from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import _is_clip_stream_path


def test_identifies_clip_stream_paths():
    assert _is_clip_stream_path("/api/clients/client-1/clips/clip-1/stream")


def test_rejects_non_clip_stream_paths():
    assert not _is_clip_stream_path("/api/clients/client-1/drive-clips")
    assert not _is_clip_stream_path("/api/video-templates")
    assert not _is_clip_stream_path("/api/clients/client-1/clips/clip-1")
