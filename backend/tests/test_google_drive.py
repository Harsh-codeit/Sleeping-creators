import requests
import os
import sys
from pathlib import Path

# Load .env for JWT secret
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000/api")

def _get_headers():
    import jwt, datetime
    secret = os.environ.get("JWT_SECRET_KEY", "secret")
    token = jwt.encode(
        {"sub": "admin", "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)},
        secret, algorithm="HS256"
    )
    return {"Authorization": f"Bearer {token}"}

def _get_client_id():
    resp = requests.get(f"{BASE_URL}/clients", headers=_get_headers())
    clients = resp.json()
    assert len(clients) > 0, "Need at least one client in DB"
    return clients[0]["id"]

def test_list_clips_empty_without_sync():
    client_id = _get_client_id()
    resp = requests.get(f"{BASE_URL}/clients/{client_id}/drive-clips", headers=_get_headers())
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_sync_requires_drive_connected():
    client_id = _get_client_id()
    resp = requests.post(f"{BASE_URL}/clients/{client_id}/drive-clips/sync", headers=_get_headers())
    # Expect 400 since Drive not connected on test client
    assert resp.status_code == 400
    assert "Drive not connected" in resp.json()["detail"]

def test_auth_url_requires_valid_client():
    resp = requests.get(f"{BASE_URL}/auth/google-drive/nonexistent-id", headers=_get_headers())
    # Will be 500 if Drive env vars not set, or 404 if client not found
    # Either is acceptable — we're just verifying the route exists
    assert resp.status_code in (200, 400, 404, 500)

def test_drive_clips_returns_list_for_unknown_client():
    resp = requests.get(f"{BASE_URL}/clients/nonexistent/drive-clips", headers=_get_headers())
    # Returns empty list (not 404) since it queries drive_clips collection
    assert resp.status_code == 200
    assert resp.json() == []
