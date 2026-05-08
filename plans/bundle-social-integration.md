# Plan: Full Migration to Bundle.social (All Platforms)

**Goal:** Replace every direct platform publisher (Instagram Graph API, Facebook Graph API, and all stubs) with Bundle.social as the single unified publishing layer. AutoMonk continues to generate carousel images and video; Bundle.social handles all platform delivery. The existing CalendarPage shows all scheduled posts with live status badges updated via webhooks.

**Why full migration:** One API key, one connection flow (Bundle's hosted portal), 14 platforms, no per-platform OAuth token management. AutoMonk focuses on content generation + design; Bundle handles distribution.

**Primary platform: Instagram** — all Instagram-specific features (carousels, reels, stories, tagged users) must work correctly through Bundle.

---

## Phase 0: Documentation Discovery (DONE)

### Confirmed Bundle.social APIs

**Base URL:** `https://api.bundle.social/api/v1`  
**Auth:** `x-api-key: pk_live_...` header on every request  
**OpenAPI spec:** `https://api.bundle.social/swagger-json`

| Purpose | Method | Path | Key params |
|---------|--------|------|------------|
| List teams | GET | `/team/` | — |
| Create team | POST | `/team/` | `{ name }` |
| Get team | GET | `/team/{id}` | includes `socialAccounts` |
| Create portal link | POST | `/social-account/create-portal-link` | `teamId`, `socialAccountTypes[]`, `redirectUrl`, `expiresIn` (5–2880 min) |
| Refresh channels | POST | `/social-account/refresh-channels` | `teamId` |
| Connection check | POST | `/social-account/connection-check` | `teamId`, `type` |
| Upload (simple) | POST | `/upload/create` | multipart: `file`, `teamId` |
| Upload (resumable init) | POST | `/upload/init` | `fileName`, `mimeType`, `teamId` |
| Upload (finalize) | POST | `/upload/finalize` | `path`, `teamId` |
| Create / schedule post | POST | `/post` | see schema below |
| Get post | GET | `/post/{id}` | returns current status |
| List posts | GET | `/post/?teamId=...` | pagination |

**Post create body (from official SDK example):**
```json
{
  "teamId": "...",
  "title": "optional internal label",
  "status": "SCHEDULED",
  "postDate": "2026-05-09T14:00:00.000Z",
  "socialAccountTypes": ["INSTAGRAM", "FACEBOOK", "TWITTER"],
  "data": {
    "INSTAGRAM": {
      "text": "caption up to 2000 chars",
      "uploadIds": ["upload_abc", "upload_def"],
      "autoFitImage": true,
      "collaborators": ["username1"],
      "tagged": [{ "username": "user", "x": 0.5, "y": 0.3 }]
    },
    "FACEBOOK": {
      "text": "...",
      "uploadIds": ["upload_abc", "upload_def"]
    },
    "TWITTER": {
      "text": "...",
      "uploadIds": [],
      "replySettings": "EVERYONE"
    }
  }
}
```

**Platform enum values:** `INSTAGRAM`, `FACEBOOK`, `TWITTER`, `LINKEDIN`, `TIKTOK`, `YOUTUBE`, `THREADS`, `PINTEREST`, `REDDIT`, `MASTODON`, `DISCORD`, `SLACK`, `BLUESKY`, `GOOGLE_BUSINESS`

**Webhook events:** `post.published`, `post.failed`  
**Signature header:** `x-signature` (HMAC-SHA256 of raw body with webhook secret)  
**Delivery:** 3 attempts, exponential backoff starting 30s, 15s timeout

### Existing Code Baseline

| What | File | Lines | Keep or replace? |
|------|------|-------|-----------------|
| Carousel renderer | `carousel_renderer.py` | all | **KEEP** — still renders PNG slides |
| Carousel design engine | `carousel_design_engine.py` | all | **KEEP** — still derives design context |
| Carousel templates | `carousel_templates/base.py` | all | **KEEP** — still generates HTML/images |
| Video service | `video_service.py` | all | **KEEP** — still processes video via FFmpeg |
| Video worker | `video_worker.py` | all | **KEEP** — Celery still processes video |
| AI service | `ai_service.py` | all | **KEEP** — still generates text |
| Publisher dispatch | `publisher.py` | 998–1012 | **REPLACE** — route all to Bundle |
| Instagram publisher | `publisher.py` | 370–812 | **REPLACE** — Bundle takes over |
| Facebook publisher | `publisher.py` | 818–985 | **REPLACE** — Bundle takes over |
| Stubs (LinkedIn etc.) | `publisher.py` | 1127–1163 | **REPLACE** — Bundle takes over |
| Instagram OAuth | `server.py` | 3829–4020 | **DEPRECATE** — Bundle portal replaces |
| Facebook OAuth | `server.py` | 4115–4260 | **DEPRECATE** — Bundle portal replaces |
| APScheduler loop | `server.py` | 612–732 | **KEEP** — same polling, new publish call |
| Calendar page | `CalendarPage.js` | all | **EXTEND** — add new platforms |
| Client detail | `ClientDetail.js` | 1–150 | **EXTEND** — replace IG/FB connect with Bundle portal |

---

## Phase 1: Backend — `bundle_service.py`

**What to implement:** The only file that talks to `api.bundle.social`. Every other module imports from here.

**File to create:** `backend/bundle_service.py`

```python
import httpx, hashlib, hmac, json
from typing import Optional

BUNDLE_BASE = "https://api.bundle.social/api/v1"

# AutoMonk platform strings → Bundle API enum strings
PLATFORM_MAP = {
    "instagram":      "INSTAGRAM",
    "facebook":       "FACEBOOK",
    "twitter":        "TWITTER",
    "linkedin":       "LINKEDIN",
    "tiktok":         "TIKTOK",
    "youtube":        "YOUTUBE",
    "threads":        "THREADS",
    "pinterest":      "PINTEREST",
    "reddit":         "REDDIT",
    "discord":        "DISCORD",
    "bluesky":        "BLUESKY",
    "google_business":"GOOGLE_BUSINESS",
}

async def _get(api_key: str, path: str, params: dict = None) -> dict: ...
async def _post(api_key: str, path: str, body: dict) -> dict: ...
async def _upload_multipart(api_key: str, path: str, file_bytes: bytes, fields: dict) -> dict: ...

async def list_teams(api_key: str) -> list[dict]: ...
async def create_team(api_key: str, name: str) -> dict: ...
async def get_team(api_key: str, team_id: str) -> dict: ...

async def create_portal_link(
    api_key: str,
    team_id: str,
    platforms: list[str],   # AutoMonk platform strings, mapped internally
    redirect_url: str,
    expires_in: int = 60,
) -> str: ...   # returns the portal URL string

async def refresh_channels(api_key: str, team_id: str) -> dict: ...

async def upload_file(
    api_key: str,
    team_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> str: ...   # returns upload_id like "upload_abc123"

async def create_post(
    api_key: str,
    team_id: str,
    platforms: list[str],          # AutoMonk platform strings
    text: str,
    post_date: str,                # ISO 8601
    upload_ids: list[str] = None,
    platform_overrides: dict = None,   # per-platform data dict, keyed by Bundle enum
    title: str = None,
) -> dict: ...   # returns Bundle post object { "id": "...", "status": "SCHEDULED", ... }

async def get_post(api_key: str, post_id: str) -> dict: ...
async def list_posts(api_key: str, team_id: str, limit: int = 50, offset: int = 0) -> list[dict]: ...

def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

**Settings storage:** Store `bundle_api_key` and `bundle_webhook_secret` in `db.settings` (the existing global settings doc), updatable via the settings UI without restart.

**Verification checklist:**
- [ ] `list_teams()` returns non-error JSON from live Bundle API
- [ ] `create_team()` creates a team visible in `https://bundle.social/dashboard`
- [ ] `upload_file()` returns a valid `upload_id`
- [ ] `create_post()` with future `postDate` appears as scheduled in Bundle dashboard
- [ ] `verify_webhook_signature()` matches known test vector

**Anti-pattern guards:**
- Never hardcode `pk_live_...` in source — always read from `db.settings`
- Use `async with httpx.AsyncClient()` per call, not a module-level client (avoids event-loop issues with FastAPI)
- Never call the `bundlesocial` npm package from Python — use raw `httpx` REST calls

---

## Phase 2: Backend — Client Bundle Team Setup

**What to implement:** Each AutoMonk client maps to one Bundle team. Routes to create/link that team and generate OAuth portal links.

**Schema changes** — add to client documents (update the client dict in `server.py` around line 126):
```python
"bundle_team_id":    str | None      # Bundle team UUID
"bundle_platforms":  list[str]       # AutoMonk strings for connected platforms, e.g. ["instagram","facebook","twitter"]
"bundle_connected_at": str | None    # ISO timestamp of last successful connection
```

**New routes to add in `server.py`:**

```
POST  /api/bundle/setup/{client_id}
  → Creates a Bundle team named after the client
  → Returns { team_id, portal_url }
  → portal_url = 60-min one-time link for all 14 platforms

GET   /api/bundle/connect/{client_id}?platforms=instagram,twitter,linkedin
  → Requires bundle_team_id already set
  → Returns { portal_url } — frontend opens in new tab
  → Use create_portal_link() with the requested platforms

POST  /api/bundle/refresh/{client_id}
  → Calls get_team() to read socialAccounts
  → Updates bundle_platforms on client doc
  → Returns updated client

GET   /api/settings/bundle
PUT   /api/settings/bundle
  → Read / write bundle_api_key and bundle_webhook_secret in settings doc
  → Reuse the existing settings read/write pattern
```

**Migration note for existing clients with instagram_connected / facebook_connected:**
- Do NOT delete those fields on migration
- After client reconnects via Bundle portal, set `bundle_platforms` accordingly
- Old direct-publish fields become unused but harmless — clean up in a separate migration later

**Verification checklist:**
- [ ] `POST /api/bundle/setup/{client_id}` returns a valid portal URL
- [ ] Opening portal URL in browser shows the Bundle account connect screen
- [ ] After connecting Instagram in portal → `POST /api/bundle/refresh/{client_id}` → `bundle_platforms` includes `"instagram"`
- [ ] Settings API saves and returns the API key (masked in logs)

---

## Phase 3: Backend — Replace Publisher with Bundle

**What to implement:** Replace all platform-specific publish functions with a single `publish_bundle()`. The carousel rendering pipeline is unchanged — images still get rendered to PNG, but are now uploaded to Bundle instead of posted directly to Instagram Graph API.

### 3a — Media upload helper

Add `async def _upload_media_to_bundle(api_key, team_id, url_or_bytes) -> str` in `publisher.py`:
- If `image_url` is a Cloudflare R2 URL: download bytes via `httpx`, upload to Bundle via `bundle_service.upload_file()`
- If carousel slides are pre-rendered bytes: upload each slide, collect `upload_ids`
- Returns a list of `upload_ids`

### 3b — Platform-specific overrides builder

Add `_build_platform_data(post, platform, upload_ids) -> dict` that returns the per-platform `data` dict:

```python
def _build_platform_data(post: dict, platform: str, upload_ids: list[str]) -> dict:
    base = {"text": post.get("text", ""), "uploadIds": upload_ids}
    if platform == "instagram":
        base["autoFitImage"] = True
        # carousel: multiple uploadIds → Bundle posts as IG carousel automatically
    elif platform == "youtube":
        base["title"] = post.get("title") or post.get("text", "")[:100]
        base["madeForKids"] = False
    elif platform == "twitter":
        base["replySettings"] = "EVERYONE"
    elif platform == "pinterest":
        board_id = post.get("pinterest_board_id") or ""
        if board_id:
            base["boardId"] = board_id
    return base
```

### 3c — `publish_bundle()` main function

```python
async def publish_bundle(post: dict, client: dict) -> dict:
    settings = await db.settings.find_one({"key": "global"})
    api_key  = settings.get("bundle_api_key")
    team_id  = client.get("bundle_team_id")
    platform = post.get("platform")

    if not api_key or not team_id:
        return {"status": "failed", "error": "Bundle not configured — run setup first"}

    # 1. Upload all media
    upload_ids = []
    if post.get("carousel_data"):
        # Render slides → upload each PNG
        slides = await render_carousel_slides(post)   # existing carousel_renderer logic
        for slide_bytes in slides:
            uid = await bundle_service.upload_file(api_key, team_id, slide_bytes, "slide.jpg", "image/jpeg")
            upload_ids.append(uid)
    elif post.get("image_url"):
        img_bytes = await _download_url(post["image_url"])
        uid = await bundle_service.upload_file(api_key, team_id, img_bytes, "image.jpg", "image/jpeg")
        upload_ids.append(uid)

    # 2. Build per-platform data
    platform_data = _build_platform_data(post, platform, upload_ids)

    # 3. Create post in Bundle
    result = await bundle_service.create_post(
        api_key=api_key,
        team_id=team_id,
        platforms=[platform],
        text=post.get("text", ""),
        post_date=post.get("scheduled_at"),
        upload_ids=upload_ids,
        platform_overrides={PLATFORM_MAP[platform]: platform_data},
        title=post.get("title"),
    )

    # Bundle accepted it — status will be updated to "published" via webhook
    return {
        "status": "published",          # accepted by Bundle scheduler
        "platform_post_id": result["id"],  # Bundle post UUID (stored for webhook lookup)
        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
    }
```

### 3d — Update the dispatcher

Replace the existing `publish()` function body in `publisher.py` (lines 998–1012):

```python
async def publish(post: dict, client: dict, local_fallback: bool = False) -> dict:
    platform = post.get("platform", "")

    # Video posts still use the Celery video worker pipeline
    if post.get("content_type") == "video":
        return await publish_video(post, client)

    # All non-video posts go through Bundle
    return await publish_bundle(post, client)
```

Keep `publish_instagram()`, `publish_facebook()` in the file but no longer call them — they serve as a fallback reference during transition.

**Verification checklist:**
- [ ] Instagram carousel post: all slide PNGs uploaded, carousel appears on Instagram via Bundle
- [ ] Instagram single image: one upload, one post
- [ ] Facebook text post: no uploads, text-only Bundle post
- [ ] Twitter post: 280-char text, posts correctly
- [ ] `platform_post_id` in MongoDB is the Bundle post UUID (not the native IG/FB post ID yet — webhook updates this after publish)
- [ ] Video posts still route to `publish_video()`, not Bundle

**Anti-pattern guards:**
- Do NOT mix `autoFitImage` and `autoCropImage` on the same Instagram post — they are mutually exclusive
- Do NOT set `status: "DRAFT"` — always `"SCHEDULED"` with a future `postDate`
- Carousel: multiple `uploadIds` in the Instagram data object = carousel post (no special flag needed)
- Instagram stories: do NOT include `collaborators` or `locationId` fields

---

## Phase 4: Backend — Webhook Handler

**What to implement:** Bundle calls `/webhooks/bundle` when a post publishes or permanently fails. Update MongoDB post status so the CalendarPage shows live state.

**Route** (add to `app` directly, NOT to `api_router`, so path is `/webhooks/bundle` not `/api/webhooks/bundle`):

```python
@app.post("/webhooks/bundle")
async def bundle_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-signature", "")
    settings = await db.settings.find_one({"key": "global"})
    secret = settings.get("bundle_webhook_secret", "")

    if not bundle_service.verify_webhook_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = json.loads(raw_body)
    event_type = event.get("type")
    data = event.get("data", {})
    bundle_post_id = data.get("id")

    if not bundle_post_id:
        return {"ok": True}

    if event_type == "post.published":
        await db.posts.update_one(
            {"platform_post_id": bundle_post_id},
            {"$set": {
                "status": "published",
                "published_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }}
        )

    elif event_type == "post.failed":
        error_msg = data.get("errorMessage") or data.get("userFacingMessage") or "Bundle publish failed"
        await db.posts.update_one(
            {"platform_post_id": bundle_post_id},
            {"$set": {
                "status": "failed",
                "error_message": error_msg,
                "updated_at": datetime.utcnow().isoformat(),
            }}
        )

    return {"ok": True}
```

**Add to JWT-exempt list** in `server.py` auth middleware — same section as `/api/auth/` and Telegram endpoints.

**Add manual sync route** for debugging when webhook delivery fails:
```
GET /api/bundle/post/{bundle_post_id}/sync
  → Calls bundle_service.get_post()
  → Maps Bundle status → AutoMonk status
  → Updates MongoDB
  → Returns updated post
```

**Bundle status → AutoMonk status mapping:**
```python
BUNDLE_STATUS_MAP = {
    "SCHEDULED":   "scheduled",
    "PUBLISHED":   "published",
    "FAILED":      "failed",
    "DRAFT":       "draft",
    "PUBLISHING":  "publishing",
}
```

**Verification checklist:**
- [ ] `curl -X POST /webhooks/bundle -H "x-signature: valid" -d '{"type":"post.published","data":{"id":"..."}}'` → post status updates to `published`
- [ ] Invalid / missing signature → 401
- [ ] Route NOT guarded by JWT middleware
- [ ] Manual sync endpoint correctly pulls status from Bundle and updates MongoDB

---

## Phase 5: Backend — Calendar & Posts API

**What to implement:** Ensure the calendar endpoint returns posts for all platforms and includes the data the frontend needs for the post detail popover.

**Tasks:**

1. Find `GET /api/calendar-posts` in `server.py`. If `platform` filter is a hardcoded list, extend it:
   ```python
   ALL_PLATFORMS = [
       "instagram", "facebook", "twitter", "linkedin",
       "tiktok", "youtube", "threads", "pinterest",
       "reddit", "discord", "bluesky",
   ]
   ```

2. Ensure each post object returned includes:
   ```json
   {
     "id": "uuid",
     "client_id": "...",
     "client_name": "Brand Name",
     "platform": "instagram",
     "status": "scheduled",
     "scheduled_at": "2026-05-09T14:00:00Z",
     "published_at": null,
     "text": "caption preview...",
     "image_url": "https://...",
     "platform_post_id": "bundle-uuid",
     "error_message": null
   }
   ```

3. Add `GET /api/bundle/posts/{client_id}` — returns Bundle-side post list for audit/sync.

**Verification checklist:**
- [ ] Calendar API returns Instagram, Facebook, Twitter, LinkedIn posts in the same response
- [ ] `platform_post_id` (Bundle UUID) is present on scheduled/published posts
- [ ] Status `publishing` is included (not filtered out) — needed while Bundle is processing

---

## Phase 6: Frontend — Bundle Settings & Client Connection UI

**What to implement:** Settings panel for the Bundle API key. Per-client "connect via Bundle" flow replacing the existing Instagram/Facebook OAuth buttons.

### Settings Page

In the Settings page, add a "Bundle.social" card:
- Masked API key input (shows `pk_live_...••••••••`)
- Webhook secret input (masked)
- Save button → `PUT /api/settings/bundle`
- Read-only webhook URL display: `{window.location.origin}/webhooks/bundle` with copy-to-clipboard button
- Note: "Register this URL in your Bundle dashboard → Organization → Webhooks"

### ClientDetail.js — Platforms Tab

Replace the existing per-platform OAuth connect buttons with the Bundle flow:

```
┌─ Bundle.social ─────────────────────────────────────────────────┐
│  Team: Acme Corp (bundle_team_id shown)                [Refresh] │
│                                                                   │
│  Connected platforms:                                             │
│  [Instagram ✓]  [Facebook ✓]  [Twitter ✗]  [LinkedIn ✗]        │
│                                                                   │
│  [+ Connect More Accounts]   → opens Bundle portal in new tab    │
│  [Setup Bundle Team]         → shown only when team not set yet  │
└──────────────────────────────────────────────────────────────────┘
```

- "Setup Bundle Team" → `POST /api/bundle/setup/{client_id}` → redirects to returned `portal_url`
- "Connect More Accounts" → `GET /api/bundle/connect/{client_id}?platforms=instagram,facebook,twitter,linkedin,tiktok,youtube,threads` → open `portal_url`
- "Refresh" → `POST /api/bundle/refresh/{client_id}` → re-renders `bundle_platforms` badges
- Green badge = in `bundle_platforms`; red/gray = not connected

### Pipeline CRUD wizard

In `frontend/src/components/pipeline/constants.js`, ensure the platforms list includes all Bundle-supported platforms:
```javascript
export const PLATFORMS = [
  { value: "instagram",  label: "Instagram" },
  { value: "facebook",   label: "Facebook" },
  { value: "twitter",    label: "Twitter / X" },
  { value: "linkedin",   label: "LinkedIn" },
  { value: "tiktok",     label: "TikTok" },
  { value: "youtube",    label: "YouTube" },
  { value: "threads",    label: "Threads" },
  { value: "pinterest",  label: "Pinterest" },
];
```

**Verification checklist:**
- [ ] API key saves and persists, shows masked on reload
- [ ] "Setup Bundle Team" creates team + opens portal
- [ ] After connecting Instagram in portal → Refresh → green Instagram badge
- [ ] Pipeline wizard shows all 8 platforms

---

## Phase 7: Frontend — Calendar Enhancements

**What to implement:** Full calendar view showing all Bundle-published posts with correct platform labels, status colors, and a clickable post detail popover.

### Platform filter

Extend the `PLATFORMS` array in `CalendarPage.js` to include all 8 platforms from Phase 6.

### Status badge colors

Ensure all 5 statuses render:
```javascript
const STATUS_COLORS = {
  draft:      "border-zinc-700 text-zinc-400",
  scheduled:  "border-amber-700 text-amber-400",
  publishing: "border-blue-700 text-blue-400",   // add this
  published:  "border-emerald-700 text-emerald-400",
  failed:     "border-red-900 text-red-400",
};
```

### Post detail popover

Click any post on the calendar to show a popover/sheet:
- Platform icon + status badge
- Scheduled date/time + published date/time (if set)
- Caption text (truncated to ~200 chars)
- Image thumbnail (if `image_url` present)
- Bundle Post ID: `{platform_post_id}` with copy button
- "Sync Status" button → `GET /api/bundle/post/{platform_post_id}/sync` → updates badge in-place
- Error message in red if `status === "failed"`

### Auto-refresh

Add a 60-second auto-refresh on CalendarPage (match the scheduler interval) so published/failed status updates appear without manual reload.

**Verification checklist:**
- [ ] All 8 platforms appear in the filter dropdown
- [ ] Clicking an Instagram post shows its caption, image thumbnail, Bundle post ID
- [ ] "Sync Status" updates the status badge without page reload
- [ ] `publishing` status shows blue badge
- [ ] 60s auto-refresh updates statuses

---

## Phase 8: Final Verification & Cleanup

### End-to-end smoke test

1. Settings → enter Bundle API key → Save
2. Client → Platforms → Setup Bundle Team → connect Instagram in portal
3. Refresh → green Instagram badge
4. Create a new carousel post for Instagram, scheduled 5 min from now
5. CalendarPage → see post in correct slot with `scheduled` amber badge
6. Wait for Bundle to publish → webhook fires → badge changes to `published` green
7. Click post → popover shows `published_at` timestamp

### Regression check

- Create a video post → confirm it routes to `publish_video()`, not `publish_bundle()`
- Confirm carousel rendering still produces correct PNGs (carousel_renderer.py unchanged)
- APScheduler still polls every 60s and calls `publish()` for due posts

### Security checks

```bash
# No hardcoded API keys
grep -r "pk_live_" backend/

# Webhook not behind JWT
grep -n "webhooks/bundle" backend/server.py
# Should be on `app.post`, not `api_router.post`

# Signature check present
grep -n "verify_webhook_signature" backend/server.py
```

### Rate limit awareness

| Platform | Bundle PRO daily limit |
|----------|------------------------|
| Instagram | 50/team |
| Facebook | 50/team |
| Twitter/X | 15/team |
| LinkedIn | 18/team |
| TikTok | 10/team |

Monthly org cap on PRO: 10,000 posts. Confirm Bundle plan before going live.

---

## Implementation Order

| # | Phase | Est. effort | Dependency |
|---|-------|-------------|------------|
| 1 | `bundle_service.py` | 2h | — |
| 2 | Client team setup routes | 1.5h | Phase 1 |
| 3 | Replace publisher with Bundle | 2.5h | Phase 1, 2 |
| 4 | Webhook handler | 1h | Phase 1 |
| 5 | Calendar/posts API fixes | 0.5h | Phase 3 |
| 6 | Frontend settings + connect UI | 2h | Phase 2 |
| 7 | Calendar enhancements | 1.5h | Phase 5, 6 |
| 8 | Final verification | 1h | All |

**Total estimated effort: ~12 hours**

---

## Environment Variables to Add

```bash
# backend/.env
BUNDLE_API_KEY=pk_live_...          # Bundle dashboard → API Keys
BUNDLE_WEBHOOK_SECRET=wh_...        # Bundle dashboard → Organization → Webhooks
```

Both also stored in `db.settings` as `bundle_api_key` / `bundle_webhook_secret` so they can be updated from the Settings UI without restarting the server.

---

## What Gets Retired

These are no longer the primary publish path after migration. Keep the code in place but it will not be called by the scheduler:

- `publisher.publish_instagram()` — replaced by `publish_bundle()`
- `publisher.publish_facebook()` — replaced by `publish_bundle()`
- Instagram OAuth routes (`/instagram/connect/{client_id}`, `/instagram/callback`) — replaced by Bundle portal link
- Facebook OAuth routes (`/facebook/connect/{client_id}`, `/facebook/callback`) — replaced by Bundle portal link

Do NOT delete these until the migration is fully validated. They serve as a fallback if Bundle has an outage.
