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
