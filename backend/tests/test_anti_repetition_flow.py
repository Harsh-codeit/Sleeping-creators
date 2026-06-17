"""Phases 2–4 integration tests — anti-repetition flows.

Carousel: variant swap, forced-rotation regen, exhaustion incident, variety
contract wiring (and legacy fallback). Video: 3-variant request + selection,
incident logging, single-object parser fallback, model routing, variety
contract + existing-hooks forbidden list.

Network-free: anthropic mocked at module level, embeddings absent (Jaccard
fallback paths), motor db mocked.
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
import content_dna  # noqa: E402
import semantic_gate  # noqa: E402
import variety_planner  # noqa: E402
import video_render_service  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def _dna(hook_text, **kw):
    base = {"hook_text": hook_text, "hook_embedding": None, "hook_type": "myth_bust",
            "format": "tips", "topic": "t", "angle": "a", "emotion": "hope",
            "opening_structure": "statement", "format_kind": "carousel",
            "embedded_at": None, "embed_model": None,
            "post_id": "p0", "created_at": "2026-06-01T00:00:00+00:00"}
    base.update(kw)
    return base


def _incident_db():
    db = MagicMock()
    db.repetition_incidents.insert_one = AsyncMock(return_value=None)
    return db


# ─── carousel: _run_carousel_gate ────────────────────────────────────────────

def _attempt(primary, variants=None, hook_type="myth_bust", title="Keep Title"):
    d = {"title": title, "strategy": {"format": "tips", "hook_type": hook_type},
         "author_name": "A", "author_handle": "@a", "author_title": "T",
         "slides": [{"slide_number": 1, "content": primary},
                    {"slide_number": 2, "content": "body"}]}
    if variants is not None:
        d["hook_variants"] = variants
    return d


def test_carousel_variant_swap_on_primary_fail(monkeypatch):
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("old hook line")]))
    data = _attempt("old hook line",
                    variants=["completely different opener", "another fresh angle entirely"])
    gen_fn = AsyncMock()

    out = _run(ai_service._run_carousel_gate(_incident_db(), {"id": "c1"}, data, gen_fn, None))

    assert out["slides"][0]["content"] == "completely different opener"
    assert out["title"] == "Keep Title"          # title kept, no regen
    assert "hook_variants" not in out            # variants never persist
    gen_fn.assert_not_awaited()


def test_carousel_primary_pass_no_changes(monkeypatch):
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("an unrelated previous hook")]))
    data = _attempt("totally novel subject matter here", variants=["v1", "v2"])
    gen_fn = AsyncMock()
    out = _run(ai_service._run_carousel_gate(_incident_db(), {"id": "c1"}, data, gen_fn, None))
    assert out["slides"][0]["content"] == "totally novel subject matter here"
    assert "hook_variants" not in out
    gen_fn.assert_not_awaited()


def test_carousel_regen_with_forced_hook_type(monkeypatch):
    dup = "you ate perfectly for six days then ruined it sunday"
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("you ate perfectly for six days then ruined it on a sunday")]))
    data = _attempt(dup, variants=[
        "you ate perfectly for six days then ruined it on sunday",
        "you ate perfectly six days then ruined sunday",
    ])
    spec = variety_planner.VarietySpec(
        format_kind="carousel", hook_type="credibility_borrow",
        banned_hook_types=["myth_bust"])

    captured = {}

    async def gen_fn(retry_note="", variety_block_override=None):
        captured["retry_note"] = retry_note
        captured["override"] = variety_block_override
        return _attempt("three hiring mistakes that cost me a company",
                        hook_type="emotional_state", title="Retry Title")

    out = _run(ai_service._run_carousel_gate(_incident_db(), {"id": "c1"}, data, gen_fn, spec))

    assert out["slides"][0]["content"] == "three hiring mistakes that cost me a company"
    assert "too similar" in captured["retry_note"]
    # respec_for_retry banned myth_bust + credibility_borrow -> forces emotional_state.
    assert 'hook_type "emotional_state"' in captured["retry_note"]
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in captured["override"]
    assert "hook_variants" not in out


def test_carousel_regen_readapts_same_hook_when_locked(monkeypatch):
    dup = "you ate perfectly for six days then ruined it sunday"
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("you ate perfectly for six days then ruined it on a sunday")]))
    data = _attempt(dup, variants=[
        "you ate perfectly for six days then ruined it on sunday",
        "you ate perfectly six days then ruined sunday",
    ])
    spec = variety_planner.VarietySpec(
        format_kind="carousel", hook_type="credibility_borrow",
        banned_hook_types=["myth_bust"])
    captured = {}

    async def gen_fn(retry_note="", variety_block_override=None):
        captured["retry_note"] = retry_note
        captured["override"] = variety_block_override
        return _attempt("three hiring mistakes that cost me a company",
                        hook_type="emotional_state", title="Retry Title")

    top_hook = {"hook_text": "the exact viral hook line", "hook_type": "shocking_number",
                "trigger": "shock_value"}
    out = _run(ai_service._run_carousel_gate(
        _incident_db(), {"id": "c1"}, data, gen_fn, spec, top_hook=top_hook))

    assert out["slides"][0]["content"] == "three hiring mistakes that cost me a company"
    # Hook-locked retry: keep the same hook, no forced hook-type rotation, no override.
    assert "same proven hook" in captured["retry_note"].lower()
    assert "the exact viral hook line" in captured["retry_note"]
    assert 'hook_type "' not in captured["retry_note"]
    assert captured["override"] is None


def test_carousel_regen_empty_locked_hook_falls_back_to_forced_rotation(monkeypatch):
    dup = "you ate perfectly for six days then ruined it sunday"
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("you ate perfectly for six days then ruined it on a sunday")]))
    data = _attempt(dup, variants=[
        "you ate perfectly for six days then ruined it on sunday",
        "you ate perfectly six days then ruined sunday",
    ])
    spec = variety_planner.VarietySpec(
        format_kind="carousel", hook_type="credibility_borrow",
        banned_hook_types=["myth_bust"])
    captured = {}

    async def gen_fn(retry_note="", variety_block_override=None):
        captured["retry_note"] = retry_note
        captured["override"] = variety_block_override
        return _attempt("three hiring mistakes that cost me a company",
                        hook_type="emotional_state", title="Retry Title")

    # Whitespace-only hook_text must be treated as "not locked".
    out = _run(ai_service._run_carousel_gate(
        _incident_db(), {"id": "c1"}, data, gen_fn, spec, top_hook={"hook_text": "   "}))

    assert out["slides"][0]["content"] == "three hiring mistakes that cost me a company"
    # Forced-rotation path: a forced hook_type is present, variety override passed.
    assert 'hook_type "' in captured["retry_note"]
    assert captured["override"] is not None


def test_carousel_exhaustion_ships_least_similar_and_logs_incident(monkeypatch):
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("alpha beta gamma delta epsilon")]))
    data = _attempt("alpha beta gamma delta epsilon zeta", variants=[
        "alpha beta gamma delta eta",                       # 0.667
        "alpha beta gamma delta epsilon theta iota",        # 0.714
    ])

    async def gen_fn(retry_note="", variety_block_override=None):
        return _attempt("alpha beta gamma delta kappa lambda", title="Retry")  # 0.571 — least

    db = _incident_db()
    out = _run(ai_service._run_carousel_gate(db, {"id": "c1"}, data, gen_fn, None))

    assert out["slides"][0]["content"] == "alpha beta gamma delta kappa lambda"
    db.repetition_incidents.insert_one.assert_awaited_once()
    doc = db.repetition_incidents.insert_one.await_args.args[0]
    assert doc["client_id"] == "c1"
    assert doc["format_kind"] == "carousel"
    assert doc["candidate_text"] == "alpha beta gamma delta kappa lambda"
    assert doc["method"] == "jaccard"


def test_carousel_gate_skipped_without_db_or_modules(monkeypatch):
    data = _attempt("hook", variants=["v1"])
    out = _run(ai_service._run_carousel_gate(None, {"id": "c1"}, data, AsyncMock(), None))
    assert out["slides"][0]["content"] == "hook"
    assert "hook_variants" not in out


def test_carousel_gate_regen_exception_ships_least_similar(monkeypatch):
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("alpha beta gamma delta epsilon")]))
    data = _attempt("alpha beta gamma delta epsilon zeta",
                    variants=["alpha beta gamma delta eta"])
    gen_fn = AsyncMock(side_effect=RuntimeError("api down"))
    db = _incident_db()
    out = _run(ai_service._run_carousel_gate(db, {"id": "c1"}, data, gen_fn, None))
    # least similar of attempt 1 = the variant (0.667 < 0.833) -> swapped in.
    assert out["slides"][0]["content"] == "alpha beta gamma delta eta"
    db.repetition_incidents.insert_one.assert_awaited_once()


# ─── carousel: variety contract wiring ───────────────────────────────────────

def _mock_llm(resp):
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(resp))]
    msg.model = "claude-sonnet-4-5"
    msg.usage = MagicMock(input_tokens=10, output_tokens=20)
    c = MagicMock()
    c.messages.create.return_value = msg
    return c


def _carousel_response(slide_count=5):
    return {"title": "T", "strategy": {"topic": "t", "format": "tips",
            "hook_type": "myth_bust", "angle": "a", "emotions": ["hope", "pride"]},
            "author_name": "A", "author_handle": "@a", "author_title": "T",
            "hook_variants": ["va", "vb"],
            "slides": [{"slide_number": i + 1, "content": f"S{i+1}"} for i in range(slide_count)]}


def _system_text(mock_client):
    val = mock_client.messages.create.call_args.kwargs.get("system", "")
    if isinstance(val, str):
        return val
    return " ".join(b.get("text", "") for b in val)


def test_single_pass_variety_block_replaces_memory_blocks():
    mock = _mock_llm(_carousel_response())
    # db WOULD return memory rows — the variety contract must suppress them.
    rows = [{"carousel_data": {"strategy": {"topic": "old topic", "angle": "old angle",
             "hook_type": "myth_bust", "format": "tips"}},
             "created_at": "2026-06-01T00:00:00+00:00", "title": "x"}]
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    db = MagicMock()
    db.posts.find.return_value = cursor
    db.token_usage.insert_one = AsyncMock(return_value=None)
    spec = variety_planner.VarietySpec(
        format_kind="carousel", hook_type="relatable_scene",
        banned_hook_types=["myth_bust"], forbidden_openings=["old line"])
    _run(ai_service._generate_carousel_single_pass(
        mock, {"id": "c1", "name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
        variety_block=spec.prompt_block(), db=db,
    ))
    sysprompt = _system_text(mock)
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in sysprompt
    assert "RECENT CONTENT MEMORY" not in sysprompt


def test_single_pass_legacy_memory_when_no_variety_block(monkeypatch):
    mock = _mock_llm(_carousel_response())
    rows = [{"carousel_data": {"strategy": {"topic": "old topic", "angle": "old angle",
             "hook_type": "myth_bust", "format": "tips"}},
             "created_at": "2026-06-01T00:00:00+00:00", "title": "x"}]
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    db = MagicMock()
    db.posts.find.return_value = cursor
    db.token_usage.insert_one = AsyncMock(return_value=None)
    _run(ai_service._generate_carousel_single_pass(
        mock, {"id": "c1", "name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="", db=db,
    ))
    sysprompt = _system_text(mock)
    assert "RECENT CONTENT MEMORY" in sysprompt
    assert "VARIETY CONTRACT" not in sysprompt


def test_single_pass_schema_includes_hook_variants():
    mock = _mock_llm(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, {"name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
    ))
    sysprompt = _system_text(mock)
    assert '"hook_variants"' in sysprompt


def test_generate_carousel_passes_planner_block(monkeypatch):
    import persona_service
    monkeypatch.setattr(persona_service, "get_or_build_persona", AsyncMock(return_value=None))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai_service.anthropic, "Anthropic", lambda api_key=None: MagicMock())
    monkeypatch.setattr(ai_service, "_recent_hook_texts", AsyncMock(return_value=["legacy hook"]))
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna", AsyncMock(return_value=[]))

    spec = variety_planner.VarietySpec(format_kind="carousel", hook_type="relatable_scene",
                                       banned_hook_types=["myth_bust"])
    monkeypatch.setattr(ai_service.variety_planner, "plan_next",
                        AsyncMock(return_value=spec))

    captured = {}

    async def fake_single_pass(*args, **kwargs):
        captured.update(kwargs)
        return _carousel_response()

    monkeypatch.setattr(ai_service, "_generate_carousel_single_pass", fake_single_pass)

    db = MagicMock()
    db.token_usage.insert_one = AsyncMock(return_value=None)
    _run(ai_service.generate_carousel(
        {"id": "c1", "name": "Acme", "industry": "Tech", "onboarding_data": {}},
        "instagram", "full_white", topic="t", slide_count=5, db=db,
    ))
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in captured["variety_block"]
    assert captured["recent_text_memory"] == ""  # legacy block suppressed


def test_generate_carousel_legacy_when_planner_none(monkeypatch):
    import persona_service
    monkeypatch.setattr(persona_service, "get_or_build_persona", AsyncMock(return_value=None))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai_service.anthropic, "Anthropic", lambda api_key=None: MagicMock())
    monkeypatch.setattr(ai_service, "_recent_hook_texts", AsyncMock(return_value=["legacy hook"]))
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_service.variety_planner, "plan_next", AsyncMock(return_value=None))

    captured = {}

    async def fake_single_pass(*args, **kwargs):
        captured.update(kwargs)
        return _carousel_response()

    monkeypatch.setattr(ai_service, "_generate_carousel_single_pass", fake_single_pass)
    db = MagicMock()
    db.token_usage.insert_one = AsyncMock(return_value=None)
    _run(ai_service.generate_carousel(
        {"id": "c1", "name": "Acme", "industry": "Tech", "onboarding_data": {}},
        "instagram", "full_white", topic="t", slide_count=5, db=db,
    ))
    assert captured["variety_block"] == ""
    assert "legacy hook" in captured["recent_text_memory"]


# ─── video: generate_video_content variants ──────────────────────────────────

_FIELDS = [{"find": "HOOK_TEXT", "ai_hint": "on-video hook", "max_chars": 50}]


def _variant(caption, hook="fresh on-video hook"):
    return {"merge_values": {"HOOK_TEXT": hook}, "caption": caption,
            "hashtags": ["a", "b"]}


@pytest.fixture
def _video_env(monkeypatch):
    """Common video mocks: no custom prompt, no usage recording, no grounding,
    planner off (individual tests override)."""
    monkeypatch.setattr(video_render_service, "_resolve_custom_video_prompt",
                        AsyncMock(return_value=None))
    monkeypatch.setattr(video_render_service, "record_usage",
                        AsyncMock(return_value=None))
    monkeypatch.setattr(ai_service, "build_generation_context", AsyncMock(return_value={
        "persona_block": "", "brand_context": "", "memory_block": "", "recent_hooks": []}))
    monkeypatch.setattr(variety_planner, "plan_next", AsyncMock(return_value=None))
    yield


def test_video_requests_variants_and_ships_most_distant(_video_env, monkeypatch):
    monkeypatch.setattr(content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("alpha beta gamma delta epsilon")]))
    captured = {}

    def fake_gen(full_prompt, *, model="claude-haiku-4-5-20251001", token_tiers=(4096, 8000)):
        captured["prompt"] = full_prompt
        captured["model"] = model
        captured["token_tiers"] = token_tiers
        return ({"variants": [
            _variant("alpha beta gamma delta epsilon zeta\nrest"),   # 0.833 fail
            _variant("totally different words right here\nrest"),    # pass, most distant
            _variant("alpha beta gamma something else again\nrest"), # pass, closer
        ]}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    db = _incident_db()
    out = _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=db))

    assert '"variants"' in captured["prompt"]
    assert "exactly 3 complete alternatives" in captured["prompt"]
    assert captured["token_tiers"] == (8000, 12000)
    assert captured["model"] == video_render_service._video_model("video_content", {"id": "c1"})
    assert out["caption"].startswith("totally different words right here")
    assert out["merge_values"] == {"HOOK_TEXT": "fresh on-video hook"}
    db.repetition_incidents.insert_one.assert_not_awaited()


def test_video_none_pass_logs_incident_ships_least_similar(_video_env, monkeypatch):
    monkeypatch.setattr(content_dna, "ensure_dna",
                        AsyncMock(return_value=[_dna("alpha beta gamma delta epsilon")]))

    def fake_gen(full_prompt, **kw):
        return ({"variants": [
            _variant("alpha beta gamma delta epsilon zeta\nrest"),        # 0.833
            _variant("alpha beta gamma delta kappa lambda\nrest"),        # 0.571 least
            _variant("alpha beta gamma delta epsilon theta iota\nrest"),  # 0.714
        ]}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    db = _incident_db()
    out = _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=db))

    assert out["caption"].startswith("alpha beta gamma delta kappa lambda")
    db.repetition_incidents.insert_one.assert_awaited_once()
    doc = db.repetition_incidents.insert_one.await_args.args[0]
    assert doc["format_kind"] == "video"
    assert doc["method"] == "jaccard"


def test_video_parser_falls_back_to_single_object(_video_env, monkeypatch):
    monkeypatch.setattr(content_dna, "ensure_dna", AsyncMock(return_value=[]))

    def fake_gen(full_prompt, **kw):
        # Model ignored the variants instruction and returned the legacy shape.
        return ({"merge_values": {"HOOK_TEXT": "h"}, "caption": "plain caption",
                 "hashtags": ["x"]}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    out = _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=_incident_db()))
    assert out["caption"] == "plain caption"
    assert out["merge_values"] == {"HOOK_TEXT": "h"}


def test_video_no_variants_without_db(_video_env, monkeypatch):
    captured = {}

    def fake_gen(full_prompt, **kw):
        captured["prompt"] = full_prompt
        captured.update(kw)
        return ({"merge_values": {}, "caption": "c", "hashtags": []}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=None))
    assert "FINAL OUTPUT OVERRIDE" not in captured["prompt"]
    assert captured.get("token_tiers") == (4096, 8000)


def test_video_variety_contract_replaces_memory(_video_env, monkeypatch):
    monkeypatch.setattr(ai_service, "build_generation_context", AsyncMock(return_value={
        "persona_block": "", "brand_context": "",
        "memory_block": "\n\nRECENTLY USED OPENINGS legacy block", "recent_hooks": []}))
    spec = variety_planner.VarietySpec(format_kind="video", hook_type="relatable_scene",
                                       banned_hook_types=["myth_bust"])
    monkeypatch.setattr(variety_planner, "plan_next", AsyncMock(return_value=spec))
    monkeypatch.setattr(content_dna, "ensure_dna", AsyncMock(return_value=[]))
    captured = {}

    def fake_gen(full_prompt, **kw):
        captured["prompt"] = full_prompt
        return ({"merge_values": {}, "caption": "c", "hashtags": []}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=_incident_db()))
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in captured["prompt"]
    assert "RECENTLY USED OPENINGS" not in captured["prompt"]


def test_video_prompt_grounded_with_hooks_and_scripts(_video_env, monkeypatch):
    """Phase 4a: generate_video_content injects the hook-patterns block and the
    winning-script-examples block (both fail-open elsewhere)."""
    import script_retrieval
    monkeypatch.setattr(ai_service, "_build_hook_patterns_block", AsyncMock(
        return_value="\n\nPROVEN VIRAL HOOK PATTERNS — study these:\n1. [myth_bust] X"))
    monkeypatch.setattr(script_retrieval, "build_script_examples_block", AsyncMock(
        return_value="\n\nWINNING SCRIPT EXAMPLES — real scripts:\n[Example 1] Y"))
    monkeypatch.setattr(content_dna, "ensure_dna", AsyncMock(return_value=[]))
    captured = {}

    def fake_gen(full_prompt, **kw):
        captured["prompt"] = full_prompt
        return ({"merge_values": {}, "caption": "c", "hashtags": []}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme", "onboarding_data": {"niche_slug": "saas-tech"}},
        _FIELDS, db=_incident_db()))
    assert "PROVEN VIRAL HOOK PATTERNS" in captured["prompt"]
    assert "WINNING SCRIPT EXAMPLES" in captured["prompt"]


def test_video_grounding_failure_does_not_block(_video_env, monkeypatch):
    monkeypatch.setattr(ai_service, "_build_hook_patterns_block",
                        AsyncMock(side_effect=RuntimeError("retrieval down")))
    monkeypatch.setattr(content_dna, "ensure_dna", AsyncMock(return_value=[]))
    captured = {}

    def fake_gen(full_prompt, **kw):
        captured["prompt"] = full_prompt
        return ({"merge_values": {}, "caption": "c", "hashtags": []}, MagicMock())

    monkeypatch.setattr(video_render_service, "_generate_content_json", fake_gen)
    out = _run(video_render_service.generate_video_content(
        "topic", {"id": "c1", "name": "Acme"}, _FIELDS, db=_incident_db()))
    assert out["caption"] == "c"  # generation completed despite grounding failure


# ─── video: generate_ai_text + generate_video_hook ───────────────────────────

def _llm_for_video(monkeypatch, response_text):
    msg = MagicMock()
    msg.content = [MagicMock(text=response_text)]
    client = MagicMock()
    client.messages.create.return_value = msg
    monkeypatch.setattr(video_render_service, "_anthropic_client", lambda: client)
    return client


def test_generate_ai_text_prepends_variety_contract(monkeypatch):
    monkeypatch.setattr(video_render_service, "_resolve_custom_video_prompt",
                        AsyncMock(return_value=None))
    spec = variety_planner.VarietySpec(format_kind="video", hook_type="relatable_scene",
                                       banned_hook_types=["myth_bust"])
    monkeypatch.setattr(variety_planner, "plan_next", AsyncMock(return_value=spec))
    client = _llm_for_video(monkeypatch, '{"F1": "text"}')
    db = MagicMock()
    db.token_usage.insert_one = AsyncMock(return_value=None)
    monkeypatch.setattr(video_render_service, "record_usage", AsyncMock(return_value=None))

    out = _run(video_render_service.generate_ai_text(
        [{"find": "F1", "ai_hint": "h", "max_chars": 50}], {"id": "c1"}, "topic", db=db))

    assert out == {"F1": "text"}
    prompt = client.messages.create.call_args.kwargs["messages"][0]["content"]
    assert prompt.startswith("VARIETY CONTRACT — HARD CONSTRAINTS")
    assert client.messages.create.call_args.kwargs["model"] == "claude-haiku-4-5-20251001"


def test_generate_ai_text_no_contract_without_db(monkeypatch):
    monkeypatch.setattr(video_render_service, "_resolve_custom_video_prompt",
                        AsyncMock(return_value=None))
    client = _llm_for_video(monkeypatch, '{"F1": "text"}')
    _run(video_render_service.generate_ai_text(
        [{"find": "F1", "ai_hint": "h", "max_chars": 50}], {"id": "c1"}, "topic", db=None))
    prompt = client.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "VARIETY CONTRACT" not in prompt


def test_generate_video_hook_forbids_existing_hooks(monkeypatch):
    monkeypatch.setattr(video_render_service, "_resolve_custom_video_prompt",
                        AsyncMock(return_value=None))
    client_doc = {"id": "c1", "name": "Acme", "strategy": {"video_hooks": [
        {"title": "Morning routine myth", "prompt": "bust the 5am club idea"},
        {"title": "Hidden gym fees", "prompt": "expose membership traps"},
    ]}}
    llm = _llm_for_video(monkeypatch, '{"title": "New angle", "prompt": "do new things"}')

    out = _run(video_render_service.generate_video_hook(client_doc, "keyword"))

    assert out == {"title": "New angle", "prompt": "do new things"}
    prompt = llm.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "EXISTING VIDEO HOOKS" in prompt
    assert "Morning routine myth" in prompt
    assert "Hidden gym fees" in prompt
    assert llm.messages.create.call_args.kwargs["model"] == "claude-haiku-4-5-20251001"


def test_generate_video_hook_no_block_when_none_exist(monkeypatch):
    monkeypatch.setattr(video_render_service, "_resolve_custom_video_prompt",
                        AsyncMock(return_value=None))
    llm = _llm_for_video(monkeypatch, '{"title": "T", "prompt": "P"}')
    _run(video_render_service.generate_video_hook({"id": "c1", "name": "Acme"}, ""))
    prompt = llm.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "EXISTING VIDEO HOOKS" not in prompt


# ─── model routing ───────────────────────────────────────────────────────────

def test_video_model_defaults_reproduce_haiku_exactly():
    for gen_type in ("video_content", "video_hook", "video_ai_text"):
        assert ai_service.resolve_model(gen_type) == "claude-haiku-4-5-20251001"
        assert video_render_service._video_model(gen_type, {}) == "claude-haiku-4-5-20251001"


def test_video_model_tier_override_lifts_to_sonnet():
    ai_service.MODEL_TIERS["premium"] = {"video_content": "claude-sonnet-4-5"}
    try:
        assert video_render_service._video_model(
            "video_content", {"model_tier": "premium"}) == "claude-sonnet-4-5"
        # Unconfigured types fall through to the route default.
        assert video_render_service._video_model(
            "video_hook", {"model_tier": "premium"}) == "claude-haiku-4-5-20251001"
    finally:
        ai_service.MODEL_TIERS.pop("premium", None)
