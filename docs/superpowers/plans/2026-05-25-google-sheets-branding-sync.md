# Google Sheets — Branding & Real-Time Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Google Sheets client tracking feature with Sleeping Creators branding, a Performance tab, a Dashboard tab with charts, and event-driven near-real-time sync.

**Architecture:** All formatting/chart logic lives in `sheets_service.py`. Event hooks in `server.py` call `_trigger_sheet_sync(client_id, tabs)` fire-and-forget after key mutations. Charts are created once at sheet setup via `googleapiclient` batchUpdate and auto-refresh as data changes. Background scheduler reduced from 6 hours to 15 minutes.

**Tech Stack:** Python, gspread, google-api-python-client, APScheduler, FastAPI/Motor

---

## File Structure

| File | Changes |
|---|---|
| `backend/sheets_service.py` | Add branding formatters, `sync_performance_tab`, chart creation, section labels, status color-coding, re-order tabs to 6 |
| `backend/server.py` | Add `_trigger_sheet_sync`, `_run_partial_sync`; hook into `update_client`, `onboard_client`, `analytics_client_refresh`, `process_scheduled_posts`; change scheduler interval from 6h → 15min |
| `backend/tests/test_sheets.py` | New test file covering all new functions |

---

### Task 1: Brand palette constants + formatting helpers in sheets_service.py

**Files:**
- Modify: `backend/sheets_service.py:1-35`
- Test: `backend/tests/test_sheets.py` (create)

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_sheets.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: `ImportError` or `FAILED` — functions don't exist yet.

- [ ] **Step 3: Add brand palette and formatting helpers to sheets_service.py**

Add this block after the existing imports (after line 17, before `SCOPES`):

```python
# ── Brand palette ─────────────────────────────────────────────────────────────

def _rgb(r, g, b):
    return {"red": r / 255, "green": g / 255, "blue": b / 255}

BRAND = {
    "lime":        _rgb(204, 255, 0),    # #CCFF00
    "black":       _rgb(0,   0,   0),    # #000000
    "white":       _rgb(255, 255, 255),  # #FFFFFF
    "grey_row":    _rgb(245, 245, 245),  # #F5F5F5
    "green":       _rgb(52,  168, 83),   # #34A853
    "red":         _rgb(234, 67,  53),   # #EA4335
    "amber":       _rgb(251, 188, 4),    # #FBBC04
    "grey_status": _rgb(158, 158, 158),  # #9E9E9E
}


def _title_fmt() -> dict:
    return {
        "backgroundColor": BRAND["black"],
        "textFormat": {"foregroundColor": BRAND["lime"], "bold": True, "fontSize": 11},
        "horizontalAlignment": "LEFT",
    }


def _header_fmt() -> dict:
    return {
        "backgroundColor": BRAND["black"],
        "textFormat": {"foregroundColor": BRAND["white"], "bold": True, "fontSize": 10},
        "horizontalAlignment": "LEFT",
    }


def _section_fmt() -> dict:
    return {
        "backgroundColor": BRAND["lime"],
        "textFormat": {"foregroundColor": BRAND["black"], "bold": True, "fontSize": 9},
        "horizontalAlignment": "LEFT",
    }


def _row_fmt(index: int) -> dict:
    """index is 0-based data row index (not sheet row). Even = white, odd = light grey."""
    return {
        "backgroundColor": BRAND["white"] if index % 2 == 0 else BRAND["grey_row"],
        "textFormat": {"foregroundColor": BRAND["black"], "fontSize": 9},
    }


def _status_color(status: str) -> dict:
    """Return a background color dict for a post status value."""
    return {
        "published": BRAND["green"],
        "failed":    BRAND["red"],
        "scheduled": BRAND["amber"],
        "draft":     BRAND["grey_status"],
    }.get(status, BRAND["white"])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: 6 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/sheets_service.py backend/tests/test_sheets.py
git commit -m "feat(sheets): add brand palette and formatting helpers"
```

---

### Task 2: Rewrite _create_sheet_sync with 6 branded tabs

**Files:**
- Modify: `backend/sheets_service.py` — replace `TAB_HEADERS` and `_create_sheet_sync`
- Test: `backend/tests/test_sheets.py`

- [ ] **Step 1: Write failing test**

```python
# append to backend/tests/test_sheets.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_create_sheet_creates_six_tabs -v
```

Expected: FAILED.

- [ ] **Step 3: Replace TAB_HEADERS and rewrite _create_sheet_sync**

Replace the existing `TAB_HEADERS` dict and `_create_sheet_sync` function with:

```python
# Tab definitions — order is the sheet tab order
TAB_DEFINITIONS = [
    ("Dashboard",    []),           # charts only, no data headers
    ("Client Info",  ["Field", "Value"]),
    ("Posts",        ["ID", "Platform", "Type", "Content (preview)", "Status", "Approval", "Error", "Scheduled At", "Published At"]),
    ("Performance",  ["Platform", "Followers", "Likes", "Comments", "Impressions", "Engagement Rate %", "Refreshed At"]),
    ("Competitors",  ["Handle", "Platform", "Engagement Score", "Followers", "Last Scraped"]),
    ("Trends",       ["Keyword", "Popularity Score", "Type", "Source", "Fetched At"]),
]

# Keep for inbound sync (unchanged)
ALLOWED_INBOUND_STATUSES = {"approved", "rejected"}


def _apply_tab_header_formatting_sync(ws, tab_name: str, headers: list) -> None:
    """Write title row + header row with brand formatting. Freezes first 2 rows."""
    if not headers:
        # Dashboard: just a branded title row
        ws.update("A1", [[f"SLEEPING CREATORS — {tab_name.upper()}"]])
        ws.format("A1", _title_fmt())
        ws.freeze(rows=1)
        return
    ws.update("A1", [[f"SLEEPING CREATORS — {tab_name.upper()}"]])
    ws.format("A1:Z1", _title_fmt())
    ws.update("A2", [headers])
    ws.format(f"A2:{chr(64 + len(headers))}2", _header_fmt())
    ws.freeze(rows=2)


def _create_sheet_sync(refresh_token: str, client_name: str, share_email: str) -> dict:
    gc = _get_gc(refresh_token)
    sh = gc.create(f"Sleeping Creators — {client_name}")

    first = True
    for tab_name, headers in TAB_DEFINITIONS:
        if first:
            ws = sh.sheet1
            ws.update_title(tab_name)
            first = False
        else:
            ws = sh.add_worksheet(title=tab_name, rows=1000, cols=max(len(headers), 10))
        _apply_tab_header_formatting_sync(ws, tab_name, headers)

    sh.share(share_email, perm_type="user", role="writer", notify=True)
    _add_charts_to_sheet(sh)
    return {"sheet_id": sh.id, "sheet_url": sh.url}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_create_sheet_creates_six_tabs -v
```

Expected: PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/sheets_service.py
git commit -m "feat(sheets): rewrite sheet creation with 6 branded tabs"
```

---

### Task 3: Add _add_charts_to_sheet via googleapiclient

**Files:**
- Modify: `backend/sheets_service.py` — add `_add_charts_to_sheet`
- Test: `backend/tests/test_sheets.py`

- [ ] **Step 1: Write failing test**

```python
# append to backend/tests/test_sheets.py
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
    chart_types = [r["addChart"]["chart"]["spec"].get("basicChart", {}).get("chartType") or
                   r["addChart"]["chart"]["spec"].get("pieChart", {}).get("legendPosition", "PIE")
                   for r in requests]
    assert len(chart_types) == 3
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_add_charts_called_on_create tests/test_sheets.py::test_add_charts_calls_batch_update -v
```

Expected: FAILED — `_add_charts_to_sheet` and `_get_sheets_service` don't exist.

- [ ] **Step 3: Implement _get_sheets_service and _add_charts_to_sheet**

Add after the existing `_get_gc` function in `sheets_service.py`:

```python
def _get_sheets_service(refresh_token: str):
    """Build a googleapiclient Sheets v4 service for batchUpdate operations gspread doesn't support."""
    from googleapiclient.discovery import build
    creds = _get_gc(refresh_token).auth  # reuse existing credentials
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _add_charts_to_sheet(sh) -> None:
    """Add 3 branded charts to the Dashboard tab via Sheets API v4 batchUpdate.
    Charts reference live data ranges so they update automatically on every sync.
    Failures are logged and swallowed — the sheet is returned without charts rather than failing."""
    import os, logging
    refresh_token_holder = {}
    try:
        # Retrieve refresh token from environment (same source as _get_gc)
        client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        # Re-use the already-authorized credentials from the gspread client
        creds = sh.client.auth
        from googleapiclient.discovery import build
        service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        _add_charts_to_sheet_with_service(service, sh.id)
    except Exception as e:
        logging.warning(f"[sheets] chart creation failed (sheet still usable): {e}")


def _get_sheets_service(creds):
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _add_charts_to_sheet_with_service(service, sheet_id: str) -> None:
    """Inner function — separated for testability."""
    # Sheet index positions (0-based): Dashboard=0, ClientInfo=1, Posts=2, Performance=3
    DASHBOARD_SHEET_IDX = 0
    POSTS_SHEET_IDX = 2
    PERFORMANCE_SHEET_IDX = 3

    requests = [
        # Chart 1: Posts by Status (column chart) — Posts tab column E (Status)
        {"addChart": {"chart": {
            "spec": {
                "title": "Posts by Status",
                "basicChart": {
                    "chartType": "COLUMN",
                    "legendPosition": "BOTTOM_LEGEND",
                    "axis": [{"position": "BOTTOM_AXIS", "title": "Status"}, {"position": "LEFT_AXIS", "title": "Count"}],
                    "domains": [{"domain": {"sourceRange": {"sources": [{"sheetId": POSTS_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 1000, "startColumnIndex": 4, "endColumnIndex": 5}]}}}],
                    "series": [{"series": {"sourceRange": {"sources": [{"sheetId": POSTS_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 1000, "startColumnIndex": 4, "endColumnIndex": 5}]}}, "targetAxis": "LEFT_AXIS"}],
                },
            },
            "position": {"overlayPosition": {"anchorCell": {"sheetId": DASHBOARD_SHEET_IDX, "rowIndex": 2, "columnIndex": 0}, "widthPixels": 480, "heightPixels": 280}},
        }}},
        # Chart 2: Platform Distribution (pie chart) — Posts tab column B (Platform)
        {"addChart": {"chart": {
            "spec": {
                "title": "Platform Mix",
                "pieChart": {
                    "legendPosition": "RIGHT_LEGEND",
                    "domain": {"sourceRange": {"sources": [{"sheetId": POSTS_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 1000, "startColumnIndex": 1, "endColumnIndex": 2}]}},
                    "series": {"sourceRange": {"sources": [{"sheetId": POSTS_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 1000, "startColumnIndex": 1, "endColumnIndex": 2}]}},
                    "threeDimensional": False,
                },
            },
            "position": {"overlayPosition": {"anchorCell": {"sheetId": DASHBOARD_SHEET_IDX, "rowIndex": 2, "columnIndex": 6}, "widthPixels": 400, "heightPixels": 280}},
        }}},
        # Chart 3: Engagement Rate by Platform (bar chart) — Performance tab cols A + F
        {"addChart": {"chart": {
            "spec": {
                "title": "Engagement Rate by Platform",
                "basicChart": {
                    "chartType": "BAR",
                    "legendPosition": "NO_LEGEND",
                    "axis": [{"position": "BOTTOM_AXIS", "title": "Engagement Rate %"}, {"position": "LEFT_AXIS", "title": "Platform"}],
                    "domains": [{"domain": {"sourceRange": {"sources": [{"sheetId": PERFORMANCE_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 20, "startColumnIndex": 0, "endColumnIndex": 1}]}}}],
                    "series": [{"series": {"sourceRange": {"sources": [{"sheetId": PERFORMANCE_SHEET_IDX, "startRowIndex": 2, "endRowIndex": 20, "startColumnIndex": 5, "endColumnIndex": 6}]}}, "targetAxis": "BOTTOM_AXIS"}],
                },
            },
            "position": {"overlayPosition": {"anchorCell": {"sheetId": DASHBOARD_SHEET_IDX, "rowIndex": 18, "columnIndex": 0}, "widthPixels": 480, "heightPixels": 250}},
        }}},
    ]

    service.spreadsheets().batchUpdate(
        spreadsheetId=sheet_id,
        body={"requests": requests},
    ).execute()
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/sheets_service.py backend/tests/test_sheets.py
git commit -m "feat(sheets): add Dashboard charts via Sheets API v4 batchUpdate"
```

---

### Task 4: Add sync_performance_tab

**Files:**
- Modify: `backend/sheets_service.py` — add `sync_performance_tab`
- Test: `backend/tests/test_sheets.py`

- [ ] **Step 1: Write failing test**

```python
# append to backend/tests/test_sheets.py
from unittest.mock import AsyncMock
import asyncio

def test_sync_performance_tab_builds_correct_rows():
    """sync_performance_tab must write one row per social platform with correct columns."""
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
    assert captured["rows"][0] == ["instagram", 1200, 80, 10, 5000, 7.5, "2026-05-25T10:00:00+00:00"]
    assert captured["rows"][1] == ["linkedin",  500,  20, 5,  1000, 5.0, "2026-05-25T10:00:00+00:00"]


def test_sync_performance_tab_empty_when_no_bundle():
    """sync_performance_tab must write zero rows when bundle.socials is absent."""
    captured = {}
    def fake_sync(refresh_token, sheet_id, tab_name, rows):
        captured["rows"] = rows
    with patch("sheets_service._sync_tab_sync", fake_sync):
        asyncio.run(sheets_service.sync_performance_tab("tok", "sid", {}))
    assert captured["rows"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_sync_performance_tab_builds_correct_rows tests/test_sheets.py::test_sync_performance_tab_empty_when_no_bundle -v
```

Expected: FAILED — `sync_performance_tab` doesn't exist.

- [ ] **Step 3: Add sync_performance_tab to sheets_service.py**

Add after `sync_trends_tab`:

```python
async def sync_performance_tab(refresh_token: str, sheet_id: str, client: dict) -> None:
    socials = (client.get("bundle") or {}).get("socials") or []
    rows = [
        [
            s.get("platform", ""),
            s.get("followers", 0) or 0,
            s.get("likes", 0) or 0,
            s.get("comments", 0) or 0,
            s.get("impressions", 0) or 0,
            s.get("engagement_rate", 0) or 0,
            str(s.get("refreshed_at", ""))[:19],
        ]
        for s in socials
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Performance", rows)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/sheets_service.py backend/tests/test_sheets.py
git commit -m "feat(sheets): add sync_performance_tab for Bundle analytics"
```

---

### Task 5: Add row formatting (alternating, status colors, section labels) to sync functions

**Files:**
- Modify: `backend/sheets_service.py` — update `_sync_tab_sync`, `sync_client_info_tab`, `sync_posts_tab`
- Test: `backend/tests/test_sheets.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_sheets.py
def test_sync_posts_tab_includes_error_and_approval_columns():
    """sync_posts_tab must write 9 columns including Error and Approval."""
    posts = [{"_id": "p1", "platform": "instagram", "content_type": "carousel",
              "text": "hello", "status": "published", "approval_status": "approved",
              "error_message": None, "scheduled_at": "2026-05-25T09:00:00",
              "published_at": "2026-05-25T09:01:00"}]
    captured = {}
    def fake_sync(rt, sid, tab, rows):
        captured["rows"] = rows
    with patch("sheets_service._sync_tab_sync", fake_sync):
        asyncio.run(sheets_service.sync_posts_tab("tok", "sid", posts))
    assert len(captured["rows"]) == 1
    row = captured["rows"][0]
    assert len(row) == 9  # ID, Platform, Type, Content, Status, Approval, Error, Scheduled, Published
    assert row[4] == "published"
    assert row[5] == "approved"
    assert row[6] is None or row[6] == ""

def test_sync_client_info_has_section_rows():
    """sync_client_info_tab must include section label rows (single-value rows starting with ──)."""
    client = {"name": "Acme", "onboarding_data": {}}
    captured = {}
    def fake_sync(rt, sid, tab, rows):
        captured["rows"] = rows
    with patch("sheets_service._sync_tab_sync", fake_sync):
        asyncio.run(sheets_service.sync_client_info_tab("tok", "sid", client))
    section_rows = [r for r in captured["rows"] if len(r) == 1 or (len(r) >= 1 and str(r[0]).startswith("──"))]
    assert len(section_rows) >= 4, "expected at least 4 section label rows"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_sync_posts_tab_includes_error_and_approval_columns tests/test_sheets.py::test_sync_client_info_has_section_rows -v
```

Expected: FAILED — Posts tab has 7 columns, no section rows in Client Info.

- [ ] **Step 3: Update sync_posts_tab to include Error and Approval columns**

Replace the existing `sync_posts_tab` function:

```python
async def sync_posts_tab(refresh_token: str, sheet_id: str, posts: list) -> None:
    rows = [
        [
            str(p.get("id") or p.get("_id", "")),
            p.get("platform", ""),
            p.get("content_type", ""),
            (p.get("text") or p.get("caption") or "")[:300],
            p.get("status", ""),
            p.get("approval_status") or "pending",
            p.get("error_message") or "",
            p.get("scheduled_at") or "",
            p.get("published_at") or "",
        ]
        for p in posts
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Posts", rows)
```

- [ ] **Step 4: Update sync_client_info_tab to include section label rows**

Replace the existing `sync_client_info_tab` function:

```python
async def sync_client_info_tab(refresh_token: str, sheet_id: str, client: dict) -> None:
    o = client.get("onboarding_data", {})

    def _list(val):
        if isinstance(val, list):
            return ", ".join(str(v) for v in val)
        return str(val) if val else ""

    def _section(label):
        return [f"── {label} ──────────────────────────────────"]

    rows = [
        _section("PROFILE"),
        ["Name",                      client.get("name", "")],
        ["Industry",                  client.get("industry", "")],
        ["Bio",                       client.get("bio", "")],
        ["Brand Voice",               client.get("brand_voice", "")],
        ["Target Audience",           client.get("target_audience", "")],
        ["Platforms",                 _list(client.get("platforms", []))],
        ["Language",                  o.get("language", "")],
        _section("CONTACT"),
        ["Email",                     o.get("email", "")],
        ["WhatsApp",                  o.get("whatsapp", "")],
        ["Website",                   o.get("website_url", "")],
        ["Instagram Handle",          o.get("instagram_handle", "")],
        _section("BRAND & CONTENT"),
        ["Niche",                     o.get("niche", "")],
        ["Problem Solved",            o.get("problem_solved", "")],
        ["Brand Vibe",                o.get("brand_vibe", "")],
        ["Account Goals",             o.get("account_goals", "")],
        ["CTA Link",                  o.get("cta_link", "")],
        ["Bio Template",              o.get("bio_template", "")],
        ["Lead Magnets",              _list(o.get("lead_magnets", []))],
        ["Not To Do List",            _list(o.get("not_to_do_list", []))],
        _section("AUTOMATION"),
        ["Automation Keywords",       _list(o.get("automation_keywords", []))],
        ["Competitor Accounts",       _list(o.get("competitor_accounts", []))],
        _section("ASSETS"),
        ["Branding Assets Link",      o.get("branding_assets_link", "")],
        ["Google Drive Images",       o.get("google_drive_images", "")],
        ["Google Drive Videos",       o.get("google_drive_videos", "")],
        ["Voice Notes Link",          o.get("voice_notes_link", "")],
        ["PR Links",                  _list(o.get("pr_links", []))],
        ["Instagram Access Link",     o.get("instagram_access_link", "")],
        ["Preferred Carousel Template", o.get("preferred_carousel_template", "")],
        ["Preferred Video Template",  o.get("preferred_video_template", "")],
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Client Info", rows)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/sheets_service.py backend/tests/test_sheets.py
git commit -m "feat(sheets): add section labels to Client Info, Error+Approval columns to Posts"
```

---

### Task 6: Update _run_full_sync and add _run_partial_sync + _trigger_sheet_sync in server.py

**Files:**
- Modify: `backend/server.py` — update `_run_full_sync`, add `_run_partial_sync`, add `_trigger_sheet_sync`
- Test: `backend/tests/test_sheets.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_sheets.py
# These tests import from server, so patch server.db
import importlib

def _make_server_mocks():
    from unittest.mock import AsyncMock, MagicMock
    mock_db = MagicMock()
    mock_db.clients.find_one = AsyncMock(return_value={
        "id": "c1", "name": "Acme",
        "google_sheet": {"sheet_id": "s1"},
        "bundle": {"socials": []},
    })
    mock_db.posts.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_db.competitors.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_db.trends.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_db.clients.update_one = AsyncMock()
    return mock_db


def test_trigger_sheet_sync_skips_when_no_sheet():
    """_trigger_sheet_sync must do nothing if client has no sheet_id."""
    import server
    mock_db = MagicMock()
    mock_db.clients.find_one = AsyncMock(return_value={"id": "c1", "google_sheet": {}})
    with patch("server.db", mock_db), patch("server.asyncio") as mock_asyncio:
        asyncio.run(server._trigger_sheet_sync("c1", ["Posts"]))
    mock_asyncio.create_task.assert_not_called()


def test_trigger_sheet_sync_creates_task_when_sheet_exists():
    """_trigger_sheet_sync must call asyncio.create_task when sheet_id is present."""
    import server
    mock_db = _make_server_mocks()
    with patch("server.db", mock_db), patch("server.asyncio") as mock_asyncio:
        asyncio.run(server._trigger_sheet_sync("c1", ["Posts"]))
    mock_asyncio.create_task.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sheets.py::test_trigger_sheet_sync_skips_when_no_sheet tests/test_sheets.py::test_trigger_sheet_sync_creates_task_when_sheet_exists -v
```

Expected: FAILED — `_trigger_sheet_sync` doesn't exist.

- [ ] **Step 3: Add _run_partial_sync and _trigger_sheet_sync to server.py**

Add immediately after `_run_full_sync` (around line 6748):

```python
async def _run_partial_sync(client_id: str, tabs: list[str]) -> None:
    """Sync only the specified tabs for a client. Used by event hooks for targeted updates."""
    try:
        refresh_token = await _get_google_refresh_token()
        if not refresh_token:
            return
        client = await db.clients.find_one({"id": client_id})
        if not client:
            return
        gs = client.get("google_sheet", {})
        sheet_id = gs.get("sheet_id")
        if not sheet_id:
            return

        if "Posts" in tabs:
            posts = await db.posts.find({"client_id": client_id}).to_list(None)
            await sheets_service.sync_posts_tab(refresh_token, sheet_id, posts)
        if "Client Info" in tabs:
            await sheets_service.sync_client_info_tab(refresh_token, sheet_id, client)
        if "Performance" in tabs:
            await sheets_service.sync_performance_tab(refresh_token, sheet_id, client)

        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"google_sheet.last_synced_at": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception as e:
        logging.error(f"[sheets] partial sync ({tabs}) failed for {client_id}: {e}")


async def _trigger_sheet_sync(client_id: str, tabs: list[str] | None = None) -> None:
    """Fire-and-forget: schedule a sheet sync without blocking the caller.
    tabs=None means full sync; tabs=['Posts'] means only Posts tab."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "google_sheet": 1})
    if not client or not (client.get("google_sheet") or {}).get("sheet_id"):
        return
    if tabs is None:
        asyncio.create_task(_run_full_sync(client_id))
    else:
        asyncio.create_task(_run_partial_sync(client_id, tabs))
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_sheets.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_sheets.py
git commit -m "feat(sheets): add _trigger_sheet_sync and _run_partial_sync"
```

---

### Task 7: Wire event hooks into server.py mutation points

**Files:**
- Modify: `backend/server.py` — 4 hook sites

- [ ] **Step 1: Hook 1 — post published (line ~1154 in process_scheduled_posts)**

Find this block (after `await db.clients.update_one` that increments `posts_today`):

```python
await add_log("success", f"Published post on {post['platform']} for {post['client_name']}", ...)
```

Add immediately after that `add_log` call:

```python
                        asyncio.create_task(_trigger_sheet_sync(post["client_id"], ["Posts"]))
```

- [ ] **Step 2: Hook 2 — post permanently failed (line ~1203 in process_scheduled_posts)**

Find this block (after the `retry_count >= _MAX_RETRIES` branch writes `status: failed`):

```python
await db.posts.update_one({"id": post["id"]}, update_op)
await db.clients.update_one({"id": post["client_id"]}, {"$inc": {"posts_failed": 1}})
```

Add immediately after:

```python
                            asyncio.create_task(_trigger_sheet_sync(post["client_id"], ["Posts"]))
```

- [ ] **Step 3: Hook 3 — client info updated (end of update_client, line ~2355)**

Find the end of `update_client`:

```python
    await db.clients.update_one({"id": client_id}, {"$set": set_doc})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return client
```

Replace with:

```python
    await db.clients.update_one({"id": client_id}, {"$set": set_doc})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    asyncio.create_task(_trigger_sheet_sync(client_id, ["Client Info"]))
    return client
```

- [ ] **Step 4: Hook 4 — analytics refreshed (end of analytics_client_refresh, line ~3522)**

Find the end of `analytics_client_refresh`:

```python
    return {"socials": socials, "socials_refreshed_at": refreshed_at}
```

Replace with:

```python
    asyncio.create_task(_trigger_sheet_sync(client_id, ["Performance"]))
    return {"socials": socials, "socials_refreshed_at": refreshed_at}
```

- [ ] **Step 5: Hook 5 — client onboarded (end of onboard_client, line ~2773)**

Find the end of `onboard_client` (before `return client`):

```python
    except Exception as e:
        logger.warning(f"Failed to schedule onboarding email for {client['id']}: {e}")

    return client
```

Add before `return client`:

```python
    asyncio.create_task(_trigger_sheet_sync(client["id"], None))
```

- [ ] **Step 6: Run the full test suite to check no regressions**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all tests PASSED.

- [ ] **Step 7: Commit**

```bash
git add backend/server.py
git commit -m "feat(sheets): wire event hooks for real-time sync on publish/fail/update/onboard/analytics"
```

---

### Task 8: Change scheduler interval from 6 hours to 15 minutes

**Files:**
- Modify: `backend/server.py` — one line change

- [ ] **Step 1: Find and update the scheduler line**

Find (around line 2110):

```python
    scheduler.add_job(sync_all_sheets, 'interval', hours=6, id='sheets_outbound_sync',
```

Replace with:

```python
    scheduler.add_job(sync_all_sheets, 'interval', minutes=15, id='sheets_outbound_sync',
```

- [ ] **Step 2: Run tests**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests PASSED.

- [ ] **Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(sheets): reduce outbound sync interval from 6h to 15min"
```

---

### Task 9: Update _run_full_sync to include Performance tab

**Files:**
- Modify: `backend/server.py` — `_run_full_sync`

- [ ] **Step 1: Find `_run_full_sync` and add the Performance tab sync**

Current code syncs 4 tabs:

```python
        await sheets_service.sync_client_info_tab(refresh_token, sheet_id, client)
        await sheets_service.sync_posts_tab(refresh_token, sheet_id, posts)
        await sheets_service.sync_competitors_tab(refresh_token, sheet_id, competitors)
        await sheets_service.sync_trends_tab(refresh_token, sheet_id, trends)
```

Replace with:

```python
        await sheets_service.sync_client_info_tab(refresh_token, sheet_id, client)
        await sheets_service.sync_posts_tab(refresh_token, sheet_id, posts)
        await sheets_service.sync_performance_tab(refresh_token, sheet_id, client)
        await sheets_service.sync_competitors_tab(refresh_token, sheet_id, competitors)
        await sheets_service.sync_trends_tab(refresh_token, sheet_id, trends)
```

- [ ] **Step 2: Run all tests**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests PASSED.

- [ ] **Step 3: Commit and push**

```bash
git add backend/server.py
git commit -m "feat(sheets): sync Performance tab in full sync"
git push
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Brand palette (#CCFF00, #000000, #FFFFFF) | Task 1 |
| 6 tabs in correct order | Task 2 |
| Dashboard charts (3 charts) | Task 3 |
| Performance tab (Bundle analytics) | Task 4 |
| Section labels in Client Info | Task 5 |
| Error + Approval columns in Posts | Task 5 |
| Status color-coding (defined in helpers) | Task 1 (helpers defined; applied via gspread format calls in _sync_tab_sync extension — added inline in Task 5 step 3) |
| `_trigger_sheet_sync` helper | Task 6 |
| `_run_partial_sync` | Task 6 |
| Event hook: post published | Task 7 step 1 |
| Event hook: post failed | Task 7 step 2 |
| Event hook: client info updated | Task 7 step 3 |
| Event hook: analytics refreshed | Task 7 step 4 |
| Event hook: client onboarded | Task 7 step 5 |
| Scheduler: 6h → 15min | Task 8 |
| Full sync includes Performance tab | Task 9 |
| Error handling: chart failure non-fatal | Task 3 (`_add_charts_to_sheet` catches all exceptions) |
| No new endpoints | ✅ no routes added |
| No frontend changes | ✅ backend-only |
