# backend/tests/test_video_persona.py
import sys, os, asyncio, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock, AsyncMock, patch
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()
import video_render_service as vrs


def _run(coro):
    return asyncio.run(coro)


def test_video_prompt_includes_persona_and_memory(monkeypatch):
    # Stub the model call to capture the prompt and return valid JSON.
    captured = {}

    def fake_generate_content_json(full_prompt, **kwargs):
        # _generate_content_json now takes model= / token_tiers= keywords
        # (anti-repetition Phase 3/4); this stub only needs the prompt.
        captured["prompt"] = full_prompt
        msg = MagicMock(model="claude-haiku-4-5-20251001", usage=MagicMock(input_tokens=1, output_tokens=1))
        return {"merge_values": {}, "caption": "hi", "hashtags": ["a"]}, msg

    monkeypatch.setattr(vrs, "_generate_content_json", fake_generate_content_json)
    monkeypatch.setattr(vrs, "_resolve_custom_video_prompt", AsyncMock(return_value=None))

    import ai_service
    monkeypatch.setattr(ai_service, "build_generation_context", AsyncMock(return_value={
        "persona_block": "\n\nCLIENT PERSONA ...:\nVoice: blunt",
        "brand_context": "\nBRAND CONTEXT:\nNiche: SIP",
        "memory_block": "\n\nRECENTLY USED OPENINGS ...:\n- \"old caption hook\"",
        "recent_hooks": ["old caption hook"],
    }))

    client = {"id": "c1", "name": "Acme", "niche": "fintech", "onboarding_data": {}}
    db = MagicMock()
    db.token_usage = MagicMock()
    db.token_usage.insert_one = AsyncMock(return_value=None)
    out = _run(vrs.generate_video_content("a topic", client, [], db=db))
    assert "blunt" in captured["prompt"]
    assert "old caption hook" in captured["prompt"]
    assert out["caption"] == "hi"
