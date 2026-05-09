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

SAMPLE_ELEMENT = {
    "type": "text_overlay",
    "x_ratio": 0.5,
    "y_ratio": 0.5,
    "z_index": 0,
    "start_at": 0.0,
    "duration": None,
    "animation_in": "fade",
    "animation_out": "none",
    "overridable": True,
    "override_key": "headline",
    "props": {"text": "Hello World", "font": "bold_sans", "size": "M", "color": "#ffffff"},
}

@pytest.fixture(scope="module")
def template_id():
    payload = {
        "name": "TEST_Element_Template",
        "aspect_ratio": "9:16",
        "video_overridable": True,
        "elements": [SAMPLE_ELEMENT],
    }
    resp = requests.post(f"{BASE_URL}/video-templates", json=payload, headers=HEADERS)
    assert resp.status_code == 201
    tid = resp.json()["id"]
    yield tid
    requests.delete(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)


def test_create_video_template_with_elements(template_id):
    assert template_id is not None


def test_list_video_templates(template_id):
    resp = requests.get(f"{BASE_URL}/video-templates", headers=HEADERS)
    assert resp.status_code == 200
    templates = resp.json()
    assert isinstance(templates, list)
    assert any(t["id"] == template_id for t in templates)


def test_get_video_template_has_elements(template_id):
    resp = requests.get(f"{BASE_URL}/video-templates/{template_id}", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == template_id
    assert isinstance(data["elements"], list)
    assert len(data["elements"]) == 1
    el = data["elements"][0]
    assert el["type"] == "text_overlay"
    assert el["overridable"] is True
    assert el["override_key"] == "headline"


def test_update_video_template_name(template_id):
    resp = requests.put(
        f"{BASE_URL}/video-templates/{template_id}",
        json={"name": "TEST_Updated_Name"},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "TEST_Updated_Name"


def test_update_video_template_elements(template_id):
    new_elements = [
        {**SAMPLE_ELEMENT, "override_key": "cta"},
        {**SAMPLE_ELEMENT, "z_index": 1, "override_key": "subtitle"},
    ]
    resp = requests.put(
        f"{BASE_URL}/video-templates/{template_id}",
        json={"elements": new_elements},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert len(resp.json()["elements"]) == 2


def test_update_video_template_not_found():
    resp = requests.put(
        f"{BASE_URL}/video-templates/nonexistent-id-12345",
        json={"name": "Ghost"},
        headers=HEADERS,
    )
    assert resp.status_code == 404


def test_delete_video_template():
    payload = {
        "name": "TEST_Delete_Check",
        "aspect_ratio": "1:1",
        "elements": [],
    }
    resp = requests.post(f"{BASE_URL}/video-templates", json=payload, headers=HEADERS)
    assert resp.status_code == 201
    tid = resp.json()["id"]

    del_resp = requests.delete(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)
    assert del_resp.status_code == 200

    gone = requests.get(f"{BASE_URL}/video-templates/{tid}", headers=HEADERS)
    assert gone.status_code == 404
