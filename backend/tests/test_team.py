import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app, _decode_token, _make_token, _make_member_token, _JWT_SECRET, _JWT_ALGO
from jose import jwt
from datetime import datetime, timezone, timedelta

client = TestClient(app)
OWNER_AUTH = {"Authorization": f"Bearer {_make_token()}"}


def test_decode_token_owner():
    token = _make_token()
    result = _decode_token(token)
    assert result == {"role": "owner", "user_id": None}


def test_decode_token_member():
    token = _make_member_token("abc123")
    result = _decode_token(token)
    assert result == {"role": "member", "user_id": "abc123"}


def test_decode_token_invalid():
    result = _decode_token("not-a-token")
    assert result is None


def test_decode_token_expired():
    expired = jwt.encode(
        {"sub": "admin", "role": "owner", "exp": datetime.now(timezone.utc) - timedelta(days=1)},
        _JWT_SECRET, algorithm=_JWT_ALGO
    )
    assert _decode_token(expired) is None


def test_decode_token_legacy_admin():
    # Old token without role field — should be treated as owner
    legacy = jwt.encode(
        {"sub": "admin", "exp": datetime.now(timezone.utc) + timedelta(days=30)},
        _JWT_SECRET, algorithm=_JWT_ALGO
    )
    result = _decode_token(legacy)
    assert result["role"] == "owner"


from bson import ObjectId

MEMBER_ID = str(ObjectId())
MEMBER_TOKEN = _make_member_token(MEMBER_ID)
MEMBER_AUTH = {"Authorization": f"Bearer {MEMBER_TOKEN}"}

ACTIVE_MEMBER = {
    "_id": ObjectId(MEMBER_ID),
    "name": "Jane", "email": "jane@test.com",
    "password_hash": "x", "is_active": True,
    "permissions": {
        "clients": {"view": True, "create": False, "edit": False, "delete": False}
    }
}

INACTIVE_MEMBER = {**ACTIVE_MEMBER, "is_active": False}


@patch("server.db")
def test_member_allowed_route(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])
    mock_db.clients.find.return_value = mock_cursor
    resp = client.get("/api/clients", headers=MEMBER_AUTH)
    # Middleware let it through — permission was satisfied
    assert resp.status_code != 401
    assert resp.status_code != 403


@patch("server.db")
def test_member_forbidden_route(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.post("/api/clients", json={}, headers=MEMBER_AUTH)
    assert resp.status_code == 403


@patch("server.db")
def test_member_inactive(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=INACTIVE_MEMBER)
    resp = client.get("/api/clients", headers=MEMBER_AUTH)
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()


@patch("server.db")
def test_member_me_always_accessible(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.get("/api/me", headers=MEMBER_AUTH)
    # Should not be blocked by permission check (200 or data error, not 403)
    assert resp.status_code != 403


def test_team_login_success():
    from server import _hash_pw
    hashed = _hash_pw("secret123")
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": hashed, "is_active": True,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "secret123"})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_team_login_wrong_password():
    from server import _hash_pw
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": _hash_pw("correct"), "is_active": True,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "wrong"})
    assert resp.status_code == 401


def test_team_login_not_found():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=None)
        resp = client.post("/api/auth/team/login", json={"email": "nobody@test.com", "password": "x"})
    assert resp.status_code == 401


def test_team_login_inactive():
    from server import _hash_pw
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": _hash_pw("pw"), "is_active": False,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "pw"})
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()


def test_me_owner():
    resp = client.get("/api/me", headers=OWNER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "owner"
    assert data["permissions"] is None


def test_me_member():
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane", "email": "jane@test.com",
        "is_active": True,
        "permissions": {"clients": {"view": True, "create": False, "edit": False, "delete": False}}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.get("/api/me", headers=MEMBER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "member"
    assert data["name"] == "Jane"
    assert data["permissions"]["clients"]["view"] is True


MEMBER_DOC = {
    "_id": ObjectId(MEMBER_ID), "name": "Jane", "email": "jane@test.com",
    "password_hash": "hash", "is_active": True, "permissions": {},
    "created_at": "2026-05-22T00:00:00"
}


def test_list_team_members():
    with patch("server.db") as mock_db:
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[MEMBER_DOC])
        mock_db.team_members.find.return_value = mock_cursor
        resp = client.get("/api/team", headers=OWNER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Jane"
    assert "password_hash" not in data[0]


def test_create_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=None)  # no duplicate
        mock_db.team_members.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id=ObjectId(MEMBER_ID))
        )
        mock_db.team_members.find_one = AsyncMock(side_effect=[None, MEMBER_DOC])
        resp = client.post("/api/team", json={
            "name": "Jane", "email": "jane@test.com",
            "password": "secret123", "permissions": {}
        }, headers=OWNER_AUTH)
    assert resp.status_code == 201


def test_create_team_member_duplicate_email():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=MEMBER_DOC)
        resp = client.post("/api/team", json={
            "name": "Other", "email": "jane@test.com",
            "password": "pw", "permissions": {}
        }, headers=OWNER_AUTH)
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


def test_update_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(
            side_effect=[MEMBER_DOC, {**MEMBER_DOC, "name": "Janet"}]
        )
        mock_db.team_members.update_one = AsyncMock(return_value=MagicMock())
        resp = client.put(f"/api/team/{MEMBER_ID}", json={"name": "Janet"}, headers=OWNER_AUTH)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Janet"


def test_delete_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=MEMBER_DOC)
        mock_db.team_members.delete_one = AsyncMock(return_value=MagicMock())
        resp = client.delete(f"/api/team/{MEMBER_ID}", headers=OWNER_AUTH)
    assert resp.status_code == 204


def test_team_endpoints_require_owner():
    """Members cannot access /api/team endpoints."""
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value={**ACTIVE_MEMBER, "is_active": True})
        resp = client.get("/api/team", headers=MEMBER_AUTH)
    assert resp.status_code == 403


# ─── Permission map coverage (regression for deny-by-default gaps) ─────────────
from server import _get_required_permission


def test_upload_is_shared_utility_not_in_map():
    """/api/upload is intentionally unmapped — it's a shared member utility."""
    assert _get_required_permission("POST", "/api/upload") is None


@patch("server.db")
def test_member_can_use_upload_with_minimal_perms(mock_db):
    """Any active member may call /api/upload regardless of section permissions.

    ACTIVE_MEMBER only has clients.view, yet the middleware must let /api/upload
    through (shared utility). The handler then rejects the bad content-type with
    400 — proving the request was NOT blocked at 401/403.
    """
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.post(
        "/api/upload",
        headers=MEMBER_AUTH,
        files={"file": ("x.txt", b"data", "text/plain")},
    )
    assert resp.status_code not in (401, 403)
    assert resp.status_code == 400  # handler reached, rejected non-image


def test_permission_map_closes_member_gaps():
    """Endpoints a full-access member legitimately needs must resolve to a
    section permission (not None, which would deny-by-default with 403)."""
    cases = {
        ("POST", "/api/carousels/abc123/export"):  ("studio", "edit"),
        ("POST", "/api/carousels/abc123/publish"): ("studio", "edit"),
        ("GET",  "/api/video-schedule/slots"):     ("studio", "view"),
        ("POST", "/api/templates/t1/preview"):     ("templates", "view"),
        ("POST", "/api/templates/t1/clone"):       ("templates", "create"),
        ("POST", "/api/posts/p1/publish"):         ("calendar", "edit"),
        ("POST", "/api/posts/p1/winner"):          ("calendar", "edit"),
        ("POST", "/api/music/tags"):               ("music", "edit"),
        ("POST", "/api/competitor-posts/cp1/recreate"): ("clients", "edit"),
        ("PUT",  "/api/clients/c1/keyword-config"): ("clients", "edit"),
        ("PUT",  "/api/clients/c1/pipelines/p1"):   ("clients", "edit"),
        ("POST", "/api/shotstack-templates/t1/generate-preview"): ("video_templates", "edit"),
        ("POST", "/api/shotstack-templates/t1/reinfer-roles"):    ("video_templates", "edit"),
    }
    for (method, path), expected in cases.items():
        assert _get_required_permission(method, path) == expected, f"{method} {path}"
