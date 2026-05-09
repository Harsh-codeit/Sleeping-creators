import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from video_service import render_element_png, render_shape_png, SIZE_PRESETS

def test_size_presets_has_xl():
    assert "XL" in SIZE_PRESETS

def test_render_text_overlay(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    el = {
        "type": "text_overlay",
        "props": {"text": "Hello", "color": "#ffffff", "size": "M",
                  "bg_shape": "pill", "bg_color": "#000000", "bg_opacity": 0.5},
    }
    path = render_element_png(el)
    assert Path(path).exists()
    assert Path(path).stat().st_size > 0

def test_render_cta_button(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    el = {
        "type": "cta_button",
        "props": {"text": "Shop Now", "bg_color": "#ffffff",
                  "text_color": "#000000", "arrow": True},
    }
    path = render_element_png(el)
    assert Path(path).exists()

def test_render_link_in_bio(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    el = {
        "type": "link_in_bio",
        "props": {"text": "Link in bio", "handle": "@brand",
                  "bg_color": "#000000", "text_color": "#ffffff"},
    }
    path = render_element_png(el)
    assert Path(path).exists()

def test_render_countdown(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    el = {
        "type": "countdown",
        "props": {"end_at": 90.0, "color": "#ffffff", "size": "L"},
    }
    path = render_element_png(el)
    assert Path(path).exists()

def test_render_rectangle(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    path = render_shape_png("rectangle",
        {"fill_color": "#000000", "fill_opacity": 0.5,
         "border_color": "#ffffff", "border_width": 2,
         "width_ratio": 0.8, "height_ratio": 0.1},
        1080, 1920)
    assert Path(path).exists()

def test_render_circle(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    path = render_shape_png("circle",
        {"fill_color": "#ffffff", "fill_opacity": 0.8,
         "border_color": "#000000", "border_width": 0,
         "width_ratio": 0.1, "height_ratio": 0.1},
        1080, 1920)
    assert Path(path).exists()

def test_render_line(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    path = render_shape_png("line",
        {"color": "#ffffff", "thickness": 2, "width_ratio": 0.8},
        1080, 1920)
    assert Path(path).exists()

def test_render_element_unknown_type():
    with pytest.raises(ValueError, match="Unknown element type"):
        render_element_png({"type": "flying_saucer", "props": {}})
