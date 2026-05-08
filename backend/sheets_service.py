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

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Tab order and headers — single source of truth
TAB_HEADERS = {
    "Client Info": ["Field", "Value"],
    "Posts": ["ID", "Platform", "Type", "Content", "Status", "Scheduled At", "Published At"],
    "Competitors": ["Handle", "Platform", "Engagement Score", "Followers", "Last Scraped"],
    "Trends": ["Keyword", "Popularity Score", "Type", "Source", "Fetched At"],
}

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

def _create_sheet_sync(refresh_token: str, client_name: str, share_email: str) -> dict:
    gc = _get_gc(refresh_token)
    sh = gc.create(f"Sleeping Creators — {client_name}")

    first = True
    for tab_name, headers in TAB_HEADERS.items():
        if first:
            ws = sh.sheet1
            ws.update_title(tab_name)
            first = False
        else:
            ws = sh.add_worksheet(title=tab_name, rows=500, cols=len(headers))
        ws.update("A1", [headers])
        ws.format("A1:Z1", {"textFormat": {"bold": True}})

    # Share with client as editor so they can update the Posts Status column
    sh.share(share_email, perm_type="user", role="writer", notify=True)

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
