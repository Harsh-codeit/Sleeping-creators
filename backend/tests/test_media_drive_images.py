import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


def _fake_drive_clips_cursor(rows):
    """Mimic db.drive_clips.find(...).sort(...).to_list(...)."""
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=rows)
    return cursor


@pytest.mark.asyncio
async def test_list_carousel_images_reads_drive_clips_image_rows():
    import server
    rows = [
        {"drive_file_id": "i1", "name": "a.jpg", "mime_type": "image/jpeg", "source": "drive"},
        {"drive_file_id": "i2", "name": "b.png", "mime_type": "image/png", "source": "drive"},
    ]
    fake_db = MagicMock()
    fake_db.drive_clips.find.return_value = _fake_drive_clips_cursor(rows)
    with patch.object(server, "db", fake_db):
        out = await server._list_carousel_images("c1")
    assert [r["drive_file_id"] for r in out] == ["i1", "i2"]
    args, kwargs = fake_db.drive_clips.find.call_args
    q = args[0]
    assert q["client_id"] == "c1"
    assert q["source"] == "drive"
    assert q["mime_type"] == {"$regex": "^image/"}


@pytest.mark.asyncio
async def test_list_carousel_images_override_lists_live():
    import server, google_drive_service
    live = [{"drive_file_id": "L1", "name": "z.jpg", "mime_type": "image/jpeg"}]
    with patch.object(server, "_get_google_refresh_token", AsyncMock(return_value="tok")), \
         patch.object(google_drive_service, "list_images", return_value=live) as li:
        out = await server._list_carousel_images("c1", folder_id_override="FOLDERX")
    assert out == live
    li.assert_called_once()
