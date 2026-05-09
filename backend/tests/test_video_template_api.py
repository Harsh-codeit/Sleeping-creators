from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)

def _auth():
    return {"Authorization": "Bearer test-token"}

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_create_video_template_with_elements(mock_db, _):
    mock_db.video_templates.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.logs.insert_one = AsyncMock(return_value=MagicMock())

    resp = client.post("/api/video-templates", json={
        "name": "Test Template",
        "aspect_ratio": "9:16",
        "video_overridable": True,
        "elements": [
            {
                "type": "cta_button",
                "x_ratio": 0.5, "y_ratio": 0.88, "z_index": 1,
                "start_at": 3.0, "duration": None,
                "animation_in": "slide_up", "animation_out": "none",
                "overridable": True, "override_key": "cta",
                "props": {"text": "Shop Now", "bg_color": "#ffffff",
                          "text_color": "#000000", "border_radius": 999,
                          "arrow": True, "gradient": False},
            }
        ],
    }, headers=_auth())
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Test Template"
    assert body["aspect_ratio"] == "9:16"
    assert len(body["elements"]) == 1
    assert body["elements"][0]["type"] == "cta_button"
    assert body["elements"][0]["override_key"] == "cta"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_create_video_template_empty_elements(mock_db, _):
    mock_db.video_templates.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.logs.insert_one = AsyncMock(return_value=MagicMock())

    resp = client.post("/api/video-templates", json={"name": "Empty"}, headers=_auth())
    assert resp.status_code == 201
    assert resp.json()["elements"] == []

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_update_video_template_elements(mock_db, _):
    existing = {
        "_id": "x", "id": "tpl-1", "name": "T",
        "aspect_ratio": "9:16", "video_overridable": True, "elements": [],
    }
    updated = {k: v for k, v in existing.items() if k != "_id"}
    updated["name"] = "Renamed"
    mock_db.video_templates.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
    mock_db.video_templates.find_one = AsyncMock(return_value=updated)
    resp = client.put("/api/video-templates/tpl-1", json={"name": "Renamed"}, headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_video_post_create_accepts_overrides(mock_db, _):
    with patch("video_worker.enqueue_video_job", return_value="task-123"), \
         patch("server.add_log", new_callable=AsyncMock):
        resp = client.post("/api/videos/create", json={
            "client_id": "c1",
            "platforms": ["instagram"],
            "overrides": {"cta": "Buy Now"},
        }, headers=_auth())
    assert resp.status_code == 201
    assert resp.json()["task_id"] == "task-123"
