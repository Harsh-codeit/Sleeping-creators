# Strategy Tab Redesign — Week Plan + Report

**Date:** 2026-05-26
**Status:** Approved

---

## Goal

Expand the client Strategy tab with two new sub-tabs: a **Week Plan** that generates a full week of content drafts using AI and schedules approved posts, and a **Report** that aggregates analytics from existing tabs into a single executive summary.

---

## Strategy Tab Structure

The Strategy tab gets an internal tab bar. Tab state driven by `?strategyTab=` query param.

| Sub-tab | Label | Content |
|---|---|---|
| 0 | Overview | Existing strategy content (themes, tone, hooks, etc.) — unchanged |
| 1 | Week Plan | AI-generated week of content drafts, approve and schedule |
| 2 | Report | Executive summary of market trends, competitor benchmark, client profile |

**Implementation:** Tab bar rendered at the top of the Strategy tab section in `ClientDetail.js`. Reads `searchParams.get("strategyTab") || "overview"`.

---

## Week Plan Tab

### Three UI States

**Empty state** (no plan generated):
- Centered call-to-action card
- "Generate Week" button
- Shows inputs that will be used: client niche, content themes, topic rules, trend keywords, competitor insights

**Generating state:**
- 7 skeleton day cards with pulse animation
- "Cancel" link

**Plan ready state:**
- Header row: "Week of Mon DD – Sun DD" + "Regenerate" button + "Schedule N posts →" button (disabled until ≥1 approved)
- 7 day cards in a 2-column grid

### Day Card

Each card shows:
- Day label + date (e.g. "MON · Jun 2")
- Format badge (Carousel / Video / Reel)
- Topic headline
- Caption preview (truncated, expand on click)
- Suggested template name + slide count
- Action buttons: Approve | Edit | Skip

**Card border states:**
- `neutral` — default zinc border
- `approved` — green border + checkmark
- `skipped` — dimmed, reduced opacity
- `editing` — inline caption textarea replaces preview

### Generation Flow

`POST /api/clients/{id}/content-plan/generate`

Input assembled by backend from:
- Client niche, content themes, topics_include, topics_exclude
- Top 10 current trends (`GET /api/clients/{id}/trends`)
- Competitor strategy summary (client.competitor_strategy)
- Active platforms from the client's primary pipeline

Claude prompt returns a structured JSON array of 7 items. Falls back gracefully if trend or competitor data is absent.

Response schema per item:
```json
{
  "day": "Monday",
  "date": "2026-06-02",
  "topic": "3 mistakes new coaches make",
  "format": "carousel",
  "caption": "Full generated caption text...",
  "template_id": "abc123",
  "slide_count": 6,
  "rationale": "Trending topic this week"
}
```

### Schedule Flow

`POST /api/clients/{id}/content-plan/schedule`

Body: `{ posts: [...approved items], pipeline_id: "xyz" }`

For each approved post, backend creates a post document in the existing `posts` collection:
- `status: "approved"` (or `"pending_approval"` if pipeline's `require_approval` is true)
- `scheduled_at` timestamps spaced using the pipeline's `days_between_posts` or `interval_hours` config, starting from tomorrow
- `platforms` from pipeline config
- `caption`, `carousel_template`, `carousel_slide_count` from the approved plan item

Returns `{ scheduled: N }`. Posts are picked up by the existing `process_scheduled_posts` scheduler.

**Pipeline selection:** If the client has multiple pipelines, a dropdown appears next to the "Schedule N posts →" button so the user can select which pipeline's config (timing, platforms, approval setting) to use. Defaults to the first active carousel pipeline.

**No new MongoDB collections. The generated plan is transient (component state only) — if the user navigates away, they regenerate.**

---

## Report Tab

Three KPI sections, each sourced from existing API endpoints fetched in parallel on mount. A "Refresh All" button at the top re-fetches all three.

### Section 1: Market Trends

**Data source:** `GET /api/clients/{id}/trends` + `GET /api/clients/{id}/trend-keywords`

Displays:
- Top 5 trending topics in niche (ranked by score)
- Format distribution (% carousel / video / reel from trend data)
- Top 5 trending hashtags

Link → "View in Trends tab →"

### Section 2: Competitor Benchmark

**Data source:** `GET /api/clients/{id}/competitor-posts` + `GET /api/clients/{id}/competitors`

Displays:
- Client avg engagement score vs competitor avg engagement score (comparison bar)
- Competitors' top-performing content type
- Number of active competitors tracked
- Top 3 hashtags used by competitors

Link → "View in Competitors tab →"

### Section 3: Client Profile

**Data source:** `GET /api/analytics/clients/{id}` (existing Bundle endpoint)

Displays:
- Posts published this month
- Average engagement score across all posts
- Best-performing format (highest avg engagement by type)
- Last refreshed timestamp + inline Refresh button

Link → "View in Analytics tab →"

---

## Files to Change

### Backend (`backend/server.py`)
- Add `POST /api/clients/{id}/content-plan/generate` — build prompt from client data + trends + competitor strategy, call Anthropic API, return 7-item array
- Add `POST /api/clients/{id}/content-plan/schedule` — create N scheduled posts from approved items using pipeline config

### Frontend

| File | Change |
|---|---|
| `frontend/src/pages/ClientDetail.js` | Add `?strategyTab=` query param reader; add sub-tab bar at top of Strategy tab section; wrap existing strategy content in `strategyTab === "overview"` condition |
| `frontend/src/components/strategy/WeekPlanTab.js` | New component — generate/review/schedule UI |
| `frontend/src/components/strategy/ReportTab.js` | New component — 3-section analytics summary |

---

## Out of Scope

- Persisting the generated week plan to the database (plan is transient; regenerate as needed)
- Video post generation in the week plan (carousel only for v1; format field can include video but caption generation focuses on carousel captions)
- PDF export of the report
- Scheduled post editing after scheduling (use the Posts tab / Calendar for that)
- Notifications when scheduled posts publish
