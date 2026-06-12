# backend/tests/test_generation_context.py
import sys, os, json, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock, AsyncMock
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()
import ai_service


def _run(coro):
    return asyncio.run(coro)


def _carousel_response(slide_count=5):
    return {
        "title": "T", "strategy": {"topic": "t", "format": "tips", "hook_type": "myth_bust",
        "angle": "a", "emotions": ["hope", "pride"], "virality_angle": "v",
        "audience_pain": "p", "mirror_slide_number": 2, "slide_arc": "a -> b -> c"},
        "author_name": "Acme", "author_handle": "@acme", "author_title": "Tech",
        "slides": [{"slide_number": i + 1, "content": f"Slide {i+1}"} for i in range(slide_count)],
    }


def _mock_client(resp):
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(resp))]
    msg.model = "claude-sonnet-4-5"
    msg.usage = MagicMock(input_tokens=10, output_tokens=20)
    c = MagicMock()
    c.messages.create.return_value = msg
    return c


def _system_text(mock_ai_client):
    """Return system prompt as a string whether it's a str or list of content blocks."""
    val = mock_ai_client.messages.create.call_args.kwargs.get("system", "")
    if isinstance(val, str):
        return val
    return " ".join(b.get("text", "") for b in val)


def test_single_pass_injects_persona_block():
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, {"name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
        persona_block="\n\nCLIENT PERSONA (write in this exact voice...):\nVoice: blunt ex-founder",
    ))
    system_prompt = _system_text(mock)
    assert "CLIENT PERSONA" in system_prompt
    assert "blunt ex-founder" in system_prompt


def _fake_memory_db(rows):
    db = MagicMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    db.posts.find.return_value = cursor
    # record_usage path: db.token_usage.insert_one must be awaitable
    db.token_usage.insert_one = AsyncMock(return_value=None)
    return db


def test_extract_hook_text_prefers_carousel_first_slide():
    row = {"carousel_data": {"slides": [{"content": "Hook line here"}], "title": "X"}}
    assert ai_service._extract_hook_text(row) == "Hook line here"


def test_extract_hook_text_falls_back_to_caption_then_text():
    assert ai_service._extract_hook_text({"caption": "Cap line\nmore"}) == "Cap line"
    assert ai_service._extract_hook_text({"text": "Text line\nmore"}) == "Text line"
    assert ai_service._extract_hook_text({}) == ""


def test_recent_hook_texts_returns_list():
    rows = [
        {"carousel_data": {"slides": [{"content": "First hook"}]}},
        {"caption": "Second hook\nrest"},
    ]
    hooks = _run(ai_service._recent_hook_texts("c1", _fake_memory_db(rows)))
    assert hooks == ["First hook", "Second hook"]


def test_recent_hook_texts_empty_safe():
    assert _run(ai_service._recent_hook_texts(None, MagicMock())) == []
    assert _run(ai_service._recent_hook_texts("c1", None)) == []


def test_format_recent_text_memory_block():
    block = ai_service._format_recent_text_memory(["First hook", "Second hook"])
    assert "RECENTLY USED OPENINGS" in block
    assert "First hook" in block
    assert "Second hook" in block
    assert ai_service._format_recent_text_memory([]) == ""


def test_build_generation_context_shape(monkeypatch):
    import persona_service
    monkeypatch.setattr(persona_service, "get_or_build_persona", AsyncMock(return_value={"voice": "blunt"}))
    rows = [{"carousel_data": {"slides": [{"content": "Recent hook"}]}}]
    db = _fake_memory_db(rows)
    client = {"id": "c1", "name": "Acme", "industry": "Tech"}
    ctx = _run(ai_service.build_generation_context(client, {"niche": "x"}, db))
    assert "CLIENT PERSONA" in ctx["persona_block"]
    assert "Recent hook" in ctx["memory_block"]
    assert ctx["recent_hooks"] == ["Recent hook"]
    assert isinstance(ctx["brand_context"], str)


def test_single_pass_injects_recent_text_memory():
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, {"name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
        recent_text_memory="\n\nRECENTLY USED OPENINGS — do NOT reuse:\n- \"old hook\"",
    ))
    system_prompt = _system_text(mock)
    assert "RECENTLY USED OPENINGS" in system_prompt
    assert "old hook" in system_prompt


def test_single_pass_appends_similarity_retry_note():
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, {"name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
        similarity_retry_note="Your opening was too similar. Rewrite completely.",
    ))
    system_prompt = _system_text(mock)
    assert "too similar" in system_prompt.lower()


def test_generate_carousel_regenerates_once_on_duplicate(monkeypatch):
    """Semantic gate (Jaccard fallback, no embeddings): a duplicate hook in the
    30-day DNA window triggers exactly one regeneration; the distinct retry ships."""
    import persona_service
    monkeypatch.setattr(persona_service, "get_or_build_persona", AsyncMock(return_value=None))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    # The 30-day DNA window contains the SAME hook the first generation produces.
    dup_hook = "you ate perfectly for six days then ruined it sunday"
    dna = [{"hook_text": dup_hook, "hook_embedding": None, "hook_type": "myth_bust",
            "format": "tips", "topic": "t", "angle": "a", "emotion": "hope",
            "opening_structure": "statement", "format_kind": "carousel",
            "embedded_at": None, "embed_model": None,
            "post_id": "p0", "created_at": "2026-06-01T00:00:00+00:00"}]
    monkeypatch.setattr(ai_service.content_dna, "ensure_dna",
                        AsyncMock(return_value=dna))
    # Isolate the gate: planner off -> legacy memory blocks path.
    monkeypatch.setattr(ai_service.variety_planner, "plan_next",
                        AsyncMock(return_value=None))

    calls = {"n": 0}

    async def fake_single_pass(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            content = dup_hook                      # duplicate → must trigger regen
        else:
            content = "three hiring mistakes that cost me everything"  # distinct
        return {"title": "T", "strategy": {"format": "tips", "hook_type": "myth_bust"},
                "author_name": "Acme", "author_handle": "@acme", "author_title": "Tech",
                "slides": [{"slide_number": 1, "content": content},
                           {"slide_number": 2, "content": "b"}]}

    monkeypatch.setattr(ai_service, "_generate_carousel_single_pass", fake_single_pass)
    # Stub anthropic.Anthropic so generate_carousel builds a client without a real key call
    monkeypatch.setattr(ai_service.anthropic, "Anthropic", lambda api_key=None: MagicMock())

    result = _run(ai_service.generate_carousel(
        {"id": "c1", "name": "Acme", "industry": "Tech", "onboarding_data": {}},
        "instagram", "full_white", topic="t", slide_count=5, db=_fake_memory_db([]),
    ))
    assert calls["n"] == 2, "expected exactly one regeneration on a duplicate hook"
    assert "hiring mistakes" in result["slides"][0]["content"]


def test_single_pass_passes_tools_to_model():
    mock = _mock_client(_carousel_response())
    # add stop_reason so the loop terminates immediately
    mock.messages.create.return_value.stop_reason = "end_turn"
    _run(ai_service._generate_carousel_single_pass(
        mock, {"id": "c1", "name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="", db=_fake_memory_db([]),
    ))
    kwargs = mock.messages.create.call_args.kwargs
    assert "tools" in kwargs
    names = [t.get("name") for t in kwargs["tools"]]
    assert "search_trends" in names
    system_prompt = _system_text(mock)
    assert "search_trends" in system_prompt


def test_single_pass_uses_cached_system_blocks():
    mock = _mock_client(_carousel_response())
    mock.messages.create.return_value.stop_reason = "end_turn"
    _run(ai_service._generate_carousel_single_pass(
        mock, {"id": "c1", "name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="", db=_fake_memory_db([]),
    ))
    system = mock.messages.create.call_args.kwargs.get("system")
    assert isinstance(system, list), "system must be a list of content blocks for caching"
    # First block is the cached static persona/format prefix.
    assert system[0].get("cache_control", {}).get("type") == "ephemeral"
    assert "world-class Instagram content strategist" in system[0]["text"]
    # Client-specific text must NOT be in the cached prefix.
    assert "Acme" not in system[0]["text"]
    # Dynamic block carries the client context.
    assert any("Acme" in b["text"] for b in system[1:])
