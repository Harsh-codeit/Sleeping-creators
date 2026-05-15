"""
Backend tests for Carousel feature and related endpoints
Tests: carousel generate, CRUD, clients, posts generate
"""
import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

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

from ai_service import (
    _build_content_memory_context,
    _generate_carousel_single_pass,
    _is_indian_audience,
    _safe_for_prompt,
)


def _make_slides(slide_count=5):
    return [{"slide_number": i + 1, "content": f"Slide {i+1}"} for i in range(slide_count)]


def _mock_client(response_dict):
    """Return a mock anthropic client whose messages.create returns response_dict as JSON."""
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(response_dict))]
    client = MagicMock()
    client.messages.create.return_value = msg
    return client


def _run(coro):
    return asyncio.run(coro)


_CAROUSEL_CLIENT = {"name": "Acme", "industry": "Tech", "strategy": {"tone": "bold"}}
_CAROUSEL_ONBOARDING = {"language": "English"}


def _carousel_response(slide_count=5, fmt="tips"):
    return {
        "title": "Test Carousel",
        "strategy": {
            "topic": "t", "format": fmt, "hook_type": "emotional_state",
            "angle": "fresh angle", "emotions": ["aspiration", "guilt"],
            "virality_angle": "v", "audience_pain": "p",
            "mirror_slide_number": 3, "slide_arc": "a -> b -> c",
        },
        "author_name": "Acme",
        "author_handle": "@acme",
        "author_title": "Tech",
        "slides": _make_slides(slide_count),
    }


@pytest.mark.parametrize("fmt,keyword", [
    ("tips",          "WHAT"),
    ("story",         "tension"),
    ("myth_bust",     "MYTH"),
    ("case_study",    "PROBLEM"),
    ("step_by_step",  "Step N"),
])
def test_single_pass_prompt_contains_format_keyword(fmt, keyword):
    """Locked format must inject its format-specific guidance into the system prompt."""
    mock_client = _mock_client(_carousel_response(fmt=fmt))
    result = _run(_generate_carousel_single_pass(
        mock_client, _CAROUSEL_CLIENT, _CAROUSEL_ONBOARDING,
        topic="Test topic", slide_count=5, slide_format=fmt, platform="instagram",
        cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))

    call_args = mock_client.messages.create.call_args
    system_prompt = call_args.kwargs.get("system") or call_args.args[0]
    assert keyword.lower() in system_prompt.lower(), (
        f"Expected '{keyword}' in single-pass prompt for format '{fmt}'"
    )
    assert "slides" in result


def test_single_pass_prompt_contains_strategist_persona():
    """The world-class strategist persona must be baked into every call."""
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CAROUSEL_CLIENT, _CAROUSEL_ONBOARDING,
        topic="Test", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "world-class Instagram content strategist" in system_prompt
    assert "mass-relatable" in system_prompt.lower() or "mass first" in system_prompt.lower()
    assert "unspoken" in system_prompt.lower() or "never say out loud" in system_prompt.lower()


def test_single_pass_competitor_hook_constraint_injected():
    """When hook_inspiration is set, the 80/20 rebuild block must appear in the prompt."""
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CAROUSEL_CLIENT, _CAROUSEL_ONBOARDING,
        topic="Test", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None,
        hook_inspiration="The 22-year-old founder raised $50M", global_instructions=None, trend_context="",
    ))
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "competitor hook rebuild" in system_prompt.lower()
    assert "80% of the original words" in system_prompt


def test_single_pass_india_framing_conditional_on_language():
    """Indian framing block must only appear when language signals an Indian audience."""
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CAROUSEL_CLIENT, {"language": "Hinglish"},
        topic="Test", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    indian_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "Indian audience" in indian_prompt or "Hinglish" in indian_prompt

    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CAROUSEL_CLIENT, {"language": "English"},
        topic="Test", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    english_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "Hinglish" not in english_prompt
    assert "INDIAN AUDIENCE FRAMING" not in english_prompt


def test_is_indian_audience_detection():
    assert _is_indian_audience({"language": "Hindi"}, {}) is True
    assert _is_indian_audience({"language": "Hinglish"}, {}) is True
    assert _is_indian_audience({}, {"target_audience": "Indian millennials"}) is True
    assert _is_indian_audience({"language": "English"}, {"target_audience": "US founders"}) is False
    assert _is_indian_audience({}, {}) is False


# ─── Phase 4 — gap-coverage tests ─────────────────────────────────────────────

def _call_single_pass(mock_client, *, slide_count=5, slide_format="tips",
                      cta_keyword=None, cta_offer=None, hook_inspiration=None,
                      global_instructions=None, onboarding=None, client=None, db=None):
    """Convenience wrapper — runs _generate_carousel_single_pass with sensible defaults."""
    return _run(_generate_carousel_single_pass(
        mock_client, client or _CAROUSEL_CLIENT, onboarding or _CAROUSEL_ONBOARDING,
        topic="Test topic", slide_count=slide_count, slide_format=slide_format,
        platform="instagram",
        cta_keyword=cta_keyword, cta_offer=cta_offer,
        hook_inspiration=hook_inspiration, global_instructions=global_instructions,
        trend_context="", db=db,
    ))


def test_single_pass_raises_on_bad_json():
    """Model returns non-JSON → function raises (caller must handle)."""
    msg = MagicMock()
    msg.content = [MagicMock(text="NOT JSON AT ALL")]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = msg
    with pytest.raises(Exception):
        _call_single_pass(mock_client)


def test_single_pass_cta_injected_into_prompt():
    """When cta_keyword + cta_offer are set, the CTA REQUIREMENT block appears in prompt."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(mock_client, cta_keyword="DEMO", cta_offer="free trial")
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "CTA REQUIREMENT" in system_prompt
    assert "DEMO" in system_prompt
    assert "free trial" in system_prompt


def test_single_pass_global_instructions_appended():
    """global_instructions argument lands under GLOBAL INSTRUCTIONS: in the system prompt."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(mock_client, global_instructions="Always mention our podcast")
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "GLOBAL INSTRUCTIONS:" in system_prompt
    assert "Always mention our podcast" in system_prompt


def test_single_pass_format_auto_pick_branch():
    """slide_format=None should produce the auto-pick prompt with all format guides + picker guide."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(mock_client, slide_format=None)
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "FORMAT — choose one" in system_prompt
    # Auto-pick schema is descriptive, not a locked literal
    assert "<one of: tips, story, myth_bust, case_study, step_by_step>" in system_prompt


def test_single_pass_large_slide_count_word_budget_clamps():
    """slide_count=12 → max(35, 85-12*5) = 35 — the middle-slides budget clamps at 35."""
    mock_client = _mock_client(_carousel_response(slide_count=12))
    _call_single_pass(mock_client, slide_count=12)
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    # Word budgets line: "Middle slides: {min}-{max} words" where max = 35 when slide_count >= 10
    assert "35 words" in system_prompt or "Middle slides: 25-35" in system_prompt


def test_india_framing_via_target_audience():
    """target_audience containing 'India' should fire the India block even when language is English."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(
        mock_client,
        client={**_CAROUSEL_CLIENT, "target_audience": "Indian millennials in tier-2 cities"},
        onboarding={"language": "English"},
    )
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "INDIAN AUDIENCE FRAMING" in system_prompt or "Hinglish" in system_prompt


def test_single_pass_unknown_format_passes_through():
    """Unknown slide_format should not crash — falls back to tips guidance."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(mock_client, slide_format="unknown_format")
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    # Locked-format header still appears with the unknown name
    assert "FORMAT — unknown_format (locked by caller)" in system_prompt
    # And the tips guidance text (WHAT/WHY/HOW) is what got injected as the fallback
    assert "WHAT" in system_prompt


def test_word_budget_no_contradiction_for_slide_one():
    """Regression guard for Phase 1.3 — slide-1 budget must say 20, never 25."""
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(mock_client)
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    # Slide 1 is mentioned with the 20-word budget in the WORD BUDGETS section
    assert "Slide 1 (hook): max 20 words" in system_prompt
    # The persona quality gates also say slide 1 ≤ 20
    assert "Slide 1 ≤ 20 words" in system_prompt
    # The old 25-word rule must NOT appear next to slide 1 anywhere
    assert "Slide 1 (hook): max 25 words" not in system_prompt
    assert "Slide 1 ≤ 25 words" not in system_prompt


# ─── Phase 6.6 — content memory tests ────────────────────────────────────────

def _fake_memory_db(rows):
    """Build a fake Mongo-like db whose posts.find()…to_list() returns the given rows."""
    fake_db = MagicMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    fake_db.posts.find.return_value = cursor
    # record_usage path: db.token_usage.insert_one must be awaitable
    fake_db.token_usage.insert_one = AsyncMock(return_value=None)
    return fake_db


def test_memory_context_empty_when_no_history():
    """No DB rows → helper returns the empty string (and never raises)."""
    fake_db = _fake_memory_db([])
    block = _run(_build_content_memory_context("client-1", fake_db))
    assert block == ""


def test_memory_context_empty_when_inputs_missing():
    """No client_id or no db → helper returns empty string without querying."""
    assert _run(_build_content_memory_context(None, MagicMock())) == ""
    assert _run(_build_content_memory_context("client-1", None)) == ""


def test_memory_context_formats_recent_strategies():
    """A recent post produces a RECENT CONTENT MEMORY block with topic / hook / format / MEMORY RULES."""
    fake_rows = [{
        "carousel_data": {"strategy": {
            "topic": "5 SIP mistakes", "angle": "ego over math",
            "hook_type": "shocking_number", "format": "myth_bust",
        }},
        "created_at": "2026-05-12T00:00:00Z",
    }]
    fake_db = _fake_memory_db(fake_rows)
    block = _run(_build_content_memory_context("client-1", fake_db))
    assert "RECENT CONTENT MEMORY" in block
    assert "5 SIP mistakes" in block
    assert "shocking_number" in block
    assert "MEMORY RULES" in block


def test_single_pass_injects_memory_block_when_db_provided():
    """When db returns past strategies, the system prompt must include the forbidden list."""
    fake_rows = [{
        "carousel_data": {"strategy": {
            "topic": "Old topic about budgeting", "angle": "guilt trap",
            "hook_type": "emotional_state", "format": "tips",
        }},
        "created_at": "2026-05-12T00:00:00Z",
    }]
    fake_db = _fake_memory_db(fake_rows)
    mock_client = _mock_client(_carousel_response())
    _call_single_pass(
        mock_client,
        client={**_CAROUSEL_CLIENT, "id": "client-1"},
        db=fake_db,
    )
    system_prompt = mock_client.messages.create.call_args.kwargs.get("system", "")
    assert "RECENT CONTENT MEMORY" in system_prompt
    assert "Old topic about budgeting" in system_prompt
    assert "MEMORY RULES" in system_prompt


def test_safe_for_prompt_strips_quotes_and_newlines():
    """_safe_for_prompt is a small but important sanitizer — exercise its contract."""
    assert _safe_for_prompt(None) == ""
    assert _safe_for_prompt("") == ""
    assert _safe_for_prompt('  hello "world"  ') == "hello 'world'"
    # newlines collapse to spaces — input can't inject new directives
    assert "\n" not in _safe_for_prompt("line1\nline2")
    # truncation
    long = "x" * 500
    assert len(_safe_for_prompt(long, max_len=100)) <= 100
