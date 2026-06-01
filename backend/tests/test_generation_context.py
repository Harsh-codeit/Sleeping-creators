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


def test_single_pass_injects_persona_block():
    mock = _mock_client(_carousel_response())
    _run(ai_service._generate_carousel_single_pass(
        mock, {"name": "Acme", "industry": "Tech"}, {"language": "English"},
        topic="t", slide_count=5, slide_format="tips", platform="instagram",
        cta_keyword=None, cta_offer=None, hook_inspiration=None,
        global_instructions=None, trend_context="",
        persona_block="\n\nCLIENT PERSONA (write in this exact voice...):\nVoice: blunt ex-founder",
    ))
    system_prompt = mock.messages.create.call_args.kwargs.get("system", "")
    assert "CLIENT PERSONA" in system_prompt
    assert "blunt ex-founder" in system_prompt


def _fake_memory_db(rows):
    db = MagicMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    db.posts.find.return_value = cursor
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
    system_prompt = mock.messages.create.call_args.kwargs.get("system", "")
    assert "RECENTLY USED OPENINGS" in system_prompt
    assert "old hook" in system_prompt
