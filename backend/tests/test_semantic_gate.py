"""Phase 3 tests — semantic gate: cosine math, gate_check (cosine + Jaccard
fallback + fail-open), candidate selection, incident logging."""
import asyncio
import math
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import content_dna  # noqa: E402
import semantic_gate  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def _dna(hook_text, embedding=None):
    return {"hook_text": hook_text, "hook_embedding": embedding,
            "hook_type": None, "topic": None, "angle": None, "emotion": None,
            "opening_structure": "statement", "format_kind": "carousel",
            "post_id": "p", "created_at": "2026-06-01T00:00:00+00:00"}


# ─── cosine / max_cosine ─────────────────────────────────────────────────────

def test_cosine_basics():
    assert semantic_gate.cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert semantic_gate.cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    assert semantic_gate.cosine([0.0, 0.0], [1.0, 0.0]) == 0.0  # zero norm safe


def test_max_cosine_picks_nearest_text():
    dna = [_dna("far away", [0.0, 1.0]),
           _dna("nearest", [1.0, 0.0]),
           _dna("no vector", None)]
    sim, nearest = semantic_gate.max_cosine([1.0, 0.0], dna)
    assert sim == pytest.approx(1.0)
    assert nearest == "nearest"


def test_max_cosine_empty_when_no_vectors():
    sim, nearest = semantic_gate.max_cosine([1.0, 0.0], [_dna("x", None)])
    assert sim == 0.0
    assert nearest is None


# ─── gate_check: cosine path ─────────────────────────────────────────────────

def test_gate_check_cosine_fail_above_threshold(monkeypatch):
    monkeypatch.setattr(semantic_gate.hook_clients, "embed_query_cached",
                        lambda t: [1.0, 0.0], raising=False)
    dna = [_dna("near twin", [1.0, 0.0])]
    r = _run(semantic_gate.gate_check("db", "c1", "candidate hook", dna=dna))
    assert r.passed is False
    assert r.method == "cosine"
    assert r.max_sim == pytest.approx(1.0)
    assert r.nearest_text == "near twin"


def test_gate_check_cosine_pass_below_threshold(monkeypatch):
    monkeypatch.setattr(semantic_gate.hook_clients, "embed_query_cached",
                        lambda t: [1.0, 0.0], raising=False)
    dna = [_dna("orthogonal", [0.0, 1.0])]
    r = _run(semantic_gate.gate_check("db", "c1", "candidate hook", dna=dna))
    assert r.passed is True
    assert r.method == "cosine"
    assert r.max_sim == pytest.approx(0.0)


def test_gate_check_cosine_boundary_is_fail(monkeypatch):
    # sim == 0.85 exactly -> NOT passed (strict <).
    monkeypatch.setattr(semantic_gate.hook_clients, "embed_query_cached",
                        lambda t: [1.0, 0.0], raising=False)
    dna = [_dna("boundary", [0.85, math.sqrt(1 - 0.85 ** 2)])]
    r = _run(semantic_gate.gate_check("db", "c1", "candidate", dna=dna))
    assert r.max_sim == pytest.approx(content_dna.HOOK_COSINE_MAX)
    assert r.passed is False


# ─── gate_check: Jaccard fallback ────────────────────────────────────────────

def test_gate_check_jaccard_when_embed_raises(monkeypatch):
    def boom(t):
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    monkeypatch.setattr(semantic_gate.hook_clients, "embed_query_cached", boom,
                        raising=False)
    dna = [_dna("you ate perfectly for six days then ruined it on sunday", [1.0, 0.0])]
    near = "you ate perfectly for six days then ruined it sunday"
    r = _run(semantic_gate.gate_check("db", "c1", near, dna=dna))
    assert r.method == "jaccard"
    assert r.passed is False
    assert r.max_sim >= content_dna.JACCARD_FALLBACK_MAX
    assert "six days" in r.nearest_text


def test_gate_check_jaccard_when_dna_has_no_vectors(monkeypatch):
    monkeypatch.setattr(semantic_gate.hook_clients, "embed_query_cached",
                        lambda t: [1.0, 0.0], raising=False)
    dna = [_dna("three hiring mistakes that cost me a company", None)]
    r = _run(semantic_gate.gate_check("db", "c1", "completely different opener here", dna=dna))
    assert r.method == "jaccard"
    assert r.passed is True


def test_gate_check_jaccard_hook_clients_missing(monkeypatch):
    monkeypatch.setattr(semantic_gate, "hook_clients", None)
    dna = [_dna("some old hook line", None)]
    r = _run(semantic_gate.gate_check("db", "c1", "some old hook line", dna=dna))
    assert r.method == "jaccard"
    assert r.passed is False  # identical -> jaccard 1.0


# ─── gate_check: skipped / fail-open ─────────────────────────────────────────

def test_gate_check_empty_text_skipped():
    r = _run(semantic_gate.gate_check("db", "c1", "   ", dna=[_dna("x", None)]))
    assert r.passed is True and r.method == "skipped"


def test_gate_check_empty_dna_skipped():
    r = _run(semantic_gate.gate_check("db", "c1", "hook", dna=[]))
    assert r.passed is True and r.method == "skipped"


def test_gate_check_fetches_dna_when_not_passed(monkeypatch):
    fetch = AsyncMock(return_value=[])
    monkeypatch.setattr(semantic_gate.content_dna, "ensure_dna", fetch)
    r = _run(semantic_gate.gate_check("db", "c1", "hook"))
    assert r.passed is True and r.method == "skipped"
    fetch.assert_awaited_once_with("db", "c1")


def test_gate_check_failopen_on_unexpected_error(monkeypatch):
    monkeypatch.setattr(semantic_gate.content_dna, "ensure_dna",
                        AsyncMock(side_effect=RuntimeError("db exploded")))
    r = _run(semantic_gate.gate_check("db", "c1", "hook"))
    assert r.passed is True and r.method == "skipped"


# ─── best_candidate ──────────────────────────────────────────────────────────

def _res(passed, sim):
    return semantic_gate.GateResult(passed=passed, max_sim=sim, method="cosine")


def test_best_candidate_prefers_lowest_sim_passing():
    results = [("a", _res(False, 0.9)), ("b", _res(True, 0.4)), ("c", _res(True, 0.2))]
    idx, text, res = semantic_gate.best_candidate(results)
    assert (idx, text) == (2, "c")
    assert res.passed is True


def test_best_candidate_least_similar_when_none_pass():
    results = [("a", _res(False, 0.95)), ("b", _res(False, 0.88))]
    idx, text, res = semantic_gate.best_candidate(results)
    assert (idx, text) == (1, "b")
    assert res.passed is False


# ─── incident logging ────────────────────────────────────────────────────────

def test_log_repetition_incident_writes_doc():
    db = MagicMock()
    db.repetition_incidents.insert_one = AsyncMock(return_value=None)
    _run(semantic_gate.log_repetition_incident(
        db, "c1", format_kind="carousel", candidate_text="x" * 500,
        max_sim=0.91, method="cosine", nearest_text="y" * 500,
        snapshot={"title": "T"}))
    doc = db.repetition_incidents.insert_one.await_args.args[0]
    assert doc["client_id"] == "c1"
    assert doc["format_kind"] == "carousel"
    assert len(doc["candidate_text"]) == 300
    assert len(doc["nearest_text"]) == 300
    assert doc["max_sim"] == 0.91
    assert doc["method"] == "cosine"
    assert doc["snapshot"] == {"title": "T"}
    assert doc["id"] and doc["created_at"]


def test_log_repetition_incident_swallows_errors():
    _run(semantic_gate.log_repetition_incident(
        "db", "c1", format_kind="video", candidate_text="x",
        max_sim=0.9, method="jaccard", nearest_text=None))  # must not raise
    db = MagicMock()
    db.repetition_incidents.insert_one = AsyncMock(side_effect=RuntimeError("down"))
    _run(semantic_gate.log_repetition_incident(
        db, "c1", format_kind="video", candidate_text="x",
        max_sim=0.9, method="jaccard", nearest_text=None))
