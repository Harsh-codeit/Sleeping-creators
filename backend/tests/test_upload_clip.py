"""Tests for POST /clients/{client_id}/clips/upload.

Verifies the manual-upload endpoint stores the same orientation metadata
(width, height, is_vertical, mime_type) as the Drive sync path in
google_drive_service.list_clips. This is what allows the vertical-rotation
logic in video_render_service.build_merge_values (lines 494-505) to fire
for manually uploaded clips.

Mocking strategy:
 - Patch `server.db` so insert_one captures the doc instead of hitting Mongo.
 - Patch `server._check_token` so the auth middleware lets requests through.
 - Patch `ffmpeg.probe` and `storage.upload_file` / `storage.is_enabled` at
   their module attributes — `upload_clip` does `import storage` and
   `import ffmpeg as _ffmpeg` inside the function, so these in-function
   imports resolve to the (already patched) modules.
"""

import io
import sys
import os
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app  # noqa: E402

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


# ── helpers ───────────────────────────────────────────────────────────────

def _probe_dict(width: int, height: int, duration: str = "10.0"):
    """Synthetic ffmpeg.probe output with one video stream."""
    return {
        "format": {"duration": duration},
        "streams": [
            {"codec_type": "video", "width": width, "height": height},
        ],
    }


def _wire_db(mock_db):
    """Configure the patched server.db so the endpoint can run end-to-end."""
    mock_db.clients.find_one = AsyncMock(return_value={"id": "c1", "name": "Acme"})
    mock_db.drive_clips.insert_one = AsyncMock()


def _inserted_doc(mock_db) -> dict:
    """Return the doc passed to drive_clips.insert_one."""
    mock_db.drive_clips.insert_one.assert_awaited_once()
    return mock_db.drive_clips.insert_one.await_args.args[0]


def _post_upload(filename: str = "clip.mp4",
                 content_type: str = "video/mp4",
                 client_id: str = "c1"):
    """Issue the multipart POST."""
    files = {"file": (filename, io.BytesIO(b"fake-video-bytes"), content_type)}
    return client.post(f"/api/clients/{client_id}/clips/upload",
                       files=files, headers=AUTH)


# ── tests ─────────────────────────────────────────────────────────────────

@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_vertical_mp4_sets_is_vertical_true(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """Probe reports 1080x1920 → doc carries width=1080, height=1920,
    is_vertical=True, mime_type='video/mp4' (matches Drive sync schema)."""
    _wire_db(mock_db)
    mock_probe.return_value = _probe_dict(1080, 1920)
    mock_upload.return_value = "https://r2.example/clips/c1/abc.mp4"

    resp = _post_upload(filename="vertical.mp4", content_type="video/mp4")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["width"] == 1080
    assert doc["height"] == 1920
    assert doc["is_vertical"] is True
    assert doc["mime_type"] == "video/mp4"
    assert doc["source"] == "upload"
    assert doc["r2_url"] == "https://r2.example/clips/c1/abc.mp4"
    # Response body mirrors the inserted doc.
    assert resp.json()["is_vertical"] is True


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_vertical_mov_preserves_quicktime_mime_type(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """.mov upload (content_type='video/quicktime') → mime_type is preserved.
    video_render_service:502-503 keys off this exact string to flip the
    rotation override from -90 to +90, so the upload pipeline MUST store it
    verbatim. The +90 vs -90 branching itself is covered by render-side
    tests (test_video_render_service.py)."""
    _wire_db(mock_db)
    mock_probe.return_value = _probe_dict(1080, 1920)
    mock_upload.return_value = "https://r2.example/clips/c1/abc.mov"

    resp = _post_upload(filename="vertical.mov", content_type="video/quicktime")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["mime_type"] == "video/quicktime"
    assert doc["is_vertical"] is True
    assert doc["width"] == 1080
    assert doc["height"] == 1920


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_horizontal_sets_is_vertical_false(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """1920x1080 → is_vertical=False (no rotation should ever be scheduled)."""
    _wire_db(mock_db)
    mock_probe.return_value = _probe_dict(1920, 1080)
    mock_upload.return_value = "https://r2.example/clips/c1/abc.mp4"

    resp = _post_upload(filename="landscape.mp4", content_type="video/mp4")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["width"] == 1920
    assert doc["height"] == 1080
    assert doc["is_vertical"] is False


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_square_is_not_vertical(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """1080x1080 → height>width is false, so is_vertical=False. Mirrors
    google_drive_service.py:102 (`bool(w and h and h > w)`)."""
    _wire_db(mock_db)
    mock_probe.return_value = _probe_dict(1080, 1080)
    mock_upload.return_value = "https://r2.example/clips/c1/sq.mp4"

    resp = _post_upload(filename="square.mp4", content_type="video/mp4")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["width"] == 1080
    assert doc["height"] == 1080
    assert doc["is_vertical"] is False


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_probe_failure_still_succeeds_no_rotation(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """ffmpeg.probe raises → duration=0, width=0, height=0, is_vertical=False.
    Upload must still return 201 so users don't lose files on corrupt probes.
    The render service then sees is_vertical falsy and skips rotation
    (video_render_service.py:498 — `if drive_doc and drive_doc.get('is_vertical')`)."""
    _wire_db(mock_db)
    mock_probe.side_effect = RuntimeError("ffmpeg: bad header")
    mock_upload.return_value = "https://r2.example/clips/c1/abc.mp4"

    resp = _post_upload(filename="broken.mp4", content_type="video/mp4")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["duration"] == 0.0
    assert doc["width"] == 0
    assert doc["height"] == 0
    assert doc["is_vertical"] is False
    # mime_type must still be stored — otherwise render service can't tell .mov
    # vs .mp4 should orientation ever get manually corrected later.
    assert doc["mime_type"] == "video/mp4"


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_no_video_stream_yields_zero_dims(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """Audio-only file → probe returns no video stream → width/height stay 0,
    is_vertical=False, upload succeeds. Guards against the `next(...)` lookup
    raising or assigning bogus dims from an audio stream."""
    _wire_db(mock_db)
    mock_probe.return_value = {
        "format": {"duration": "5.0"},
        "streams": [{"codec_type": "audio", "channels": 2}],
    }
    mock_upload.return_value = "https://r2.example/clips/c1/audio.mp4"

    resp = _post_upload(filename="audio-only.mp4", content_type="video/mp4")

    assert resp.status_code == 201, resp.text
    doc = _inserted_doc(mock_db)
    assert doc["width"] == 0
    assert doc["height"] == 0
    assert doc["is_vertical"] is False
    assert doc["duration"] == 5.0  # format.duration still gets read


@patch("server._check_token", return_value=True)
@patch("server.db")
@patch("ffmpeg.probe")
@patch("storage.upload_file")
@patch("storage.is_enabled", return_value=True)
def test_upload_clip_schema_matches_drive_sync(
    _is_enabled, mock_upload, mock_probe, mock_db, _token,
):
    """Parity check: every orientation-related key produced by Drive sync
    (google_drive_service.list_clips, lines 95-105) must also appear on
    the upload doc. If Drive sync grows a new orientation field, this
    test will surface the gap."""
    _wire_db(mock_db)
    mock_probe.return_value = _probe_dict(1080, 1920)
    mock_upload.return_value = "https://r2.example/clips/c1/x.mp4"

    resp = _post_upload(filename="x.mp4", content_type="video/mp4")

    assert resp.status_code == 201
    doc = _inserted_doc(mock_db)
    required = {"width", "height", "is_vertical", "mime_type",
                "drive_file_id", "client_id", "duration"}
    missing = required - doc.keys()
    assert not missing, f"upload doc is missing Drive-sync parity keys: {missing}"
