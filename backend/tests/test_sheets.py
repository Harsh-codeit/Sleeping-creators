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


def test_add_charts_called_on_create():
    """_add_charts_to_sheet must be called exactly once during sheet creation."""
    mock_gc = MagicMock()
    mock_sh = MagicMock()
    mock_gc.create.return_value = mock_sh
    mock_sh.sheet1 = MagicMock()
    mock_sh.id = "s1"
    mock_sh.url = "https://x"
    mock_sh.add_worksheet.return_value = MagicMock()

    with patch("sheets_service._get_gc", return_value=mock_gc), \
         patch("sheets_service._add_charts_to_sheet") as mock_charts:
        from sheets_service import _create_sheet_sync
        _create_sheet_sync("tok", "Acme", "a@b.com")

    mock_charts.assert_called_once_with(mock_sh)


def test_add_charts_calls_batch_update():
    """_add_charts_to_sheet must call spreadsheets().batchUpdate with 3 addChart requests."""
    import sheets_service
    mock_sh = MagicMock()
    mock_sh.id = "sheet_id_123"
    mock_sh.client = MagicMock()
    mock_sh.client.auth = MagicMock()

    mock_service = MagicMock()
    mock_spreadsheets = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets
    mock_batchupdate = MagicMock()
    mock_spreadsheets.batchUpdate.return_value = mock_batchupdate
    mock_batchupdate.execute.return_value = {}

    with patch("sheets_service._get_sheets_service", return_value=mock_service):
        sheets_service._add_charts_to_sheet(mock_sh)

    call_args = mock_spreadsheets.batchUpdate.call_args
    requests = call_args[1]["body"]["requests"]
    assert len(requests) == 3


def test_sync_performance_tab_builds_correct_rows():
    """sync_performance_tab must write one row per social platform with correct columns."""
    import asyncio
    import sheets_service

    socials = [
        {"platform": "instagram", "followers": 1200, "likes": 80, "comments": 10,
         "impressions": 5000, "engagement_rate": 7.5, "refreshed_at": "2026-05-25T10:00:00+00:00"},
        {"platform": "linkedin",  "followers": 500,  "likes": 20, "comments": 5,
         "impressions": 1000, "engagement_rate": 5.0, "refreshed_at": "2026-05-25T10:00:00+00:00"},
    ]
    client = {"bundle": {"socials": socials}}

    captured = {}
    def fake_sync(refresh_token, sheet_id, tab_name, rows):
        captured["rows"] = rows
    with patch("sheets_service._sync_tab_sync", fake_sync):
        asyncio.run(sheets_service.sync_performance_tab("tok", "sid", client))

    assert len(captured["rows"]) == 2
    assert captured["rows"][0] == ["instagram", 1200, 80, 10, 5000, 7.5, "2026-05-25T10:00:00"]
    assert captured["rows"][1] == ["linkedin",  500,  20, 5,  1000, 5.0, "2026-05-25T10:00:00"]


def test_sync_performance_tab_empty_when_no_bundle():
    """sync_performance_tab must write zero rows when bundle.socials is absent."""
    import asyncio
    import sheets_service

    captured = {}
    def fake_sync(refresh_token, sheet_id, tab_name, rows):
        captured["rows"] = rows
    with patch("sheets_service._sync_tab_sync", fake_sync):
        asyncio.run(sheets_service.sync_performance_tab("tok", "sid", {}))
    assert captured["rows"] == []
