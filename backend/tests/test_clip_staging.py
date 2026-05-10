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
