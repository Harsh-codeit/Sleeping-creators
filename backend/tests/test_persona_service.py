# backend/tests/test_persona_service.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock, AsyncMock
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()
import asyncio
from datetime import datetime, timezone
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


def _run(coro):
    return asyncio.run(coro)


def _fake_db(winners, recent):
    """posts.find(...).sort(...).limit(...).to_list() returns winners on the winner query,
    recent on the published query — distinguished by the filter dict."""
    db = MagicMock()

    def find(filt, proj=None):
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.limit.return_value = cursor
        if filt.get("is_winner"):
            cursor.to_list = AsyncMock(return_value=winners)
        else:
            cursor.to_list = AsyncMock(return_value=recent)
        return cursor

    db.posts.find.side_effect = find
    return db


def test_signal_prefers_winners_when_enough():
    winners = [{"text": f"w{i}", "engagement_score": 10 - i} for i in range(3)]
    recent = [{"text": "r1"}]
    db = _fake_db(winners, recent)
    signal = _run(persona_service.fetch_persona_signal("c1", db))
    assert [p["text"] for p in signal] == ["w0", "w1", "w2"]


def test_signal_falls_back_to_recent_when_few_winners():
    winners = [{"text": "w0", "engagement_score": 5}]  # < MIN_WINNERS_FOR_SIGNAL
    recent = [{"text": "r1"}, {"text": "r2"}]
    db = _fake_db(winners, recent)
    signal = _run(persona_service.fetch_persona_signal("c1", db))
    assert [p["text"] for p in signal] == ["r1", "r2"]


def test_is_persona_fresh():
    fresh = {"updated_at": datetime.now(timezone.utc).isoformat(), "version": persona_service.PERSONA_VERSION}
    stale_age = {"updated_at": "2020-01-01T00:00:00+00:00", "version": persona_service.PERSONA_VERSION}
    stale_ver = {"updated_at": datetime.now(timezone.utc).isoformat(), "version": 1}
    assert persona_service.is_persona_fresh(fresh) is True
    assert persona_service.is_persona_fresh(stale_age) is False
    assert persona_service.is_persona_fresh(stale_ver) is False
    assert persona_service.is_persona_fresh(None) is False
