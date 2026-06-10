"""Tests for viral_library.py — standalone Postgres (pgvector + FTS) hook library.

DB-integration tests connect to ``VIRAL_LIBRARY_PG_URL`` when set, otherwise they
skip cleanly (no Postgres available locally / in CI). Pure-logic tests (embedding
dim validation, constants) always run.
"""
import importlib
import os

import pytest


# ---------------------------------------------------------------------------
# Postgres availability
# ---------------------------------------------------------------------------

PG_URL = os.environ.get("VIRAL_LIBRARY_PG_URL")
pg_only = pytest.mark.skipif(
    not PG_URL,
    reason="VIRAL_LIBRARY_PG_URL not set — Postgres integration tests skipped",
)


def _fresh_module(monkeypatch):
    """(Re)import a clean module bound to the configured Postgres URL and reset
    the schema so each test starts from an empty `hooks` table."""
    import viral_library
    importlib.reload(viral_library)
    viral_library.init_db()
    # Hard reset between tests: drop all rows.
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


def _emb(seed: float, dim: int = 1536):
    """Deterministic vector; nudged so two seeds differ."""
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
# Pure-logic (no DB required)
# ---------------------------------------------------------------------------

def test_embed_dim_constant():
    import viral_library
    importlib.reload(viral_library)
    assert viral_library.EMBED_DIM == 1536


def test_retrieve_is_importable():
    import viral_library
    importlib.reload(viral_library)
    assert callable(viral_library.retrieve)
    assert isinstance(viral_library.RETRIEVAL_WEIGHTS, dict)
    assert isinstance(viral_library.MMR_LAMBDA, float)
    assert isinstance(viral_library.MIN_SEMANTIC_SIM, float)


def test_viral_library_error_exists():
    import viral_library
    importlib.reload(viral_library)
    assert issubclass(viral_library.ViralLibraryError, Exception)


def test_connect_uses_shared_pool_and_close_returns(monkeypatch):
    """_connect checks out of the shared pg_pool; close() re-pools instead of
    really closing, and a broken connection is discarded (close=True)."""
    from unittest.mock import MagicMock
    import pg_pool
    import viral_library
    importlib.reload(viral_library)

    class _FakePool:
        def __init__(self, conns):
            self._conns = list(conns)
            self.put = []

        def getconn(self):
            return self._conns.pop(0)

        def putconn(self, conn, close=False):
            self.put.append((conn, close))
            if not close:
                self._conns.append(conn)

    healthy = MagicMock()
    healthy.closed = 0
    pool = _FakePool([healthy])
    monkeypatch.setattr(pg_pool, "_pool", pool)
    monkeypatch.setenv("VIRAL_LIBRARY_PG_URL", "postgresql://test")

    conn = viral_library._connect()
    conn.close()
    assert pool.put == [(healthy, False)]
    # Reuse, then breakage: a conn that died while checked out is discarded.
    conn2 = viral_library._connect()
    healthy.closed = 1
    conn2.close()
    assert pool.put[-1] == (healthy, True)


def test_connect_wraps_pool_errors(monkeypatch):
    import pg_pool
    import viral_library
    importlib.reload(viral_library)

    class _Boom:
        def getconn(self):
            raise RuntimeError("pool exhausted")

        def putconn(self, conn, close=False):
            pass

    monkeypatch.setattr(pg_pool, "_pool", _Boom())
    monkeypatch.setenv("VIRAL_LIBRARY_PG_URL", "postgresql://test")
    with pytest.raises(viral_library.ViralLibraryError):
        viral_library._connect()


# ---------------------------------------------------------------------------
# Schema / init
# ---------------------------------------------------------------------------

@pg_only
def test_init_db_idempotent(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.init_db()  # must not raise / wipe
    assert lib.get_hook(hid) is not None


@pg_only
def test_init_db_creates_table(lib):
    conn = lib._connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.hooks')")
            assert cur.fetchone()[0] == "hooks"
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Insert / get / update / status / delete
# ---------------------------------------------------------------------------

@pg_only
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


@pg_only
def test_insert_uses_provided_id(lib):
    hid = lib.insert_hook(_hook(id="fixed-id-123"), _emb(0.1))
    assert hid == "fixed-id-123"
    assert lib.get_hook("fixed-id-123") is not None


@pg_only
def test_insert_generates_uuid_when_absent(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    hid2 = lib.insert_hook(_hook(phash="aaaa"), _emb(0.2))
    assert hid != hid2


@pg_only
def test_get_missing_returns_none(lib):
    assert lib.get_hook("nope") is None


@pg_only
def test_update_hook(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.update_hook(hid, {"hook_text": "new text", "virality_score": 0.5})
    row = lib.get_hook(hid)
    assert row["hook_text"] == "new text"
    assert row["virality_score"] == 0.5


@pg_only
def test_update_hook_syncs_fts(lib):
    hid = lib.insert_hook(_hook(hook_text="original burnout phrase"), _emb(0.1))
    lib.update_hook(hid, {"hook_text": "completely different wording"})
    assert lib.list_hooks(text="burnout") == []
    found = lib.list_hooks(text="different")
    assert any(r["id"] == hid for r in found)


@pg_only
def test_set_status(lib):
    hid = lib.insert_hook(_hook(status="review"), _emb(0.1))
    lib.set_status(hid, "live")
    assert lib.get_hook(hid)["status"] == "live"


@pg_only
def test_delete_hook(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    lib.delete_hook(hid)
    assert lib.get_hook(hid) is None
    assert lib.list_hooks(text="quit") == []


# ---------------------------------------------------------------------------
# list_hooks filters
# ---------------------------------------------------------------------------

@pg_only
def test_list_filter_by_niche(lib):
    lib.insert_hook(_hook(niche_slug="fitness-coaching", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(niche_slug="personal-finance", phash="p2"), _emb(0.2))
    rows = lib.list_hooks(niche_slug="fitness-coaching")
    assert len(rows) == 1
    assert rows[0]["niche_slug"] == "fitness-coaching"


@pg_only
def test_list_filter_by_hook_type_and_status(lib):
    lib.insert_hook(_hook(hook_type="myth_bust", status="live", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(hook_type="myth_bust", status="review", phash="p2"), _emb(0.2))
    lib.insert_hook(_hook(hook_type="emotional_state", status="live", phash="p3"), _emb(0.3))
    rows = lib.list_hooks(hook_type="myth_bust", status="live")
    assert len(rows) == 1
    assert rows[0]["hook_type"] == "myth_bust"
    assert rows[0]["status"] == "live"


@pg_only
def test_list_text_search(lib):
    lib.insert_hook(_hook(hook_text="founder burnout is real", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(hook_text="ten ways to save money", phash="p2"), _emb(0.2))
    rows = lib.list_hooks(text="burnout")
    assert len(rows) == 1
    assert "burnout" in rows[0]["hook_text"]


@pg_only
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

@pg_only
def test_phash_exists(lib):
    assert lib.phash_exists("deadbeef") is False
    lib.insert_hook(_hook(phash="deadbeef"), _emb(0.1))
    assert lib.phash_exists("deadbeef") is True
    assert lib.phash_exists("other") is False


# ---------------------------------------------------------------------------
# count
# ---------------------------------------------------------------------------

@pg_only
def test_count(lib):
    assert lib.count() == 0
    lib.insert_hook(_hook(status="live", phash="p1"), _emb(0.1))
    lib.insert_hook(_hook(status="review", phash="p2"), _emb(0.2))
    assert lib.count() == 2
    assert lib.count(status="live") == 1
    assert lib.count(status="review") == 1


# ---------------------------------------------------------------------------
# Semantic duplicate (vector)
# ---------------------------------------------------------------------------

@pg_only
def test_find_semantic_duplicate_hit(lib):
    lib.insert_hook(_hook(phash="p1"), _emb(0.10))
    dup = lib.find_semantic_duplicate(_emb(0.10), threshold=0.99)
    assert dup is not None


@pg_only
def test_find_semantic_duplicate_miss(lib):
    lib.insert_hook(_hook(phash="p1"), _emb(0.10))
    far = [0.0] * 1536
    far[5] = 1.0
    assert lib.find_semantic_duplicate(far, threshold=0.99) is None


@pg_only
def test_find_semantic_duplicate_empty_db(lib):
    assert lib.find_semantic_duplicate(_emb(0.1)) is None


@pg_only
def test_find_semantic_duplicate_niche_scope(lib):
    lib.insert_hook(_hook(niche_slug="fitness-coaching", phash="p1"), _emb(0.10))
    res = lib.find_semantic_duplicate(
        _emb(0.10), threshold=0.99, niche_slug="personal-finance"
    )
    assert res is None


@pg_only
def test_insert_writes_embedding(lib):
    hid = lib.insert_hook(_hook(), _emb(0.1))
    conn = lib._connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM hooks WHERE id = %s AND embedding IS NOT NULL",
                (hid,),
            )
            assert cur.fetchone()[0] == 1
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def test_insert_wrong_embedding_dim_raises(monkeypatch):
    if not PG_URL:
        pytest.skip("VIRAL_LIBRARY_PG_URL not set")
    mod = _fresh_module(monkeypatch)
    with pytest.raises(mod.ViralLibraryError):
        mod.insert_hook(_hook(), [0.1, 0.2, 0.3])  # not 1536


@pg_only
def test_update_missing_hook_is_safe(lib):
    lib.update_hook("does-not-exist", {"hook_text": "x"})
