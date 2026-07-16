# Sleeping Creators — Functional Requirements

**What this product is:** A mobile app (iOS + Android) that lets individual content creators generate AI-written Instagram carousels and schedule them to auto-publish. The name captures the core promise: you set it up once, and content goes out while you sleep.

**Target user:** Solo Instagram creators (coaches, educators, lifestyle influencers, entrepreneurs) who know what they want to say but need help with the writing, formatting, and consistency of showing up every day.

---

## 1. Authentication

- User signs up and logs in using only phone number or email — no passwords.
- After entering identifier, a 6-digit OTP is sent via SMS or email.
- Verifying the OTP issues a JWT that is stored locally on the device.
- All protected actions require this JWT in the Authorization header.
- A 401 response from the backend auto-logs the user out and returns them to login.
- Session persists across app restarts until the user explicitly signs out.

## 2. Onboarding (first-time users only)

- After signing up, users are taken through a 3-step onboarding flow before accessing the main app.
- Step 1: Pick a content aesthetic — user selects one of the 20 predefined carousel templates that will be their default style.
- Step 2: Select content niches (interests) — e.g. Fitness, Business, Travel, Mental Health. These are used by the AI to write relevant content.
- Step 3: Confirm and finish — sets `onboarding_complete = true` on the user record.
- Users who have not completed onboarding are redirected to the onboarding flow on every app open.
- Onboarding can only be completed once. Returning users go directly to the Dashboard.

## 3. Profile & Account Settings

- User can view and edit their full name, bio, and profile photo.
- Profile photo is uploaded to Cloudflare R2 and served via CDN.
- User can update their content niches (interests) at any time after onboarding.
- Account details shown in read-only mode: email, member since date, Instagram connection status.
- User can sign out from the Settings screen.
- Settings has three tabs: Profile, Connections, Subscription.

## 4. Template Library (20 Predefined Templates)

- The app ships with exactly 20 predefined carousel design templates seeded at startup.
- Templates cover a range of visual aesthetics: dark minimal, social card (profile photo visible), cream editorial, ocean blue, rose pink, bold red, newspaper, pastel lavender, forest green, gold premium, bullet points, and others.
- Each template has: a name, a color scheme, a slide blueprint (per-slide role, content guidance, example text), a layout style, and canvas zone definitions (background color, text color, accent color, font style).
- Light-background templates (cream, white, rose, lavender, newspaper) render dark text automatically.
- The "social card" template shows the creator's profile photo, name, and handle — styled like an Instagram post screenshot.
- Users can browse templates in the Template Library page and select one when generating content.
- Users can create custom templates (via TemplateBuilder) or clone and modify existing ones.
- When no custom templates exist, the 20 predefined ones serve as the full library.
- Templates can be tagged as "video" kind to appear only in the video creation flow.

## 5. AI Carousel Generation

- User fills in: topic, tone (Educational / Entertaining / Inspirational / Professional / Casual), number of slides (3, 5, 7, or 10), target audience, key points (optional), CTA (optional), and a hook style (optional).
- User selects a carousel template before generating.
- The AI pipeline (LangGraph) runs: builds creator context → fetches trending topics → selects variety → retrieves hook templates → generates content → runs semantic similarity gate → attaches metadata.
- Creator context includes: brand voice, niche, spice level, last 50 generated pieces (anti-repeat), top 10 starred/winner pieces (style reference), and competitor accounts.
- The semantic gate blocks content that is too similar to recent posts (Jaccard similarity check). If blocked, the pipeline retries up to 2 times before returning the best available result.
- The generated carousel returns: a list of slides (each with heading, body text, speaker note), a suggested caption with hashtags, a hook, and a tone classification.
- The result is immediately shown in a slide-by-slide preview using the selected template's visual style.
- Generated content is saved as a "draft" carousel in the database.
- A content DNA record is written for every generation to power the anti-repeat and winner-reference system.

## 6. Reel Reference Analyzer

- Before generating, user can optionally paste an Instagram reel URL as a creative reference.
- The app fetches the reel's caption, hashtags, and accessibility caption via Apify (no audio transcription required).
- Claude analyzes the written content and returns: opening hook pattern, key message, tone, structure type, CTA pattern, and hook techniques used.
- This analysis is injected into the AI generation prompt to inspire the output style — not to copy it.
- User can also paste free-form text as a reference instead of a reel URL.

## 7. Slide Preview

- After generation, the user sees each slide rendered in the chosen template's visual style.
- User can navigate between slides with prev/next controls or a dot indicator.
- Each slide shows: heading, body text, decorative elements, and accents as defined by the template.
- Social card template additionally shows: creator avatar, creator name, Instagram handle, a divider, and a simulated engagement bar (Like / Comment / Share).
- Light-background templates render dark text; dark-background templates render light text — decided per template configuration.
- The preview is a faithful representation of what will be rendered as the final slide images.

## 8. Drafts Management

- All generated carousels are saved as drafts immediately after generation.
- The Drafts page shows all saved carousels with: thumbnail of first slide, topic, number of slides, creation date, and status.
- User can open a draft to review all slides and the full caption.
- User can delete a draft.
- User can approve a draft to move it to "scheduled" status.
- User can edit the scheduled date/time before approving.
- Dashboard shows a horizontal strip of the most recent drafts for quick access.

## 9. Post Scheduling

- When approving a draft, user selects a date and time to publish.
- The post record is updated with `scheduled_at` timestamp and status set to "scheduled".
- Scheduled posts appear on the Calendar page.
- User can reschedule a post by editing its date/time.
- The backend auto-publishes scheduled posts at the correct time.

## 10. Instagram Publishing

- User connects their Instagram account via Bundle.social OAuth.
- Once connected, the user's `bundle_team_id` is stored on their account.
- Publishing a post: slide images (or video) are uploaded to Bundle.social, then Bundle creates and schedules the post on Instagram.
- After successful publish: post status changes to "published", `content_dna.published` is flagged true, and the `bundle_post_id` is stored.
- If publishing fails, post status changes to "failed" and the user is notified.
- User can disconnect Instagram from Settings > Connections.
- Instagram connection status is shown on the Dashboard analytics card.

## 11. Video Content Creation

- Separate from carousel, user can upload a short video clip.
- AI generates a caption overlay script for the video.
- The app sends the clip + caption script to Shotstack for rendering.
- The rendered video can be scheduled and published to Instagram like a regular post.
- Video templates are separate from carousel templates and managed via VideoTemplateBuilder.

## 12. Calendar View

- Shows all scheduled and published posts on a monthly calendar.
- Each day shows a dot or count indicator if there are posts on that day.
- Tapping a day shows the list of posts for that day with their status.
- User can navigate between months.

## 13. Analytics

- Shows engagement data pulled from Bundle.social for connected Instagram accounts.
- Metrics include: followers, reach, impressions, engagement rate.
- Data is cached per user and refreshed on demand.
- Shown on the Analytics page and summarized on the Dashboard.

## 14. Hook Library

- A library of hook templates used by the AI during content generation.
- Global hooks (creator_id = null) ship with the app and are available to all users.
- User-specific hooks can be created and are prioritized over global hooks.
- Hooks are matched to the user's niche during generation.
- The hook library is seeded at backend startup (idempotent — only seeds if empty).

## 15. Content DNA & Winner System

- Every AI generation writes a "content DNA" record: niche, tone, hook type, key themes, semantic fingerprint.
- User can "star" a post to mark it as a winner. Starred posts have `is_winner = true` on their DNA record.
- Top 10 winner DNA records are loaded as style reference in every future generation for that user.
- Published posts have `published = true` flagged on their DNA. The AI references published + winner DNA to understand what content performs.
- The semantic gate prevents re-generating content that is too similar to any existing DNA record.

## 16. Dashboard

- First screen after login.
- Greeting with user's first name and current date.
- Four stat cards: Scheduled (count), Published (count), Drafts (count, tappable to Drafts page), Analytics (Instagram connection status, tappable to Analytics page).
- Quick action buttons: Create Post, View Calendar.
- Strip of recent draft carousels with thumbnails.
- List of 3 most recent posts with status badge and tone tag.
- "Create Post" button in the top right.
- Refreshes automatically when returning to the foreground.

## 17. Mobile-Native Behavior

- App is distributed as a native iOS (.ipa) and Android (.apk) build via Capacitor.
- Status bar is dark-styled to match the app theme.
- Splash screen hides after app loads.
- Android hardware back button exits the app if there is no navigation history, otherwise goes back.
- When the iOS soft keyboard opens, the bottom navigation bar stays visible above it (Capacitor keyboard resize mode: Body).
- Safe areas (Dynamic Island on iPhone 15, home indicator) are respected — content is never clipped behind hardware UI elements.
- The app works offline for browsing saved drafts; network features degrade gracefully.

## 18. Admin Dashboard (Internal)

- Separate web app (admin/) not visible to end users.
- Admin logs in with a secret key (not the user JWT).
- Admin can view all users, posts, carousels, and generation logs.
- Admin can manage the hook library (create, edit, delete global hooks).
- Admin can view usage stats and generation activity.
- Admin session is protected by a separate JWT with role: "admin".

---

## What is NOT in scope (current version)

- Multi-platform publishing (Twitter/X, LinkedIn, TikTok) — Instagram only via Bundle.social.
- Team accounts or agency mode — each account is a single creator.
- In-app payments or subscription billing — subscription tab is a teaser ("Pro coming soon").
- Direct Instagram API — all Instagram interaction is via Bundle.social.
- Audio transcription of reels — analysis uses only written caption/accessibility text.
- Redis caching — optional; app degrades gracefully when unavailable.
