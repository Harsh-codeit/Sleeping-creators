import requests, pytest
from jose import jwt
from datetime import datetime, timezone, timedelta
import os

BASE_URL = "http://localhost:8000/api"

def _get_headers():
    secret = os.environ.get("JWT_SECRET_KEY", "change-this-to-a-long-random-secret")
    exp = datetime.now(timezone.utc) + timedelta(days=30)
    token = jwt.encode({"sub": "admin", "exp": exp}, secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

HEADERS = _get_headers()

@pytest.fixture(scope="module")
def template_id():
    payload = {
        "name": "TEST_Bold_Center",
        "position": "center",
        "font_size": 52,
        "font_color": "#ffffff",
        "overlay_color": "#000000",
        "overlay_opacity": 0.6,
        "shadow": True,
        "stroke_width": 0,
    }
    resp = requests.post(f"{BASE_URL}/video-templates", json=payload, headers=HEADERS)
    assert resp.status_code == 201
    tid = resp.json()["id"]
    yield tid
    requests.delete(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)

def test_create_video_template(template_id):
    assert template_id is not None

def test_list_video_templates(template_id):
    resp = requests.get(f"{BASE_URL}/video-templates", headers=HEADERS)
    assert resp.status_code == 200
    templates = resp.json()
    assert isinstance(templates, list)
    assert any(t["id"] == template_id for t in templates)

def test_get_video_template(template_id):
    resp = requests.get(f"{BASE_URL}/video-templates/{template_id}", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["id"] == template_id

def test_update_video_template(template_id):
    resp = requests.put(f"{BASE_URL}/video-templates/{template_id}", json={"font_size": 60}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["font_size"] == 60

def test_update_video_template_false_value(template_id):
    resp = requests.put(f"{BASE_URL}/video-templates/{template_id}", json={"shadow": False}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["shadow"] == False

def test_update_video_template_zero_value(template_id):
    resp = requests.put(f"{BASE_URL}/video-templates/{template_id}", json={"stroke_width": 0}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["stroke_width"] == 0

def test_update_video_template_not_found():
    resp = requests.put(f"{BASE_URL}/video-templates/nonexistent-id-12345", json={"font_size": 60}, headers=HEADERS)
    assert resp.status_code == 404

def test_delete_video_template(template_id):
    # We'll do a secondary create/delete here so the fixture still cleans up cleanly
    payload = {
        "name": "TEST_Delete_Check",
        "position": "bottom",
        "font_size": 40,
        "font_color": "#000000",
        "overlay_color": "#ffffff",
        "overlay_opacity": 0.4,
        "shadow": False,
        "stroke_width": 1,
    }
    resp = requests.post(f"{BASE_URL}/video-templates", json=payload, headers=HEADERS)
    assert resp.status_code == 201
    tid = resp.json()["id"]

    del_resp = requests.delete(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)
    assert del_resp.status_code == 200

    gone = requests.get(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)
    assert gone.status_code == 404
