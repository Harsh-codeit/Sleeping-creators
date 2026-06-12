"""Phase 2 tests — variety planner: LRU rotation, VarietySpec contract block,
retry re-prescription, exemplar pool sampling, usage log fail-open."""
import asyncio
import os
import random
import sys
from collections import Counter
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import content_dna  # noqa: E402
import variety_planner  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


# ─── pick_lru ────────────────────────────────────────────────────────────────

def test_pick_lru_never_used_wins_in_vocab_order():
    out = variety_planner.pick_lru(["b", "a"], ["a", "b", "c", "d"])
    assert out == "c"


def test_pick_lru_oldest_use_wins():
    # newest-first usage: "a" used most recently, "c" longest ago.
    out = variety_planner.pick_lru(["a", "b", "c"], ["a", "b", "c"])
    assert out == "c"


def test_pick_lru_ignores_nones_and_unknown_values():
    out = variety_planner.pick_lru([None, "z", "a", None], ["a", "b"])
    assert out == "b"  # b never used


def test_pick_lru_banned_skipped():
    out = variety_planner.pick_lru(["a"], ["a", "b", "c"], banned=("b",))
    assert out == "c"  # b banned, c never used


def test_pick_lru_banned_ignored_when_it_empties_choices():
    out = variety_planner.pick_lru(["a", "b"], ["a", "b"], banned=("a", "b"))
    assert out == "b"  # bans dropped; b's most recent use is older


def test_pick_lru_empty_vocab_is_none():
    assert variety_planner.pick_lru(["a"], []) is None


# ─── plan_next ───────────────────────────────────────────────────────────────

def _dna_entry(**kw):
    base = {"hook_text": "", "hook_embedding": None, "hook_type": None,
            "format": None, "topic": None, "angle": None, "emotion": None,
            "opening_structure": "other", "format_kind": "carousel",
            "embedded_at": None, "embed_model": None,
            "post_id": "p", "created_at": "2026-06-01T00:00:00+00:00"}
    base.update(kw)
    return base


_DNA = [  # newest first, cross-format
    _dna_entry(hook_type="myth_bust", opening_structure="question",
               topic="sleep", angle="naps", emotion="hope",
               hook_text="Why naps fail you", format_kind="carousel"),
    _dna_entry(hook_type="shocking_number", opening_structure="number",
               topic="money", angle="fees", emotion="anger",
               hook_text="5 fees you pay", format_kind="video"),
    _dna_entry(hook_type="myth_bust", opening_structure="statement",
               topic="sleep", angle="naps", emotion="fomo",
               hook_text="Sleep is a skill", format_kind="carousel"),
]


def test_plan_next_prescribes_lru_and_bans(monkeypatch):
    monkeypatch.setattr(variety_planner.content_dna, "ensure_dna",
                        AsyncMock(return_value=list(_DNA)))
    spec = _run(variety_planner.plan_next("db", {"id": "c1"}, format_kind="carousel"))
    assert spec is not None
    assert spec.format_kind == "carousel"
    # banned = hook types of the 2 newest entries that have one.
    assert spec.banned_hook_types == ["myth_bust", "shocking_number"]
    # LRU over HOOK_TYPES: first never-used in vocabulary order.
    assert spec.hook_type == "credibility_borrow"
    # banned openings = structures of the 3 newest entries (no "other").
    assert spec.banned_opening_structures == ["question", "number", "statement"]
    # LRU over OPENING_STRUCTURES: first never-used in vocabulary order.
    assert spec.opening_structure == "scene"
    # ordered-unique topic+angle pairs.
    assert spec.banned_topic_angles == [("sleep", "naps"), ("money", "fees")]
    # all opening lines forbidden, newest first.
    assert spec.forbidden_openings == [
        "Why naps fail you", "5 fees you pay", "Sleep is a skill"]
    assert spec.emotion_to_avoid == "hope"


def test_plan_next_none_on_empty_dna(monkeypatch):
    monkeypatch.setattr(variety_planner.content_dna, "ensure_dna",
                        AsyncMock(return_value=[]))
    assert _run(variety_planner.plan_next("db", {"id": "c1"}, format_kind="video")) is None


def test_plan_next_none_without_db_or_client_id():
    assert _run(variety_planner.plan_next(None, {"id": "c1"}, format_kind="carousel")) is None
    assert _run(variety_planner.plan_next("db", {}, format_kind="carousel")) is None
    assert _run(variety_planner.plan_next("db", None, format_kind="carousel")) is None


def test_plan_next_none_on_exception(monkeypatch):
    monkeypatch.setattr(variety_planner.content_dna, "ensure_dna",
                        AsyncMock(side_effect=RuntimeError("boom")))
    assert _run(variety_planner.plan_next("db", {"id": "c1"}, format_kind="carousel")) is None


# ─── prompt_block ────────────────────────────────────────────────────────────

def test_prompt_block_renders_contract():
    spec = variety_planner.VarietySpec(
        format_kind="carousel",
        hook_type="relatable_scene",
        banned_hook_types=["myth_bust", "shocking_number"],
        opening_structure="question",
        banned_opening_structures=["statement", "number"],
        banned_topic_angles=[("topic a", "angle a"), ("topic b", "angle b")],
        forbidden_openings=["old opening line one", "old opening line two"],
        emotion_to_avoid="hope",
    )
    block = spec.prompt_block()
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in block
    assert "relatable_scene" in block
    assert "myth_bust" in block and "shocking_number" in block
    assert "question" in block
    assert "statement" in block and "number" in block
    assert "topic a" in block and "angle a" in block
    assert "old opening line one" in block
    assert "old opening line two" in block
    assert "hope" in block


def test_prompt_block_empty_spec_is_empty_string():
    assert variety_planner.VarietySpec(format_kind="carousel").prompt_block() == ""


def test_prompt_block_omits_empty_sections():
    spec = variety_planner.VarietySpec(format_kind="video", hook_type="myth_bust")
    block = spec.prompt_block()
    assert "VARIETY CONTRACT — HARD CONSTRAINTS" in block
    assert "topic + angle" not in block
    assert "emotion" not in block


# ─── respec_for_retry ────────────────────────────────────────────────────────

def test_respec_for_retry_bans_failed_and_represcribes():
    spec = variety_planner.VarietySpec(
        format_kind="carousel", hook_type="credibility_borrow",
        banned_hook_types=["myth_bust", "shocking_number"],
        forbidden_openings=["already banned line"],
    )
    new = variety_planner.respec_for_retry(
        spec, failed_hook_type="credibility_borrow",
        failed_opening="the failed opening")
    assert new is not spec  # copy, original untouched
    assert spec.hook_type == "credibility_borrow"
    assert "credibility_borrow" in new.banned_hook_types
    assert new.hook_type not in new.banned_hook_types
    # First non-banned vocab entry after banning myth_bust/shocking_number/credibility_borrow.
    assert new.hook_type == "emotional_state"
    assert "the failed opening" in new.forbidden_openings
    assert "already banned line" in new.forbidden_openings


def test_respec_for_retry_handles_none_failed_values():
    spec = variety_planner.VarietySpec(format_kind="video", hook_type="myth_bust")
    new = variety_planner.respec_for_retry(spec, failed_hook_type=None, failed_opening=None)
    assert "myth_bust" in new.banned_hook_types
    assert new.hook_type != "myth_bust"


# ─── sample_exemplars ────────────────────────────────────────────────────────

def _pool(n, score=1.0):
    return [{"id": f"h{i}", "hook_text": f"hook {i}", "score": score} for i in range(n)]


def test_sample_exemplars_small_pool_identity_in_order():
    pool = _pool(3)
    out = variety_planner.sample_exemplars(pool, 5)
    assert out == pool  # unchanged, original order


def test_sample_exemplars_exact_k_identity():
    pool = _pool(5)
    assert variety_planner.sample_exemplars(pool, 5) == pool


def test_sample_exemplars_deterministic_with_seed():
    pool = _pool(12)
    a = variety_planner.sample_exemplars(pool, 5, rng=random.Random(42))
    b = variety_planner.sample_exemplars(pool, 5, rng=random.Random(42))
    assert [h["id"] for h in a] == [h["id"] for h in b]
    assert len(a) == 5
    assert len({h["id"] for h in a}) == 5  # without replacement


def test_sample_exemplars_recently_used_demoted():
    pool = _pool(6, score=1.0)
    used = {"h0"}
    counts = Counter()
    for seed in range(300):
        picked = variety_planner.sample_exemplars(
            pool, 3, recently_used_ids=used, rng=random.Random(seed))
        counts.update(h["id"] for h in picked)
    # The demoted exemplar is picked far less often than an equal-score peer.
    assert counts["h0"] < counts["h1"] * 0.7


def test_sample_exemplars_zero_score_does_not_crash():
    pool = _pool(10, score=0.0)
    out = variety_planner.sample_exemplars(pool, 4, rng=random.Random(1))
    assert len(out) == 4


# ─── exemplar usage log (fail-open with bogus db) ────────────────────────────

def test_recent_exemplar_ids_failopen_with_bogus_db():
    assert _run(variety_planner.recent_exemplar_ids("db", "c1")) == set()
    assert _run(variety_planner.recent_exemplar_ids(None, "c1")) == set()
    assert _run(variety_planner.recent_exemplar_ids(MagicMock(), None)) == set()


def test_recent_exemplar_ids_reads_window():
    db = MagicMock()
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[
        {"exemplar_id": "e1"}, {"exemplar_id": "e2"}, {"exemplar_id": None}])
    db.exemplar_usage.find.return_value = cursor
    out = _run(variety_planner.recent_exemplar_ids(db, "c1"))
    assert out == {"e1", "e2"}
    query = db.exemplar_usage.find.call_args.args[0]
    assert query["client_id"] == "c1"
    assert "$gte" in query["used_at"]


def test_log_exemplar_usage_failopen_with_bogus_db():
    _run(variety_planner.log_exemplar_usage("db", "c1", ["e1"]))  # must not raise
    _run(variety_planner.log_exemplar_usage(None, "c1", ["e1"]))
    _run(variety_planner.log_exemplar_usage(MagicMock(), None, ["e1"]))
    _run(variety_planner.log_exemplar_usage(MagicMock(), "c1", []))


def test_log_exemplar_usage_inserts_rows():
    db = MagicMock()
    db.exemplar_usage.insert_many = AsyncMock(return_value=None)
    _run(variety_planner.log_exemplar_usage(db, "c1", ["e1", "e2"]))
    docs = db.exemplar_usage.insert_many.await_args.args[0]
    assert [d["exemplar_id"] for d in docs] == ["e1", "e2"]
    assert all(d["client_id"] == "c1" and d["used_at"] for d in docs)
