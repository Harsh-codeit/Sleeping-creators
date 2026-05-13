import sys, os
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_list_music_tags_merges_curated_and_inferred(mock_db, _):
    mock_db.settings.find_one = AsyncMock(return_value={"key": "music_tags", "value": ["acoustic", "energy"]})
    mock_db.music_tracks.distinct = AsyncMock(return_value=["energy", "calm", "power"])
    resp = client.get("/api/music/tags", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["tags"] == ["acoustic", "calm", "energy", "power"]


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_list_music_tags_empty(mock_db, _):
    mock_db.settings.find_one = AsyncMock(return_value=None)
    mock_db.music_tracks.distinct = AsyncMock(return_value=[])
    resp = client.get("/api/music/tags", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["tags"] == []


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_create_music_tag_lowercases_and_trims(mock_db, _):
    mock_db.settings.update_one = AsyncMock()
    mock_db.settings.find_one = AsyncMock(return_value={"key": "music_tags", "value": ["acoustic"]})
    mock_db.music_tracks.distinct = AsyncMock(return_value=[])
    resp = client.post("/api/music/tags", json={"tag": "  Acoustic  "}, headers=AUTH)
    assert resp.status_code == 201
    update_call = mock_db.settings.update_one.call_args
    # filter doc
    assert update_call[0][0] == {"key": "music_tags"}
    # operations doc — verifying $addToSet got the normalized value
    ops = update_call[0][1]
    assert ops["$addToSet"]["value"] == "acoustic"


@patch("server._check_token", return_value=True)
def test_create_music_tag_rejects_empty(_):
    resp = client.post("/api/music/tags", json={"tag": "   "}, headers=AUTH)
    assert resp.status_code == 400


@patch("server._check_token", return_value=True)
def test_create_music_tag_rejects_invalid_chars(_):
    resp = client.post("/api/music/tags", json={"tag": "rock&roll"}, headers=AUTH)
    assert resp.status_code == 400


@patch("server._check_token", return_value=True)
def test_create_music_tag_rejects_too_long(_):
    resp = client.post("/api/music/tags", json={"tag": "x" * 33}, headers=AUTH)
    assert resp.status_code == 400


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_delete_music_tag_does_not_touch_tracks(mock_db, _):
    mock_db.settings.update_one = AsyncMock()
    mock_db.settings.find_one = AsyncMock(return_value={"key": "music_tags", "value": []})
    mock_db.music_tracks.distinct = AsyncMock(return_value=["acoustic"])  # still present on a track
    resp = client.delete("/api/music/tags/acoustic", headers=AUTH)
    assert resp.status_code == 200
    # only the curated list was modified — no music_tracks updates
    assert mock_db.music_tracks.update_many.called is False
    # the tag still appears (inferred from tracks)
    assert "acoustic" in resp.json()["tags"]
