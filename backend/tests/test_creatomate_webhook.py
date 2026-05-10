import hmac
import hashlib
import json
import pytest
from creatomate_webhook import verify_signature


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_verify_signature_ok():
    body = b'{"id":"r1","status":"succeeded"}'
    sig = _sign("topsecret", body)
    assert verify_signature(body, sig, "topsecret") is True


def test_verify_signature_rejects_wrong():
    body = b'{"id":"r1","status":"succeeded"}'
    assert verify_signature(body, "deadbeef", "topsecret") is False


def test_verify_signature_rejects_empty():
    assert verify_signature(b"x", "", "topsecret") is False


from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
import creatomate_webhook


def _app(db_mock):
    app = FastAPI()
    creatomate_webhook._db_for_test = lambda: db_mock  # injection point
    app.include_router(creatomate_webhook.router)
    return TestClient(app)


def test_succeeded_webhook_mirrors_video_and_updates_render_job(monkeypatch):
    db = MagicMock()
    db.render_jobs.find_one = AsyncMock(return_value={
        "id": "rj-1", "post_id": "p1", "client_id": "c1",
        "creatomate_render_id": "render-xyz", "status": "submitted",
    })
    db.render_jobs.update_one = AsyncMock()
    db.posts.update_one = AsyncMock()
    db.posts.find_one = AsyncMock(return_value={
        "id": "p1", "client_id": "c1", "scheduled_at": "2099-01-01T00:00:00+00:00",
    })
    db.clients.find_one = AsyncMock(return_value={"id": "c1", "auto_approve": False})

    monkeypatch.setenv("CREATOMATE_WEBHOOK_SECRET", "wsec")

    import video_render_service
    monkeypatch.setattr(video_render_service, "mirror_to_r2",
                        AsyncMock(return_value=("https://r2.x/v.mp4", "https://r2.x/v.jpg")))

    client = _app(db)
    body = json.dumps({
        "id": "render-xyz", "status": "succeeded",
        "url": "https://creatomate/x.mp4", "snapshot_url": "https://creatomate/x.jpg",
    }).encode()
    sig = _sign("wsec", body)

    resp = client.post("/webhooks/creatomate", content=body,
                       headers={"X-Creatomate-Signature": sig})
    assert resp.status_code == 200
    db.render_jobs.update_one.assert_awaited()
    db.posts.update_one.assert_awaited()


def test_failed_webhook_marks_post_failed_render(monkeypatch):
    db = MagicMock()
    db.render_jobs.find_one = AsyncMock(return_value={
        "id": "rj-1", "post_id": "p1", "client_id": "c1",
        "creatomate_render_id": "render-z", "status": "submitted",
    })
    db.render_jobs.update_one = AsyncMock()
    db.posts.update_one = AsyncMock()
    monkeypatch.setenv("CREATOMATE_WEBHOOK_SECRET", "s")
    monkeypatch.setattr("server.get_settings", AsyncMock(return_value={}), raising=False)

    client = _app(db)
    body = json.dumps({"id": "render-z", "status": "failed", "error": "boom"}).encode()
    resp = client.post("/webhooks/creatomate", content=body,
                       headers={"X-Creatomate-Signature": _sign("s", body)})
    assert resp.status_code == 200
    db.posts.update_one.assert_awaited()


def test_webhook_invalid_signature_returns_401(monkeypatch):
    db = MagicMock()
    monkeypatch.setenv("CREATOMATE_WEBHOOK_SECRET", "s")
    client = _app(db)
    body = b'{"id":"x","status":"succeeded"}'
    resp = client.post("/webhooks/creatomate", content=body,
                       headers={"X-Creatomate-Signature": "wrong"})
    assert resp.status_code == 401


def test_webhook_unknown_render_ignored(monkeypatch):
    db = MagicMock()
    db.render_jobs.find_one = AsyncMock(return_value=None)
    monkeypatch.setenv("CREATOMATE_WEBHOOK_SECRET", "s")
    client = _app(db)
    body = b'{"id":"unknown","status":"succeeded"}'
    resp = client.post("/webhooks/creatomate", content=body,
                       headers={"X-Creatomate-Signature": _sign("s", body)})
    assert resp.status_code == 200
    assert "ignored" in resp.json()


def test_webhook_terminal_state_idempotent(monkeypatch):
    db = MagicMock()
    db.render_jobs.find_one = AsyncMock(return_value={"id": "rj-1", "status": "succeeded"})
    monkeypatch.setenv("CREATOMATE_WEBHOOK_SECRET", "s")
    client = _app(db)
    body = b'{"id":"r","status":"succeeded"}'
    resp = client.post("/webhooks/creatomate", content=body,
                       headers={"X-Creatomate-Signature": _sign("s", body)})
    assert resp.status_code == 200
    assert "terminal" in resp.json()["ignored"]
