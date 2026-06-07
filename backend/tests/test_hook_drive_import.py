"""Tests for Google Drive folder import into the viral hook library.

Covers:
  - worker ``_process`` threads ``source_ref`` onto the inserted hook;
  - the ``/api/viral-hooks/ingest/drive`` endpoint: file-id dedup skip path
    (already-imported file is NOT downloaded/queued, counted as skipped), new
    files are downloaded + dispatched with source_ref set, and the 400 when no
    Google token is connected;
  - the perm-map entry exists and precedes the generic rules.

No network, no Redis, no Mongo, no Postgres: google_drive_service, the worker
dispatch, viral_library, and db are all replaced with fakes/stubs.
"""
import importlib
import os

import pytest


# ---------------------------------------------------------------------------
# Worker: source_ref threads onto the inserted hook
# ---------------------------------------------------------------------------

class _FakeHookClientError(Exception):
    pass


class _FakeClients:
    HookClientError = _FakeHookClientError

    def phash(self, image_path):
        return "phash-xyz"

    def extract_and_classify(self, image_path, *, allowed_niches):
        return {
            "hook_text": "drive imported hook",
            "niche_slug": "business-entrepreneurship",
            "category": "hook-story",
            "hook_type": "shocking_number",
            "language": "en",
            "trigger": "curiosity_gap",
            "virality_score": 0.7,
            "quality_ok": True,
            "confidence": 0.9,
        }

    def embed(self, text):
        return [0.0] * 8


class _FakeLibrary:
    def __init__(self):
        self.inserted = []

    def phash_exists(self, ph):
        return False

    def find_semantic_duplicate(self, emb, *, niche_slug=None):
        return None

    def insert_hook(self, hook, embedding):
        self.inserted.append((hook, embedding))
        return "hook-id-1"


@pytest.fixture
def worker(monkeypatch, tmp_path):
    monkeypatch.setenv("HOOK_INGEST_TMP", str(tmp_path / "tmp"))
    import hook_ingest_worker
    importlib.reload(hook_ingest_worker)
    monkeypatch.setattr(hook_ingest_worker, "_bump_batch", lambda *a, **k: None)
    monkeypatch.setattr(
        hook_ingest_worker, "_allowed_niches",
        lambda: ["business-entrepreneurship", "other"],
    )
    return hook_ingest_worker


def _make_image(tmp_path, name="shot.png"):
    p = tmp_path / name
    p.write_bytes(b"fake-image-bytes")
    return str(p)


def test_process_stores_source_ref_on_inserted_hook(worker, tmp_path):
    clients, lib = _FakeClients(), _FakeLibrary()
    img = _make_image(tmp_path)
    res = worker._process(
        clients, lib,
        image_path=img, batch_id="b1", created_by="admin",
        platform="instagram", source_ref="gdrive:FILE123",
    )
    assert res["status"] == "live"
    assert len(lib.inserted) == 1
    hook, _emb = lib.inserted[0]
    assert hook["source_ref"] == "gdrive:FILE123"
    assert not os.path.exists(img)


def test_process_source_ref_defaults_none(worker, tmp_path):
    """Upload path (no source_ref) still works and stores None."""
    clients, lib = _FakeClients(), _FakeLibrary()
    img = _make_image(tmp_path, "b.png")
    worker._process(
        clients, lib,
        image_path=img, batch_id="b1", created_by="admin", platform=None,
    )
    assert lib.inserted[0][0]["source_ref"] is None


# ---------------------------------------------------------------------------
# Endpoint: /api/viral-hooks/ingest/drive
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def server_mod():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test-db")
    os.environ.pop("REDIS_URL", None)  # force inline dispatch in tests
    import server
    return server


class _FakeBatches:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(doc)


class _FakeDB:
    def __init__(self):
        self.hook_ingest_batches = _FakeBatches()


class _FakeBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args, **kwargs):
        self.tasks.append((fn, args, kwargs))

    @property
    def jobs(self):
        """The job dict passed to each scheduled inline task."""
        return [args[0] for _fn, args, _kw in self.tasks]


def _run(coro):
    import asyncio
    return asyncio.run(coro)


def _patch_common(monkeypatch, server_mod, *, token="rt", images=None,
                  existing_refs=None, tmp_path=None):
    """Wire up the endpoint dependencies with in-memory fakes."""
    existing = set(existing_refs or [])

    # Force the inline dispatch branch (no Celery/Redis) regardless of ambient env.
    monkeypatch.delenv("REDIS_URL", raising=False)

    async def _fake_token():
        return token
    monkeypatch.setattr(server_mod, "_get_google_refresh_token", _fake_token)

    fake_db = _FakeDB()
    monkeypatch.setattr(server_mod, "db", fake_db)

    monkeypatch.setattr(server_mod, "_hook_ingest_tmp_dir", lambda: tmp_path)

    # Fake google_drive_service module functions (imported inside the endpoint).
    import google_drive_service as gds
    downloaded = []

    def _list_images(refresh_token, folder_id):
        return list(images or [])

    def _extract_folder_id(url):
        return "FOLDER"

    def _download_clip(refresh_token, file_id, dest_path):
        with open(dest_path, "wb") as fh:
            fh.write(b"x")
        downloaded.append(file_id)
        return dest_path

    monkeypatch.setattr(gds, "list_images", _list_images)
    monkeypatch.setattr(gds, "extract_folder_id", _extract_folder_id)
    monkeypatch.setattr(gds, "download_clip", _download_clip)

    # Fake viral_library.source_ref_exists.
    import viral_library
    monkeypatch.setattr(
        viral_library, "source_ref_exists", lambda ref: ref in existing
    )

    # Stub the inline dispatcher so a scheduled task (if ever run) does nothing.
    # The endpoint schedules via BackgroundTasks.add_task, so we assert on the
    # captured jobs (bg.jobs) rather than on actual execution.
    import hook_ingest_worker
    monkeypatch.setattr(
        hook_ingest_worker, "process_image_inline", lambda job: None
    )
    return {"db": fake_db, "downloaded": downloaded}


def test_drive_ingest_400_without_token(monkeypatch, server_mod, tmp_path):
    _patch_common(monkeypatch, server_mod, token="", tmp_path=tmp_path)
    body = server_mod.HookDriveIngest(folder_url="https://drive/folders/X")
    bg = _FakeBackgroundTasks()
    with pytest.raises(server_mod.HTTPException) as exc:
        _run(server_mod.ingest_viral_hooks_from_drive(body, bg))
    assert exc.value.status_code == 400
    assert "not connected" in str(exc.value.detail).lower()


def test_drive_ingest_skips_already_imported(monkeypatch, server_mod, tmp_path):
    images = [
        {"drive_file_id": "A", "name": "a.png", "mime_type": "image/png"},
        {"drive_file_id": "B", "name": "b.png", "mime_type": "image/png"},
    ]
    ctx = _patch_common(
        monkeypatch, server_mod, images=images,
        existing_refs={"gdrive:A"}, tmp_path=tmp_path,
    )
    body = server_mod.HookDriveIngest(folder_url="folder")
    bg = _FakeBackgroundTasks()
    res = _run(server_mod.ingest_viral_hooks_from_drive(body, bg))

    assert res["skipped"] == 1
    assert res["queued"] == 1
    assert res["mode"] == "inline"
    # Only the NEW file (B) was downloaded + dispatched.
    assert ctx["downloaded"] == ["B"]
    assert len(bg.jobs) == 1
    job = bg.jobs[0]
    assert job["source_ref"] == "gdrive:B"
    # batch total counts NEW files only.
    assert ctx["db"].hook_ingest_batches.docs[0]["total"] == 1


def test_drive_ingest_dispatches_new_files_with_source_ref(
    monkeypatch, server_mod, tmp_path
):
    images = [
        {"drive_file_id": "X1", "name": "x1.jpg", "mime_type": "image/jpeg"},
        {"drive_file_id": "X2", "name": "x2.png", "mime_type": "image/png"},
    ]
    ctx = _patch_common(
        monkeypatch, server_mod, images=images, existing_refs=set(),
        tmp_path=tmp_path,
    )
    body = server_mod.HookDriveIngest(folder_url="folder", platform="tiktok")
    bg = _FakeBackgroundTasks()
    res = _run(server_mod.ingest_viral_hooks_from_drive(body, bg))

    assert res["skipped"] == 0
    assert res["queued"] == 2
    assert sorted(ctx["downloaded"]) == ["X1", "X2"]
    refs = sorted(j["source_ref"] for j in bg.jobs)
    assert refs == ["gdrive:X1", "gdrive:X2"]
    assert all(j["platform"] == "tiktok" for j in bg.jobs)
    assert all(j["created_by"] == "admin" for j in bg.jobs)


# ---------------------------------------------------------------------------
# Perm-map entry
# ---------------------------------------------------------------------------

def test_perm_map_drive_ingest_is_settings_edit(server_mod):
    import re
    pm = server_mod.PERMISSION_MAP
    found = None
    for (m, pattern), perm in pm.items():
        if m == "POST" and re.match(pattern, "/api/viral-hooks/ingest/drive"):
            found = perm
            break
    assert found == ("settings", "edit")
