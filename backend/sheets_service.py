"""
sheets_service.py — Google Sheets integration for Sleeping Creators.

Architecture:
- Uses our own Google account authorized via OAuth2 (Web application credentials).
- Refresh token is stored in MongoDB (db.settings) after a one-time admin auth flow.
- Each client gets one Sheet created under our account and shared with their email.
- All gspread calls are blocking internally but wrapped in asyncio.to_thread()
  so they never block the FastAPI event loop.
"""

import os
import asyncio

import gspread
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

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
    return {
        "backgroundColor": BRAND["white"] if index % 2 == 0 else BRAND["grey_row"],
        "textFormat": {"foregroundColor": BRAND["black"], "fontSize": 9},
    }


def _status_color(status: str) -> dict:
    return {
        "published": BRAND["green"],
        "failed":    BRAND["red"],
        "scheduled": BRAND["amber"],
        "draft":     BRAND["grey_status"],
    }.get(status, BRAND["white"])


SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

TAB_DEFINITIONS = [
    ("Dashboard",    []),
    ("Client Info",  ["Field", "Value"]),
    ("Posts",        ["ID", "Platform", "Type", "Content (preview)", "Status", "Approval", "Error", "Scheduled At", "Published At"]),
    ("Performance",  ["Platform", "Followers", "Likes", "Comments", "Impressions", "Engagement Rate %", "Refreshed At"]),
    ("Competitors",  ["Handle", "Platform", "Engagement Score", "Followers", "Last Scraped"]),
    ("Trends",       ["Keyword", "Popularity Score", "Type", "Source", "Fetched At"]),
]

# Only these status values are accepted from inbound sheet edits
ALLOWED_INBOUND_STATUSES = {"approved", "rejected"}


# ── Auth ──────────────────────────────────────────────────────────────────────

def _get_gc(refresh_token: str) -> gspread.Client:
    """Build an authorized gspread client from the stored OAuth2 refresh token."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()

    if not all([client_id, client_secret, refresh_token]):
        raise RuntimeError(
            "Google Sheets not connected. "
            "Visit /api/auth/google/start to authorize the app."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return gspread.authorize(creds)


# ── Blocking helpers (run via asyncio.to_thread) ──────────────────────────────

def _apply_tab_header_formatting_sync(ws, tab_name: str, headers: list) -> None:
    """Write title row + header row with brand formatting. Freezes first 2 rows."""
    if not headers:
        ws.update("A1", [[f"SLEEPING CREATORS — {tab_name.upper()}"]])
        ws.format("A1", _title_fmt())
        ws.freeze(rows=1)
        return
    ws.update("A1", [[f"SLEEPING CREATORS — {tab_name.upper()}"]])
    ws.format("A1:Z1", _title_fmt())
    ws.update("A2", [headers])
    ws.format(f"A2:{chr(64 + len(headers))}2", _header_fmt())
    ws.freeze(rows=2)


def _get_sheets_service(creds):
    """Build a googleapiclient Sheets v4 service for batchUpdate operations gspread doesn't support."""
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _add_charts_to_sheet(sh) -> None:
    """Add 3 branded charts to the Dashboard tab via Sheets API v4 batchUpdate.
    Failures are logged and swallowed — sheet is returned without charts rather than failing."""
    import logging
    try:
        creds = sh.client.auth
        service = _get_sheets_service(creds)
        _add_charts_to_sheet_with_service(service, sh.id)
    except Exception as e:
        logging.warning(f"[sheets] chart creation failed (sheet still usable): {e}")


def _add_charts_to_sheet_with_service(service, sheet_id: str) -> None:
    """Inner function separated for testability. Creates 3 charts on Dashboard tab."""
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


def _sync_tab_sync(refresh_token: str, sheet_id: str, tab_name: str, rows: list) -> None:
    gc = _get_gc(refresh_token)
    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet(tab_name)
    ws.batch_clear(["A2:Z1000"])
    if rows:
        ws.update("A2", rows)


def _read_posts_statuses_sync(refresh_token: str, sheet_id: str) -> list:
    gc = _get_gc(refresh_token)
    sh = gc.open_by_key(sheet_id)
    ws = sh.worksheet("Posts")
    records = ws.get_all_records()
    return [
        {"id": str(r.get("ID", "")).strip(), "status": str(r.get("Status", "")).strip().lower()}
        for r in records
        if r.get("ID")
    ]


# ── Public async API ──────────────────────────────────────────────────────────

async def create_sheet(refresh_token: str, client_name: str, share_email: str) -> dict:
    """Create a new Sheet and share it. Returns {sheet_id, sheet_url}."""
    return await asyncio.to_thread(_create_sheet_sync, refresh_token, client_name, share_email)


async def sync_client_info_tab(refresh_token: str, sheet_id: str, client: dict) -> None:
    o = client.get("onboarding_data", {})

    def _list(val):
        if isinstance(val, list):
            return ", ".join(str(v) for v in val)
        return str(val) if val else ""

    rows = [
        # ── Core ──────────────────────────────────────────
        ["Name",                      client.get("name", "")],
        ["Industry",                  client.get("industry", "")],
        ["Bio",                       client.get("bio", "")],
        ["Brand Voice",               client.get("brand_voice", "")],
        ["Target Audience",           client.get("target_audience", "")],
        ["Platforms",                 _list(client.get("platforms", []))],
        ["Language",                  o.get("language", "")],
        # ── Contact ───────────────────────────────────────
        ["Username",                  o.get("username", "")],
        ["Email",                     o.get("email", "")],
        ["WhatsApp",                  o.get("whatsapp", "")],
        ["Website",                   o.get("website_url", "")],
        ["Instagram Handle",          o.get("instagram_handle", "")],
        # ── Brand & Content ───────────────────────────────
        ["Niche",                     o.get("niche", "")],
        ["Problem Solved",            o.get("problem_solved", "")],
        ["Brand Vibe",                o.get("brand_vibe", "")],
        ["Account Goals",             o.get("account_goals", "")],
        ["CTA Link",                  o.get("cta_link", "")],
        ["Bio Template",              o.get("bio_template", "")],
        ["Lead Magnets",              _list(o.get("lead_magnets", []))],
        ["Not To Do List",            _list(o.get("not_to_do_list", []))],
        # ── Automation ────────────────────────────────────
        ["Automation Keywords",       _list(o.get("automation_keywords", []))],
        ["Competitor Accounts",       _list(o.get("competitor_accounts", []))],
        # ── Assets & Links ────────────────────────────────
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


async def sync_posts_tab(refresh_token: str, sheet_id: str, posts: list) -> None:
    rows = [
        [
            str(p["_id"]),
            p.get("platform", ""),
            p.get("content_type", ""),
            p.get("text", "")[:500],
            p.get("status", ""),
            p.get("scheduled_at") or "",
            p.get("published_at") or "",
        ]
        for p in posts
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Posts", rows)


async def sync_competitors_tab(refresh_token: str, sheet_id: str, competitors: list) -> None:
    rows = [
        [
            c.get("handle", ""),
            c.get("platform", ""),
            round(float(c.get("engagement_score", 0) or 0), 2),
            c.get("followers", ""),
            str(c.get("last_scraped_at", ""))[:19],
        ]
        for c in competitors
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Competitors", rows)


async def sync_trends_tab(refresh_token: str, sheet_id: str, trends: list) -> None:
    rows = [
        [
            t.get("keyword", ""),
            t.get("popularity_score", ""),
            t.get("trend_type", ""),
            t.get("source", ""),
            str(t.get("created_at", ""))[:19],
        ]
        for t in trends
    ]
    await asyncio.to_thread(_sync_tab_sync, refresh_token, sheet_id, "Trends", rows)


async def read_post_statuses(refresh_token: str, sheet_id: str) -> list:
    """Read ID + Status columns from the Posts tab for inbound sync."""
    return await asyncio.to_thread(_read_posts_statuses_sync, refresh_token, sheet_id)
