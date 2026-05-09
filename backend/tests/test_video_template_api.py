from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}

TEMPLATE = {
    "id": "t1", "name": "Glow Up", "client_id": None,
    "cta_text": "Book Now", "cta_text_color": "#ffffff",
    "cta_text_size": "M", "cta_text_bg": True,
    "cta_text_bg_color": "#000000", "cta_text_bg_opacity": 0.5,
    "cta_text_x_ratio": 0.5, "cta_text_y_ratio": 0.78,
    "cta_button_text": "Get Started", "cta_button_bg_color": "#ffffff",
    "cta_button_text_color": "#000000", "cta_button_size": "M",
    "cta_button_arrow": True, "cta_button_x_ratio": 0.5,
    "cta_button_y_ratio": 0.88, "cta_button_border_radius": 8,
    "cta_button_shadow": True, "cta_animation": "slide_up", "cta_delay": 3.0,
    "overlay_style": "gradient_wash", "overlay_color": "#000000",
    "overlay_opacity": 0.5, "font_preset": "bold_sans", "mood_tags": ["energy"],
    "created_at": "2026-05-09T00:00:00Z",
}

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_create_template_with_style_fields(mock_db, _):
    mock_db.video_templates.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.logs.insert_one = AsyncMock(return_value=MagicMock())
    body = {
        "name": "Glow Up",
        "overlay_style": "gradient_wash",
        "overlay_color": "#000000",
        "overlay_opacity": 0.5,
        "font_preset": "bold_sans",
        "mood_tags": ["energy"],
        "cta_button_border_radius": 8,
        "cta_button_shadow": True,
    }
    resp = client.post("/api/video-templates", json=body, headers=AUTH)
    assert resp.status_code == 201
    call_doc = mock_db.video_templates.insert_one.call_args[0][0]
    assert call_doc["overlay_style"] == "gradient_wash"
    assert call_doc["font_preset"] == "bold_sans"
    assert call_doc["mood_tags"] == ["energy"]
    assert call_doc["cta_button_border_radius"] == 8
    assert call_doc["cta_button_shadow"] is True

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_update_template_style_fields(mock_db, _):
    updated = {**TEMPLATE, "overlay_style": "blur", "mood_tags": ["calm"]}
    update_result = MagicMock()
    update_result.matched_count = 1
    mock_db.video_templates.update_one = AsyncMock(return_value=update_result)
    mock_db.video_templates.find_one = AsyncMock(return_value=updated)
    resp = client.put("/api/video-templates/t1",
                      json={"overlay_style": "blur", "mood_tags": ["calm"]},
                      headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["overlay_style"] == "blur"
    assert resp.json()["mood_tags"] == ["calm"]
