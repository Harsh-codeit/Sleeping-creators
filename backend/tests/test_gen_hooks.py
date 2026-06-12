"""Phase C tests — viral-hook PATTERN injection + anti-sameness + model routing.

Covers:
  1. ai_service._build_hook_patterns_block — fail-open + formatting + anti-sameness.
  2. ai_service.resolve_model — default routes reproduce today exactly + per-client override.
  3. Injection points: carousel single-pass dynamic suffix + single-image system message.

All tests are network-free: hook_clients.embed, viral_library.retrieve and
_recent_hook_texts are monkeypatched; the anthropic client is mocked.
"""
import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()

import ai_service  # noqa: E402


# ─── helpers ──────────────────────────────────────────────────────────────────

def _run(coro):
    return asyncio.run(coro)


def _make_message(response_dict):
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(response_dict))]
    msg.model = "claude-sonnet-4-5"
    msg.usage = MagicMock(input_tokens=100, output_tokens=50)
    return msg


def _mock_client(response_dict):
    c = MagicMock()
    c.messages.create.return_value = _make_message(response_dict)
    return c


def _async_mock_client(response_dict):
    c = MagicMock()
    c.messages.create = AsyncMock(return_value=_make_message(response_dict))
    return c


def _system_text(mock_client):
    val = mock_client.messages.create.call_args.kwargs.get("system", "")
    if isinstance(val, str):
        return val
    return " ".join(b.get("text", "") for b in val)


def _carousel_response(slide_count=5, fmt="tips"):
    return {
        "title": "T",
        "strategy": {
            "topic": "t", "format": fmt, "hook_type": "myth_bust",
            "angle": "a", "emotions": ["hope", "pride"], "virality_angle": "v",
            "audience_pain": "p", "mirror_slide_number": 2, "slide_arc": "a -> b -> c",
        },
        "author_name": "Acme", "author_handle": "@acme", "author_title": "Tech",
        "slides": [{"slide_number": i + 1, "content": f"Slide {i+1}"} for i in range(slide_count)],
    }


def _single_image_response():
    return {
        "title": "S", "hook_type": "direct_confront", "content": "The biggest lie in tech.",
        "author_name": "Acme", "author_handle": "@acme", "author_title": "Tech",
    }


_CLIENT = {"id": "c1", "name": "Acme", "industry": "Tech", "strategy": {"tone": "bold"}}
_ONBOARDING = {"language": "English", "niche_slug": "saas-tech",
               "problem_solved": "founders burn out", "brand_vibe": "blunt"}


def _hooks():
    return [
        {"id": "h1", "hook_text": "You are not lazy. You are exhausted.",
         "hook_type": "emotional_state", "trigger": "validation",
         "niche_slug": "saas-tech", "virality_score": 0.9, "score": 1.2},
        {"id": "h2", "hook_text": "Stop scaling. Start surviving.",
         "hook_type": "direct_confront", "trigger": "controversy",
         "niche_slug": "saas-tech", "virality_score": 0.8, "score": 1.0},
    ]


@pytest.fixture(autouse=True)
def _patch_externals(monkeypatch):
    """Default happy-path patches; individual tests override as needed."""
    monkeypatch.setattr(ai_service.hook_clients, "embed", lambda text: [0.1, 0.2, 0.3], raising=False)
    monkeypatch.setattr(ai_service.hook_clients, "embed_query_cached",
                        lambda text: [0.1, 0.2, 0.3], raising=False)
    monkeypatch.setattr(ai_service.viral_library, "retrieve",
                        lambda *a, **k: _hooks(), raising=False)

    async def _no_recent(*a, **k):
        return []
    monkeypatch.setattr(ai_service, "_recent_hook_texts", _no_recent)
    yield


# ─── _build_hook_patterns_block: fail-open ────────────────────────────────────

def test_block_empty_when_use_hook_library_false():
    client = {**_CLIENT, "use_hook_library": False}
    out = _run(ai_service._build_hook_patterns_block(client, _ONBOARDING, "topic", db=None))
    assert out == ""


def test_block_empty_when_embed_raises(monkeypatch):
    def _boom(text):
        raise RuntimeError("no key")
    monkeypatch.setattr(ai_service.hook_clients, "embed", _boom, raising=False)
    monkeypatch.setattr(ai_service.hook_clients, "embed_query_cached", _boom, raising=False)
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db=None))
    assert out == ""


def test_block_empty_when_retrieve_returns_empty(monkeypatch):
    monkeypatch.setattr(ai_service.viral_library, "retrieve", lambda *a, **k: [], raising=False)
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db=None))
    assert out == ""


def test_block_empty_when_retrieve_raises(monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("db gone")
    monkeypatch.setattr(ai_service.viral_library, "retrieve", _boom, raising=False)
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db=None))
    assert out == ""


# ─── _build_hook_patterns_block: formatting ───────────────────────────────────

def test_block_formats_retrieved_hooks():
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "founder burnout", db=None))
    assert out  # non-empty
    # Header drives "study the structure / fresh hook / never copy wording".
    low = out.lower()
    assert "structure" in low
    assert "fresh" in low or "never copy" in low or "do not copy" in low
    # Both hook texts + their hook_type labels are present.
    assert "You are not lazy. You are exhausted." in out
    assert "Stop scaling. Start surviving." in out
    assert "emotional_state" in out
    assert "direct_confront" in out


def test_block_passes_niche_and_language_to_retrieve(monkeypatch):
    captured = {}

    def _retrieve(query_text, query_embedding, *, niche_slug=None, language=None, k=5):
        captured["niche_slug"] = niche_slug
        captured["language"] = language
        captured["k"] = k
        captured["query_text"] = query_text
        return _hooks()

    monkeypatch.setattr(ai_service.viral_library, "retrieve", _retrieve, raising=False)
    _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "founder burnout", db=None))
    assert captured["niche_slug"] == "saas-tech"
    assert captured["language"] == "English"
    # Phase 4 exemplar entropy: retrieve a POOL, then sample EXEMPLAR_K from it.
    assert captured["k"] == ai_service.content_dna.EXEMPLAR_POOL
    # query_text blends topic + problem_solved + brand_vibe.
    assert "founder burnout" in captured["query_text"]
    assert "founders burn out" in captured["query_text"]


def test_block_samples_pool_and_logs_usage(monkeypatch):
    """>EXEMPLAR_K retrieved -> only EXEMPLAR_K rendered; injected ids logged."""
    hooks = [{"id": f"h{i}", "hook_text": f"unique viral line number {i}",
              "hook_type": "myth_bust", "trigger": "fomo", "niche_slug": "saas-tech",
              "virality_score": 0.5, "score": 1.0 - i * 0.01} for i in range(12)]
    monkeypatch.setattr(ai_service.viral_library, "retrieve",
                        lambda *a, **k: hooks, raising=False)
    monkeypatch.setattr(ai_service.variety_planner, "recent_exemplar_ids",
                        AsyncMock(return_value=set()))
    logged = {}

    async def fake_log(db, client_id, ids):
        logged["client_id"] = client_id
        logged["ids"] = ids

    monkeypatch.setattr(ai_service.variety_planner, "log_exemplar_usage", fake_log)

    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db=MagicMock()))

    rendered = [l for l in out.splitlines() if l.strip() and l.strip()[0].isdigit()]
    assert len(rendered) == ai_service.content_dna.EXEMPLAR_K
    assert logged["client_id"] == "c1"
    assert len(logged["ids"]) == ai_service.content_dna.EXEMPLAR_K
    assert all(i.startswith("h") for i in logged["ids"])


# ─── _build_hook_patterns_block: anti-sameness ────────────────────────────────

def test_block_drops_client_recent_similar_hooks(monkeypatch):
    # Recent hook is near-identical to h1 -> h1 must be dropped, h2 kept.
    async def _recent(*a, **k):
        return ["You are not lazy you are exhausted"]
    monkeypatch.setattr(ai_service, "_recent_hook_texts", _recent)
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db="db"))
    assert "You are not lazy. You are exhausted." not in out
    assert "Stop scaling. Start surviving." in out


def test_block_empty_when_all_hooks_filtered(monkeypatch):
    async def _recent(*a, **k):
        return ["You are not lazy you are exhausted", "Stop scaling start surviving"]
    monkeypatch.setattr(ai_service, "_recent_hook_texts", _recent)
    out = _run(ai_service._build_hook_patterns_block(_CLIENT, _ONBOARDING, "topic", db="db"))
    assert out == ""


# ─── injection into generation paths ──────────────────────────────────────────

def test_carousel_injects_hook_patterns_block():
    client = {**_CLIENT, "use_hook_library": True}
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, client, _ONBOARDING, topic="founder burnout", slide_count=5,
        slide_format="tips", platform="instagram", cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    sysprompt = _system_text(mock)
    assert "You are not lazy. You are exhausted." in sysprompt


def test_carousel_hook_block_in_dynamic_suffix_only():
    """The retrieved (per-client) block must live in the dynamic suffix, never the
    cacheable static prefix."""
    client = {**_CLIENT, "use_hook_library": True}
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, client, _ONBOARDING, topic="founder burnout", slide_count=5,
        slide_format="tips", platform="instagram", cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    blocks = mock.messages.create.call_args.kwargs.get("system")
    assert isinstance(blocks, list)
    static_block = blocks[0]["text"]
    assert "You are not lazy. You are exhausted." not in static_block


def test_single_image_injects_hook_patterns_block():
    client = {**_CLIENT, "use_hook_library": True}
    mock = _async_mock_client(_single_image_response())
    _run(ai_service._generate_single_image_hook(
        mock, client, _ONBOARDING, topic="founder burnout", platform="instagram",
    ))
    sysprompt = _system_text(mock)
    assert "Stop scaling. Start surviving." in sysprompt


def test_carousel_no_block_when_disabled(monkeypatch):
    client = {**_CLIENT, "use_hook_library": False}
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, client, _ONBOARDING, topic="founder burnout", slide_count=5,
        slide_format="tips", platform="instagram", cta_keyword=None, cta_offer=None,
        hook_inspiration=None, global_instructions=None, trend_context="",
    ))
    sysprompt = _system_text(mock)
    assert "You are not lazy. You are exhausted." not in sysprompt


# ─── _use_hook_library ────────────────────────────────────────────────────────

def test_use_hook_library_defaults_true():
    assert ai_service._use_hook_library({"id": "x"}) is True


def test_use_hook_library_root_false():
    assert ai_service._use_hook_library({"use_hook_library": False}) is False


def test_use_hook_library_onboarding_false():
    assert ai_service._use_hook_library(
        {"onboarding_data": {"use_hook_library": False}}) is False


def test_use_hook_library_root_overrides_onboarding():
    assert ai_service._use_hook_library(
        {"use_hook_library": True, "onboarding_data": {"use_hook_library": False}}) is True


# ─── resolve_model ────────────────────────────────────────────────────────────

def test_resolve_model_defaults_reproduce_today():
    for gen_type in ("carousel_single_pass", "carousel_caption",
                     "single_image_hook", "generate_content"):
        assert ai_service.resolve_model(gen_type) == "claude-sonnet-4-5"


def test_resolve_model_unknown_type_falls_back_to_default():
    assert ai_service.resolve_model("brand_new_thing") == "claude-sonnet-4-5"


def test_resolve_model_per_client_tier_override():
    ai_service.MODEL_TIERS["cheap"] = {"carousel_single_pass": "test-cheap-model"}
    try:
        assert ai_service.resolve_model(
            "carousel_single_pass", client_tier="cheap") == "test-cheap-model"
        # A tier that doesn't define this gen_type falls back to the route default.
        assert ai_service.resolve_model(
            "carousel_caption", client_tier="cheap") == "claude-sonnet-4-5"
    finally:
        ai_service.MODEL_TIERS.pop("cheap", None)


def test_resolve_model_unknown_tier_falls_back_to_default():
    assert ai_service.resolve_model(
        "carousel_single_pass", client_tier="does-not-exist") == "claude-sonnet-4-5"


def test_resolve_model_video_routes_reproduce_todays_haiku_exactly():
    for gen_type in ("video_content", "video_hook", "video_ai_text"):
        assert ai_service.resolve_model(gen_type) == "claude-haiku-4-5-20251001"


def test_resolve_model_video_tier_override_lifts_to_sonnet():
    ai_service.MODEL_TIERS["premium"] = {"video_content": "claude-sonnet-4-5"}
    try:
        assert ai_service.resolve_model(
            "video_content", client_tier="premium") == "claude-sonnet-4-5"
        assert ai_service.resolve_model(
            "video_hook", client_tier="premium") == "claude-haiku-4-5-20251001"
    finally:
        ai_service.MODEL_TIERS.pop("premium", None)
