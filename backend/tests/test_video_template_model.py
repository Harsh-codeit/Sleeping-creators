from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)

def _auth():
    return {"Authorization": "Bearer test-token"}

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_video_template_create_accepts_style_fields(mock_db, mock_check):
    # Mock the async DB calls
    mock_db.video_templates.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.logs.insert_one = AsyncMock(return_value=MagicMock())

    resp = client.post("/api/video-templates", json={
        "name": "T",
        "font_preset": "bold_sans",
        "overlay_style": "gradient_wash",
        "overlay_color": "#000000",
        "overlay_opacity": 0.5,
        "mood_tags": ["energy"],
        "cta_button_border_radius": 8,
        "cta_button_shadow": False,
    }, headers=_auth())
    assert resp.status_code == 201
    body = resp.json()
    assert body["font_preset"] == "bold_sans"
    assert body["mood_tags"] == ["energy"]
    assert body["cta_button_border_radius"] == 8
