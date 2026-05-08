"""
Backend tests for Carousel feature and related endpoints
Tests: carousel generate, CRUD, clients, posts generate
"""
import asyncio
import json
import os
import sys
from unittest.mock import MagicMock

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def client_id(session):
    """Get TechFlow Inc client ID"""
    resp = session.get(f"{BASE_URL}/api/clients")
    assert resp.status_code == 200
    clients = resp.json()
    for c in clients:
        if "TechFlow" in c.get("name", ""):
            return c["id"]
    # Fallback: return first client
    if clients:
        return clients[0]["id"]
    pytest.skip("No clients found")

# ─── Client Tests ─────────────────────────────────────────────────────────────

def test_list_clients(session):
    resp = session.get(f"{BASE_URL}/api/clients")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    print(f"PASS: List clients returned {len(data)} clients")

def test_create_and_delete_client(session):
    payload = {"name": "TEST_CarouselClient", "industry": "Testing", "brand_voice": "test", "platforms": ["instagram"]}
    resp = session.post(f"{BASE_URL}/api/clients", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "TEST_CarouselClient"
    cid = data["id"]
    # Delete
    del_resp = session.delete(f"{BASE_URL}/api/clients/{cid}")
    assert del_resp.status_code == 200
    print(f"PASS: Create and delete client works")

def test_pause_resume_client(session, client_id):
    # Pause
    resp = session.post(f"{BASE_URL}/api/clients/{client_id}/pause")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"
    # Resume
    resp2 = session.post(f"{BASE_URL}/api/clients/{client_id}/resume")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "active"
    print(f"PASS: Pause/resume client works")

# ─── Carousel Generate Tests ──────────────────────────────────────────────────

def test_carousel_generate(session, client_id):
    """Test AI carousel generation"""
    payload = {
        "client_id": client_id,
        "platform": "instagram",
        "template": "full_white",
        "topic": "SaaS growth tips",
        "slide_count": 5
    }
    resp = session.post(f"{BASE_URL}/api/carousel/generate", json=payload, timeout=30)
    assert resp.status_code == 200
    data = resp.json()
    assert "title" in data
    assert "slides" in data
    assert isinstance(data["slides"], list)
    assert len(data["slides"]) >= 1
    assert "author_name" in data
    print(f"PASS: Carousel generate returned '{data['title']}' with {len(data['slides'])} slides")

def test_carousel_generate_missing_client(session):
    resp = session.post(f"{BASE_URL}/api/carousel/generate", json={"client_id": "nonexistent", "platform": "instagram"}, timeout=10)
    assert resp.status_code == 404
    print("PASS: 404 for missing client")

# ─── Carousel CRUD Tests ─────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def saved_carousel_id(session, client_id):
    """Create a carousel for testing, return its ID"""
    payload = {
        "client_id": client_id,
        "platform": "instagram",
        "template": "full_white",
        "title": "TEST_SaaS Growth Tips",
        "author_name": "TechFlow Inc",
        "author_handle": "@techflowinc",
        "author_title": "SaaS / Technology",
        "slides": [
            {"slide_number": 1, "content": "5 SaaS growth tips"},
            {"slide_number": 2, "content": "Tip 1: Focus on retention"},
            {"slide_number": 3, "content": "Tip 2: Optimize onboarding"},
        ]
    }
    resp = session.post(f"{BASE_URL}/api/carousels", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    return data["id"]

def test_create_carousel(session, client_id):
    payload = {
        "client_id": client_id,
        "platform": "instagram",
        "template": "floating_card",
        "title": "TEST_Floating Card Test",
        "author_name": "Test Author",
        "author_handle": "@test",
        "author_title": "Tech",
        "slides": [{"slide_number": 1, "content": "Test slide content"}]
    }
    resp = session.post(f"{BASE_URL}/api/carousels", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "TEST_Floating Card Test"
    assert data["slide_count"] == 1
    assert data["template"] == "floating_card"
    # Cleanup
    session.delete(f"{BASE_URL}/api/carousels/{data['id']}")
    print("PASS: Create carousel works")

def test_list_carousels(session, saved_carousel_id):
    resp = session.get(f"{BASE_URL}/api/carousels")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    ids = [c["id"] for c in data]
    assert saved_carousel_id in ids
    print(f"PASS: List carousels returned {len(data)} carousels")

def test_get_carousel(session, saved_carousel_id):
    resp = session.get(f"{BASE_URL}/api/carousels/{saved_carousel_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == saved_carousel_id
    assert "slides" in data
    print("PASS: Get carousel by ID works")

def test_delete_carousel(session, client_id):
    # Create one to delete
    payload = {
        "client_id": client_id,
        "platform": "instagram",
        "template": "full_white",
        "title": "TEST_ToDelete",
        "author_name": "Test",
        "author_handle": "@test",
        "author_title": "Test",
        "slides": [{"slide_number": 1, "content": "Delete me"}]
    }
    create_resp = session.post(f"{BASE_URL}/api/carousels", json=payload)
    cid = create_resp.json()["id"]
    del_resp = session.delete(f"{BASE_URL}/api/carousels/{cid}")
    assert del_resp.status_code == 200
    # Verify deletion
    get_resp = session.get(f"{BASE_URL}/api/carousels/{cid}")
    assert get_resp.status_code == 404
    print("PASS: Delete carousel works and verifies 404")

def test_delete_carousel_not_found(session):
    resp = session.delete(f"{BASE_URL}/api/carousels/nonexistent-id")
    assert resp.status_code == 404
    print("PASS: Delete non-existent carousel returns 404")

# ─── Post Generate Test ───────────────────────────────────────────────────────

def test_posts_generate(session, client_id):
    payload = {"client_id": client_id, "platform": "instagram", "topic": "SaaS tips"}
    resp = session.post(f"{BASE_URL}/api/posts/generate", json=payload, timeout=30)
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert len(data["text"]) > 0
    print(f"PASS: Post generate returned text of length {len(data['text'])}")

# ─── Cleanup ─────────────────────────────────────────────────────────────────

def test_cleanup_saved_carousel(session, saved_carousel_id):
    resp = session.delete(f"{BASE_URL}/api/carousels/{saved_carousel_id}")
    assert resp.status_code in [200, 404]
    print("PASS: Cleanup done")


# ─── Pass 4 Unit Tests ────────────────────────────────────────────────────────

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub out the `anthropic` package so ai_service can be imported without it installed
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()

from ai_service import _pass4_format_refine


def _make_draft(slide_count=5):
    return {
        "title": "Test Carousel",
        "author_name": "Acme",
        "author_handle": "@acme",
        "author_title": "Tech",
        "slides": [{"slide_number": i + 1, "content": f"Slide {i+1}"} for i in range(slide_count)],
    }


def _mock_client(response_dict):
    """Return a mock anthropic client whose messages.create returns response_dict as JSON."""
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(response_dict))]
    client = MagicMock()
    client.messages.create.return_value = msg
    return client


def _run(coro):
    return asyncio.run(coro)


_PASS4_CLIENT = {"name": "Acme", "strategy": {"tone": "bold"}}


@pytest.mark.parametrize("fmt,keyword", [
    ("tips",          "WHAT / WHY / HOW"),
    ("story",         "narrative arc"),
    ("myth_bust",     "MYTH"),
    ("case_study",    "PROBLEM"),
    ("step_by_step",  "step"),
])
def test_pass4_prompt_contains_format_keyword(fmt, keyword):
    draft = _make_draft()
    expected = {**draft, "slides": draft["slides"]}
    mock_client = _mock_client(expected)

    result = _run(_pass4_format_refine(mock_client, _PASS4_CLIENT, draft, fmt, 5))

    call_args = mock_client.messages.create.call_args
    system_prompt = call_args.kwargs.get("system") or call_args.args[0]
    assert keyword.lower() in system_prompt.lower(), (
        f"Expected '{keyword}' in system prompt for format '{fmt}'"
    )
    assert "slides" in result


def test_pass4_falls_back_to_draft_on_bad_json():
    draft = _make_draft()
    msg = MagicMock()
    msg.content = [MagicMock(text="NOT JSON AT ALL")]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = msg

    result = _run(_pass4_format_refine(mock_client, _PASS4_CLIENT, draft, "tips", 5))
    assert result == draft


def test_pass4_unknown_format_still_runs():
    """An unknown format value must not crash — falls through to a generic specialist."""
    draft = _make_draft()
    expected = {**draft}
    mock_client = _mock_client(expected)

    result = _run(_pass4_format_refine(mock_client, _PASS4_CLIENT, draft, "unknown_format", 5))
    mock_client.messages.create.assert_called_once()
    assert "slides" in result
