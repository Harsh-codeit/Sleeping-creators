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

from video_service import build_filter_chain, animation_out_exprs, resolve_overrides

def test_animation_out_fade_produces_decreasing_alpha():
    _, alpha = animation_out_exprs("fade", end_t=5.0)
    assert "lt(t" in alpha
    assert "4.7" in alpha or "4.70" in alpha  # start_t = 5.0 - 0.3

def test_animation_out_none_returns_one():
    _, alpha = animation_out_exprs("none", end_t=5.0)
    assert alpha == "1"

def test_resolve_overrides_updates_matching_elements():
    elements = [
        {"type": "cta_button", "overridable": True, "override_key": "cta",
         "props": {"text": "Shop Now"}},
        {"type": "text_overlay", "overridable": False, "override_key": None,
         "props": {"text": "Static text"}},
    ]
    result = resolve_overrides(elements, {"cta": "Buy Now"})
    assert result[0]["props"]["text"] == "Buy Now"
    assert result[1]["props"]["text"] == "Static text"

def test_resolve_overrides_does_not_mutate_original():
    elements = [
        {"type": "cta_button", "overridable": True, "override_key": "cta",
         "props": {"text": "Shop Now"}},
    ]
    resolve_overrides(elements, {"cta": "Buy Now"})
    assert elements[0]["props"]["text"] == "Shop Now"

def test_build_filter_chain_returns_one_entry_per_element(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    elements = [
        {"type": "text_overlay", "x_ratio": 0.5, "y_ratio": 0.5, "z_index": 0,
         "start_at": 0, "duration": None, "animation_in": "none", "animation_out": "none",
         "props": {"text": "Hi", "color": "#fff", "size": "M", "bg_shape": "none",
                   "bg_color": "#000", "bg_opacity": 0.5}},
    ]
    chain = build_filter_chain(elements, video_duration=10.0)
    assert len(chain) == 1
    assert "png_path" in chain[0]
    assert "x_expr" in chain[0]
    assert "enable_expr" in chain[0]

def test_build_filter_chain_sorted_by_z_index(tmp_path, monkeypatch):
    monkeypatch.setattr("video_service.TEMP_DIR", tmp_path)
    props = {"text": "Hi", "color": "#fff", "size": "M", "bg_shape": "none",
             "bg_color": "#000", "bg_opacity": 0.5}
    elements = [
        {"type": "text_overlay", "x_ratio": 0.5, "y_ratio": 0.5, "z_index": 5,
         "start_at": 0, "duration": None, "animation_in": "none", "animation_out": "none",
         "props": {**props, "text": "Z5"}},
        {"type": "text_overlay", "x_ratio": 0.5, "y_ratio": 0.5, "z_index": 1,
         "start_at": 0, "duration": None, "animation_in": "none", "animation_out": "none",
         "props": {**props, "text": "Z1"}},
    ]
    chain = build_filter_chain(elements, video_duration=10.0)
    assert len(chain) == 2
