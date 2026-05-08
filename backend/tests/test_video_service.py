import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from video_service import assemble_video, pick_clip, _hex_to_ffmpeg_color, _y_expression

def test_hex_to_ffmpeg_color():
    assert _hex_to_ffmpeg_color("#ffffff") == "0xFFFFFF"
    assert _hex_to_ffmpeg_color("000000") == "0x000000"

def test_y_expression_positions():
    assert "0.08" in _y_expression("top", 0)
    assert "text_h" in _y_expression("center", 0)
    assert "0.80" in _y_expression("bottom", 0)

def test_y_expression_with_positive_offset():
    expr = _y_expression("top", 50)
    assert "+50" in expr

def test_y_expression_with_negative_offset():
    expr = _y_expression("top", -20)
    assert "-20" in expr

def test_pick_clip_sequential():
    clips = [{"drive_file_id": "a"}, {"drive_file_id": "b"}, {"drive_file_id": "c"}]
    assert pick_clip(clips, "sequential", 0)["drive_file_id"] == "a"
    assert pick_clip(clips, "sequential", 1)["drive_file_id"] == "b"
    assert pick_clip(clips, "sequential", 3)["drive_file_id"] == "a"  # wraps

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
def test_assemble_video_creates_output(tmp_path):
    import subprocess
    input_path = str(tmp_path / "input.mp4")
    output_path = str(tmp_path / "output.mp4")
    subprocess.run([
        "ffmpeg", "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:d=2",
        "-c:v", "libx264", "-preset", "ultrafast", input_path, "-y"
    ], check=True, capture_output=True)

    template = {
        "position": "center", "position_y": 0,
        "font_size": 48, "font_color": "#ffffff",
        "overlay_color": "#000000", "overlay_opacity": 0.5,
        "shadow": True, "stroke_width": 0,
        "text_align": "center", "font_family": "DejaVuSans-Bold",
    }
    assemble_video(input_path, output_path, "Hello World", template)
    assert Path(output_path).exists()
    assert Path(output_path).stat().st_size > 0
