# Google Sheets — Branding & Real-Time Sync Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Google Sheets client tracking feature with Sleeping Creators branding, a Dashboard tab with auto-updating charts, a Performance tab from Bundle analytics, and event-driven near-real-time sync.

**Architecture:** Event hooks at key write points fire a background sheet sync task immediately; a 15-minute background sweep catches anything missed. Charts are created once at sheet setup via the Sheets API v4 `batchUpdate` and auto-update as data changes.

**Tech Stack:** Python, gspread, google-api-python-client (`googleapiclient.discovery`), APScheduler (already running), FastAPI background tasks (`asyncio.create_task`)

---

## Brand Palette

| Token | Hex | Usage |
|---|---|---|
| Lime | `#CCFF00` | Tab title row text, section label bg |
| Black | `#000000` | Tab title row bg, header row bg, section label text |
| White | `#FFFFFF` | Header row text, data row bg (odd) |
| Light grey | `#F5F5F5` | Data row bg (even / alternating) |
| Green | `#34A853` | Status: published |
| Red | `#EA4335` | Status: failed |
| Amber | `#FBBC04` | Status: scheduled |
| Grey | `#9E9E9E` | Status: draft |

---

## Sheet Structure — 6 Tabs

Tab order and purpose:

| # | Tab Name | Purpose |
|---|---|---|
| 1 | Dashboard | Charts + key stat formula cells. No raw data entered here. |
| 2 | Client Info | Onboarding profile fields |
| 3 | Posts | All posts with status, error, approval |
| 4 | Performance | Bundle analytics per platform |
| 5 | Competitors | Competitor handle data |
| 6 | Trends | Keyword trend data |

### Tab 1 — Dashboard

No raw data rows. Contains:

**Stat cells (A1:B6 area, formula-driven):**
- Total Posts Published (`=COUNTIF(Posts!E:E,"published")`)
- Total Scheduled (`=COUNTIF(Posts!E:E,"scheduled")`)
- Total Failed (`=COUNTIF(Posts!E:E,"failed")`)
- Success Rate (`=B1/(B1+B3)*100` formatted as %)
- Top Platform (most frequent value in Posts!B:B)
- Last Synced (static text cell, written by backend on each sync)

**3 embedded charts (created via Sheets API v4 batchUpdate):**

1. **Posts by Day** — `COLUMN_CHART`, data from Posts tab column F (Scheduled At), last 30 days. X axis: date, Y axis: count. Title: "Posts Published — Last 30 Days".
2. **Platform Distribution** — `PIE_CHART`, data from Posts tab column B (Platform). Title: "Platform Mix".
3. **Engagement by Platform** — `BAR_CHART`, data from Performance tab columns A (Platform) and F (Engagement Rate %). Title: "Engagement Rate by Platform".

Charts are created once at sheet creation. They reference live data ranges so they update automatically when tabs are rewritten.

### Tab 2 — Client Info

Two columns: `Field` | `Value`. Section label rows (lime bg, black text) group fields:

```
── PROFILE ──────────────────
Name
Industry
Brand Voice
Target Audience
Platforms
Language
── CONTACT ──────────────────
Email
WhatsApp
Website
Instagram Handle
── BRAND & CONTENT ──────────
Niche
Problem Solved
Brand Vibe
Account Goals
CTA Link
Bio Template
Lead Magnets
Not To Do List
── AUTOMATION ───────────────
Automation Keywords
Competitor Accounts
── ASSETS ───────────────────
Branding Assets Link
Google Drive Images
Google Drive Videos
Voice Notes Link
PR Links
Instagram Access Link
Preferred Carousel Template
Preferred Video Template
```

### Tab 3 — Posts

Columns: `ID` | `Platform` | `Type` | `Content (preview)` | `Status` | `Approval` | `Error` | `Scheduled At` | `Published At`

- `Status` column cells background color-coded per brand palette above
- `Content (preview)` truncated to 300 chars
- `Approval` values: `pending` / `approved` / `rejected` — inbound sync reads this column (existing behaviour, unchanged)
- `Error` column: populated from `error_message` field on failed posts

### Tab 4 — Performance *(new)*

Columns: `Platform` | `Followers` | `Likes` | `Comments` | `Impressions` | `Engagement Rate %` | `Refreshed At`

Data source: `client.bundle.socials` array. One row per platform. Synced when `analytics_client_refresh` completes.

### Tab 5 — Competitors

Columns: `Handle` | `Platform` | `Engagement Score` | `Followers` | `Last Scraped` — unchanged from current.

### Tab 6 — Trends

Columns: `Keyword` | `Popularity Score` | `Type` | `Source` | `Fetched At` — unchanged from current.

---

## Formatting Implementation

All formatting applied via `gspread` batch `format` calls in `sheets_service.py`. Applied once at creation and re-applied on each full sync (idempotent).

**Per-tab setup sequence:**
1. Write title row (row 1): black bg, `#CCFF00` text, bold, "SLEEPING CREATORS — {TAB_NAME}"
2. Write header row (row 2): black bg, white text, bold, column names
3. Freeze rows 1–2
4. Write data starting row 3
5. Alternate row backgrounds (white / `#F5F5F5`)
6. Apply status color-coding to Status column (Posts tab only)
7. Auto-resize all columns

**Section label rows (Client Info tab):** lime bg `#CCFF00`, black text, bold, merged across both columns.

---

## Real-Time Sync — Event Hooks

`sheets_service.py` exposes tab-level sync functions. The server fires targeted syncs immediately after relevant mutations using `asyncio.create_task()` (fire-and-forget, never blocks the request).

| Event | Where in server.py | Sync action |
|---|---|---|
| Post published | `publisher.py` after successful publish | `sync_posts_tab` |
| Post failed | `publisher.py` after publish failure | `sync_posts_tab` |
| Post status changed (approve/reject via API) | `update_post` route | `sync_posts_tab` |
| Client onboarded | `onboard_client` | full sync (all tabs) |
| Client info updated | `update_client` route | `sync_client_info_tab` |
| Bundle analytics refreshed | `analytics_client_refresh` | `sync_performance_tab` |

Helper added to `server.py`:
```python
async def _trigger_sheet_sync(client_id: str, tabs: list[str] = None):
    """Fire-and-forget sheet sync. tabs=None means full sync."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client or not client.get("google_sheet", {}).get("sheet_id"):
        return
    asyncio.create_task(_run_partial_sync(client_id, tabs))
```

`_run_partial_sync` is a new variant of `_run_full_sync` that accepts a `tabs` list and only syncs the specified tabs, saving API quota.

---

## Background Scheduler

| Job | Interval | Change from current |
|---|---|---|
| `sync_all_sheets` (outbound) | Every 15 minutes | Was 6 hours |
| `pull_sheet_approvals` (inbound) | Every 15 minutes | Unchanged |

---

## Files Changed

| File | Change |
|---|---|
| `backend/sheets_service.py` | Add `sync_performance_tab`, branding format helpers, chart creation via `googleapiclient`, section label rows for Client Info, status color-coding for Posts |
| `backend/server.py` | Add `_trigger_sheet_sync` helper; hook into `onboard_client`, `update_client`, `analytics_client_refresh`; change scheduler interval; add `_run_partial_sync` |
| `backend/publisher.py` | Add `_trigger_sheet_sync` call after publish success and failure |

No new endpoints. No frontend changes. No schema changes.

---

## Error Handling

- All sync calls are fire-and-forget (`asyncio.create_task`). Failures log a warning and do not propagate to the caller.
- If Google is not connected (no refresh token), `_trigger_sheet_sync` returns immediately without error.
- Chart creation failures during sheet setup are caught and logged; sheet is still returned without charts rather than failing the whole creation.
- Google Sheets API quota: each tab sync = ~3–5 API calls. Full sync = ~20 calls. At 15-minute intervals with staggered 10s between clients, well within 300 req/min quota for up to 60 clients.

---

## Testing

- Unit test `sync_performance_tab`: given a client with `bundle.socials`, assert correct row shape written
- Unit test branding formatter: assert row 1 has black bg, row 2 has black bg, data rows alternate
- Unit test `_trigger_sheet_sync`: mock `db.clients.find_one` with no sheet_id → assert no sync called; with sheet_id → assert `create_task` called
- Integration: `_create_sheet_sync` with mocked gspread — assert 6 worksheets created in correct order, chart batchUpdate called once
