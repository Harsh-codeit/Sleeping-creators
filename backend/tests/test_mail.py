import os
from unittest.mock import patch


def test_send_email_calls_resend():
    with patch("mail_service.resend") as mock_resend:
        mock_resend.Emails.send.return_value = {"id": "abc123"}
        from mail_service import send_email
        result = send_email("client@test.com", "Test", "<p>Hello</p>")
    assert result == "abc123"
    mock_resend.Emails.send.assert_called_once()


def test_send_email_passes_cc_and_reply_to():
    with patch("mail_service.resend") as mock_resend:
        mock_resend.Emails.send.return_value = {"id": "xyz"}
        from mail_service import send_email
        send_email("a@b.com", "Sub", "<p>hi</p>", cc=["cc@b.com"], reply_to="r@b.com")
        call_args = mock_resend.Emails.send.call_args[0][0]
    assert call_args["cc"] == ["cc@b.com"]
    assert call_args["reply_to"] == "r@b.com"


def test_verify_webhook_valid():
    import hmac, hashlib, base64
    secret = base64.b64encode(b"testsecret").decode()
    whsec = f"whsec_{secret}"
    svix_id, svix_ts = "msg_001", "1234567890"
    payload = b'{"type":"email.delivered"}'
    msg = f"{svix_id}.{svix_ts}.{payload.decode()}"
    sig = base64.b64encode(
        hmac.new(base64.b64decode(secret), msg.encode(), hashlib.sha256).digest()
    ).decode()
    with patch.dict(os.environ, {"RESEND_WEBHOOK_SECRET": whsec}):
        from mail_service import verify_webhook_signature
        assert verify_webhook_signature(svix_id, svix_ts, f"v1,{sig}", payload) is True


def test_verify_webhook_invalid():
    with patch.dict(os.environ, {"RESEND_WEBHOOK_SECRET": "whsec_dGVzdA=="}):
        from mail_service import verify_webhook_signature
        assert verify_webhook_signature("id", "ts", "v1,badsig", b"{}") is False


def test_verify_webhook_missing_secret():
    with patch.dict(os.environ, {}, clear=True):
        # Remove RESEND_WEBHOOK_SECRET if set
        os.environ.pop("RESEND_WEBHOOK_SECRET", None)
        from mail_service import verify_webhook_signature
        assert verify_webhook_signature("id", "ts", "v1,anysig", b"{}") is False


from fastapi.testclient import TestClient
from server import app, _make_token

_client = TestClient(app)
OWNER_AUTH = {"Authorization": f"Bearer {_make_token()}"}


def test_mail_send_requires_auth():
    resp = _client.post("/api/mail/send", json={
        "type": "invoice", "client_id": "x", "to": "a@b.com", "subject": "S", "html": "<p/>"
    })
    assert resp.status_code == 401


@patch("server.db")
def test_mail_send_success(mock_db):
    from unittest.mock import AsyncMock
    mock_db.email_logs.insert_one = AsyncMock(return_value=None)
    with patch("mail_service.send_email", return_value="resend_123"):
        resp = _client.post("/api/mail/send", json={
            "type": "invoice", "client_id": "c1", "to": "a@b.com", "subject": "Inv", "html": "<p/>"
        }, headers=OWNER_AUTH)
    assert resp.status_code == 200
    assert resp.json()["resend_id"] == "resend_123"


@patch("server.db")
def test_mail_scheduled_list(mock_db):
    from unittest.mock import MagicMock, AsyncMock
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[])
    mock_db.scheduled_emails.find.return_value = mock_cursor
    resp = _client.get("/api/mail/scheduled", headers=OWNER_AUTH)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@patch("server.db")
def test_mail_history(mock_db):
    from unittest.mock import MagicMock, AsyncMock
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.skip.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[])
    mock_db.email_logs.find.return_value = mock_cursor
    resp = _client.get("/api/mail/history", headers=OWNER_AUTH)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_mail_webhook_rejects_bad_sig():
    resp = _client.post("/api/mail/webhook/resend",
                        content=b'{"type":"email.delivered"}',
                        headers={"content-type": "application/json"})
    assert resp.status_code == 401
