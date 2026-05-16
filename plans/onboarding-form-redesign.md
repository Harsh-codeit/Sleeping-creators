# Onboarding Form Redesign — Implementation Plan

**Source spec:** `Client_Onboarding_Form.pdf` (4-step client onboarding wizard)
**Current implementation:** [frontend/src/pages/Onboarding.js](../frontend/src/pages/Onboarding.js) (7 steps, 27 fields) + [backend/server.py:382-2217](../backend/server.py)
**Plan style:** Phased, copy-from-references, each phase self-contained.
**Companion plan:** [onboarding-schema-dedup.md](onboarding-schema-dedup.md) — schema/SSOT/migration concerns. Read both before executing.

---

## Skills & Agents — pick the right tool per phase

Use the `Skill` tool to invoke skills and the `Agent` tool with the named `subagent_type` to spawn agents. Defaults below — only override if the phase has been re-scoped.

| Phase | Skill (`/skill-name`) | Subagent (`subagent_type`) | Why |
|---|---|---|---|
| **Workspace setup (before P0)** | `using-git-worktrees` | — | Cross-cutting change; isolate from current branch so unrelated work stays bisectable. |
| **P0 — Decisions** | `brainstorming` | `planner` (optional) | Five blockers need product/legal calls (IG password, step count, kept-vs-dropped fields). Brainstorm-then-decide; don't code. |
| **P1 — Schema & mapping** | `test-driven-development` | `backend-dev` + `system-architect` | Pydantic round-trip tests for every new field. Architect reviews `_ONBOARDING_KEYS` / `ClientUpdate` diff for completeness. |
| **P2 — Component primitives** | `ui-styling` (or `ui-ux-pro-max` for design choices) | `coder` | Build 5 reusables once (MultiCheckbox, YesNoToggle, CappedMultiInput, LongTextarea, SubsectionHeader). Test in isolation. |
| **P3 — Step 1 UI (Basic Info)** | `subagent-driven-development` | `coder` named `step1-builder` | Independent of P4/P5/P6 once P2 lands. Run in parallel with P4-P6 via `dispatching-parallel-agents`. |
| **P4 — Step 2 UI (Story & Audience)** | `subagent-driven-development` | `coder` named `step2-builder` | Heaviest step (18 fields, 8 capped-5 multi-inputs, conditional reveal). Independent of others. |
| **P5 — Step 3 UI (Content Strategy)** | `subagent-driven-development` | `coder` named `step3-builder` | Includes the `brand_vibe`/`language` type change — pair with backend support already shipped in P1. |
| **P6 — Step 4 UI + Platforms + Submit** | `subagent-driven-development` | `coder` named `step4-builder` | Owns Review screen update and submit-payload changes. |
| **Cross-step coordination** | `dispatching-parallel-agents` | — | Spawn `step1-builder`…`step4-builder` in ONE message with `run_in_background: true`; each `SendMessage`s a `step-integrator` agent when done. |
| **P7 — Downstream consumers + migration** | `test-driven-development` + `verification-before-completion` | `backend-dev`, `performance-engineer` (migration), `tester` | Most likely to silently break AI generation. Test prompts against BOTH old-shape and new-shape clients. Migration: dry-run on `mongodump` clone first. |
| **Security audit of new free-text fields** | — | `security-auditor` + `security-architect` | `personal_story`, `business_description`, `case_study_*` flow into AI prompts — audit for prompt-injection. |
| **Cross-file dup sanity** | `pathfinder` | `system-architect` | Re-run after P7 to confirm no NEW duplicates emerged (cross-reference with `onboarding-schema-dedup.md`). |
| **P8 — Final verification** | `verification-before-completion` + `requesting-code-review` | `production-validator` + `code-review-swarm` | Evidence before assertions. E2E AI generation against both client shapes; attach prompt outputs to the PR. |
| **Branch close-out** | `finishing-a-development-branch` | `pr-manager` | Decide merge strategy; confirm migrations ran on prod BEFORE merge. |

**Coordination pattern (per CLAUDE.md):** Spawn the 4 step-builder coders in ONE `Agent` message with `run_in_background: true`, each named (`step1-builder`…`step4-builder`). Each builder's prompt names the next downstream agent to `SendMessage` (e.g. `step1-builder` → `step-integrator`). After spawning: STOP and wait for completion notifications.

---

## Phase 0 — Decisions Required Before Coding

These are NOT plan execution items; they are blockers the human must resolve so later phases are deterministic.

### D1. Instagram Password field (Step 1B, PDF row 7)
**Risk:** Storing raw Instagram passwords violates Meta TOS and creates a credential-leak liability. The existing `instagram_access_link` field already supports the Meta Business invite flow described in PDF Step 4D ("4D — Instagram Access (Final Step)").
**Recommendation:** DROP the password field. Repurpose existing `instagram_access_link` and surface Step 4D's invite copy inline in Step 1B.
**Decision needed:** Drop / Encrypt-with-consent / Defer.

### D2. Step count: 4 (PDF) vs 7 (current)
PDF defines 4 steps. Current form is 7. The new field count is ~45, so 4 steps means ~11 fields per step (acceptable with sub-sections 1A/1B/1C/1D as the PDF uses).
**Recommendation:** Match PDF — 4 steps with sub-section headers within each step. Keep the existing 8th implicit "Review" step.
**Decision needed:** 4 / 7 / 4-with-skippable-intermediate.

### D3. Fields removed by PDF but USED downstream
PDF omits these fields, but each has live readers — removing them breaks features:

| Field | Downstream impact | Recommendation |
|---|---|---|
| `automation_keywords` | `trend_service.py:45` (top-priority trend seed) | KEEP — move to optional Step 3 addendum or hide entirely (auto-derive from competitors) |
| `lead_magnets` | `ai_service.py:473` (AI brand context) | KEEP — could fit Step 4B "Lead Magnet & Funnel" (rows 3 & 4 are empty in PDF, likely placeholder for this) |
| `not_to_do_list` | `ai_service.py:505, 666` ("NEVER DO" block) | KEEP — overlaps with new "3 Topics to AVOID" (Step 3D-10). Merge: rename `not_to_do_list` → keep DB key, surface as "Topics to AVOID" in 3D |
| `bio_template` | `ai_service.py:474, 651` (brand context + hook anchor) | KEEP — overlaps with new "Personal Story" (2A-1). Decide: deprecate bio_template (let AI derive from `personal_story`) OR keep as advanced/optional. |
| `preferred_carousel_template` | `carousel_renderer.py:443/511` (template selection) | KEEP — required for rendering. Move to a post-onboarding settings panel, not the new form. |
| `preferred_video_template` | Stored only, no readers | DROP from onboarding; keep DB key for backfill compat. |
| `platforms` | IG publisher, AI prompts (root field) | KEEP — but it's already a root field, not under onboarding_data. Surface as a final pick before submit (replaces current Step 7). |
| `voice_notes_link` | Stored + Sheet export only, no AI use | DROP from onboarding. |

**Decision needed:** Per-field keep/drop/relocate. Default the plan to recommendations above unless told otherwise.

### D4. Type changes: `brand_vibe` and `language` → multi-select
Both currently `str`, both feed AI prompts via `.format()` substitution.
**Recommendation:** Keep DB type backward-compat — accept both `str` and `List[str]` server-side; serialize to comma-joined string when feeding AI prompts. Run a one-time Mongo migration to normalize existing docs.
**Decision needed:** Confirm migration approach.

### D5. Step 4B "Lead Magnet & Funnel" — rows 3 and 4 are blank in PDF
**Recommendation:** Treat as intentional placeholders for `lead_magnets` (multi-input) and a "lead magnet drive link" — matches the section title and the kept-field decision in D3.
**Decision needed:** Confirm or supply the missing copy.

---

## Phase 1 — Field Mapping & Schema Update

### What to implement
1. **Adopt the field map below** as the canonical mapping between PDF rows and DB keys. Existing keys reused wherever semantically equivalent (preserves all downstream readers).
2. **Extend `OnboardingCreate` Pydantic model** at [backend/server.py:382-416](../backend/server.py) with the new fields. Keep existing fields. Defaults must be backward-compat-safe (`""`, `[]`, `False`).
3. **Extend `_ONBOARDING_KEYS` frozenset** at [backend/server.py:1805-1813](../backend/server.py) to include every new key so `PUT /clients/{id}` routes them under `onboarding_data.*`.
4. **Extend `ClientUpdate` model** at [backend/server.py:108-154](../backend/server.py) mirroring the same additions.
5. **Update `onboard_client`** handler at [backend/server.py:2160-2217](../backend/server.py) to include new fields in the `onboarding_data` dict it builds (lines 2162-2188). Do NOT add new root mirrors unless explicitly needed by a downstream reader.

### Field Mapping (PDF → DB)

**Step 1 — Basic Info & Access**
| PDF row | DB key | Type | Source |
|---|---|---|---|
| 1A-1 Full Name | `name` | str (req) | existing |
| 1A-2 Brand Name | `brand_name` | str | NEW |
| 1A-3 Email | `email` | str | existing |
| 1A-4 WhatsApp | `whatsapp` | str | existing |
| 1A-5 City & Country | `city_country` | str | NEW |
| 1B-6 IG Username | `instagram_handle` | str | existing (load-bearing — do not rename) |
| 1B-7 IG Password | — | — | DROPPED (see D1) |
| 1B-8 IG Profile URL | `instagram_profile_url` | str | NEW |
| 1B-9 Website URL | `website_url` | str | existing |
| 1B-10 LinkedIn URL | `linkedin_url` | str | NEW |
| 1B-11 YouTube URL | `youtube_url` | str | NEW |
| 1B-12 Twitter/X URL | `twitter_url` | str | NEW |
| 1B-13 PR/Media Links | `pr_links` | List[str] | existing |
| 1C-14 Profile Photo Drive | `profile_photo_link` | str | NEW |
| 1C-15 Logo/Signature Drive | `logo_link` | str | NEW |
| 1C-16 20+ Photos Drive | `google_drive_images` | str | existing |
| 1C-17 20+ Videos Drive | `google_drive_videos` | str | existing |
| 1D-22 Account suspended | `account_suspended` | bool | NEW |
| 1D-23 Paid ads run | `paid_ads_run` | bool | NEW |

**Step 2 — Story, Brand & Audience**
| PDF row | DB key | Type | Source |
|---|---|---|---|
| 2A-1 Personal Story (500+w) | `personal_story` | str | NEW |
| 2A-2 Business Description (300+w) | `business_description` | str | NEW |
| 2A-3 One-Line Niche Statement | `niche` | str | existing (load-bearing — feeds 6+ AI prompts) |
| 2A-4 Daily Life | `daily_life` | str | NEW |
| 2B-5 Target Audience | `target_audience_description` | str | NEW (root `target_audience` is currently mirrored from `niche` — use new key to avoid collision) |
| 2B-6 Audience Age Range | `audience_age_range` | str | NEW |
| 2B-7 Audience Emotional State | `audience_emotional_state` | List[str] | NEW (multi-checkbox) |
| 2C-10 5 Solutions You Provide | `solutions_provided` | List[str] (cap 5) | NEW |
| 2C-11 5 Audience Problems | `problem_solved` + extras | hybrid | existing `problem_solved` (str) for the synthesized summary; NEW `audience_problems` (List[str], cap 5) for the 5-item version |
| 2C-12 5 Desires / Dream Outcomes | `audience_desires` | List[str] (cap 5) | NEW |
| 2C-13 5 Myths Audience Believes | `audience_myths` | List[str] (cap 5) | NEW |
| 2C-14 5 Failed Attempts | `audience_failed_attempts` | List[str] (cap 5) | NEW |
| 2C-15 5 USPs | `unique_selling_points` | List[str] (cap 5) | NEW |
| 2C-16 5 FAQs | `frequent_questions` | List[str] (cap 5) | NEW |
| 2C-17 5 Topics You Love | `love_topics` | List[str] (cap 5) | NEW |
| 2D-17 Has Case Studies | `has_case_studies` | bool | NEW |
| 2D-18 Case Study 1 | `case_study_1` | str | NEW |
| 2D-19 Case Study 2 | `case_study_2` | str | NEW |

**Step 3 — Content Strategy & Direction**
| PDF row | DB key | Type | Source |
|---|---|---|---|
| 3A-1 ONE Signature Topic | `signature_topic` | str | NEW |
| 3A-2 Brand/Writing Vibe | `brand_vibe` | List[str] | existing (TYPE CHANGE — see D4) |
| 3A-3 Content Language | `language` | List[str] | existing (TYPE CHANGE — see D4) |
| 3B-5 Working Topics in Niche | `niche_working_topics` | str | NEW |
| 3B-6 Oversaturated Topics | `niche_oversaturated_topics` | str | NEW |
| 3B-7 Underserved Topics | `niche_underserved_topics` | str | NEW |
| 3C-8 Top 8 Competitor Accounts | `competitor_accounts` | List[str] (cap 8) | existing (raise cap from N to 8) |
| 3D-9 Content You Dislike | `disliked_content` | str | NEW |
| 3D-10 3 Topics to AVOID | `not_to_do_list` | List[str] (cap 3) | existing (load-bearing — DO NOT rename) |

**Step 4 — Goals, CTA & Lead Generation**
| PDF row | DB key | Type | Source |
|---|---|---|---|
| 4A-1 Primary Goal | `account_goals` | enum (extend) | existing — extend enum to `leads / reach / followers` |
| 4A-2 Next Step | `next_step_after_view` | enum | NEW |
| 4B-3 Lead Magnets (inferred) | `lead_magnets` | List[str] | existing (see D5) |
| 4B-4 Lead Magnet Drive Link (inferred) | `lead_magnet_link` | str | NEW (see D5) |
| 4B-5 Landing Page URL | `cta_link` | str | existing |
| (post-form) Platforms picker | `platforms` | List[str] | existing (root field) |

### Verification checklist
- [ ] `OnboardingCreate` model declares every key in the field map; type matches.
- [ ] `_ONBOARDING_KEYS` contains every new key (grep `_ONBOARDING_KEYS` and diff).
- [ ] `ClientUpdate` declares every new key as Optional.
- [ ] `onboard_client` writes every new key into `onboarding_data` (grep `onboarding_data = {` and diff line count).
- [ ] Old fields NOT touched: `username`, `instagram_access_link`, `branding_assets_link`, `lead_sheet_link`, `bio_template`, `voice_notes_link`, `preferred_carousel_template`, `preferred_video_template`, `automation_keywords` — keep as-is unless D3 decides otherwise.
- [ ] No new root mirrors (do not add to lines 2192-2204 unless a downstream reader requires it).

### Anti-pattern guards
- DO NOT rename `niche`, `problem_solved`, `brand_vibe`, `account_goals`, `bio_template`, `not_to_do_list`, `automation_keywords`, `competitor_accounts`, `lead_magnets`, `website_url`, `pr_links`, `language` — all are referenced by AI prompt builders via `.get("<exact_key>")`.
- DO NOT collapse `problem_solved` (str) into `audience_problems` (List[str]) — they serve different downstream consumers.
- DO NOT add `EmailStr` validation to `email` without coordinating with backfill (existing docs may have invalid emails).

---

## Phase 2 — Frontend: New Component Primitives

Several new field types in the PDF lack a current component. Build these once, then reuse across Steps 2-4.

### What to implement
Add to top of [frontend/src/pages/Onboarding.js](../frontend/src/pages/Onboarding.js), before the existing `Step1` component. Match existing Tailwind styling tokens (`bg-zinc-950`, `border-zinc-700`, `text-zinc-400`, `font-mono` for labels — see existing `Input` at Onboarding.js:60-68 as the styling reference).

1. **`MultiCheckbox`** — multi-select chip grid. Props: `{ label, options: [{value,label}], values: string[], onChange, optional, testid }`. Use as the chip-grid pattern at Onboarding.js:506-533 (platforms picker) — copy and parametrize.

2. **`YesNoToggle`** — boolean radio pair. Props: `{ label, value: boolean, onChange, optional, testid }`. Mirror the styling of the account_goals 3-button radio at Onboarding.js:218-241.

3. **`CappedMultiInput`** — fixed-length list editor (for the 5-item and 3-item, 8-item lists). Props: `{ label, values, onChange, cap, placeholder, testid, optional }`. Wraps existing `MultiInput` at Onboarding.js:81-119; hide the "+ add" button when `values.length >= cap`.

4. **`LongTextarea`** — textarea with word-count hint. Props: `{ label, value, onChange, minWords, placeholder, testid, optional }`. Shows live `{N} / minWords words` under the field. Built on existing `Textarea` at Onboarding.js:70-79.

5. **`SubsectionHeader`** — mono uppercase divider for 1A/1B/1C/1D-style headers inside a step. Props: `{ id, label, hint }`. Pure presentational; matches existing `Label` typography (Onboarding.js:51-58).

### Verification checklist
- [ ] All five components render in isolation when wired to mock state.
- [ ] `MultiCheckbox` correctly toggles items in/out of the values array; matches existing chip-grid visual identity.
- [ ] `CappedMultiInput` enforces the cap; "+ add" button disappears at the limit.
- [ ] `LongTextarea` word count handles whitespace runs and excludes empty.
- [ ] No new external dependencies added to package.json.

### Anti-pattern guards
- DO NOT replace existing `Input`/`Textarea`/`MultiInput` — extend the system, do not refactor what works.
- DO NOT introduce a UI framework (shadcn, MUI, etc.). Keep pure Tailwind to match existing style.

---

## Phase 3 — Frontend: Step 1 (Basic Info & Access)

### What to implement
Replace the existing `Step1` and `Step2` components in [frontend/src/pages/Onboarding.js](../frontend/src/pages/Onboarding.js) with a single new `Step1` containing four sub-sections (1A/1B/1C/1D).

Reference layouts: copy field arrangements from `Step1` (Onboarding.js:123-160) for personal info, and `Step2` (Onboarding.js:163-210) for URLs.

- **1A Personal & Contact Details (5 fields):** name, brand_name, email, whatsapp, city_country
- **1B Social Media & Online Presence (7 fields, password dropped):** instagram_handle (use `@`-prefix input pattern from Onboarding.js:175-184), instagram_profile_url, website_url, linkedin_url, youtube_url, twitter_url, pr_links (existing MultiInput)
- **1C Assets Upload (4 fields):** profile_photo_link, logo_link, google_drive_images, google_drive_videos — all URL inputs with paperclip icon prefix
- **1D Instagram Account Health Check (2 fields):** account_suspended (YesNoToggle), paid_ads_run (YesNoToggle)

Update `INITIAL` state object (Onboarding.js:32-47) with the new keys and defaults.

### Verification checklist
- [ ] All 18 Step-1 fields render and write to state.
- [ ] `name` still required at step-1 validation gate (Onboarding.js:617-620).
- [ ] Step-1 sub-section headers visually match the PDF (1A / 1B / 1C / 1D).
- [ ] Form state diff sent to server includes new keys; backend persists them under `onboarding_data` (verify via Mongo shell or `GET /api/clients/{id}`).

### Anti-pattern guards
- DO NOT add the IG password field even if convenient (see D1).
- DO NOT add format validation (URL/email/phone) in this phase — defer to a dedicated validation pass after the form structure is locked.

---

## Phase 4 — Frontend: Step 2 (Story, Brand & Audience)

### What to implement
Replace existing `Step3` (Brand Profile) with new `Step2` containing 2A/2B/2C/2D sub-sections.

- **2A Story & Business (4 fields):** personal_story (`LongTextarea`, minWords=500), business_description (`LongTextarea`, minWords=300), niche (single-line `Input`, label "One-Line Niche Statement" — DB key stays `niche`), daily_life (`Textarea` rows=4)
- **2B Audience (3 fields):** target_audience_description (`Textarea`), audience_age_range (`Input`), audience_emotional_state (`MultiCheckbox`, options: Ambitious/Stressed/Confused/Motivated/Depressed/Directionless/Lonely)
- **2C Deep Audience Intelligence (8 capped-5 multi-inputs):** solutions_provided, audience_problems, audience_desires, audience_myths, audience_failed_attempts, unique_selling_points, frequent_questions, love_topics — all `CappedMultiInput cap=5`
- **2D Case Studies (3 fields):** has_case_studies (`YesNoToggle`), case_study_1 (`Textarea`, conditionally shown when has_case_studies), case_study_2 (same)

### Verification checklist
- [ ] All 18 Step-2 fields render and write to state.
- [ ] `LongTextarea` word counts update on type.
- [ ] `has_case_studies = false` hides case_study_1 and case_study_2.
- [ ] Submitting all-empty Step 2 does not block step transition (matches existing leniency).

### Anti-pattern guards
- DO NOT enforce 500/300-word minimums — display the hint but allow submit. Current form has zero blocking validation past step 1; preserve that UX contract.
- DO NOT collapse `niche` into `personal_story`. Keep them separate; AI prompts read each independently.

---

## Phase 5 — Frontend: Step 3 (Content Strategy)

### What to implement
Replace existing `Step4`/`Step5`/`Step6` content with new `Step3` containing 3A/3B/3C/3D sub-sections.

- **3A Content Positioning (3 fields):** signature_topic (`Textarea` rows=2), brand_vibe (`MultiCheckbox`, options: Professional/Rude-Bold/Funny/Inspirational/Creative/Straight-talking/Funky), language (`MultiCheckbox`, options: Hindi/English/Hinglish/Other-with-text)
- **3B Competitive Landscape (3 fields):** niche_working_topics, niche_oversaturated_topics, niche_underserved_topics — all `Textarea` rows=3
- **3C Top 8 Competitors (1 field):** competitor_accounts (`CappedMultiInput cap=8`, placeholder `@username`)
- **3D Content Boundaries (2 fields):** disliked_content (`Textarea`), not_to_do_list (`CappedMultiInput cap=3`, label "3 Topics to AVOID")

### Verification checklist
- [ ] `brand_vibe` and `language` write `List[str]` to state; backend accepts both shapes during transition.
- [ ] `competitor_accounts` enforces 8-cap; existing data with >8 entries truncates display but does not lose data on submit (use slice on render, not on state).
- [ ] AI prompt builders (`ai_service.py:471, 524, 650` for `brand_vibe`; `:456, 501` for `language`) still produce valid prompts. Test by triggering a generation against a client with new-shape `brand_vibe`.

### Anti-pattern guards
- DO NOT silently drop existing string values for `brand_vibe`/`language` — Phase 7 migration converts them.
- DO NOT remove `not_to_do_list` from the form; the DB key is load-bearing for AI's "NEVER DO" block.

---

## Phase 6 — Frontend: Step 4 + Platforms Picker + Submit

### What to implement
Replace existing `Step7` with new `Step4` containing 4A/4B sub-sections, followed by a `PlatformsPicker` block that captures the existing `platforms` requirement, then the existing `Review` step.

- **4A Primary Goal (2 fields):** account_goals (3-radio button-group, copy from existing Onboarding.js:218-241; options: leads/reach/followers), next_step_after_view (radio button-group; options: DM you / Click a link / Book a call / Enrol directly / Other-with-text)
- **4B Lead Magnet & Funnel (3 fields):** lead_magnets (`MultiInput`, existing), lead_magnet_link (`Input` URL), cta_link (`Input` URL, label "Website or Landing Page URL")
- **4D Instagram Access info card:** copy the 3-step instructions and warning verbatim from the PDF; no fields, purely informational.
- **Platforms picker:** retain the existing chip-multi-select grid from Onboarding.js:506-533 at the bottom of Step 4 (since `platforms` is required at submit).

Update `Review` (Onboarding.js:563-605) to render every new field under the appropriate section headers. Keep "No data provided" fallback (Onboarding.js:550-552).

Update `submit()` (Onboarding.js:635-656) — no structural change needed; the spread payload picks up new keys automatically. Keep the array-filter list updated for any new `List[str]` fields (`solutions_provided`, `audience_problems`, …).

### Verification checklist
- [ ] All Step-4 fields render and write to state.
- [ ] `platforms.length >= 1` validation still gates submit (Onboarding.js:621-624, 637).
- [ ] Review screen shows every new field; empties are filtered.
- [ ] End-to-end submit creates a Mongo `clients` doc whose `onboarding_data` contains every new key. Verify with `db.clients.findOne({}, {onboarding_data: 1})`.
- [ ] Existing route `/onboarding` in `App.js` still works; no link breaks in `Clients.js`.

### Anti-pattern guards
- DO NOT remove the implicit Step 8 (Review). It is the user's last sanity check.
- DO NOT change the submit endpoint or payload-wrapping shape — backend `OnboardingCreate` is the contract.

---

## Phase 7 — Downstream Consumer Updates & Migration

### What to implement

**A. AI prompt builders** — Update to read new keys where helpful:
- [backend/ai_service.py:465-510](../backend/ai_service.py) `_build_brand_context`: add optional reads for `personal_story`, `business_description`, `unique_selling_points`, `audience_desires`, `audience_problems`, `audience_emotional_state`, `signature_topic`. Existing reads of `niche`/`problem_solved`/`brand_vibe`/etc. stay unchanged. Use `.get("<key>", "")` to keep backward compat with un-migrated docs.
- [backend/ai_service.py:640-680](../backend/ai_service.py) hook-anchor builder: add `personal_story` as a hook source.
- When `brand_vibe` / `language` is a list, join with `", "` before substituting into prompt templates.

**B. ClientDetail.js edit form** — Update [frontend/src/pages/ClientDetail.js:18-51](../frontend/src/pages/ClientDetail.js) `initEditForm` to destructure every new key with safe defaults, and add corresponding UI rows in the existing edit panel (lines 251-420). Keep ordering consistent with the new wizard's 4 steps.

**C. Google Sheets export** — Update [backend/sheets_service.py:112-157](../backend/sheets_service.py) `sync_client_info_tab` to add rows for every new key (~25 new rows). Order them grouped by 1A/1B/1C/1D/2A/2B/2C/2D/3A-3D/4A-4B for readability.

**D. Mongo migration script** — Create `backend/migrations/2026_onboarding_redesign.py`:
1. For each `clients` doc: if `onboarding_data.brand_vibe` is `str`, wrap it `[brand_vibe]` (or split on `, ` if comma-separated).
2. Same for `onboarding_data.language`.
3. Backfill new keys with safe defaults (`""`, `[]`, `False`) on all existing docs.
4. Idempotent: re-running must not double-wrap arrays.
Run script once against staging Mongo; verify with sample queries before prod run.

**E. Pydantic flexibility for `brand_vibe`/`language`** — In [backend/server.py:382-416](../backend/server.py), use `Union[str, List[str]]` with a `@field_validator` that normalizes `str → [str]`. This prevents 422 errors from clients submitting either shape during the transition.

### Verification checklist
- [ ] `grep -r "onboarding\.get(\"" backend/` — every match references a key that exists in `OnboardingCreate` or is intentionally read-with-fallback.
- [ ] AI generation against a client onboarded via OLD form still produces valid output (no `KeyError`, no empty prompts).
- [ ] AI generation against a client onboarded via NEW form uses at least one new field in the assembled prompt (verify by logging the rendered prompt for a test client).
- [ ] Google Sheets "Client Info" tab shows every new field with correct values.
- [ ] `ClientDetail.js` edit panel renders every new field and round-trips a save without data loss.
- [ ] Migration script run against staging produces 0 docs with `brand_vibe` as `str` and 0 docs missing any new key.

### Anti-pattern guards
- DO NOT delete the old root mirrors (`industry`, `target_audience`, `brand_voice`, `strategy.*`) — `Clients.js:215` and `VideoCreator.js:710,742` read them.
- DO NOT drop `bio_template`, `automation_keywords`, `lead_magnets`, `not_to_do_list`, or `preferred_carousel_template` from the Pydantic model or `_ONBOARDING_KEYS` — they are still load-bearing downstream even if hidden from the new form UI.
- DO NOT run the migration in prod without first backing up the `clients` collection. Mongo doesn't have an automatic rollback.

---

## Phase 8 — Final Verification

### What to implement
1. **E2E test:** Create a new client via the new form, populating every field; verify Mongo doc shape matches `OnboardingCreate`; trigger an AI generation; verify Sheet row.
2. **Backward-compat test:** Pick an existing pre-migration client; trigger AI generation; verify no regression in output structure or empty-prompt errors.
3. **Field inventory audit:** Generate a CSV `field-audit.csv` with columns `[db_key, step, type, default, reader_files]`. Used as living documentation; commit to `docs/onboarding-fields.csv`.
4. **Remove dead constants:** Onboarding.js:13-20 `PLATFORM_COLORS` is defined but unused — delete (per `downstream-researcher` confidence).

### Verification checklist
- [ ] Both new-flow and old-flow clients generate carousels and videos successfully.
- [ ] `grep -r "not_to_do_list\|automation_keywords\|bio_template" backend/` confirms all references still point at extant keys.
- [ ] No build artifacts in `frontend/build-cta-check*` (delete in a separate cleanup PR — not in scope here).
- [ ] `field-audit.csv` enumerates every key in `OnboardingCreate`.

### Anti-pattern guards
- DO NOT call this complete without running the AI generation E2E. Renames break silently; only generation output proves the prompt builders still work.
- DO NOT skip the backward-compat test. We have live clients with the old field shape.

---

## Phase Order & Parallelization

- **Sequential required:** P1 → P3-P6 (frontend depends on Pydantic schema). P7 must come AFTER P3-P6 to test against the new form. P8 is final.
- **Can parallelize:** P2 (component primitives) can run concurrently with P1 (schema). Phases P3, P4, P5, P6 can each be a separate PR after P1+P2 land.
- **Recommended PR breakdown:** 1 PR per phase, in order. Each phase is independently mergeable if D3 decisions favor "keep old fields side-by-side with new".

## Risks & Open Items
- D1 (IG password) — blocks Phase 3 start.
- D3 (kept-vs-dropped fields) — drives Phase 7-A scope.
- D4 (multi-type for `brand_vibe`/`language`) — drives Phase 7-D migration script complexity.
- The 3135-line `ClientDetail.js` was not fully read by research; Phase 7-B may discover additional consumer sites in tabs 1740-3135 that need updating. Allocate buffer.
