"""Tests for the hybrid retrieval API in viral_library.retrieve (Phase B).

No network: we control the embeddings passed into insert_hook and into
retrieve(), so vector similarity is fully deterministic and assertable.

Vector-path tests skip cleanly when the sqlite-vec extension can't load; the
FTS-only fail-open path is exercised unconditionally.
"""
import importlib
import math
import sqlite3

import pytest


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

DIM = 3072


def _fresh_module(tmp_path, monkeypatch):
    db_path = tmp_path / "lib" / "viral_library.db"
    monkeypatch.setenv("VIRAL_LIBRARY_DB", str(db_path))
    import viral_library
    importlib.reload(viral_library)
    viral_library.init_db()
    return viral_library


@pytest.fixture
def lib(tmp_path, monkeypatch):
    return _fresh_module(tmp_path, monkeypatch)


def _vec_available():
    try:
        import sqlite_vec  # noqa: F401
        db = sqlite3.connect(":memory:")
        db.enable_load_extension(True)
        sqlite_vec.load(db)
        db.close()
        return True
    except Exception:
        return False


VEC_OK = _vec_available()
vec_only = pytest.mark.skipif(
    not VEC_OK, reason="sqlite-vec extension could not load in this environment"
)


def _unit(*coords):
    """Build a unit vector in the first len(coords) dims (rest zero)."""
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
# RRF fusion correctness (pure function, no DB / no extension required)
# ---------------------------------------------------------------------------

def test_rrf_fuse_rewards_appearing_in_both_lists(lib):
    # "b" is rank-2 in BOTH lists; "a" is rank-1 in one list and absent from the
    # other. RRF rewards consistent presence: "b" should overtake the single #1.
    vec_ranked = ["a", "b", "c"]
    fts_ranked = ["d", "b", "e"]
    fused = lib._rrf_fuse([vec_ranked, fts_ranked], k0=60)
    assert "b" in fused and fused["b"] > fused["a"]
    # everything that appeared at least once is scored
    assert set(fused) == {"a", "b", "c", "d", "e"}


def test_rrf_fuse_rank_one_beats_rank_three(lib):
    fused = lib._rrf_fuse([["x", "y", "z"]], k0=60)
    assert fused["x"] > fused["y"] > fused["z"]


# ---------------------------------------------------------------------------
# Re-rank ordering
# ---------------------------------------------------------------------------

@vec_only
def test_rerank_virality_breaks_ties(lib):
    # Two hooks with identical embeddings/text but different virality_score.
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="lowvir", hook_text="founder burnout grind",
                          virality_score=0.1, phash="p1"), q)
    lib.insert_hook(_hook(id="hivir", hook_text="founder burnout grind",
                          virality_score=0.9, phash="p2"), q)
    res = lib.retrieve("founder burnout", q, k=2)
    ids = [r["id"] for r in res]
    assert ids[0] == "hivir", f"high-virality hook should rank first, got {ids}"


@vec_only
def test_rerank_same_niche_boost(lib):
    # Same relevance + virality; only niche differs. Same-niche should win,
    # but the cross-niche one must still be RETURNED (boost, not filter).
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="cross", hook_text="founder burnout grind",
                          niche_slug="fitness-coaching",
                          virality_score=0.5, phash="p1"), q)
    lib.insert_hook(_hook(id="same", hook_text="founder burnout grind",
                          niche_slug="business-entrepreneurship",
                          virality_score=0.5, phash="p2"), q)
    res = lib.retrieve("founder burnout", q, niche_slug="business-entrepreneurship", k=2)
    ids = [r["id"] for r in res]
    assert ids[0] == "same", f"same-niche should rank first, got {ids}"
    assert "cross" in ids, "cross-niche hook must still appear (boost, not filter)"


# ---------------------------------------------------------------------------
# MMR diversification
# ---------------------------------------------------------------------------

@vec_only
def test_mmr_avoids_near_duplicate_cluster(lib):
    # Three near-identical hooks (same embedding) + one distinct relevant hook.
    # Plain top-k by relevance would pick the 3 dups; MMR should surface the
    # distinct hook within the top-2.
    dup = _unit(1.0, 0.02)
    distinct = _unit(0.9, 0.44)  # still fairly relevant to the query, but different
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="dup1", hook_text="quit job made money", phash="p1"), dup)
    lib.insert_hook(_hook(id="dup2", hook_text="quit job made money", phash="p2"), dup)
    lib.insert_hook(_hook(id="dup3", hook_text="quit job made money", phash="p3"), dup)
    lib.insert_hook(_hook(id="other", hook_text="quit job made cash", phash="p4"), distinct)
    res = lib.retrieve("quit job money", q, k=2)
    ids = [r["id"] for r in res]
    assert "other" in ids, f"MMR should include the distinct hook, got {ids}"
    # And should not return all three duplicates with k=2 anyway
    assert sum(1 for i in ids if i.startswith("dup")) <= 1


# ---------------------------------------------------------------------------
# Candidate filters: status / language
# ---------------------------------------------------------------------------

@vec_only
def test_only_live_hooks_returned(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="live", hook_text="founder burnout", status="live", phash="p1"), q)
    lib.insert_hook(_hook(id="review", hook_text="founder burnout", status="review", phash="p2"), q)
    res = lib.retrieve("founder burnout", q, k=5)
    ids = [r["id"] for r in res]
    assert "live" in ids and "review" not in ids


@vec_only
def test_language_filter_keeps_english_fallback(lib):
    q = _unit(1.0, 0.0)
    lib.insert_hook(_hook(id="en", hook_text="founder burnout", language="English", phash="p1"), q)
    lib.insert_hook(_hook(id="hi", hook_text="founder burnout", language="Hindi", phash="p2"), q)
    lib.insert_hook(_hook(id="es", hook_text="founder burnout", language="Spanish", phash="p3"), q)
    res = lib.retrieve("founder burnout", q, language="Hindi", k=5)
    ids = set(r["id"] for r in res)
    assert "hi" in ids and "en" in ids  # requested lang + English fallback
    assert "es" not in ids  # other languages excluded


# ---------------------------------------------------------------------------
# k respected + return shape
# ---------------------------------------------------------------------------

@vec_only
def test_k_respected_and_return_shape(lib):
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


# ---------------------------------------------------------------------------
# Fail open
# ---------------------------------------------------------------------------

def test_empty_library_returns_empty(lib):
    res = lib.retrieve("anything at all", _unit(1.0, 0.0), k=5)
    assert res == []


def test_fail_open_on_internal_error(lib, monkeypatch):
    # Force the candidate generation to blow up; retrieve must swallow + return [].
    def boom(*a, **k):
        raise RuntimeError("kaboom")
    monkeypatch.setattr(lib, "_candidate_ids", boom, raising=False)
    res = lib.retrieve("founder burnout", _unit(1.0, 0.0), k=5)
    assert res == []


def test_fts_only_fallback_when_vec_unavailable(lib, monkeypatch):
    # Simulate no sqlite-vec: candidates must come from FTS, ranked by virality.
    monkeypatch.setattr(lib, "_vec_available", lambda: False)
    lib.insert_hook(_hook(id="lo", hook_text="founder burnout story",
                          virality_score=0.2, phash="p1"), _unit(1.0, 0.0))
    lib.insert_hook(_hook(id="hi", hook_text="founder burnout story",
                          virality_score=0.95, phash="p2"), _unit(1.0, 0.0))
    res = lib.retrieve("founder burnout", _unit(1.0, 0.0), k=2)
    ids = [r["id"] for r in res]
    assert ids and ids[0] == "hi", f"FTS-only fallback ranks by virality, got {ids}"
