"""Tests for viral_library.py — standalone SQLite (sqlite-vec + FTS5) hook library.

Vector-specific tests skip cleanly if the sqlite-vec extension cannot load in CI.
Non-vector tests (CRUD, FTS, phash dedup) must always run.
"""
import importlib
import os
import sqlite3

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _fresh_module(tmp_path, monkeypatch):
    """Point VIRAL_LIBRARY_DB at a temp file and (re)import a clean module."""
    db_path = tmp_path / "lib" / "viral_library.db"
    monkeypatch.setenv("VIRAL_LIBRARY_DB", str(db_path))
    import viral_library
    importlib.reload(viral_library)
    viral_library.init_db()
    return viral_library, db_path


@pytest.fixture
def lib(tmp_path, monkeypatch):
    mod, _ = _fresh_module(tmp_path, monkeypatch)
    yield mod


# Whether sqlite-vec can load in this environment.
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


def _emb(seed: float, dim: int = 3072):
    """Deterministic unit-ish vector; nudged so two seeds differ."""
    base = [0.0] * dim
    base[0] = 1.0
    base[1] = seed
    return base


def _hook(**over):
    h = {
        "hook_text": "I quit my job and made $10k in 30 days",
        "niche_slug": "business-entrepreneurship",
        "category": "hook-story",
        "hook_type": "shocking_number",
        "platform": "instagram",
        "language": "en",
        "trigger": "curiosity_gap",
        "source": "@founder",
        "engagement_signal": "220k likes",
        "virality_score": 0.8,
        "confidence": 0.9,
        "status": "live",
        "phash": "ffff0000ffff0000",
        "created_by": "admin",
    }
    h.update(over)
    return h


# ---------------------------------------------------------------------------
# Schema / init
# ---------------------------------------------------------------------------

def test_init_db_idempotent(tmp_path, monkeypatch):
    mod, db_path = _fresh_module(tmp_path, monkeypatch)
    # Calling again must not raise and must keep data intact.
    hid = mod.insert_hook(_hook(), _emb(0.1))
    mod.init_db()
    assert mod.get_hook(hid) is not None
    assert db_path.exists()


def test_init_db_creates_parent_dir(tmp_path, monkeypatch):
    mod, db_path = _fresh_module(tmp_path, monkeypatch)
    assert db_path.parent.is_dir()


def test_wal_enabled(lib):
    conn = lib._connect()  # internal helper, read access fine for assertion
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert str(mode).lower() == "wal"
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Insert / get / update / status / delete
# ---------------------------------------------------------------------------

def test_insert_and_get(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    assert isinstance(hid, str) and hid
    row = lib.get_hook(hid)
    assert row["hook_text"] == "I quit my job and made $10k in 30 days"
    assert row["niche_slug"] == "business-entrepreneurship"
    assert row["hook_type"] == "shocking_number"
    assert row["status"] == "live"
    assert row["active"] == 1
    assert row["created_at"]  # auto-populated


def test_insert_uses_provided_id(lib):
    hid = lib.insert_hook(_hook(id="fixed-id-123"), _emb(0.1))
    assert hid == "fixed-id-123"
    assert lib.get_hook("fixed-id-123") is not None


def test_insert_generates_uuid_when_absent(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    # uuid4 hex-ish; just assert non-trivial + unique vs a second insert
    hid2 = lib.insert_hook(_hook(phash="aaaa"), _emb(0.2))
    assert hid != hid2


def test_get_missing_returns_none(lib):
    assert lib.get_hook("nope") is None


def test_update_hook(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.update_hook(hid, {"hook_text": "new text", "virality_score": 0.5})
    row = lib.get_hook(hid)
    assert row["hook_text"] == "new text"
    assert row["virality_score"] == 0.5


def test_update_hook_syncs_fts(lib):
    hid = lib.insert_hook(_hook(hook_text="original burnout phrase"), _emb(0.1))
    lib.update_hook(hid, {"hook_text": "completely different wording"})
    # old term gone, new term present
    assert lib.list_hooks(text="burnout") == []
    found = lib.list_hooks(text="different")
    assert any(r["id"] == hid for r in found)


def test_set_status(lib):
    hid = lib.insert_hook(_hook(status="review"), _emb(0.1))
    lib.set_status(hid, "live")
    assert lib.get_hook(hid)["status"] == "live"


def test_delete_hook(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.delete_hook(hid)
    assert lib.get_hook(hid) is None
    # FTS row gone too
    assert lib.list_hooks(text="quit") == []


# ---------------------------------------------------------------------------
# list_hooks filters
# ---------------------------------------------------------------------------

def test_list_filter_by_niche(lib):
    lib.insert_hook(_hook(niche_slug="fitness-coaching", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(niche_slug="personal-finance", phash="p2"), _emb(0.2))
    rows = lib.list_hooks(niche_slug="fitness-coaching")
    assert len(rows) == 1
    assert rows[0]["niche_slug"] == "fitness-coaching"


def test_list_filter_by_hook_type_and_status(lib):
    lib.insert_hook(_hook(hook_type="myth_bust", status="live", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(hook_type="myth_bust", status="review", phash="p2"), _emb(0.2))
    lib.insert_hook(_hook(hook_type="emotional_state", status="live", phash="p3"), _emb(0.3))
    rows = lib.list_hooks(hook_type="myth_bust", status="live")
    assert len(rows) == 1
    assert rows[0]["hook_type"] == "myth_bust"
    assert rows[0]["status"] == "live"


def test_list_text_search(lib):
    lib.insert_hook(_hook(hook_text="founder burnout is real", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(hook_text="ten ways to save money", phash="p2"), _emb(0.2))
    rows = lib.list_hooks(text="burnout")
    assert len(rows) == 1
    assert "burnout" in rows[0]["hook_text"]


def test_list_limit_offset(lib):
    for i in range(5):
        lib.insert_hook(_hook(phash=f"p{i}"), _emb(0.1 + i * 0.01))
    page1 = lib.list_hooks(limit=2, offset=0)
    page2 = lib.list_hooks(limit=2, offset=2)
    assert len(page1) == 2 and len(page2) == 2
    assert {r["id"] for r in page1}.isdisjoint({r["id"] for r in page2})


# ---------------------------------------------------------------------------
# pHash dedup precheck
# ---------------------------------------------------------------------------

def test_phash_exists(lib):
    assert lib.phash_exists("deadbeef") is False
    lib.insert_hook(_hook(phash="deadbeef"), _emb(0.1))
    assert lib.phash_exists("deadbeef") is True
    assert lib.phash_exists("other") is False


# ---------------------------------------------------------------------------
# count
# ---------------------------------------------------------------------------

def test_count(lib):
    assert lib.count() == 0
    lib.insert_hook(_hook(status="live", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(status="review", phash="p2"), _emb(0.2))
    assert lib.count() == 2
    assert lib.count(status="live") == 1
    assert lib.count(status="review") == 1


# ---------------------------------------------------------------------------
# Vector-specific (skip if extension unavailable)
# ---------------------------------------------------------------------------

@vec_only
def test_find_semantic_duplicate_hit(lib):
    lib.insert_hook(_hook(phash="p1"), _emb(0.10))
    dup = lib.find_semantic_duplicate(_emb(0.10), threshold=0.99)
    assert dup is not None


@vec_only
def test_find_semantic_duplicate_miss(lib):
    lib.insert_hook(_hook(phash="p1"), _emb(0.10))
    # An orthogonal-ish vector should be below a high threshold.
    far = [0.0] * 3072
    far[5] = 1.0
    assert lib.find_semantic_duplicate(far, threshold=0.99) is None


@vec_only
def test_find_semantic_duplicate_empty_db(lib):
    assert lib.find_semantic_duplicate(_emb(0.1)) is None


@vec_only
def test_find_semantic_duplicate_niche_scope(lib):
    lib.insert_hook(_hook(niche_slug="fitness-coaching", phash="p1"), _emb(0.10))
    # Same vector but scoped to a different niche -> no match.
    res = lib.find_semantic_duplicate(
        _emb(0.10), threshold=0.99, niche_slug="personal-finance"
    )
    assert res is None


@vec_only
def test_insert_writes_vec_row(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    conn = lib._connect()
    try:
        cnt = conn.execute(
            "SELECT count(*) FROM hooks_vec WHERE hook_id = ?", (hid,)
        ).fetchone()[0]
        assert cnt == 1
    finally:
        conn.close()


@vec_only
def test_delete_removes_vec_row(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.delete_hook(hid)
    conn = lib._connect()
    try:
        cnt = conn.execute(
            "SELECT count(*) FROM hooks_vec WHERE hook_id = ?", (hid,)
        ).fetchone()[0]
        assert cnt == 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def test_insert_wrong_embedding_dim_raises(lib):
    with pytest.raises(lib.ViralLibraryError):
        lib.insert_hook(_hook(), [0.1, 0.2, 0.3])  # not 3072


def test_update_missing_hook_is_safe(lib):
    # Updating a nonexistent id should not crash the process.
    lib.update_hook("does-not-exist", {"hook_text": "x"})
