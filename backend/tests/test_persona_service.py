# backend/tests/test_persona_service.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()
import persona_service


def test_format_persona_block_empty_returns_empty():
    assert persona_service.format_persona_block(None) == ""
    assert persona_service.format_persona_block({}) == ""


def test_format_persona_block_includes_fields():
    persona = {
        "voice": "Blunt, funny, ex-founder energy.",
        "signature_traits": ["short sentences", "uses rupee figures"],
        "recurring_themes": ["bootstrapping", "hiring"],
        "winning_patterns": ["myth-bust hooks land"],
        "audience_portrait": "second-time founders in tier-2 India",
        "avoid": ["corporate tone"],
    }
    block = persona_service.format_persona_block(persona)
    assert "CLIENT PERSONA" in block
    assert "Blunt, funny" in block
    assert "short sentences" in block
    assert "bootstrapping" in block
    assert "myth-bust hooks land" in block
    assert "second-time founders" in block
    assert "corporate tone" in block
