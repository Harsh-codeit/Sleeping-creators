import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import clip_staging_service


@pytest.mark.asyncio
async def test_stage_clip_returns_cached_url():
    db = MagicMock()
    db.clip_cache = MagicMock()
    db.clip_cache.find_one = AsyncMock(return_value={
        "client_id": "c1", "drive_file_id": "f1",
        "r2_url": "https://r2.example/clips/c1/f1.mp4",
        "drive_modified_time": "2026-05-01T00:00:00Z",
    })
    db.clients.find_one = AsyncMock(return_value={"google_drive_refresh_token": "tok"})

    with patch.object(clip_staging_service, "_drive_modified_time", AsyncMock(return_value="2026-05-01T00:00:00Z")):
        url = await clip_staging_service.stage_clip(db, "c1", "f1")

    assert url == "https://r2.example/clips/c1/f1.mp4"


@pytest.mark.asyncio
async def test_stage_clip_uploads_when_cache_miss(monkeypatch, tmp_path):
    db = MagicMock()
    db.clip_cache.find_one = AsyncMock(return_value=None)
    db.clip_cache.update_one = AsyncMock()
    db.clients.find_one = AsyncMock(return_value={"google_drive_refresh_token": "tok-1"})

    download_called = {}
    def fake_download(token, file_id, dest):
        download_called["args"] = (token, file_id, dest)
        with open(dest, "wb") as f:
            f.write(b"fake-mp4-bytes")
        return dest

    upload_called = {}
    def fake_upload(local_path, key, content_type):
        upload_called["key"] = key
        upload_called["content_type"] = content_type
        return f"https://r2.example/{key}"

    monkeypatch.setattr(clip_staging_service, "_drive_modified_time", AsyncMock(return_value="2026-05-02T00:00:00Z"))
    import google_drive_service, storage
    monkeypatch.setattr(google_drive_service, "download_clip", fake_download)
    monkeypatch.setattr(storage, "upload_file", fake_upload)

    url = await clip_staging_service.stage_clip(db, "c1", "f1")

    assert download_called["args"][0] == "tok-1"
    assert upload_called["key"] == "video-clips/c1/f1.mp4"
    assert upload_called["content_type"] == "video/mp4"
    assert url == "https://r2.example/video-clips/c1/f1.mp4"
    db.clip_cache.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_stage_clip_reuploads_when_modified_time_changes(monkeypatch):
    db = MagicMock()
    db.clip_cache.find_one = AsyncMock(return_value={
        "client_id": "c1", "drive_file_id": "f1",
        "r2_url": "https://r2.example/old.mp4",
        "drive_modified_time": "2026-04-01T00:00:00Z",
    })
    db.clip_cache.update_one = AsyncMock()
    db.clients.find_one = AsyncMock(return_value={"google_drive_refresh_token": "tok"})

    monkeypatch.setattr(clip_staging_service, "_drive_modified_time", AsyncMock(return_value="2026-05-09T00:00:00Z"))
    import google_drive_service, storage
    monkeypatch.setattr(google_drive_service, "download_clip", lambda t, fid, dest: open(dest, "wb").write(b"x"))
    monkeypatch.setattr(storage, "upload_file", lambda p, k, content_type: f"https://r2.example/{k}")

    url = await clip_staging_service.stage_clip(db, "c1", "f1")
    assert url == "https://r2.example/video-clips/c1/f1.mp4"
    db.clip_cache.update_one.assert_awaited_once()
