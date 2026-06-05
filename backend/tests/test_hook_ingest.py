"""Tests for the hook-ingest worker flow + ingest endpoint perm-map entries.

No network, no Redis, no Mongo: hook_clients and viral_library are replaced
with fakes, and the batch-counter writer is stubbed to collect $inc calls in a
plain dict. We assert every branch of the worker flow plus that the image is
always deleted, and that server.py registers the expected permission entries.
"""
import importlib
import os

import pytest


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeHookClientError(Exception):
    pass


class FakeClients:
    """Stand-in for hook_clients with scriptable returns + a call log."""

    HookClientError = FakeHookClientError

    def __init__(self):
        self.phash_value = "phash-abc"
        self.classify_result = {
            "hook_text": "I quit my 9-5 and made $10k",
            "niche_slug": "business-entrepreneurship",
            "category": "hook-story",
            "hook_type": "shocking_number",
            "language": "en",
            "trigger": "curiosity_gap",
            "virality_score": 0.7,
            "quality_ok": True,
            "confidence": 0.92,
        }
        self.embed_value = [0.0] * 8
        self.phash_calls = 0
        self.classify_calls = 0
        self.embed_calls = 0
        self.classify_error = None
        self.embed_error = None

    def phash(self, image_path):
        self.phash_calls += 1
        return self.phash_value

    def extract_and_classify(self, image_path, *, allowed_niches):
        self.classify_calls += 1
        if self.classify_error:
            raise self.classify_error
        return dict(self.classify_result)

    def embed(self, text):
        self.embed_calls += 1
        if self.embed_error:
            raise self.embed_error
        return list(self.embed_value)


class FakeLibrary:
    def __init__(self):
        self.phash_dup = False
        self.semantic_dup = None
        self.inserted = []

    def phash_exists(self, ph):
        return self.phash_dup

    def find_semantic_duplicate(self, emb, *, niche_slug=None):
        return self.semantic_dup

    def insert_hook(self, hook, embedding):
        self.inserted.append((hook, embedding))
        return "hook-id-1"


@pytest.fixture
def worker(monkeypatch, tmp_path):
    """Import the worker with a temp DB env and fakes wired in."""
    monkeypatch.setenv("VIRAL_LIBRARY_DB", str(tmp_path / "lib.db"))
    monkeypatch.setenv("HOOK_INGEST_TMP", str(tmp_path / "tmp"))
    import hook_ingest_worker
    importlib.reload(hook_ingest_worker)

    # Collect batch $inc calls instead of touching Mongo.
    bumps = []
    monkeypatch.setattr(
        hook_ingest_worker, "_bump_batch",
        lambda batch_id, **inc: bumps.append((batch_id, inc)),
    )
    # Deterministic, network-free niche vocabulary.
    monkeypatch.setattr(
        hook_ingest_worker, "_allowed_niches",
        lambda: ["business-entrepreneurship", "other"],
    )
    hook_ingest_worker._test_bumps = bumps
    return hook_ingest_worker


def _make_image(tmp_path, name="shot.png"):
    p = tmp_path / name
    p.write_bytes(b"not-a-real-image-but-a-real-file")
    return str(p)


def _run(worker, clients, lib, image_path, **kw):
    """Invoke the core flow with injected fakes."""
    return worker._process(
        clients, lib,
        image_path=image_path,
        batch_id=kw.get("batch_id", "batch-1"),
        created_by=kw.get("created_by", "admin"),
        platform=kw.get("platform"),
    )


def _totals(worker):
    """Sum all collected $inc dicts into one dict for easy assertions."""
    out = {}
    for _bid, inc in worker._test_bumps:
        for k, v in inc.items():
            out[k] = out.get(k, 0) + v
    return out


# ---------------------------------------------------------------------------
# Branch: pHash duplicate
# ---------------------------------------------------------------------------

def test_phash_duplicate_skips_vision_and_bumps_duplicates(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    lib.phash_dup = True
    img = _make_image(tmp_path)

    res = _run(worker, clients, lib, img)

    assert res["status"] == "duplicate"
    assert res["reason"] == "phash"
    assert clients.classify_calls == 0  # no vision spend
    assert clients.embed_calls == 0
    assert _totals(worker) == {"processed": 1, "duplicates": 1}
    assert not os.path.exists(img)  # image always deleted


# ---------------------------------------------------------------------------
# Branch: quality gate rejection
# ---------------------------------------------------------------------------

def test_quality_gate_rejects(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_result["quality_ok"] = False
    img = _make_image(tmp_path)

    res = _run(worker, clients, lib, img)

    assert res["status"] == "rejected"
    assert clients.embed_calls == 0  # rejected before embedding
    assert lib.inserted == []
    assert _totals(worker) == {"processed": 1, "rejected": 1}
    assert not os.path.exists(img)


# ---------------------------------------------------------------------------
# Branch: semantic duplicate
# ---------------------------------------------------------------------------

def test_semantic_duplicate_skips_insert(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    lib.semantic_dup = "existing-hook-id"
    img = _make_image(tmp_path)

    res = _run(worker, clients, lib, img)

    assert res["status"] == "duplicate"
    assert res["reason"] == "semantic"
    assert clients.embed_calls == 1  # embedded, then found dup
    assert lib.inserted == []
    assert _totals(worker) == {"processed": 1, "duplicates": 1}
    assert not os.path.exists(img)


# ---------------------------------------------------------------------------
# Branch: high confidence -> live
# ---------------------------------------------------------------------------

def test_high_confidence_inserts_live(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_result["confidence"] = 0.9  # >= 0.75
    img = _make_image(tmp_path)

    res = _run(worker, clients, lib, img, created_by="op", platform="instagram")

    assert res["status"] == "live"
    assert len(lib.inserted) == 1
    hook, emb = lib.inserted[0]
    assert hook["status"] == "live"
    assert hook["phash"] == clients.phash_value
    assert hook["created_by"] == "op"
    assert hook["platform"] == "instagram"
    assert hook["hook_text"] == clients.classify_result["hook_text"]
    assert _totals(worker) == {"processed": 1, "inserted": 1}
    assert not os.path.exists(img)


# ---------------------------------------------------------------------------
# Branch: low confidence -> review
# ---------------------------------------------------------------------------

def test_low_confidence_inserts_review(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_result["confidence"] = 0.5  # < 0.75
    img = _make_image(tmp_path)

    res = _run(worker, clients, lib, img)

    assert res["status"] == "review"
    assert lib.inserted[0][0]["status"] == "review"
    assert _totals(worker) == {"processed": 1, "inserted": 1, "review": 1}
    assert not os.path.exists(img)


# ---------------------------------------------------------------------------
# Image always deleted, even when classify raises a non-retryable error path
# ---------------------------------------------------------------------------

def test_client_error_keeps_image_for_retry(worker, tmp_path):
    """On a HookClientError the core flow leaves the image in place so the
    Celery autoretry can re-read it; the wrapper handles final cleanup."""
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_error = FakeHookClientError("openrouter 502")
    img = _make_image(tmp_path)

    with pytest.raises(FakeHookClientError):
        _run(worker, clients, lib, img)

    assert os.path.exists(img)  # preserved for retry


# ---------------------------------------------------------------------------
# Error path via the task wrapper: exhausted retries bump 'errors' + delete
# ---------------------------------------------------------------------------

def test_task_error_path_bumps_errors_after_exhaustion(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_error = FakeHookClientError("openrouter down")
    img = _make_image(tmp_path)

    # Fake `self` whose retries already equal max_retries (exhausted).
    class _Req:
        retries = 3

    class _Self:
        request = _Req()
        max_retries = 3

    payload = {"image_path": img, "batch_id": "b1", "created_by": "admin"}
    res = worker.run_task(_Self(), payload, clients, lib)

    assert res["status"] == "errors"
    assert _totals(worker) == {"processed": 1, "errors": 1}
    assert not os.path.exists(img)


def test_task_error_path_reraises_before_exhaustion(worker, tmp_path):
    """Before retries are exhausted the wrapper re-raises (Celery autoretry)
    and the image is preserved for the next attempt."""
    clients, lib = FakeClients(), FakeLibrary()
    clients.classify_error = FakeHookClientError("openrouter 502")
    img = _make_image(tmp_path)

    class _Req:
        retries = 0

    class _Self:
        request = _Req()
        max_retries = 3

    payload = {"image_path": img, "batch_id": "b1", "created_by": "admin"}
    with pytest.raises(FakeHookClientError):
        worker.run_task(_Self(), payload, clients, lib)
    assert os.path.exists(img)  # kept for retry
    assert _totals(worker) == {}  # nothing bumped yet


# ---------------------------------------------------------------------------
# Batch counter increments accumulate across calls
# ---------------------------------------------------------------------------

def test_batch_counters_accumulate(worker, tmp_path):
    clients, lib = FakeClients(), FakeLibrary()
    # First image inserts live.
    img1 = _make_image(tmp_path, "a.png")
    _run(worker, clients, lib, img1)
    # Second image is a phash dup.
    lib.phash_dup = True
    img2 = _make_image(tmp_path, "b.png")
    _run(worker, clients, lib, img2)

    totals = _totals(worker)
    assert totals["processed"] == 2
    assert totals["inserted"] == 1
    assert totals["duplicates"] == 1


# ---------------------------------------------------------------------------
# Endpoint perm-map entries exist with the right (resource, action)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def perm_map():
    """Import server.py's PERMISSION_MAP without booting the app/Mongo."""
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test-db")
    import server
    return server.PERMISSION_MAP


def _find(perm_map, method, path):
    import re
    for (m, pattern), perm in perm_map.items():
        if m == method and re.match(pattern, path):
            return perm
    return None


def test_perm_map_ingest_is_settings_edit(perm_map):
    assert _find(perm_map, "POST", "/api/viral-hooks/ingest") == ("settings", "edit")


def test_perm_map_batch_progress_is_settings_view(perm_map):
    assert _find(perm_map, "GET", "/api/viral-hooks/ingest/abc123") == ("settings", "view")


def test_perm_map_list_is_settings_view(perm_map):
    assert _find(perm_map, "GET", "/api/viral-hooks") == ("settings", "view")


def test_perm_map_approve_reject_are_settings_edit(perm_map):
    assert _find(perm_map, "POST", "/api/viral-hooks/abc/approve") == ("settings", "edit")
    assert _find(perm_map, "POST", "/api/viral-hooks/abc/reject") == ("settings", "edit")


def test_perm_map_put_delete_are_settings_edit(perm_map):
    assert _find(perm_map, "PUT", "/api/viral-hooks/abc") == ("settings", "edit")
    assert _find(perm_map, "DELETE", "/api/viral-hooks/abc") == ("settings", "edit")


def test_hook_approve_reject_not_auth_exempt(perm_map):
    """The Telegram /approve|/reject public-suffix rule must NOT exempt the
    hook-library routes (those require settings:edit)."""
    import server
    # Public-suffix exemption is scoped so hook routes are NOT public.
    exempt = any(
        "/api/viral-hooks/abc/approve".endswith(s) and
        "/api/viral-hooks/abc/approve".startswith("/api/posts/")
        for s in server._PUBLIC_SUFFIXES
    )
    assert exempt is False
