import sys, os
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}

FOLDER_URL = "https://drive.google.com/drive/folders/abc123folder"

DRIVE_ITEMS = [
    {"drive_file_id": "f1", "name": "track-one.mp3", "mime_type": "audio/mpeg", "size": 1024},
    {"drive_file_id": "f2", "name": "track-two.wav", "mime_type": "audio/wav", "size": 2048},
]


def _find_returning(docs):
    """Build a MagicMock chain that mimics db.music_tracks.find(...).to_list(None)."""
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=docs)
    return cursor


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="rt-token")
@patch("google_drive_service.list_audio")
@patch("server.db")
def test_drive_list_marks_already_imported(mock_db, mock_list_audio, _gt, _ct):
    mock_list_audio.return_value = list(DRIVE_ITEMS)
    mock_db.music_tracks.find.return_value = _find_returning([{"drive_file_id": "f1"}])
    resp = client.get(f"/api/music/drive/list?folder={FOLDER_URL}", headers=AUTH)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["folder_id"] == "abc123folder"
    items = {it["drive_file_id"]: it for it in body["items"]}
    assert items["f1"]["already_imported"] is True
    assert items["f2"]["already_imported"] is False


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="")
@patch("server.db")
def test_drive_list_requires_google_connection(mock_db, _gt, _ct):
    resp = client.get(f"/api/music/drive/list?folder={FOLDER_URL}", headers=AUTH)
    assert resp.status_code == 400
    assert "Google account not connected" in resp.json()["detail"]


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="rt-token")
def test_drive_list_invalid_folder(_gt, _ct):
    resp = client.get("/api/music/drive/list?folder=", headers=AUTH)
    # FastAPI rejects missing query param with 422; an unparseable value yields 400
    assert resp.status_code in (400, 422)


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="rt-token")
@patch("google_drive_service.list_audio")
@patch("google_drive_service.download_clip")
@patch("storage.upload_file", return_value="https://r2.example/music/new.mp3")
@patch("storage.is_enabled", return_value=True)
@patch("server.db")
def test_drive_import_happy_path(mock_db, _en, mock_upload, mock_download, mock_list_audio, _gt, _ct):
    mock_list_audio.return_value = list(DRIVE_ITEMS)
    mock_db.music_tracks.find.return_value = _find_returning([])  # nothing imported yet
    mock_db.music_tracks.insert_one = AsyncMock()
    mock_db.music_tracks.find_one = AsyncMock(side_effect=lambda q: {
        "_id": "x", **{
            "id": q["id"], "name": "track-one", "filename": "track-one.mp3",
            "r2_url": "https://r2.example/music/new.mp3", "r2_key": f"music/{q['id']}.mp3",
            "duration": 0.0, "mood_tags": ["energy"], "segments": [],
            "drive_file_id": "f1", "source": "drive", "uploaded_at": "2026-05-13T00:00:00Z",
        }
    })
    resp = client.post(
        "/api/music/drive/import",
        json={"folder": FOLDER_URL, "drive_file_ids": ["f1"], "mood_tags": ["energy"]},
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body["imported"]) == 1
    imported = body["imported"][0]
    assert imported["drive_file_id"] == "f1"
    assert imported["source"] == "drive"
    assert imported["mood_tags"] == ["energy"]
    assert body["skipped"] == []
    assert body["failed"] == []
    mock_download.assert_called_once()
    mock_upload.assert_called_once()
    # r2_key matches pattern music/<uuid>.mp3
    key = mock_upload.call_args[0][1]
    assert key.startswith("music/") and key.endswith(".mp3")


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="rt-token")
@patch("google_drive_service.list_audio")
@patch("google_drive_service.download_clip")
@patch("storage.upload_file", return_value="https://r2.example/music/new.mp3")
@patch("storage.is_enabled", return_value=True)
@patch("server.db")
def test_drive_import_skips_already_imported(mock_db, _en, _up, _dl, mock_list_audio, _gt, _ct):
    mock_list_audio.return_value = list(DRIVE_ITEMS)
    mock_db.music_tracks.find.return_value = _find_returning([{"drive_file_id": "f1"}])
    mock_db.music_tracks.insert_one = AsyncMock()
    resp = client.post(
        "/api/music/drive/import",
        json={"folder": FOLDER_URL, "drive_file_ids": ["f1"]},
        headers=AUTH,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["imported"] == []
    assert body["skipped"] == [{"drive_file_id": "f1", "reason": "already_imported"}]
    _dl.assert_not_called()
    _up.assert_not_called()
    mock_db.music_tracks.insert_one.assert_not_called()


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="rt-token")
@patch("google_drive_service.list_audio")
@patch("google_drive_service.download_clip")
@patch("storage.upload_file", return_value="https://r2.example/music/new.mp3")
@patch("storage.is_enabled", return_value=True)
@patch("server.db")
def test_drive_import_fails_when_file_not_in_folder(mock_db, _en, _up, _dl, mock_list_audio, _gt, _ct):
    mock_list_audio.return_value = list(DRIVE_ITEMS)  # only f1, f2 — not f99
    mock_db.music_tracks.find.return_value = _find_returning([])
    resp = client.post(
        "/api/music/drive/import",
        json={"folder": FOLDER_URL, "drive_file_ids": ["f99"]},
        headers=AUTH,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["imported"] == []
    assert body["failed"] == [{"drive_file_id": "f99", "reason": "not_found_in_folder"}]
    _dl.assert_not_called()


@patch("server._check_token", return_value=True)
@patch("server._get_google_refresh_token", new_callable=AsyncMock, return_value="")
@patch("storage.is_enabled", return_value=True)
def test_drive_import_requires_google_connection(_en, _gt, _ct):
    resp = client.post(
        "/api/music/drive/import",
        json={"folder": FOLDER_URL, "drive_file_ids": ["f1"]},
        headers=AUTH,
    )
    assert resp.status_code == 400
    assert "Google account not connected" in resp.json()["detail"]


@patch("server._check_token", return_value=True)
@patch("storage.is_enabled", return_value=False)
def test_drive_import_requires_storage(_en, _ct):
    resp = client.post(
        "/api/music/drive/import",
        json={"folder": FOLDER_URL, "drive_file_ids": ["f1"]},
        headers=AUTH,
    )
    assert resp.status_code == 503
