"""Phase 1 tests — content DNA: opening classifier, hook extraction, build_dna,
and the lazy 30-day ensure_dna backfill. All network-free: embed_batch is
monkeypatched; the motor db is mocked with the cursor pattern from
test_generation_context.py.
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import content_dna  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


# ─── classify_opening behavior table ─────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    # question
    ("Why do founders burn out so fast", "question"),
    ("Are you tired of dieting every Monday", "question"),
    ("Kya aap apne business se thak gaye ho", "question"),
    # precedence: digit start but ends with ? -> question wins over number
    ("5 reasons your diet fails?", "question"),
    # quote
    ('"Discipline equals freedom"', "quote"),
    ("'You miss 100% of the shots you never take'", "quote"),
    # precedence: quote beats number
    ('"10x your output" they said', "quote"),
    # number
    ("5 mistakes that cost me my company", "number"),
    ("2026 will be the hardest year for coaches", "number"),
    ("$10,000 in 30 days is a lie nobody questions", "number"),
    ("Here are 7 habits that quietly destroy your focus", "number"),
    # myth_bust
    ("Stop drinking protein shakes", "myth_bust"),
    ("Never hire your friends", "myth_bust"),
    ("Everyone tells you to wake at 5am. Wrong.", "myth_bust"),
    ("Don't buy followers", "myth_bust"),
    # confession
    ("I lost everything in 2019", "confession"),
    ("My biggest client fired me over a typo", "confession"),
    ("Honestly, this business broke me", "confession"),
    # scene
    ("Imagine waking up with zero notifications", "scene"),
    ("It's Sunday night and you can't sleep", "scene"),
    ("POV: your boss texts at 9pm", "scene"),
    ("3am. Staring at the ceiling again.", "scene"),
    # statement (default)
    ("Most agencies overcharge for ads", "statement"),
    ("Your portfolio matters more than your resume", "statement"),
    # other
    ("", "other"),
    (None, "other"),
    ("   \n  ", "other"),
])
def test_classify_opening_table(text, expected):
    assert content_dna.classify_opening(text) == expected


def test_classify_opening_uses_first_nonempty_line():
    assert content_dna.classify_opening("\n\nWhy bother?\nmore text") == "question"


def test_opening_structures_vocabulary():
    # The classifier vocabulary the planner rotates through.
    assert set(content_dna.OPENING_STRUCTURES) == {
        "question", "number", "scene", "confession",
        "myth_bust", "quote", "statement",
    }


# ─── extract_hook_text parity ────────────────────────────────────────────────

def test_extract_hook_text_prefers_carousel_first_slide():
    row = {"carousel_data": {"slides": [{"content": "Hook line here"}], "title": "X"}}
    assert content_dna.extract_hook_text(row) == "Hook line here"


def test_extract_hook_text_falls_back_to_caption_then_text():
    assert content_dna.extract_hook_text({"caption": "Cap line\nmore"}) == "Cap line"
    assert content_dna.extract_hook_text({"text": "Text line\nmore"}) == "Text line"
    assert content_dna.extract_hook_text({}) == ""


def test_extract_hook_text_video_post_uses_caption_first_line():
    row = {"kind": "video", "caption": "Reel opener line\nsecond line", "topic": "t"}
    assert content_dna.extract_hook_text(row) == "Reel opener line"


# ─── build_dna shapes ────────────────────────────────────────────────────────

def _carousel_post():
    return {
        "id": "p1",
        "created_at": "2026-06-01T00:00:00+00:00",
        "carousel_data": {
            "slides": [{"content": "Stop chasing every trend"}],
            "title": "T",
            "strategy": {
                "topic": "content strategy",
                "format": "tips",
                "hook_type": "myth_bust",
                "angle": "trends are a treadmill",
                "emotions": ["frustration", "hope"],
            },
        },
    }


def _video_post():
    return {
        "id": "p2",
        "created_at": "2026-06-02T00:00:00+00:00",
        "kind": "video",
        "caption": "Why your reels die at 200 views?\nrest of caption",
        "topic": "reels reach",
    }


def test_build_dna_carousel_shape():
    dna = content_dna.build_dna(_carousel_post(), embedding=[0.1, 0.2])
    assert dna["hook_text"] == "Stop chasing every trend"
    assert dna["hook_embedding"] == [0.1, 0.2]
    assert dna["hook_type"] == "myth_bust"
    assert dna["format"] == "tips"
    assert dna["topic"] == "content strategy"
    assert dna["angle"] == "trends are a treadmill"
    assert dna["emotion"] == "frustration"
    assert dna["opening_structure"] == "myth_bust"
    assert dna["format_kind"] == "carousel"
    assert dna["embedded_at"] is not None
    assert dna["embed_model"] is not None


def test_build_dna_video_shape_no_embedding():
    dna = content_dna.build_dna(_video_post())
    assert dna["hook_text"] == "Why your reels die at 200 views?"
    assert dna["hook_embedding"] is None
    assert dna["hook_type"] is None
    assert dna["format"] is None
    assert dna["topic"] == "reels reach"  # falls back to the root topic field
    assert dna["angle"] is None
    assert dna["emotion"] is None
    assert dna["opening_structure"] == "question"
    assert dna["format_kind"] == "video"
    assert dna["embedded_at"] is None
    assert dna["embed_model"] is None


def test_build_dna_emotion_requires_nonempty_list():
    post = _carousel_post()
    post["carousel_data"]["strategy"]["emotions"] = []
    assert content_dna.build_dna(post)["emotion"] is None
    post["carousel_data"]["strategy"]["emotions"] = "not-a-list"
    assert content_dna.build_dna(post)["emotion"] is None


# ─── ensure_dna ──────────────────────────────────────────────────────────────

def _dna_db(rows):
    db = MagicMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    db.posts.find.return_value = cursor
    db.posts.update_one = AsyncMock(return_value=None)
    return db


def test_ensure_dna_backfills_and_persists(monkeypatch):
    calls = []

    def fake_embed_batch(texts):
        calls.append(list(texts))
        return [[0.1] * 3 for _ in texts]

    monkeypatch.setattr(content_dna.hook_clients, "embed_batch", fake_embed_batch,
                        raising=False)
    db = _dna_db([_carousel_post(), _video_post()])

    out = _run(content_dna.ensure_dna(db, "c1"))

    assert len(out) == 2
    # ONE batched embedding call covering both hook texts.
    assert len(calls) == 1
    assert calls[0] == ["Stop chasing every trend", "Why your reels die at 200 views?"]
    # Both entries carry an embedding + identity fields.
    assert all(e["hook_embedding"] == [0.1] * 3 for e in out)
    assert [e["post_id"] for e in out] == ["p1", "p2"]
    assert all(e["created_at"] for e in out)
    # Both rows persisted via update_one with $set content_dna.
    assert db.posts.update_one.await_count == 2
    first_call = db.posts.update_one.await_args_list[0]
    assert first_call.args[0] == {"id": "p1"}
    assert "content_dna" in first_call.args[1]["$set"]


def test_ensure_dna_embed_failure_fails_open(monkeypatch):
    def boom(texts):
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(content_dna.hook_clients, "embed_batch", boom, raising=False)
    db = _dna_db([_carousel_post(), _video_post()])

    out = _run(content_dna.ensure_dna(db, "c1"))

    assert len(out) == 2
    assert all(e["hook_embedding"] is None for e in out)
    # No-DNA rows still persisted (lexical fallback DNA).
    assert db.posts.update_one.await_count == 2


def test_ensure_dna_hook_clients_missing(monkeypatch):
    monkeypatch.setattr(content_dna, "hook_clients", None)
    db = _dna_db([_carousel_post()])
    out = _run(content_dna.ensure_dna(db, "c1"))
    assert len(out) == 1
    assert out[0]["hook_embedding"] is None


def test_ensure_dna_guards():
    assert _run(content_dna.ensure_dna(None, "c1")) == []
    assert _run(content_dna.ensure_dna(MagicMock(), None)) == []


def test_ensure_dna_cursor_error_fails_open():
    db = MagicMock()
    db.posts.find.side_effect = RuntimeError("db gone")
    assert _run(content_dna.ensure_dna(db, "c1")) == []


def test_ensure_dna_reembeds_missing_vector(monkeypatch):
    """Self-healing: existing DNA with hook_embedding None gets a vector once
    embeddings come back; rows with a vector already are left untouched."""
    healthy = _carousel_post()
    healthy["id"] = "p-ok"
    healthy["content_dna"] = {
        "hook_text": "Stop chasing every trend", "hook_embedding": [0.5] * 3,
        "hook_type": "myth_bust", "format": "tips", "topic": "t", "angle": "a",
        "emotion": "hope", "opening_structure": "myth_bust",
        "format_kind": "carousel", "embedded_at": "x", "embed_model": "m",
    }
    needs_heal = _video_post()
    needs_heal["id"] = "p-heal"
    needs_heal["content_dna"] = {
        "hook_text": "Why your reels die at 200 views?", "hook_embedding": None,
        "hook_type": None, "format": None, "topic": "reels reach", "angle": None,
        "emotion": None, "opening_structure": "question",
        "format_kind": "video", "embedded_at": None, "embed_model": None,
    }

    calls = []

    def fake_embed_batch(texts):
        calls.append(list(texts))
        return [[0.9] * 3 for _ in texts]

    monkeypatch.setattr(content_dna.hook_clients, "embed_batch", fake_embed_batch,
                        raising=False)
    db = _dna_db([healthy, needs_heal])

    out = _run(content_dna.ensure_dna(db, "c1"))

    assert len(out) == 2
    # Only the unhealed row was embedded.
    assert calls == [["Why your reels die at 200 views?"]]
    assert out[0]["hook_embedding"] == [0.5] * 3   # untouched
    assert out[1]["hook_embedding"] == [0.9] * 3   # healed
    # Only the healed row was persisted.
    assert db.posts.update_one.await_count == 1
    assert db.posts.update_one.await_args.args[0] == {"id": "p-heal"}


def test_ensure_dna_reembed_not_persisted_when_embed_fails(monkeypatch):
    """A re-embed candidate keeps its existing DNA (no write) when embedding fails."""
    needs_heal = _video_post()
    needs_heal["content_dna"] = {
        "hook_text": "Why your reels die at 200 views?", "hook_embedding": None,
        "hook_type": None, "format": None, "topic": "reels reach", "angle": None,
        "emotion": None, "opening_structure": "question",
        "format_kind": "video", "embedded_at": None, "embed_model": None,
    }

    def boom(texts):
        raise RuntimeError("no key")

    monkeypatch.setattr(content_dna.hook_clients, "embed_batch", boom, raising=False)
    db = _dna_db([needs_heal])

    out = _run(content_dna.ensure_dna(db, "c1"))
    assert len(out) == 1
    assert out[0]["hook_embedding"] is None
    assert db.posts.update_one.await_count == 0


def test_ensure_dna_includes_empty_hook_entries():
    """Posts with no extractable hook still return DNA (topic/angle still useful)."""
    bare = {"id": "p3", "created_at": "2026-06-03T00:00:00+00:00",
            "carousel_data": {"strategy": {"topic": "silent topic", "angle": "a"}}}
    db = _dna_db([bare])
    out = _run(content_dna.ensure_dna(db, "c1"))
    assert len(out) == 1
    assert out[0]["hook_text"] == ""
    assert out[0]["topic"] == "silent topic"


def test_ensure_dna_window_query_uses_iso_cutoff():
    db = _dna_db([])
    _run(content_dna.ensure_dna(db, "c1", window_days=30))
    query = db.posts.find.call_args.args[0]
    assert query["client_id"] == "c1"
    gte = query["created_at"]["$gte"]
    assert isinstance(gte, str) and gte[:2] == "20"  # ISO-8601 string comparison
