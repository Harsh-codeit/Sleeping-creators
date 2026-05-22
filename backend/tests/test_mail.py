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
