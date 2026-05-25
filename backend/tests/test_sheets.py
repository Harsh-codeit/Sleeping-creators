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


from unittest.mock import patch, MagicMock

def test_create_sheet_creates_six_tabs():
    """_create_sheet_sync must create exactly 6 worksheets in correct order."""
    mock_gc = MagicMock()
    mock_sh = MagicMock()
    mock_gc.create.return_value = mock_sh
    mock_sh.sheet1 = MagicMock()
    mock_sh.id = "sheet123"
    mock_sh.url = "https://sheets.google.com/sheet123"

    created_tabs = []
    def fake_add_worksheet(title, rows, cols):
        ws = MagicMock()
        ws.title = title
        created_tabs.append(title)
        return ws
    mock_sh.add_worksheet.side_effect = fake_add_worksheet

    with patch("sheets_service._get_gc", return_value=mock_gc), \
         patch("sheets_service._add_charts_to_sheet"):
        from sheets_service import _create_sheet_sync
        result = _create_sheet_sync("tok", "Acme", "acme@email.com")

    # Tab 1 (Dashboard) is sheet1, renamed. Tabs 2-6 are add_worksheet calls.
    assert len(created_tabs) == 5
    assert created_tabs == ["Client Info", "Posts", "Performance", "Competitors", "Trends"]
    assert result == {"sheet_id": "sheet123", "sheet_url": "https://sheets.google.com/sheet123"}
