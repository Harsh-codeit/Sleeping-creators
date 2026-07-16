# Smoke Test Guide — Sleeping Creators Mobile App

> Last updated: 2026-07-16  
> Backend: `backend_mobile/` (FastAPI, port 8001)  
> Frontend: `frontend/` (React + Capacitor mobile app)

---

## How to Run

```bash
# Start backend
source backend_mobile/.venv/bin/activate
python -m backend_mobile.main          # http://localhost:8001

# Start frontend (browser preview)
cd frontend && npm start               # http://localhost:3000
```

All authenticated calls require `Authorization: Bearer <token>` where `<token>` comes from the OTP verify response.  
Replace `$TOKEN` and `$USER_ID` with actual values throughout.

---

## Feature 1 — Authentication

### 1.1 Register (new user)

**Step 1 — Send OTP**

```http
POST /api/auth/otp/send
Content-Type: application/json

{ "identifier": "test@example.com", "purpose": "register" }
```

| Expected response | Status |
|---|---|
| `{ "sent": true, "identifier": "test@example.com" }` | 200 |
| Email does not exist yet → OTP is sent to the email | ✓ |
| If user already exists with this email → `404 "No account found"` for login purpose | ✓ |

**Step 2 — Verify OTP**

```http
POST /api/auth/otp/verify
Content-Type: application/json

{ "identifier": "test@example.com", "otp": "123456", "purpose": "register", "full_name": "Test User" }
```

| Expected response | Status |
|---|---|
| `{ "token": "eyJ...", "user": { "id": "...", "email": "...", "name": "Test User" } }` | 200 |
| Wrong OTP → 401 | ✓ |
| Expired OTP (> 10 min) → 401 | ✓ |

**Step 3 — Save interests**

```http
POST /api/auth/register
Content-Type: application/json

{ "identifier": "test@example.com", "name": "Test User", "interests": ["business", "marketing"] }
```

| Expected response | Status |
|---|---|
| `{ "token": "...", "user": { ... } }` | 200 |
| `user.niche` equals first interest | ✓ |

### 1.2 Login (existing user)

```http
POST /api/auth/otp/send
{ "identifier": "test@example.com", "purpose": "login" }
```

| Expected | Status |
|---|---|
| `{ "sent": true }` if user exists | 200 |
| `404 "No account found. Please sign up first."` if user not found | 404 |

### 1.3 Get current user

```http
GET /api/me
Authorization: Bearer $TOKEN
```

| Expected response fields | Type |
|---|---|
| `id` / `client_id` | string (MongoDB ObjectId as string) |
| `email` or `phone` | string |
| `name` | string |
| `niche`, `interests` | string / array |
| `onboarding_complete` | bool |
| `avatar_url` | string or null |
| `bundle_team_id` | string or null |

**UI mapping:** `UserContext.js` maps `data.client_id || data.id` as the user's ID used throughout the app.

### 1.4 Update profile

```http
PUT /api/auth/profile
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "New Name",
  "bio": "My bio",
  "brand_voice": "Professional and witty",
  "target_audience": "Entrepreneurs 25-40",
  "spice_level": 3,
  "interests": ["finance", "mindset"],
  "competitors": ["@garyvee", "@alexhormozi"]
}
```

| Expected | Status |
|---|---|
| Updated user object | 200 |
| `niche` auto-set to first interest if `interests` is in body | ✓ |

### 1.5 Upload profile photo

```http
POST /api/auth/profile/photo
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

photo: <image file>
```

| Expected | Status |
|---|---|
| `{ "avatar_url": "https://cdn.sleepingcreators.com/avatars/$USER_ID.jpg" }` | 200 |
| Same URL every time (overwrites previous avatar) | ✓ |

### 1.6 Mark onboarding complete

```http
POST /api/auth/onboarding-complete
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true }` | 200 |

---

## Feature 2 — Carousel (AI Content Generation)

### 2.1 Generate carousel

```http
POST /api/carousel/generate
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "topic": "5 habits of successful entrepreneurs",
  "slide_count": 7,
  "platform": "instagram",
  "tone": "inspirational",
  "cta_keyword": "follow",
  "template_id": "<optional-uuid>"
}
```

| Expected response fields | Notes |
|---|---|
| `carousel_id` | UUID — save this for subsequent calls |
| `slides` | Array of `{slide_number, heading, body}` |
| `slide_image_urls` | Array of CDN URLs (PNG renders). May be empty if R2 unavailable |
| `caption` | Instagram caption text |
| `hashtags` | Array of strings |
| `cta_text` | CTA string or null |
| `generation_id` | UUID for DNA tracking |
| `latency_ms` | Generation time in ms |

**⚠️ Expected latency:** 8–25 seconds (LangGraph pipeline + Claude).  
**UI behavior:** Spinner during generation; slides shown inline with HTML rendering if `slide_image_urls` is empty.

### 2.2 List carousels (Drafts feed)

```http
GET /api/carousels?limit=10&offset=0
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "carousels": [...], "total": N }` | 200 |
| Each carousel has `id`, `topic`, `slides`, `status`, `created_at` | ✓ |
| Default sorted newest-first | ✓ |

### 2.3 Get single carousel

```http
GET /api/carousels/{carousel_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| Full carousel doc (no `_id` field) | 200 |
| Non-existent ID → 404 | ✓ |

### 2.4 Update carousel

```http
PATCH /api/carousels/{carousel_id}
Authorization: Bearer $TOKEN
Content-Type: application/json

{ "status": "scheduled", "caption": "Updated caption" }
```

| Expected | Status |
|---|---|
| `{ "ok": true }` | 200 |
| Only `status`, `topic`, `caption`, `hashtags` are mutable | ✓ |
| Empty update body → 400 | ✓ |

### 2.5 Delete carousel

```http
DELETE /api/carousels/{carousel_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true }` | 200 |
| Already deleted → still `{ "ok": true }` (idempotent) | ✓ |

### 2.6 Analyze Instagram reel (reference content)

```http
POST /api/intelligence/analyze-reel
Authorization: Bearer $TOKEN
Content-Type: application/json

{ "reel_url": "https://www.instagram.com/reel/XXXXX/" }
```

| Expected response fields | Notes |
|---|---|
| `opening_hook` | Text of the reel hook |
| `tone` | e.g. `"educational"` |
| `structure_type` | e.g. `"tips"` |
| `hook_techniques` | e.g. `"number_reveal, contrast"` |
| `key_message` | Core takeaway |
| `cta_pattern` | CTA used |
| Non-Instagram URL → 400 | ✓ |

---

## Feature 3 — Posts

### 3.1 Create post (schedule or publish)

```http
POST /api/posts
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "platform": "instagram",
  "content_type": "carousel",
  "caption": "Test caption",
  "hashtags": ["#test"],
  "slides": [],
  "slide_image_urls": ["https://cdn.sleepingcreators.com/..."],
  "carousel_id": "<uuid>",
  "status": "draft",
  "scheduled_at": "2026-08-01T10:00:00Z"
}
```

| Expected | Status |
|---|---|
| Created post object with `id` (UUID) | 201 |
| `creator_id` auto-set from JWT | ✓ |

### 3.2 List posts

```http
GET /api/posts?limit=20&status=draft
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "posts": [...], "total": N }` | 200 |
| Optional `client_id` param overrides user's own ID (for admin use) | ✓ |

### 3.3 Approve / schedule post

```http
POST /api/posts/{post_id}/approve
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true, "status": "scheduled" }` | 200 |
| Post `status` changes from `"draft"` → `"scheduled"` | ✓ |
| Non-existent post → 404 | ✓ |

### 3.4 Update post (reschedule)

```http
PUT /api/posts/{post_id}
Authorization: Bearer $TOKEN
Content-Type: application/json

{ "scheduled_at": "2026-08-05T14:00:00Z" }
```

| Expected | Status |
|---|---|
| Full updated post object | 200 |
| Only `caption`, `hashtags`, `slides`, `status`, `scheduled_at`, `platform`, `content_type` writable | ✓ |

### 3.5 Star post (winner feedback)

```http
POST /api/posts/{post_id}/star
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true, "starred": true }` (toggles on/off) | 200 |
| Mirrors `is_winner` flag to `content_dna` collection for AI learning | ✓ |
| Post not owned by this user → 404 | ✓ |

### 3.6 Publish post to Instagram

```http
POST /api/posts/{post_id}/publish
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true, "bundle_post_id": "...", "status": "published" }` | 200 |
| User has no `bundle_team_id` → 400 "Instagram not connected" | ✓ |
| Images uploaded to Bundle, then scheduled on Instagram | ✓ |
| On success: `post.status` = `"published"`, `post.bundle_post_id` set | ✓ |
| On failure: `post.status` = `"failed"`, `post.error` set | ✓ |

### 3.7 Delete post

```http
DELETE /api/posts/{post_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true }` | 200 |

### 3.8 Calendar view

```http
GET /api/calendar?start=2026-07-01T00:00:00Z&end=2026-07-31T23:59:59Z
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "posts": [...], "total": N }` | 200 |
| Only posts with `scheduled_at` or `published_at` in range returned | ✓ |
| Sorted by `scheduled_at` ascending | ✓ |

**UI behavior:** Monthly calendar with post pills. Tap a post to reschedule or publish directly from calendar.

---

## Feature 4 — Video

### 4.1 Generate AI video script

```http
POST /api/videos/script
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "topic": "How to grow on Instagram in 2026",
  "tone": "energetic",
  "duration": "30",
  "hook": "Most creators make this mistake",
  "cta": "Follow for more tips"
}
```

| Expected response fields | Notes |
|---|---|
| `post_id` | UUID of the created post record |
| `script` | Object with `{hook, narration_lines, cta}` |
| `caption` | Auto-generated Instagram caption |
| `hashtags` | Array of strings |

### 4.2 Upload user clip for video

```http
POST /api/videos/upload
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

file: <video file (.mp4/.mov)>
```

| Expected | Status |
|---|---|
| `{ "upload_url": "https://cdn...", "key": "clips/..." }` | 200 |

### 4.3 Render video with captions (Shotstack)

```http
POST /api/videos/{post_id}/render
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "script": { "hook": "...", "narration_lines": [...], "cta": "..." },
  "clip_url": "https://cdn.sleepingcreators.com/clips/..."
}
```

| Expected | Status |
|---|---|
| `{ "render_id": "...", "status": "queued" }` | 200 |

### 4.4 Poll render job

```http
GET /api/videos/job/{render_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "status": "rendering\|done\|failed", "url": "https://..." }` | 200 |
| `status: "done"` includes `url` of the final video | ✓ |
| Poll every 3s until `done` or `failed` | — |

### 4.5 Generate via Shotstack template (text-only)

```http
POST /api/videos/generate
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "template_id": "<shotstack-template-id>",
  "topic": "5 tips to save money",
  "tone": "casual",
  "hook": "You're losing money every day",
  "cta": "Save this post",
  "duration": "30"
}
```

| Expected | Status |
|---|---|
| `{ "post_id": "...", "render_id": "...", "status": "queued" }` | 200 |

### 4.6 List Shotstack templates

```http
GET /api/shotstack-templates
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| Array of template objects with `id`, `name`, `merge_fields` | 200 |

---

## Feature 5 — Templates (Carousel Design)

### 5.1 List templates

```http
GET /api/templates
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| Array of template objects | 200 |
| Each has `id`, `name`, `template_type`, `slide_count`, `thumbnail_url` | ✓ |
| Includes both global (seeded) and user-created templates | ✓ |

### 5.2 Get single template

```http
GET /api/templates/{template_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| Full template doc | 200 |
| Not found → 404 | ✓ |

### 5.3 Clone template

```http
POST /api/templates/{template_id}/clone
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| New template doc with fresh `id`, `creator_id` = current user | 200 |

### 5.4 Create template

```http
POST /api/templates
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "name": "My Dark Template",
  "template_type": "tips",
  "slide_count": 7
}
```

| Expected | Status |
|---|---|
| New template doc | 201 |

### 5.5 Update template

```http
PUT /api/templates/{template_id}
Authorization: Bearer $TOKEN
Content-Type: application/json

{ "name": "Renamed Template" }
```

| Expected | Status |
|---|---|
| Updated template doc | 200 |
| Editing another user's template → 404 | ✓ |

### 5.6 Delete template

```http
DELETE /api/templates/{template_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "ok": true }` | 200 |

---

## Feature 6 — Instagram / Bundle Connect

### 6.1 Get Instagram status

```http
GET /api/instagram/status/{user_id}
```

| Expected | Status |
|---|---|
| `{ "connected": false, "status": "not_connected", "username": null }` when not linked | 200 |
| `{ "connected": true, "status": "connected", "username": "@handle" }` when linked | 200 |
| Never throws — returns disconnected shape on any error | ✓ |

### 6.2 Get Bundle connect URL (used in Settings + Onboarding)

```http
GET /api/bundle/connect/{user_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "url": "https://bundle.social/...", "team_id": "..." }` | 200 |
| If Instagram already connected → `{ "already_connected": true, "instagram_username": "..." }` | 200 |
| Bundle social-set limit hit → 503 with descriptive message | 503 |

**UI flow:** Settings page calls this to open the Bundle.social portal in a new tab. After user connects, poll `GET /api/instagram/status/{user_id}` to confirm.

### 6.3 Disconnect Instagram

```http
DELETE /api/instagram/disconnect/{user_id}
```

| Expected | Status |
|---|---|
| `{ "ok": true, "disconnected": true }` | 200 |
| Always succeeds even if already disconnected | ✓ |

### 6.4 Refresh connected accounts

```http
GET /api/bundle/refresh/{user_id}
Authorization: Bearer $TOKEN
```

| Expected | Status |
|---|---|
| `{ "connected": ["instagram"], "accounts": [...], "instagram": true, "instagram_username": "@handle" }` | 200 |
| No `bundle_team_id` on user → `{ "connected": [], "instagram": false }` | 200 |

---

## Feature 7 — Analytics

### 7.1 Get analytics snapshot

```http
GET /api/analytics/clients/{user_id}
```

| Expected | Status |
|---|---|
| `{ "bundle_connected": false, "totals": {}, "bundle": {"socials": []}, "platform_breakdown": {} }` when not connected | 200 |
| `{ "bundle_connected": true, "totals": {"followers": N, "likes": N, ...}, "bundle": {"socials": [...]}, ... }` when connected and refreshed | 200 |

### 7.2 Refresh analytics (live pull from Bundle)

```http
POST /api/analytics/clients/{user_id}/refresh
```

| Expected | Status |
|---|---|
| Full analytics snapshot (same shape as GET) | 200 |
| No `bundle_team_id` → 400 "Instagram not connected" | 400 |
| Bundle API error → 502 | 502 |

**UI behavior:** Analytics page shows KPI tiles (followers, impressions, views, likes, comments, engagement rate) plus connected platform list. Refresh button triggers POST.

---

## Feature 8 — Hook Library

### 8.1 List hooks

```http
GET /api/hooks?niche=business&hook_type=shocking_number&limit=50
```

| Expected | Status |
|---|---|
| Array of hook objects (not wrapped in `{hooks: ...}`) | 200 |
| Sorted by `avg_engagement` descending | ✓ |
| Filters by `niche` and/or `hook_type` if provided | ✓ |
| Returns both global (`creator_id: null`) and user-specific hooks | ✓ |

**⚠️ Note:** The endpoint returns a plain array, not `{hooks: [...]}`.

---

## Feature 9 — User Onboarding

### 9.1 Onboarding flow (sequential screens)

| Step | Action | API call |
|---|---|---|
| 1 | Enter phone/email | `POST /api/auth/otp/send` |
| 2 | Enter OTP | `POST /api/auth/otp/verify` |
| 3 | Enter name + pick interests | `POST /api/auth/register` |
| 4 | Fill profile (brand voice, audience, etc.) | `PUT /api/auth/profile` |
| 5 | Connect Instagram | `GET /api/bundle/connect/{user_id}` → opens portal |
| 6 | Poll connection | `GET /api/instagram/status/{user_id}` |
| 7 | Complete | `POST /api/auth/onboarding-complete` |

### 9.2 Skip Instagram (optional step)

| Expected | UI behaviour |
|---|---|
| User can skip Instagram connection | Onboarding advances; `onboarding_complete = true` still set |
| Publish will fail later with "Instagram not connected" error | Shown in Settings as "Connect Instagram" prompt |

---

## Feature 10 — Dashboard

Calls made on load:

```
GET /api/posts?client_id={userId}&limit=3          → Recent posts widget
GET /api/templates                                  → Template picker
GET /api/carousels?limit=6                          → Recent carousels widget
GET /api/instagram/status/{userId}                  → Connection badge
```

| Expected | UI behaviour |
|---|---|
| All 4 calls fire in parallel | Dashboard renders in a single loading pass |
| Empty state (no posts/carousels) handled gracefully | Onboarding CTA shown |
| Instagram disconnected → settings nudge shown | ✓ |

---

## Feature 11 — Drafts Page

Load:

```
GET /api/carousels?limit=10&offset=0
GET /api/posts?limit=10&offset=0
```

Both paginate independently with infinite scroll. Items are merged in the UI sorted by date.

| Action | API |
|---|---|
| Schedule draft (carousel) | `POST /api/posts` (create) → `POST /api/posts/{id}/approve` |
| Schedule existing post | `PUT /api/posts/{id}` `{scheduled_at}` → `POST /api/posts/{id}/approve` |
| Delete carousel | `DELETE /api/carousels/{id}` |
| Delete post | `DELETE /api/posts/{id}` |

---

## Feature 12 — Settings Page

| Section | API |
|---|---|
| Load profile | Comes from `UserContext` (`GET /api/me`) |
| Save basic info | `PUT /api/auth/profile` |
| Save brand/audience settings | `PUT /api/auth/profile` (same endpoint, different fields) |
| Upload avatar | `POST /api/auth/profile/photo` (multipart) |
| Check Instagram status | `GET /api/instagram/status/{userId}` |
| Connect Instagram | `GET /api/bundle/connect/{userId}` → open URL |
| Disconnect Instagram | `DELETE /api/instagram/disconnect/{userId}` |
| View post stats (counts by status) | `GET /api/posts?client_id={userId}&limit=500` |

---

## Known Issues / Bugs Found During Audit

| # | Severity | Feature | Issue | Fix |
|---|---|---|---|---|
| 1 | 🔴 Critical | Carousel Builder | `POST /api/carousel/preview-slides` was missing. Slide preview calls in editor silently failed (404 swallowed). | Added endpoint to `carousel_router.py` — renders changed slides only (content-hash diffing), caches unchanged previews |
| 2 | 🔴 Critical | Carousel Builder | `POST /api/upload` was missing. Author photo + element image uploads in editor failed. | Added generic file upload endpoint to `carousel_router.py` — uploads to R2, returns CDN URL |
| 3 | 🔴 Critical | Carousel Builder | `POST /api/carousels/{id}/export` was missing. Export & Download All always failed. | Added endpoint — returns existing `slide_image_urls` or re-renders + caches them |
| 4 | 🔴 Critical | Carousel Builder | `POST /api/carousels/{id}/publish` was missing. Carousel publish path always fell through to `retrying_local` failure. | Added endpoint — exports slides if needed, uploads to Bundle, publishes to Instagram |
| 5 | 🟡 Medium | Instagram Connect | `BundleConnect.js` opened popup to `/api/bundle/authorize/{id}` which doesn't exist. | Rewrote `BundleConnect.js` to call `GET /api/bundle/connect/{id}` first, then open the returned portal URL |
| 6 | 🟡 Medium | AI Content DNA | `POST /api/carousels` (manual save in Carousel Builder) did not store `generation_id` or `template_id`. Star/publish could not backfill the DNA entry. | Added `generation_id` and `template_id` fields to `save_carousel` document |
| 7 | 🟢 Low | Posts list | `GET /api/posts` returns `{posts, total}`. Verified DraftsPage uses `.data.posts` correctly — no issue. | — |
| 8 | 🟢 Low | Hook library | `GET /api/hooks` returns flat array. Verified compat_router matches frontend expectation. | — |
