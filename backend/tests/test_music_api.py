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
    mock_db.music_tracks.find.return_value = [TRACK]
    resp = client.get("/api/music", headers=AUTH)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Energy Beat"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_list_music_mood_filter(mock_db, _):
    mock_db.music_tracks.find.return_value = [TRACK]
    resp = client.get("/api/music?mood=energy", headers=AUTH)
    assert resp.status_code == 200
    call_args = mock_db.music_tracks.find.call_args[0][0]
    assert "mood_tags" in call_args

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_update_music_track(mock_db, _):
    updated = {**TRACK, "mood_tags": ["power"]}
    mock_db.music_tracks.find_one.side_effect = [TRACK, updated]
    mock_db.music_tracks.update_one.return_value = MagicMock()
    resp = client.put("/api/music/t1", json={"mood_tags": ["power"]}, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["mood_tags"] == ["power"]

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_delete_music_track(mock_db, _):
    mock_db.music_tracks.find_one.return_value = TRACK
    mock_db.music_tracks.delete_one.return_value = MagicMock()
    resp = client.delete("/api/music/t1", headers=AUTH)
    assert resp.status_code == 200

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_pick_music_by_mood(mock_db, _):
    mock_db.music_tracks.find.return_value = [TRACK]
    resp = client.get("/api/music/pick?mood=energy", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["track"]["id"] == "t1"

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_pick_music_empty_library(mock_db, _):
    mock_db.music_tracks.find.return_value = []
    resp = client.get("/api/music/pick?mood=energy", headers=AUTH)
    assert resp.status_code == 404
