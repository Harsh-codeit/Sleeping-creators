"""Tests for sheets_service branding helpers."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from sheets_service import (
    _title_fmt, _header_fmt, _section_fmt,
    _row_fmt, _status_color, BRAND
)

def test_brand_palette_has_required_keys():
    for key in ("lime", "black", "white", "grey_row", "green", "red", "amber", "grey_status"):
        assert key in BRAND, f"missing palette key: {key}"

def test_title_fmt_uses_lime_text_on_black():
    fmt = _title_fmt()
    assert fmt["backgroundColor"] == BRAND["black"]
    assert fmt["textFormat"]["foregroundColor"] == BRAND["lime"]
    assert fmt["textFormat"]["bold"] is True

def test_header_fmt_uses_white_text_on_black():
    fmt = _header_fmt()
    assert fmt["backgroundColor"] == BRAND["black"]
    assert fmt["textFormat"]["foregroundColor"] == BRAND["white"]
    assert fmt["textFormat"]["bold"] is True

def test_section_fmt_uses_black_text_on_lime():
    fmt = _section_fmt()
    assert fmt["backgroundColor"] == BRAND["lime"]
    assert fmt["textFormat"]["foregroundColor"] == BRAND["black"]
    assert fmt["textFormat"]["bold"] is True

def test_row_fmt_alternates():
    even = _row_fmt(0)
    odd = _row_fmt(1)
    assert even["backgroundColor"] == BRAND["white"]
    assert odd["backgroundColor"] == BRAND["grey_row"]

def test_status_color_returns_correct_colors():
    assert _status_color("published")["red"] == BRAND["green"]["red"]
    assert _status_color("failed")["red"] == BRAND["red"]["red"]
    assert _status_color("scheduled")["red"] == BRAND["amber"]["red"]
    assert _status_color("draft")["red"] == BRAND["grey_status"]["red"]
    assert _status_color("unknown") == BRAND["white"]
