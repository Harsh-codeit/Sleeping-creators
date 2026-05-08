# Product Requirements Document (PRD)
# AutoMonk-EM — New & Incomplete Features

**Date:** 2026-03-27
**Version:** 1.0
**Author:** AutoMonk-EM Team

---

## Feature Audit Summary

| Status | Count | Features |
|--------|-------|----------|
| ✅ Fully Exists | 7 | #2, #4, #10, #17, #19, #23, #5(partial) |
| ⚠️ Partially Exists (needs completion) | 12 | #1, #5, #6, #9, #11, #14, #15, #18, #20, #26, #27 |
| 🆕 Completely New | 9 | #3, #7, #8, #12, #13, #16, #21, #22, #24, #25, #28 |

---

## PHASE 1: Quick Wins & In-App Guides (Week 1-2)
*Low effort, high impact — documentation, UI polish, template expansion*

### F-4/5/7/8/13: In-App Help & Explanation System
**What:** Add contextual help panels/modals throughout the app explaining:
- How AI content generation works (#4)
- How strategy sessions drive content (#5)
- How assets are used in posts (#7)
- How images are selected (#8)
- How carousel content is researched & written (#13)
- How to change images in carousel (#9)
- How to update strategy (#10)

**Why:** Users don't understand the "magic" — they need transparency to trust and use the tool effectively.

**Requirements:**
- Add an `InfoButton` component (ℹ️ icon) next to key sections
- Clicking opens a side panel or modal with rich explanation
- Content sourced from `how-content-is-generated.txt` + new copy
- Pages affected: Carousel editor, ContentQueue, ClientDetail (Strategy tab), Dashboard

**Backend:** None
**Frontend:** New `HelpPanel` component, info buttons on 5+ pages
**Effort:** Small

---

### F-6: Expand to 12 Premade Templates
**What:** Add 9 more carousel/post templates (currently 3: dark_card, full_white, floating_card)

**Suggested new templates:**
1. `gradient_bold` — Bold gradient backgrounds with large text
2. `minimal_line` — Clean white with thin line accents
3. `photo_overlay` — Text over darkened photo background
4. `neon_glow` — Dark background with neon accent colors
5. `magazine_editorial` — Editorial/magazine style layout
6. `split_layout` — Half image, half text
7. `retro_vintage` — Warm tones, serif fonts
8. `corporate_clean` — Professional blue/white theme
9. `social_native` — Instagram-native casual style

**Requirements:**
- Each template: HTML/CSS in `backend/carousel_templates/`
- Preview thumbnails for template selector UI
- 1080x1350px output (existing standard)
- Support both carousel slides and single posts

**Backend:** 9 new template files in `carousel_templates/`
**Frontend:** Update template selector grid in `Carousel.js`
**Effort:** Medium

---

### F-18: CTA in Last Carousel Slide + Caption
**What:** Auto-generate a call-to-action on the last slide of every carousel and in the caption.

**Requirements:**
- AI generates a keyword (e.g., "Growth") relevant to the post topic
- Last slide text: "If you experience the same, comment the word **[KEYWORD]** and I'll send you [Lead Magnet Name]"
- Caption includes the same CTA at the end
- CTA type configurable per client: comment keyword, DM trigger, link in bio
- `cta_keyword` and `cta_lead_magnet` fields added to client profile

**Backend:** Update `ai_service.py` generation prompt, update carousel generation
**Frontend:** CTA config fields in ClientDetail, preview in carousel editor
**Effort:** Small-Medium

---

## PHASE 2: Communication & Notifications (Week 3-4)
*WhatsApp integration, email triggers, reporting*

### F-1: Email + WhatsApp Notification on Form Fill
**What:** When a new client completes onboarding, automatically send a welcome email and WhatsApp message.

**Requirements:**
- Trigger: Client onboarding form submitted (`POST /api/clients`)
- Email: Welcome email with next steps (use SendGrid or AWS SES)
- WhatsApp: Welcome message via WhatsApp Business API (Twilio or direct Meta API)
- Template-based messages (customizable)
- Log delivery status

**Backend:** New `notification_service.py` with email + WhatsApp providers
**Frontend:** Notification settings in Settings page
**Effort:** Medium

---

### F-14: Saturday WhatsApp Group Report at 8 AM
**What:** Every Saturday at 8:00 AM, send a weekly performance report to the client's WhatsApp group.

**Requirements:**
- Reuse existing `send_weekly_report()` logic from `telegram_service.py`
- Add WhatsApp Business API integration
- Report content: posts published, engagement metrics, top performing content
- Per-client WhatsApp group link stored in client profile
- Scheduler: APScheduler cron job (Saturday 8:00 AM IST)
- Fallback: Continue Telegram if WhatsApp not configured

**Backend:** New `whatsapp_service.py`, update scheduler in `server.py`
**Frontend:** WhatsApp group link field in ClientDetail
**Effort:** Medium

---

### F-15: WhatsApp Message After Posting Done
**What:** After content is published to Instagram, send a confirmation message to the client's WhatsApp group.

**Requirements:**
- Trigger: Successful publish in `publisher.py`
- Message: "✅ [Client Name] - Posting done! [Post type] published on [Platform] at [Time]"
- Include post thumbnail if available
- Uses same WhatsApp service as F-14

**Backend:** Hook into `publisher.py` post-publish flow
**Frontend:** Toggle in client settings
**Effort:** Small (after F-14 is done)

---

### F-3: Invoice Reminder Button
**What:** Add an invoice/payment reminder button in the top-right corner of the dashboard.

**Requirements:**
- Button visible on all pages (header/navbar)
- Click opens a modal showing:
  - List of clients with payment due dates
  - Status: Paid / Pending / Overdue
  - "Send Reminder" button per client (sends WhatsApp + Email)
- Client profile gets new fields: `billing_cycle`, `next_payment_date`, `payment_status`
- Auto-reminder option: send 3 days before due date

**Backend:** New `/api/invoices` endpoints (list, create, update, send-reminder)
**Frontend:** `InvoiceReminder` component in header, Invoice modal
**Effort:** Medium

---

## PHASE 3: Content Creation Power Features (Week 5-7)
*Video, recreation, manual topics, training*

### F-11 (Video): Manual Video Content Creation
**What:** Allow users to create video content manually — script, captions, b-roll notes.

**Requirements:**
- Video creation form: script text, hook, CTA, platform, duration
- AI-assisted script generation from topic
- Video metadata stored in posts collection with `type: "video"`
- Export script as formatted document

**Backend:** New video post type in schema, AI script generation endpoint
**Frontend:** Video tab in ContentQueue, script editor component
**Effort:** Medium

---

### F-21: Video B-Roll 6-Frame Template
**What:** Create a visual storyboard template for video b-roll with 6 frames.

**Requirements:**
- 6-frame grid template (like a comic strip / storyboard)
- Each frame: scene description, duration, visual notes, text overlay
- AI generates b-roll suggestions based on video script
- Export as image (storyboard) or JSON
- Template renders at 1080x1920 (vertical video format)

**Backend:** New `video_templates/` directory, storyboard renderer
**Frontend:** Storyboard editor with drag-and-drop frames
**Effort:** Large

---

### F-22: Subtitle Box for Raw Video
**What:** Add subtitle/caption text input when uploading raw video.

**Requirements:**
- Text area for adding subtitles with timestamps
- SRT format support (start time → end time → text)
- Option: Auto-generate subtitles from script (F-11)
- Store subtitles linked to video post
- Future: Burn subtitles into video (FFmpeg integration)

**Backend:** Subtitle storage schema, SRT generation endpoint
**Frontend:** Subtitle editor with timeline UI
**Effort:** Medium-Large

---

### F-12: Post Recreation from Link
**What:** Paste a URL (Instagram post, competitor content) and recreate similar content.

**Requirements:**
- Input: URL of existing post/carousel
- Backend scrapes: text, image descriptions, hashtags, format
- AI generates "inspired by" content matching the style but original
- Support: Instagram posts, LinkedIn posts, Twitter posts
- Legal: Clear "inspired by" — not copy. AI rewrites completely.
- Uses Playwright for scraping (already installed)

**Backend:** New `/api/posts/recreate-from-url` endpoint, scraping service
**Frontend:** "Recreate from Link" button in ContentQueue
**Effort:** Medium

---

### F-20: Winning References & Scripts Library
**What:** Allow clients to upload winning content, scripts, or copy examples to train the AI's style.

**Requirements:**
- New "Reference Library" section per client
- Upload: text snippets, links, file attachments
- Tag references: tone, topic, format
- AI uses references as few-shot examples in generation prompts
- Keep optional — generation works without references
- Storage: MongoDB collection `references`, files on S3

**Backend:** `/api/clients/{id}/references` CRUD endpoints, update AI prompt builder
**Frontend:** Reference library tab in ClientDetail
**Effort:** Medium

---

### F-27: Dropbox Integration for Winning Content
**What:** Connect a Dropbox folder that syncs winning content for AI training.

**Requirements:**
- OAuth2 connection to Dropbox API
- Select folder to watch for new content
- Auto-import new files as references (ties into F-20)
- Sync frequency: daily
- Supported files: images, text docs, PDFs

**Backend:** New `dropbox_service.py`, OAuth flow, sync scheduler
**Frontend:** Dropbox connect button in ClientDetail
**Effort:** Large

---

## PHASE 4: Platform & Scheduling (Week 8-10)
*Calendar, Stories, Google Sheets, mobile*

### F-28: Calendar View for Scheduled Content
**What:** Visual calendar showing all scheduled posts across clients.

**Requirements:**
- Monthly/weekly calendar view
- Color-coded by client
- Drag-and-drop to reschedule
- Click to view/edit post details
- Filter by client, platform, content type
- Shows: scheduled, published, draft posts

**Backend:** New `/api/calendar` endpoint (aggregates posts by date)
**Frontend:** New `Calendar.js` page using a calendar library (e.g., FullCalendar or react-big-calendar)
**Effort:** Medium

---

### F-24: Instagram Story After Feed Post
**What:** Option to auto-post to Instagram Stories when a feed post is published.

**Requirements:**
- Toggle per post: "Also post to Story"
- Global client setting: "Always post to Story"
- Story format: Resize feed image to 1080x1920 with branding overlay
- Uses Instagram Graph API `/me/stories` endpoint
- Delay between feed and story post (configurable, default 30 min)

**Backend:** Update `publisher.py` with story publishing, image resizer
**Frontend:** Toggle in post editor, global toggle in client settings
**Effort:** Medium

---

### F-25: Google Sheets Integration for Client Metrics
**What:** Auto-create a Google Sheet per client and update daily metrics.

**Requirements:**
- On client creation: Create new Google Sheet via Google Sheets API
- Sheet columns: Date, Posts Published, Impressions, Likes, Comments, Shares, Engagement Rate, Followers
- Daily update: APScheduler job pushes latest metrics
- Sheet link stored in client profile and accessible from dashboard
- Service account authentication (no per-user OAuth needed)

**Backend:** New `sheets_service.py`, Google Sheets API integration, daily scheduler
**Frontend:** "View Sheet" button in client analytics
**Effort:** Medium-Large

---

### F-26: Mobile-Friendly PWA
**What:** Make the app installable as a Progressive Web App for phone management.

**Requirements:**
- Add `manifest.json` and service worker
- Optimize UI for mobile breakpoints (most Tailwind responsive already)
- Add bottom navigation for mobile
- Push notifications for approvals (replaces/supplements Telegram)
- Offline: View scheduled content queue
- Install prompt on mobile browsers

**Backend:** Push notification endpoints (Web Push API)
**Frontend:** PWA setup, mobile navigation, responsive fixes
**Effort:** Medium

---

## PHASE 5: Advanced Automation (Week 11-13)
*Comment automation, advanced AI features*

### F-16: Comment Keyword Automation (ManyChat Research)
**What:** When posting content with a CTA keyword (from F-18), auto-setup comment automation to DM the lead magnet.

**Status:** RESEARCH REQUIRED

**Research Tasks:**
1. ManyChat API availability and cost analysis
2. Superprofile API feasibility (currently no API)
3. Instagram comment webhook availability
4. Alternative: Build custom comment listener using Instagram Graph API

**Possible Architecture:**
- Option A (ManyChat): API call to create automation rule → keyword trigger → DM with file link
- Option B (Custom): Webhook listener for comments → match keyword → Instagram DM API → send file
- Option C (Hybrid): Manual ManyChat setup with pre-generated keywords from our system

**Requirements (if feasible):**
- Auto-create ManyChat flow when carousel is published
- Keyword from F-18 CTA mapped to lead magnet file
- Track: comments received, DMs sent, leads generated
- Dashboard widget showing automation performance

**Backend:** Integration service (TBD based on research)
**Frontend:** Automation status per post, lead metrics
**Effort:** Large (+ research time)

---

## Phase Timeline

```
Week 1-2   ▓▓░░░░░░░░░░░  Phase 1: Help System, Templates, CTA
Week 3-4   ░░▓▓░░░░░░░░░  Phase 2: WhatsApp, Email, Invoice
Week 5-7   ░░░░▓▓▓░░░░░░  Phase 3: Video, Recreation, Training
Week 8-10  ░░░░░░░▓▓▓░░░  Phase 4: Calendar, Stories, Sheets, PWA
Week 11-13 ░░░░░░░░░░▓▓▓  Phase 5: Comment Automation Research & Build
```

## Priority Matrix

| Impact ↑ / Effort → | Small | Medium | Large |
|----------------------|-------|--------|-------|
| **High Impact** | F-18 (CTA slides), F-15 (post notification) | F-28 (Calendar), F-1 (notifications), F-12 (recreate from link) | F-16 (comment automation) |
| **Medium Impact** | Help system (F-4/5/7/8/13) | F-6 (templates), F-14 (Saturday report), F-24 (Stories), F-20 (references) | F-25 (Google Sheets), F-27 (Dropbox) |
| **Lower Impact** | — | F-3 (Invoice), F-11 (video), F-26 (PWA) | F-21 (b-roll), F-22 (subtitles) |

---

## Technical Dependencies

```
F-14 (WhatsApp service) ──→ F-15 (post notification) ──→ F-1 (form notification)
F-18 (CTA keywords) ──→ F-16 (comment automation)
F-20 (Reference library) ──→ F-27 (Dropbox sync)
F-11 (Video creation) ──→ F-21 (B-roll template) ──→ F-22 (Subtitles)
```

Build dependent features in order. WhatsApp service (F-14) is a prerequisite for F-15 and F-1.
