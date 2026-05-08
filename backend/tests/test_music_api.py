from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}

TRACK = {"id": "t1", "name": "Energy Beat", "filename": "beat.mp3",
         "r2_url": "https://r2.example/music/t1.mp3", "r2_key": "music/t1.mp3",
         "duration": 120.0, "mood_tags": ["energy"], "segments": [], "uploaded_at": "2026-05-09T00:00:00Z"}

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_list_music(mock_db, _):
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[TRACK])
    mock_db.music_tracks.find.return_value = mock_cursor
    resp = client.get("/api/music", headers=AUTH)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Energy Beat"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_list_music_mood_filter(mock_db, _):
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[TRACK])
    mock_db.music_tracks.find.return_value = mock_cursor
    resp = client.get("/api/music?mood=energy", headers=AUTH)
    assert resp.status_code == 200
    call_args = mock_db.music_tracks.find.call_args[0][0]
    assert call_args["mood_tags"] == {"$in": ["energy"]}

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_update_music_track(mock_db, _):
    updated = {**TRACK, "mood_tags": ["power"]}
    mock_db.music_tracks.find_one = AsyncMock(side_effect=[TRACK, updated])
    mock_db.music_tracks.update_one = AsyncMock(return_value=MagicMock())
    resp = client.put("/api/music/t1", json={"mood_tags": ["power"]}, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["mood_tags"] == ["power"]

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_delete_music_track(mock_db, _):
    mock_db.music_tracks.find_one = AsyncMock(return_value=TRACK)
    mock_db.music_tracks.delete_one = AsyncMock(return_value=MagicMock())
    resp = client.delete("/api/music/t1", headers=AUTH)
    assert resp.status_code == 200

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_pick_music_by_mood(mock_db, _):
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[TRACK])
    mock_db.music_tracks.find.return_value = mock_cursor
    resp = client.get("/api/music/pick?mood=energy", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["track"]["id"] == "t1"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_pick_music_empty_library(mock_db, _):
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])
    mock_db.music_tracks.find.return_value = mock_cursor
    resp = client.get("/api/music/pick?mood=energy", headers=AUTH)
    assert resp.status_code == 404

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_update_music_track_empty_body_returns_400(mock_db, _):
    mock_db.music_tracks.find_one = AsyncMock(return_value=TRACK)
    resp = client.put("/api/music/t1", json={}, headers=AUTH)
    assert resp.status_code == 400

import io

@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("storage.upload_bytes", return_value="https://r2.example/music/new-id.mp3")
def test_upload_music_track(mock_upload, mock_db, _):
    mock_db.music_tracks.insert_one = AsyncMock(return_value=MagicMock())
    mock_db.music_tracks.find_one = AsyncMock(return_value={
        "_id": "x", "id": "new-id", "name": "My Track", "filename": "beat.mp3",
        "r2_url": "https://r2.example/music/new-id.mp3", "r2_key": "music/new-id.mp3",
        "duration": 0.0, "mood_tags": ["calm"], "segments": [], "uploaded_at": "2026-05-09T00:00:00Z"
    })
    resp = client.post(
        "/api/music/upload",
        data={"name": "My Track", "mood_tags": '["calm"]'},
        files={"file": ("beat.mp3", io.BytesIO(b"fake-audio"), "audio/mpeg")},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "My Track"
    assert resp.json()["mood_tags"] == ["calm"]
    assert resp.json()["r2_url"] == "https://r2.example/music/new-id.mp3"
