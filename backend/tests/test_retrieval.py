"""Tests for the hybrid retrieval API in viral_library.retrieve (Phase B).

Pure-logic tests (RRF fusion, re-rank ordering, MMR diversity, relevance-guard
math) call the helpers directly with fakes and run unconditionally — no DB.

End-to-end retrieve() tests connect to ``VIRAL_LIBRARY_PG_URL`` when set, else
they skip cleanly (no Postgres available locally / in CI).
"""
import importlib
import math
import os

import pytest


DIM = 1536

PG_URL = os.environ.get("VIRAL_LIBRARY_PG_URL")
pg_only = pytest.mark.skipif(
    not PG_URL,
    reason="VIRAL_LIBRARY_PG_URL not set — Postgres integration tests skipped",
)


def _fresh_module(monkeypatch):
    import viral_library
    importlib.reload(viral_library)
    viral_library.init_db()
    conn = viral_library._connect()
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE hooks")
        conn.commit()
    finally:
        conn.close()
    return viral_library


@pytest.fixture
def lib(monkeypatch):
    if not PG_URL:
        pytest.skip("VIRAL_LIBRARY_PG_URL not set")
    return _fresh_module(monkeypatch)


def _unit(*coords):
    v = [0.0] * DIM
    n = math.sqrt(sum(c * c for c in coords)) or 1.0
    for i, c in enumerate(coords):
        v[i] = c / n
    return v


def _hook(**over):
    h = {
        "hook_text": "I quit my job and made money fast",
        "niche_slug": "business-entrepreneurship",
        "category": "hook-story",
        "hook_type": "shocking_number",
        "platform": "instagram",
        "language": "English",
        "trigger": "curiosity_gap",
        "source": "@founder",
        "engagement_signal": "220k likes",
        "virality_score": 0.5,
        "confidence": 0.5,
        "status": "live",
        "phash": "ffff0000ffff0000",
        "created_by": "admin",
    }
    h.update(over)
    return h


# ---------------------------------------------------------------------------
# RRF fusion correctness (pure function, no DB)
# ---------------------------------------------------------------------------

def test_rrf_fuse_rewards_appearing_in_both_lists():
    import viral_retrieval as vr
    vec_ranked = ["a", "b", "c"]
    fts_ranked = ["d", "b", "e"]
    fused = vr._rrf_fuse([vec_ranked, fts_ranked], k0=60)
    assert "b" in fused and fused["b"] > fused["a"]
    assert set(fused) == {"a", "b", "c", "d", "e"}


def test_rrf_fuse_rank_one_beats_rank_three():
    import viral_retrieval as vr
    fused = vr._rrf_fuse([["x", "y", "z"]], k0=60)
    assert fused["x"] > fused["y"] > fused["z"]


# ---------------------------------------------------------------------------
# Re-rank ordering (pure function, no DB)
# ---------------------------------------------------------------------------

def test_rerank_virality_breaks_ties():
    import viral_retrieval as vr
    # Two candidates, identical semantic sim; virality breaks the tie.
    sims = {"lowvir": 1.0, "hivir": 1.0}
    rows = {
        "lowvir": {"virality_score": 0.1, "confidence": 0.5, "niche_slug": "x"},
        "hivir": {"virality_score": 0.9, "confidence": 0.5, "niche_slug": "x"},
    }
    scored = vr._rerank(["lowvir", "hivir"], sims, rows, niche_slug=None)
    assert scored[0][0] == "hivir"


def test_rerank_same_niche_boost():
    import viral_retrieval as vr
    sims = {"cross": 1.0, "same": 1.0}
    rows = {
        "cross": {"virality_score": 0.5, "confidence": 0.5, "niche_slug": "fitness"},
        "same": {"virality_score": 0.5, "confidence": 0.5, "niche_slug": "biz"},
    }
    scored = vr._rerank(["cross", "same"], sims, rows, niche_slug="biz")
    ids = [hid for hid, _ in scored]
    assert ids[0] == "same"
    assert "cross" in ids  # boost, not filter


# ---------------------------------------------------------------------------
# MMR diversification (pure function, no DB)
# ---------------------------------------------------------------------------

def test_mmr_avoids_near_duplicate_cluster():
    import viral_retrieval as vr
    dup = _unit(1.0, 0.02)
    distinct = _unit(0.9, 0.44)
    reranked = [("dup1", 1.0), ("dup2", 0.99), ("dup3", 0.98), ("other", 0.9)]
    embeddings = {"dup1": dup, "dup2": dup, "dup3": dup, "other": distinct}
    chosen = vr._mmr(reranked, embeddings, k=2)
    assert "other" in chosen
    assert sum(1 for i in chosen if i.startswith("dup")) <= 1


def test_mmr_falls_back_to_relevance_when_no_embeddings():
    import viral_retrieval as vr
    reranked = [("a", 1.0), ("b", 0.5), ("c", 0.1)]
    chosen = vr._mmr(reranked, {}, k=2)
    assert chosen == ["a", "b"]


# ---------------------------------------------------------------------------
# Relevance-guard math (pure: normalized sim threshold)
# ---------------------------------------------------------------------------

def test_relevance_guard_normalization_math():
    import viral_retrieval as vr
    # Orthogonal cosine (0.0) normalizes to 0.5, below the 0.55 default floor.
    assert (0.0 + 1.0) / 2.0 < vr.MIN_SEMANTIC_SIM
    # A near-1.0 cosine clears it.
    assert (0.9 + 1.0) / 2.0 >= vr.MIN_SEMANTIC_SIM


# ---------------------------------------------------------------------------
# End-to-end retrieve() against Postgres (skip without PG)
# ---------------------------------------------------------------------------

@pg_only
def test_e2e_virality_breaks_ties(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="lowvir", hook_text="founder burnout grind",
                          virality_score=0.1, phash="p1"), q)
    lib.insert_hook(_hook(id="hivir", hook_text="founder burnout grind",
                          virality_score=0.9, phash="p2"), q)
    res = lib.retrieve("founder burnout", q, k=2)
    ids = [r["id"] for r in res]
    assert ids[0] == "hivir", f"high-virality hook should rank first, got {ids}"


@pg_only
def test_e2e_same_niche_boost(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="cross", hook_text="founder burnout grind",
                          niche_slug="fitness-coaching",
                          virality_score=0.5, phash="p1"), q)
    lib.insert_hook(_hook(id="same", hook_text="founder burnout grind",
                          niche_slug="business-entrepreneurship",
                          virality_score=0.5, phash="p2"), q)
    res = lib.retrieve("founder burnout", q, niche_slug="business-entrepreneurship", k=2)
    ids = [r["id"] for r in res]
    assert ids[0] == "same"
    assert "cross" in ids


@pg_only
def test_e2e_mmr_avoids_near_duplicate_cluster(lib):
    dup = _unit(1.0, 0.02)
    distinct = _unit(0.9, 0.44)
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="dup1", hook_text="quit job made money", phash="p1"), dup)
    lib.insert_hook(_hook(id="dup2", hook_text="quit job made money", phash="p2"), dup)
    lib.insert_hook(_hook(id="dup3", hook_text="quit job made money", phash="p3"), dup)
    lib.insert_hook(_hook(id="other", hook_text="quit job made cash", phash="p4"), distinct)
    res = lib.retrieve("quit job money", q, k=2)
    ids = [r["id"] for r in res]
    assert "other" in ids
    assert sum(1 for i in ids if i.startswith("dup")) <= 1


@pg_only
def test_e2e_only_live_hooks_returned(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="live", hook_text="founder burnout", status="live", phash="p1"), q)
    lib.insert_hook(_hook(id="review", hook_text="founder burnout", status="review", phash="p2"), q)
    res = lib.retrieve("founder burnout", q, k=5)
    ids = [r["id"] for r in res]
    assert "live" in ids and "review" not in ids


@pg_only
def test_e2e_language_filter_keeps_english_fallback(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="en", hook_text="founder burnout", language="English", phash="p1"), q)
    lib.insert_hook(_hook(id="hi", hook_text="founder burnout", language="Hindi", phash="p2"), q)
    lib.insert_hook(_hook(id="es", hook_text="founder burnout", language="Spanish", phash="p3"), q)
    res = lib.retrieve("founder burnout", q, language="Hindi", k=5)
    ids = set(r["id"] for r in res)
    assert "hi" in ids and "en" in ids
    assert "es" not in ids


@pg_only
def test_e2e_k_respected_and_return_shape(lib):
    q = _unit(1.0, 0.0)
    for i in range(6):
        v = _unit(1.0, 0.01 * i)
        lib.insert_hook(_hook(id=f"h{i}", hook_text=f"founder burnout {i}",
                              phash=f"p{i}"), v)
    res = lib.retrieve("founder burnout", q, k=3)
    assert len(res) == 3
    r = res[0]
    assert set(r.keys()) == {
        "id", "hook_text", "hook_type", "trigger", "niche_slug",
        "virality_score", "score",
    }


@pg_only
def test_e2e_relevance_guard_drops_offtopic_vec_hook(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="relevant", hook_text="founder burnout grind",
                          phash="p1"), _unit(1.0, 0.1))
    lib.insert_hook(_hook(id="offtopic", hook_text="gardening tips spring afternoon",
                          phash="p2"), _unit(0.0, 1.0))
    res = lib.retrieve("founder burnout", q, k=5)
    ids = [r["id"] for r in res]
    assert "relevant" in ids
    assert "offtopic" not in ids


@pg_only
def test_e2e_relevance_guard_returns_empty_when_all_offtopic(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="far", hook_text="gardening tips spring afternoon",
                          phash="p1"), _unit(0.0, 1.0))
    assert lib.retrieve("founder burnout", q, k=5) == []


@pg_only
def test_e2e_relevance_guard_threshold_is_tunable(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="far", hook_text="gardening tips spring afternoon",
                          phash="p1"), _unit(0.0, 1.0))
    res = lib.retrieve("founder burnout", q, k=5, min_semantic=0.0)
    assert [r["id"] for r in res] == ["far"]


# ---------------------------------------------------------------------------
# Fail open (always runs — no DB needed for empty/error paths)
# ---------------------------------------------------------------------------

@pg_only
def test_empty_library_returns_empty(lib):
    res = lib.retrieve("anything at all", _unit(1.0, 0.0), k=5)
    assert res == []


def test_fail_open_on_internal_error(monkeypatch):
    import viral_library
    importlib.reload(viral_library)

    def boom(*a, **k):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(viral_library, "_connect", boom, raising=False)
    res = viral_library.retrieve("founder burnout", _unit(1.0, 0.0), k=5)
    assert res == []


# ---------------------------------------------------------------------------
# Taxonomy (hook_type / trigger) filters
# ---------------------------------------------------------------------------

def test_taxonomy_clause_both_none():
    import viral_retrieval as vr
    sql, params = vr._taxonomy_clause(None, None)
    assert sql == "" and params == []


def test_taxonomy_clause_hook_type_and_trigger():
    import viral_retrieval as vr
    sql, params = vr._taxonomy_clause("myth_bust", "fomo")
    assert sql == " AND hook_type = %s AND trigger = %s"
    assert params == ["myth_bust", "fomo"]


def _exec_args(mock_conn):
    return mock_conn.cursor().__enter__().execute.call_args


def test_vec_candidates_applies_taxonomy_filters():
    from unittest.mock import MagicMock
    import viral_retrieval as vr
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchall.return_value = []
    vr._vec_candidates(mock_conn, [0.1] * 1536, None, 40,
                       hook_type="myth_bust", trigger="fomo")
    sql, params = _exec_args(mock_conn)[0]
    assert "hook_type = %s" in sql and "trigger = %s" in sql
    assert "myth_bust" in params and "fomo" in params


def test_fts_candidates_applies_taxonomy_filters():
    from unittest.mock import MagicMock
    import viral_retrieval as vr
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchall.return_value = []
    vr._fts_candidates(mock_conn, "cardio myths", None, 40,
                       hook_type="myth_bust", trigger=None)
    sql, params = _exec_args(mock_conn)[0]
    assert "hook_type = %s" in sql and "trigger = %s" not in sql
    assert "myth_bust" in params


def test_vec_candidates_no_filters_sql_unchanged():
    from unittest.mock import MagicMock
    import viral_retrieval as vr
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchall.return_value = []
    vr._vec_candidates(mock_conn, [0.1] * 1536, None, 40)
    sql, _ = _exec_args(mock_conn)[0]
    assert "hook_type" not in sql and "trigger" not in sql


def test_taxonomy_clause_trigger_only():
    import viral_retrieval as vr
    sql, params = vr._taxonomy_clause(None, "fomo")
    assert sql == " AND trigger = %s"
    assert params == ["fomo"]


def test_fetch_rows_applies_taxonomy_filters():
    from unittest.mock import MagicMock
    import viral_retrieval as vr
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchall.return_value = []
    vr._fetch_rows(mock_conn, [1, 2], None, hook_type="myth_bust", trigger="fomo")
    sql, params = _exec_args(mock_conn)[0]
    assert "hook_type = %s" in sql and "trigger = %s" in sql
    assert params == [1, 2, "myth_bust", "fomo"]
