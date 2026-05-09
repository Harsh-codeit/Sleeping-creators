import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from video_service import pick_clip

def test_pick_clip_sequential():
    clips = [{"drive_file_id": "a"}, {"drive_file_id": "b"}, {"drive_file_id": "c"}]
    assert pick_clip(clips, "sequential", 0)["drive_file_id"] == "a"
    assert pick_clip(clips, "sequential", 1)["drive_file_id"] == "b"
    assert pick_clip(clips, "sequential", 3)["drive_file_id"] == "a"

def test_pick_clip_random():
    clips = [{"drive_file_id": "a"}, {"drive_file_id": "b"}]
    result = pick_clip(clips, "random", 0)
    assert result["drive_file_id"] in ("a", "b")

def test_pick_clip_empty_raises():
    with pytest.raises(ValueError, match="No clips available"):
        pick_clip([], "sequential", 0)

def _ffmpeg_available():
    import shutil
    return shutil.which("ffmpeg") is not None

@pytest.mark.skipif(not _ffmpeg_available(), reason="FFmpeg not installed")
def test_assemble_video_with_elements(tmp_path, monkeypatch):
    import subprocess
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    input_path = str(tmp_path / "input.mp4")
    output_path = str(tmp_path / "output.mp4")
    subprocess.run([
        "ffmpeg", "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:d=3",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-c:v", "libx264", "-c:a", "aac", "-preset", "ultrafast",
        "-t", "3", input_path, "-y"
    ], check=True, capture_output=True)

    from video_service import assemble_video
    elements = [
        {
            "type": "text_overlay", "x_ratio": 0.5, "y_ratio": 0.5, "z_index": 0,
            "start_at": 0, "duration": None, "animation_in": "none", "animation_out": "none",
            "props": {"text": "Hello", "color": "#ffffff", "size": "M",
                      "bg_shape": "pill", "bg_color": "#000000", "bg_opacity": 0.5},
        }
    ]
    result = assemble_video(input_path, output_path, elements)
    assert Path(output_path).exists()
    assert Path(output_path).stat().st_size > 0
