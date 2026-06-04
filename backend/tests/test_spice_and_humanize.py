"""
Phase 1 (Spicy / Viral Content Overhaul) unit tests.

Covers:
  1.1 — caption + single-image writer upgraded Haiku -> Sonnet 4.5
  1.2 — per-client spice dial (_build_spice_block + injection into prompts)
  1.3 — softened _humanize_content (keep voice + render-safety, drop voice-flatteners)

All tests are server-free: they drive ai_service directly with a mocked anthropic client.
"""
import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub out the `anthropic` package so ai_service imports without it installed.
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()

from ai_service import (  # noqa: E402
    _build_spice_block,
    _generate_carousel_caption,
    _generate_carousel_single_pass,
    _generate_single_image_hook,
    _humanize_content,
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _run(coro):
    return asyncio.run(coro)


def _make_message(response_dict, model="claude-sonnet-4-5"):
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(response_dict))]
    msg.model = model
    msg.usage = MagicMock(input_tokens=100, output_tokens=50)
    return msg


def _mock_client(response_dict):
    """Sync messages.create mock — used by the carousel single-pass path."""
    client = MagicMock()
    client.messages.create.return_value = _make_message(response_dict)
    return client


def _async_mock_client(response_dict):
    """Async messages.create mock — _generate_single_image_hook awaits create()."""
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=_make_message(response_dict))
    return client


def _system_text(mock_client):
    blocks = mock_client.messages.create.call_args.kwargs.get("system", "")
    if isinstance(blocks, str):
        return blocks
    return " ".join(b.get("text", "") for b in blocks)


def _model_of(mock_client):
    return mock_client.messages.create.call_args.kwargs.get("model")


_CLIENT = {"name": "Acme", "industry": "Tech", "strategy": {"tone": "bold"}}
_ONBOARDING = {"language": "English"}


def _carousel_response(slide_count=5, fmt="tips"):
    return {
        "title": "Test Carousel",
        "strategy": {
            "topic": "t", "format": fmt, "hook_type": "emotional_state",
            "angle": "fresh angle", "emotions": ["aspiration", "guilt"],
            "virality_angle": "v", "audience_pain": "p",
            "mirror_slide_number": 3, "slide_arc": "a -> b -> c",
        },
        "author_name": "Acme", "author_handle": "@acme", "author_title": "Tech",
        "slides": [{"slide_number": i + 1, "content": f"Slide {i+1}"} for i in range(slide_count)],
    }


def _single_image_response():
    return {
        "title": "Single", "hook_type": "direct_confront",
        "content": "The biggest lie in tech.", "author_name": "Acme",
        "author_handle": "@acme", "author_title": "Tech",
    }


def _fake_db():
    db = MagicMock()
    db.token_usage.insert_one = AsyncMock(return_value=None)
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    db.posts.find.return_value = cursor
    db.posts.find_one = AsyncMock(return_value=None)
    return db


# ─── 1.1 — model swap ─────────────────────────────────────────────────────────

def test_single_image_hook_uses_sonnet():
    mock_client = _async_mock_client(_single_image_response())
    _run(_generate_single_image_hook(
        mock_client, _CLIENT, _ONBOARDING, topic="Test", platform="instagram",
    ))
    assert _model_of(mock_client) == "claude-sonnet-4-5"


def test_single_image_hook_records_usage_with_correct_type():
    db = _fake_db()
    mock_client = _async_mock_client(_single_image_response())
    _run(_generate_single_image_hook(
        mock_client, {**_CLIENT, "id": "c1"}, _ONBOARDING,
        topic="Test", platform="instagram", db=db,
    ))
    # record_usage path must have been called (token_usage insert) — generation_type tag preserved.
    assert db.token_usage.insert_one.await_count >= 1
    insert_doc = db.token_usage.insert_one.await_args.args[0]
    assert insert_doc["generation_type"] == "single_image_hook"


def _caption_response():
    return {"caption": "Stop scrolling. Here is the truth.", "topic_hashtags": ["#a", "#b"]}


def test_carousel_caption_uses_sonnet():
    mock_client = _mock_client(_caption_response())
    carousel_data = {"title": "T", "slides": [{"content": "hook"}]}
    _run(_generate_carousel_caption(
        mock_client, _CLIENT, _ONBOARDING, carousel_data, "instagram",
        cta_keyword=None, cta_offer=None,
    ))
    assert _model_of(mock_client) == "claude-sonnet-4-5"


# ─── 1.2 — spice dial helper ──────────────────────────────────────────────────

def test_spice_block_none_and_balanced_are_equal():
    """None must resolve to balanced — same output for stable prompt cache behavior."""
    assert _build_spice_block(None) == _build_spice_block("balanced")


def test_spice_block_unknown_falls_back_to_balanced():
    assert _build_spice_block("nonsense") == _build_spice_block("balanced")


def test_spice_block_case_insensitive():
    assert _build_spice_block("BOLD") == _build_spice_block("bold")
    assert _build_spice_block("  Unhinged ") == _build_spice_block("unhinged")


def test_spice_block_levels_distinct():
    safe = _build_spice_block("safe")
    bold = _build_spice_block("bold")
    unhinged = _build_spice_block("unhinged")
    # Each non-balanced level produces a non-empty, distinct block.
    assert safe and bold and unhinged
    assert safe != bold != unhinged
    assert safe != unhinged


def test_spice_block_escalates_heat_keywords():
    safe = _build_spice_block("safe").lower()
    unhinged = _build_spice_block("unhinged").lower()
    # safe is the agreeable end; unhinged is the provocative end.
    assert "no controversy" in safe or "agreeable" in safe
    assert "hot take" in unhinged or "provocative" in unhinged or "maximum" in unhinged


# ─── 1.2 — spice injection into carousel prompt ───────────────────────────────

def test_carousel_injects_spice_block_from_explicit_param():
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CLIENT, _ONBOARDING, topic="Test", slide_count=5,
        slide_format="tips", platform="instagram", cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
        spice_level="unhinged",
    ))
    sysprompt = _system_text(mock_client)
    assert _build_spice_block("unhinged") in sysprompt


def test_carousel_injects_spice_block_from_client_dict():
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, {**_CLIENT, "spice_level": "bold"}, _ONBOARDING, topic="Test",
        slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
    ))
    sysprompt = _system_text(mock_client)
    assert _build_spice_block("bold") in sysprompt


def test_carousel_explicit_param_overrides_client_dict():
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, {**_CLIENT, "spice_level": "safe"}, _ONBOARDING, topic="Test",
        slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="", spice_level="unhinged",
    ))
    sysprompt = _system_text(mock_client)
    assert _build_spice_block("unhinged") in sysprompt


def test_single_image_injects_spice_block():
    mock_client = _async_mock_client(_single_image_response())
    _run(_generate_single_image_hook(
        mock_client, {**_CLIENT, "spice_level": "bold"}, _ONBOARDING,
        topic="Test", platform="instagram",
    ))
    sysprompt = _system_text(mock_client)
    assert _build_spice_block("bold") in sysprompt


def test_carousel_balanced_does_not_bloat_prompt():
    """balanced (default) keeps the static cache prefix stable — spice text must live in the
    dynamic suffix only. Static block 0 should never carry spice content."""
    mock_client = _mock_client(_carousel_response())
    _run(_generate_carousel_single_pass(
        mock_client, _CLIENT, _ONBOARDING, topic="Test", slide_count=5,
        slide_format="tips", platform="instagram", cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
        spice_level="bold",
    ))
    blocks = mock_client.messages.create.call_args.kwargs.get("system")
    assert isinstance(blocks, list)
    static_block = blocks[0]["text"]
    assert _build_spice_block("bold") not in static_block


# ─── 1.3 — softened _humanize_content ─────────────────────────────────────────

def test_humanize_keeps_em_dash():
    text = "This is the truth — and you know it."
    out = _humanize_content(text)
    assert "—" in out  # em-dash now reads human, must survive


def test_humanize_strips_markdown_and_smart_quotes():
    text = "**Bold** and *italic* with “smart” quotes and an ellipsis…"
    out = _humanize_content(text)
    assert "**" not in out and "*" not in out
    assert "“" not in out and "”" not in out
    assert '"smart"' in out
    assert "…" not in out and "..." in out


def test_humanize_strips_unicode_bullets_and_headers():
    text = "# Heading\n• first\n→ second"
    out = _humanize_content(text)
    assert not out.startswith("#")
    assert "•" not in out
    assert "→" not in out


def test_humanize_kills_true_bot_tells():
    assert "leverage" not in _humanize_content("We leverage data.").lower()
    assert "utilize" not in _humanize_content("We utilize tools.").lower()
    assert "synergy" not in _humanize_content("Pure synergy here.").lower()
    assert "In today's world" not in _humanize_content("In today's world, things change.")
    assert "It's important to note" not in _humanize_content("It's important to note this.")
    assert "delve" not in _humanize_content("Let's delve into it.").lower()
    assert "circle back" not in _humanize_content("Let's circle back later.").lower()


def test_humanize_preserves_legitimate_voice():
    """These words are legitimate voice and must NOT be swapped anymore."""
    for word in ["strategic", "dynamic", "narrative", "pivot", "ecosystem",
                 "proactive", "actionable", "impactful", "sustainable",
                 "foster", "cultivate", "demonstrate"]:
        out = _humanize_content(f"This is a {word} approach.")
        assert word in out.lower(), f"{word!r} should be preserved, got: {out!r}"
