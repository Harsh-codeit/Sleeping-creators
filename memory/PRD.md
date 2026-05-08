# Sleeping Creators — Content Automation Platform
**PRD Last Updated:** February 2026

---

## Problem Statement
A fully autonomous, multi-client, multi-platform content automation platform that generates, renders, schedules, and publishes social media content across Instagram, Facebook, YouTube, LinkedIn, Twitter/X, and Threads — with zero daily human input. Two interfaces: Telegram (passive alerts) and Dashboard (full control).

## User Persona
Solo operators and small agencies managing social media for multiple clients using fully automated AI-powered systems.

---

## Architecture

**Stack:** React (frontend) + FastAPI (backend) + MongoDB

**Backend files:**
- `server.py` — All API routes, scheduler setup, seed data
- `ai_service.py` — Claude Sonnet 4.5 content + carousel generation
- `telegram_service.py` — Telegram alert bot integration
- `publisher.py` — Mock social publisher (90% success rate)

**Frontend pages:**
- `/` Dashboard — System stats, client status, activity feed
- `/clients` — Client management (CRUD, pause/resume)
- `/clients/:id` — Client detail with tabs (Overview, Strategy, Platforms, Posts)
- `/queue` — Content queue with AI generate, approve, publish, filters
- `/carousel` — Carousel renderer with AI generation + manual creation
- `/analytics` — Charts, per-platform breakdown, per-client performance
- `/settings` — Telegram config, AI model, automation settings
- `/logs` — Automation log stream with level filters

---

## What's Been Implemented

### Phase 1 — MVP (Feb 2026)
- ✅ Command-center dark dashboard (zinc-950, IBM Plex Sans/Mono)
- ✅ Multi-client management: CRUD, pause/resume, per-client strategy
- ✅ AI content generation (Claude Sonnet 4.5 via Emergent LLM key)
- ✅ Content queue: draft → approve → scheduled → published/failed
- ✅ Mock publishing engine with 90% success rate simulation
- ✅ APScheduler background automation (5-min publish cycle, daily reset)
- ✅ Telegram alert integration (configurable via Settings)
- ✅ Analytics: time-series charts, platform distribution, per-client stats
- ✅ Automation logs with level filtering (success/info/warning/error)
- ✅ Settings: AI model, Telegram, automation toggles
- ✅ 3 seeded sample clients (TechFlow Inc, Wellness Path, Urban Eats)

### Phase 7 — Login / Auth Protection (Mar 2026)
- ✅ Password-protected dashboard: first visit shows "Set up your admin password", subsequent visits show login form
- ✅ JWT tokens (30-day expiry) stored in localStorage; axios global `Authorization` header set automatically
- ✅ `AuthMiddleware` protects all `/api/*` routes except `/api/auth/*`, `/api/static/*`, and Telegram approve/reject links
- ✅ "Sign Out" button in sidebar, 401 interceptor auto-logs out on expired token
- ✅ "Change Password" section added to Settings page
- ✅ bcrypt password hashing; admin password stored in MongoDB settings

### Phase 6 — Pipeline Templates + Telegram Approval (Mar 2026)
- ✅ Pipeline template picker now includes all 3 carousel templates: Dark Card, Quote White, Floating
- ✅ Telegram approval flow: when "Require Approval" is enabled, pipeline sends Telegram message with ✅ Approve / ❌ Reject inline keyboard buttons
- ✅ GET `/api/posts/{id}/approve?token=` and `/api/posts/{id}/reject?token=` with branded HTML response pages
- ✅ Token-secured: one-time `approval_token` on post, cleared after use (prevents double-approval/reject)
- ✅ Approved → status changes to "scheduled"; Rejected → stays "draft"

### Phase 5 — Carousel Visual Redesign + Telegram Fix (Mar 2026)
- ✅ Added "Profile" edit tab to ClientDetail — all 7 onboarding sections editable (Identity, Online Presence, Brand Profile, Content Assets, Automation, Voice & Training, Templates & Platforms)
- ✅ Pre-populates from existing `onboarding_data` on client load
- ✅ Backend `ClientUpdate` extended with all onboarding fields; `update_client` routes them to `onboarding_data.*` via MongoDB dot-notation, derives root fields (`industry`, `brand_voice`) from onboarding edits
- ✅ Detailed Telegram error logging (logs exact API response code + message)
- ✅ Frontend sends current form values in test request instead of relying on DB
- ✅ Rewrote all 3 carousel templates to match Twitter/X-style quote card reference
- ✅ Rewrote all 3 carousel templates (dark_card, full_white, floating_card) to match Twitter/X-style quote card reference
- ✅ Unified `_card_html` backend function with theme parameter (dark/white/cream)
- ✅ Clean layout: outer bg → card → author (avatar + name + badge + handle) → quote (flex:1) → footer
- ✅ Dynamic font sizing: 58px (short) → 32px (long), prevents overflow
- ✅ Last paragraph bold for multi-paragraph quotes (punchline emphasis)
- ✅ `@handle · Follow for more` footer on all templates
- ✅ Updated React preview components to match renderer proportions (scale=0.72)
- ✅ All 3 themes export to 1080×1350 PNG via Playwright — verified 9/10 visual quality

### Phase 4 — Client Onboarding Wizard (Feb 2026)
- ✅ 7-step onboarding wizard at `/onboard` route
- ✅ Step 1: Basic Identity (name, username, WhatsApp, email)
- ✅ Step 2: Client Assets (website, PR links, Instagram handle + access link)
- ✅ Step 3: Brand Profile (niche, problem solved, brand vibe, goals, CTA, language)
- ✅ Step 4: Content Assets (branding link, Google Drive images/videos, lead magnets)
- ✅ Step 5: Automation Setup (keywords, competitor accounts, lead sheet link, bio template)
- ✅ Step 6: Voice & Training (voice notes link, not-to-do list)
- ✅ Step 7: Templates & Platforms (carousel template visual picker, video template, platform selector)
- ✅ Step 8: Review — full data summary before submission
- ✅ Backend: `OnboardingCreate` Pydantic model + `POST /api/clients/onboard` endpoint
- ✅ Onboarding creates a new active client with full onboarding_data stored in MongoDB
- ✅ Clients page: "Onboard Client" primary CTA + "Quick Add" secondary for simple form
- ✅ Progress bar, step sidebar, back/next navigation, per-step validation
- ✅ E2E tested: all 15 test cases passed (100%)


- ✅ Pipeline model: name, content_type, template, topics, platforms, schedule, require_approval
- ✅ Dual schedule modes: Interval (every N hours) OR Specific Times (daily at HH:MM)
- ✅ Content source: AI auto-generate carousel or text post per run
- ✅ Per-platform posting: creates one post per platform per pipeline run
- ✅ Run Now: manual trigger with immediate execution
- ✅ Pause / Resume per pipeline
- ✅ Edit pipeline with pre-filled form
- ✅ Pipeline stats: total runs, success rate, last/next run time
- ✅ APScheduler runs pipelines every 5 minutes (checks next_run_at)
- ✅ Auto-logs every pipeline run to the Logs page
- ✅ Carousel Renderer page (/carousel) with dual-panel layout
- ✅ Template 1: Full White (Twitter Quote style) — pure white, large bold text
- ✅ Template 2: Floating Card — cream background, rounded white card, shadow
- ✅ AI carousel generation: picks topic from client strategy, generates 3-10 slides
- ✅ Manual creation mode: add/edit/delete slides with real-time preview
- ✅ Slide editor: textarea with char count and 280-char limit indicator
- ✅ Slide navigation: prev/next arrows + dot indicators
- ✅ Template thumbnails: mini live previews in picker
- ✅ Save carousels to DB + load/edit/delete saved carousels
- ✅ Auto-fills author info from selected client

---

## API Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/clients | List all clients |
| POST | /api/clients/onboard | Full onboarding wizard submit — creates client |
| PUT | /api/clients/:id | Update client |
| DELETE | /api/clients/:id | Delete client |
| POST | /api/clients/:id/pause | Pause automation |
| POST | /api/clients/:id/resume | Resume automation |
| GET | /api/posts | List posts (filterable) |
| POST | /api/posts | Create post manually |
| POST | /api/posts/generate | AI generate post |
| POST | /api/posts/bulk-generate | AI bulk generate |
| POST | /api/posts/:id/publish | Publish now |
| POST | /api/posts/:id/approve | Approve draft |
| GET | /api/analytics/overview | Global stats |
| GET | /api/analytics/clients/:id | Per-client stats |
| GET | /api/analytics/time-series | Historical chart data |
| GET | /api/logs | Automation logs |
| GET | /api/settings | Get settings |
| PUT | /api/settings | Update settings |
| POST | /api/settings/telegram/test | Test Telegram |
| GET | /api/automation/status | Scheduler status |
| POST | /api/automation/trigger | Manual trigger |
| POST | /api/carousel/generate | AI generate carousel |
| GET | /api/carousels | List carousels |
| POST | /api/carousels | Save carousel |
| DELETE | /api/carousels/:id | Delete carousel |

---

## Prioritized Backlog

### P0 (Core Platform)
- [ ] Real social media API publishing (Instagram Graph API, Twitter API v2, LinkedIn API)
- [ ] Platform OAuth token management per client
- [ ] Token expiry detection + Telegram alerts

### P1 (Enhancement)
- [ ] Carousel image export (html2canvas → PNG download for actual posting)
- [ ] Carousel post to content queue (schedule carousel for publishing)
- [ ] Telegram bot commands: /stats, /queue, /pause [client]
- [ ] Weekly automated Telegram report
- [ ] Content performance sync (pull real metrics from platform APIs)

### P2 (Advanced)
- [ ] Image generation per post (Gemini Nano Banana)
- [ ] Content calendar view (month/week view of scheduled posts)
- [ ] A/B testing variants
- [ ] Client-specific API key storage (encrypted)
- [ ] Multi-user / team access

---

## MOCKED Components
- **Social publishing** — `publisher.py` mock_publish() with 90% success simulation
- **Carousel export** — Slides render as HTML/CSS only, no PNG export yet
- **Platform metrics** — Performance data is randomly generated for seeded posts

---

## Notes
- AI powered by Claude Sonnet 4.5 via Emergent Universal LLM Key
- No real platform API keys needed for current MVP (all publishing mocked)
- Scheduler runs every 5 minutes to process scheduled posts
- Telegram alerts work when bot token + chat ID configured in Settings
