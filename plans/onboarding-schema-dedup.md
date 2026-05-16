# Onboarding Schema — Deduplicated Design

**Companion to:** [onboarding-form-redesign.md](onboarding-form-redesign.md) (UI/form plan)
**Goal:** New onboarding form writes EVERY concept to exactly ONE place. Other tabs READ from that single source. Existing client documents continue to work without re-onboarding. Zero data loss.
**Sources:** drift-reader-map and clientupdate-schema research reports (in conversation context).

---

## 1. Design Principles

1. **Single source of truth (SSOT):** Every concept owns exactly one DB key. That key lives under `onboarding_data.<key>`.
2. **Derived mirrors are write-only outputs of a single function.** Code never edits a mirror directly; mirrors are recomputed from the canonical key on every write.
3. **Other tabs read-only against canonical keys.** Strategy tab, Overview tab, Platforms tab — none of them write to a concept owned by onboarding. They read `onboarding_data.<key>` or its derived mirror.
4. **No destructive migrations.** Existing documents are recomputed in-place (idempotent). No keys are deleted from existing docs in the same release that introduces the new schema. Cleanup of legacy keys is a separate, later release.
5. **Backward-compat read shim.** Server returns a "canonical view" computed at response time, so frontend code that reads either old or new keys keeps working.
6. **No new infra.** Mongo, motor, FastAPI, Pydantic — no Alembic, no schema_version field, no migration framework. Use a one-shot script in `backend/migrations/` (matches existing pattern at `001_creatomate_migration.py`).

---

## 2. Canonical Schema (after this plan)

### 2.1 Document layout

```
db.clients/<doc>
├── id, name, status, avatar, platforms,        ← root: identity + lifecycle only
│   platform_configs, profile_photo_url,
│   created_at, posts_today, posts_total,
│   posts_failed, last_post_at,
│   onboarding_complete, schema_version: 2     ← NEW: marks docs migrated
│
├── onboarding_data: { ... }                    ← SSOT for every onboarding concept
│
├── strategy: { themes, hashtags, topics_include,
│              video_hooks, video_prompt }      ← UI-owned, distinct concepts only
│
├── drive_folder_id, drive_images_folder_id,    ← root: integration state (UNCHANGED)
│   drive_images_index, video_*_*, auto_approve,
│   brand_overrides, bio
│
└── _derived: {                                 ← NEW: cache of derived mirrors
      industry, target_audience, brand_voice,     (read-only, recomputed on write)
      tone, topics_exclude_view, goals_view,
      cta_link_view, language_view
    }
```

The `_derived` sub-doc is a single, clearly-named cache of "values you might want to read by an old name". Every value in it is a pure function of `onboarding_data`. Nothing writes to it directly except the recompute function. Old code that reads root `industry` or `strategy.tone` continues to work via a **read-time view** (see §4).

### 2.2 Per-concept canonical decisions

| Concept | SSOT (canonical key) | Derived mirrors maintained for legacy reads | Orphans deleted from new writes |
|---|---|---|---|
| Niche / industry | `onboarding_data.niche` | root `industry`, root `target_audience` (independent semantic slots, derived from niche by default but editable in `onboarding_data.target_audience_description` and `onboarding_data.industry_label` overrides — see §2.3) | — |
| Brand tone | `onboarding_data.brand_vibe` | root `brand_voice`, `strategy.tone` | — |
| Goals | `onboarding_data.account_goals` | — | `strategy.goals` (0 readers — stop writing) |
| CTA link | `onboarding_data.cta_link` | — | `strategy.cta_link` (0 readers — stop writing) |
| Language | `onboarding_data.language` | — | `strategy.language` (0 readers — stop writing) |
| Avoid topics | `onboarding_data.not_to_do_list` | `strategy.topics_exclude` (kept as a derived view because `video_render_service.py:26` reads it) | — |
| Bio (intro) | root `bio` | — | (NOT a duplicate — `bio_template` is a separate semantic slot; keep both) |
| Brand positioning | `onboarding_data.bio_template` | — | — |

**Rationale per concept:**

- **Niche family** — `industry` and `target_audience` have **15+** and **5** independent AI-prompt readers respectively. Collapsing them is too risky and they serve distinct semantic slots (`industry` is a 1-word category label like "Fitness" used in author_title strings; `target_audience` is a descriptor like "busy moms 28-40"). The new form gives the user TWO inputs that derive separately:
  - `onboarding_data.niche` — the one-line positioning statement ("I help busy moms lose 10kg")
  - `onboarding_data.industry_label` (NEW) — short category label (defaults to first word of niche if not provided)
  - `onboarding_data.target_audience_description` (NEW, from PDF 2B-5) — explicit audience descriptor
- **Brand tone** — `strategy.tone` has the most direct AI-prompt readers (6) and is the primary key in fallback chains like `strategy.tone || brand_voice || "professional"`. But the user-facing field is "Brand Vibe". So `brand_vibe` stays SSOT, `strategy.tone` and `brand_voice` are derived. No reader changes.
- **Orphans (`strategy.goals`, `strategy.cta_link`, `strategy.language`)** — Zero readers anywhere. Stop writing them. Existing docs keep them but the migration leaves them alone (purely additive change).
- **Avoid topics** — `not_to_do_list` and `topics_exclude` are written by two different UIs but feed two different code paths. Converge on `not_to_do_list` as SSOT; update `video_render_service.py:26` to read `onboarding_data.not_to_do_list` first, fall back to `strategy.topics_exclude` for legacy docs. Strategy tab loses its `topics_exclude` edit chip; it becomes a read-only mirror or is removed entirely.
- **Bio / bio_template** — NOT duplicates. `_build_brand_context` at `ai_service.py:468,474` reads them on two different lines for two different prompt slots ("Client introduction" vs "Brand positioning"). Keep both.

### 2.3 New `onboarding_data` shape (after this plan)

Combining the 25 existing keys (per `_ONBOARDING_KEYS` at server.py:1805-1813) + the ~25 new keys from the PDF spec. ALL onboarding concepts live here. No exceptions.

```python
# Pydantic model in backend/server.py — replaces OnboardingCreate
class OnboardingData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # — Step 1A: Personal & Contact —
    name: str                           # required (existing)
    brand_name: str = ""                # NEW
    email: str = ""                     # existing (was: str)
    whatsapp: str = ""                  # existing
    city_country: str = ""              # NEW

    # — Step 1B: Social & Online —
    instagram_handle: str = ""          # existing (was: str)
    instagram_profile_url: str = ""     # NEW
    instagram_access_link: str = ""     # existing (kept for Meta-invite workflow)
    website_url: str = ""               # existing
    linkedin_url: str = ""              # NEW
    youtube_url: str = ""               # NEW
    twitter_url: str = ""               # NEW
    pr_links: List[str] = []            # existing

    # — Step 1C: Assets (Drive links) —
    profile_photo_link: str = ""        # NEW
    logo_link: str = ""                 # NEW
    google_drive_images: str = ""       # existing
    google_drive_videos: str = ""       # existing
    branding_assets_link: str = ""      # existing (kept; not in PDF but still consumed)

    # — Step 1D: Account Health —
    account_suspended: bool = False     # NEW
    paid_ads_run: bool = False          # NEW

    # — Step 2A: Story & Business —
    personal_story: str = ""            # NEW
    business_description: str = ""      # NEW
    niche: str = ""                     # existing (load-bearing — DO NOT RENAME)
    industry_label: str = ""            # NEW — short category, derives industry if empty
    daily_life: str = ""                # NEW

    # — Step 2B: Audience —
    target_audience_description: str = ""  # NEW — derives root target_audience
    audience_age_range: str = ""        # NEW
    audience_emotional_state: List[str] = []  # NEW

    # — Step 2C: Deep Audience Intelligence (5 each) —
    solutions_provided: List[str] = []  # NEW (cap 5)
    audience_problems: List[str] = []   # NEW (cap 5)
    audience_desires: List[str] = []    # NEW (cap 5)
    audience_myths: List[str] = []      # NEW (cap 5)
    audience_failed_attempts: List[str] = []  # NEW (cap 5)
    unique_selling_points: List[str] = []  # NEW (cap 5)
    frequent_questions: List[str] = []  # NEW (cap 5)
    love_topics: List[str] = []         # NEW (cap 5)
    problem_solved: str = ""            # existing (kept — read by AI as summary)

    # — Step 2D: Case Studies —
    has_case_studies: bool = False      # NEW
    case_study_1: str = ""              # NEW
    case_study_2: str = ""              # NEW

    # — Step 3A: Positioning —
    signature_topic: str = ""           # NEW
    brand_vibe: Union[str, List[str]] = ""  # existing (was str; now Union for migration)
    language: Union[str, List[str]] = ""    # existing (was str; now Union for migration)

    # — Step 3B: Competitive Landscape —
    niche_working_topics: str = ""      # NEW
    niche_oversaturated_topics: str = ""  # NEW
    niche_underserved_topics: str = ""  # NEW

    # — Step 3C: Competitors —
    competitor_accounts: List[str] = []  # existing (cap raised to 8)

    # — Step 3D: Boundaries —
    disliked_content: str = ""          # NEW
    not_to_do_list: List[str] = []      # existing (load-bearing; cap 3 in new UI)

    # — Step 4A: Goal & Next Step —
    account_goals: str = "followers"    # existing
    next_step_after_view: str = ""      # NEW

    # — Step 4B: Lead Magnet & Funnel —
    lead_magnets: List[str] = []        # existing
    lead_magnet_link: str = ""          # NEW
    cta_link: str = ""                  # existing

    # — Deprecated but kept for backward compat (legacy clients only) —
    username: str = ""                  # existing (subsumed by instagram_handle in new UI)
    lead_sheet_link: str = ""           # existing
    bio_template: str = ""              # existing (distinct from bio per §2.2)
    voice_notes_link: str = ""          # existing (read by Sheets export only)
    automation_keywords: List[str] = []  # existing (load-bearing — trend_service)
    preferred_carousel_template: str = "full_white"  # existing (load-bearing — renderer)
    preferred_video_template: str = ""  # existing
```

`platforms` and `name` remain root fields (matching current behavior); `platforms` is captured at the end of the wizard.

---

## 3. Write Path — Single Derivation Function

### 3.1 The recompute function

Add to `backend/server.py` (near the model declarations, before `onboard_client`):

```python
_LEGACY_DERIVED_KEYS = (
    # paths we keep updating for backward-compat reads
    "industry",                  # root
    "target_audience",           # root
    "brand_voice",               # root
    "strategy.tone",
    "strategy.topics_exclude",
)

def _recompute_derived(client: dict) -> dict:
    """
    Pure function: given a client doc, return a dict of $set updates
    that recompute every legacy-readable mirror from onboarding_data.
    Never raises. Idempotent.
    """
    ob = client.get("onboarding_data") or {}
    set_doc: dict = {}

    # niche family
    niche = (ob.get("niche") or "").strip()
    industry_label = (ob.get("industry_label") or "").strip()
    target_audience_description = (ob.get("target_audience_description") or "").strip()
    if niche or industry_label:
        # industry: explicit label wins; else first word of niche; else preserve
        set_doc["industry"] = industry_label or (niche.split()[0] if niche else client.get("industry", ""))
    if niche or target_audience_description:
        set_doc["target_audience"] = target_audience_description or niche or client.get("target_audience", "")

    # brand tone
    raw_vibe = ob.get("brand_vibe")
    vibe_str = ", ".join(raw_vibe) if isinstance(raw_vibe, list) else (raw_vibe or "")
    if vibe_str:
        set_doc["brand_voice"] = vibe_str
        # strategy.tone is dot-pathed so we don't trample sibling strategy.* keys
        set_doc["strategy.tone"] = vibe_str

    # avoid-topics convergence
    avoid_list = ob.get("not_to_do_list") or []
    if avoid_list:
        set_doc["strategy.topics_exclude"] = list(avoid_list)

    # language for strategy view (no consumer today, but kept consistent for the future)
    lang = ob.get("language")
    if isinstance(lang, list):
        lang = ", ".join(lang)
    if lang:
        # we deliberately do NOT write strategy.language anymore (orphan)
        pass

    # mark version
    set_doc["schema_version"] = 2
    return set_doc
```

Rules for the function:
- **Never overwrites a non-empty value with empty.** If `niche` is unset, do not clobber an existing `industry`.
- **Never writes orphans** (`strategy.goals`, `strategy.cta_link`, `strategy.language`).
- **Always sets `schema_version: 2`** so we can tell migrated docs apart.

### 3.2 Wire-up at write points

Three places call this function:

1. **`onboard_client` handler** (server.py:2160-2217) — after building `onboarding_data`, run `_recompute_derived(client_doc_in_memory)` and merge into the insert payload. Remove the manual `strategy.goals/cta_link/language` writes (lines 2202-2204) — those become orphan-stop.

2. **`update_client` PUT handler** (server.py:1815-1843) — after the existing dispatch loop builds `set_doc`, fetch the post-update onboarding state (in-memory merge), run `_recompute_derived`, and merge into `set_doc`. Replace the four ad-hoc mirror blocks (lines 1828-1836) with this single call.

3. **NEW endpoint: `POST /api/clients/{id}/recompute-derived`** — admin-only utility that runs `_recompute_derived` for a single doc. Used by the migration script and for manual repair.

After this, **no other code path writes to `industry`, `target_audience`, `brand_voice`, `strategy.tone`, `strategy.topics_exclude`**. Direct writes are forbidden by code review; runtime enforcement is enough because only two handlers can mutate clients (`onboard_client` and `update_client`) and both go through `_recompute_derived`.

### 3.3 Remove the `saveStrategy` destructive-$set bug

[ClientDetail.js:1546-1563](../frontend/src/pages/ClientDetail.js#L1546) currently sends `{ strategy: {...} }` which `update_client` writes as `set_doc["strategy"] = v` (server.py:1820-1826). This is a $set of the whole sub-doc — it wipes `strategy.tone`, `strategy.goals`, `strategy.cta_link`, `strategy.language`, `strategy.topics_exclude` if not included in the payload.

Fix in the backend, not the frontend: when handling the `strategy` key, dot-path each sub-key instead of replacing the dict:

```python
# Replace lines 1820-1826 with:
for k, v in raw.items():
    if v is None:
        continue
    if k == "strategy" and isinstance(v, dict):
        # dot-path so we don't trample sibling keys
        for sk, sv in v.items():
            set_doc[f"strategy.{sk}"] = sv
    elif k in _ONBOARDING_KEYS:
        set_doc[f"onboarding_data.{k}"] = v
    else:
        set_doc[k] = v
```

This is a defect fix; ship it independently if convenient.

---

## 4. Read Path — Per-Tab Single-Source Contract

After this plan, the rule for every tab is: **read the canonical key first; legacy keys are fallback only for un-migrated docs**.

### 4.1 ClientDetail.js — per-tab field source map

| Tab | Concept | Reads from | Writes to | Notes |
|---|---|---|---|---|
| **Overview** | Industry display | `_derived.industry` → fallback `client.industry` → fallback `onboarding_data.niche` | — (read-only) | Currently reads `client.industry` ([:1809](../frontend/src/pages/ClientDetail.js#L1809)) |
| Overview | Brand voice display | `_derived.brand_voice` → fallback `client.brand_voice` → fallback `onboarding_data.brand_vibe` | — | Currently reads `client.brand_voice` ([:1810](../frontend/src/pages/ClientDetail.js#L1810)) |
| Overview | Target audience display | `_derived.target_audience` → fallback `client.target_audience` → fallback `onboarding_data.target_audience_description` | — | Currently reads `client.target_audience` ([:1811](../frontend/src/pages/ClientDetail.js#L1811)) |
| Overview | Bio | `client.bio` | — | NOT a duplicate, keep as-is |
| **Strategy** | Tone of voice input | **REMOVED** | — | Edit moved exclusively to Profile tab (`onboarding_data.brand_vibe`). Strategy tab shows read-only mirror sourced from `_derived.tone`. |
| Strategy | Topics_exclude chips | **REMOVED** | — | Edit moved exclusively to Profile tab (`onboarding_data.not_to_do_list`). Strategy tab shows read-only mirror. |
| Strategy | Themes input | `strategy.themes` | `strategy.themes` (dot-paths via §3.3 fix) | UI-owned; no duplicate |
| Strategy | Hashtags input | `strategy.hashtags` | `strategy.hashtags` | UI-owned; no duplicate |
| Strategy | Topics_include chips | `strategy.topics_include` | `strategy.topics_include` | UI-owned; no duplicate |
| Strategy | Video hooks | `strategy.video_hooks` | `strategy.video_hooks` | UI-owned; no duplicate |
| Strategy | Video prompt override | `strategy.video_prompt` | `strategy.video_prompt` | UI-owned; no duplicate |
| **Profile** | Every onboarding field | `onboarding_data.*` (canonical) | `onboarding_data.*` via PUT | This is the ONLY tab that edits onboarding concepts. |
| **Platforms** | platforms array | `client.platforms` | `client.platforms` + `client.platform_configs` | Root-owned; no duplicate |

Concrete code change in `ClientDetail.js`:
- Remove the Strategy tab's `tone` input ([:1901-1909](../frontend/src/pages/ClientDetail.js#L1901)) — replace with a read-only display.
- Remove the Strategy tab's "Never Cover" chip editor ([:1967-2002](../frontend/src/pages/ClientDetail.js#L1967)) — replace with a read-only chip display sourced from `onboarding_data.not_to_do_list`.
- Update `saveStrategy` at [:1546-1563](../frontend/src/pages/ClientDetail.js#L1546) to no longer include `tone` or `topics_exclude` in the payload.

### 4.2 Reader-code changes (backend)

For each file that currently reads a duplicated key, switch to the canonical source with safe fallback. **All changes are additive — old key reads kept as fallback to support un-migrated docs.**

| File:line | Before | After |
|---|---|---|
| `ai_service.py:153,500,637,838` | `strategy.get("tone", client.get("brand_voice", "professional"))` | `_get_tone(client)` — helper that returns `onboarding_data.brand_vibe` (joined if list) → fallback to existing chain |
| `competitor_service.py:455-457` | 3-step fallback chain | use same `_get_tone(client)` helper |
| `video_render_service.py:26` | `strategy.get("topics_exclude") or []` | `client.get("onboarding_data", {}).get("not_to_do_list") or strategy.get("topics_exclude") or []` |
| `ai_service.py:165, 499, 636, …` | `client.get("industry", "...")` | unchanged — `_derived.industry` is mirrored into root `industry` by recompute, so existing reads are fine |
| (all other duplicate readers) | unchanged | rely on derived mirrors |

Net code change in backend = **one new helper (`_get_tone`)** + **one read fallback update** (`video_render_service.py:26`). All other existing reads keep working because mirrors are maintained.

### 4.3 Reader-code changes (frontend)

| File:line | Before | After |
|---|---|---|
| `ClientDetail.js:31` (`niche: ob.niche \|\| client.industry \|\| ""`) | unchanged — keep fallback chain for legacy clients | unchanged |
| `ClientDetail.js:33` (`brand_vibe: ob.brand_vibe \|\| client.brand_voice \|\| ""`) | unchanged | unchanged |
| `ClientDetail.js:1458` (Strategy form tone init) | derived from server | **REMOVE** — Strategy form drops `tone` field per §4.1 |
| `ClientDetail.js:1461` (Strategy form topics_exclude init) | from `s.topics_exclude` | **REMOVE** per §4.1 |
| `Clients.js:215, 500` | `client.industry \|\| ""` | unchanged |
| `VideoCreator.js:710, 742` | `c.niche \|\| c.industry \|\| ""` | unchanged |
| `Dashboard.js:198` | `client.industry` | unchanged |
| `Carousel.js:482` | `c.industry \|\| ""` | unchanged |

Net frontend change: only the Strategy tab edit surface is removed (UI dedup); every other consumer reads from mirrors that are maintained.

---

## 5. Backward Compatibility — Existing Clients Untouched

Three types of existing client docs in the database:

| Doc shape | Created by | Has `onboarding_data`? | Has `strategy.*`? | Risk |
|---|---|---|---|---|
| **Quick Add client** | `POST /api/clients` | NO | NO | Low — readers already use `.get(..., default)` |
| **Onboarded client (pre-rewrite)** | `POST /api/clients/onboard` (current) | YES (25 keys) | YES (8 keys: themes/tone/hashtags/goals/cta_link/language/topics_include/topics_exclude/video_hooks/video_prompt — varies) | Medium — has all the duplicates |
| **Onboarded client (post-rewrite)** | `POST /api/clients/onboard` (new) | YES (~50 keys) | YES (5 keys: themes/hashtags/topics_include/video_hooks/video_prompt) | None — by construction |

### 5.1 What does NOT change for existing docs
- No keys are deleted from existing documents at migration time.
- `strategy.goals`, `strategy.cta_link`, `strategy.language` (orphans) remain on disk. Future writes stop touching them. They linger harmlessly.
- All root mirrors (`industry`, `target_audience`, `brand_voice`) remain populated. Migration re-derives them but does not delete them.
- All `onboarding_data` fields remain. New fields are added with empty defaults via the migration script (or implicitly via Pydantic defaults on next read).
- Quick Add clients without `onboarding_data` continue to work; nothing in the new path requires it. `_recompute_derived` handles the empty case (`set_doc` stays small).

### 5.2 One-shot migration script

Create `backend/migrations/002_onboarding_schema_dedup.py`:

```python
# Pseudocode
async def migrate():
    async for doc in db.clients.find({}):
        # 1. Recompute derived mirrors (idempotent)
        updates = _recompute_derived(doc)

        # 2. Normalize brand_vibe / language type drift
        ob = doc.get("onboarding_data") or {}
        # (do not change values; only normalize empty/null)

        # 3. NEVER delete keys. Only $set.
        if updates:
            await db.clients.update_one({"_id": doc["_id"]}, {"$set": updates})

        # 4. Stamp schema_version even on quick-add docs without onboarding_data
        if "schema_version" not in doc:
            await db.clients.update_one({"_id": doc["_id"]}, {"$set": {"schema_version": 2}})
```

Properties:
- **Idempotent** — re-running has no effect after the first pass.
- **Purely additive** — no `$unset`, no key deletions.
- **Safe to run while traffic is live** — every write goes through `_recompute_derived` anyway after this release; the script just catches up the rest.
- **No backup required as a hard prerequisite** — but take one anyway (Mongo `mongodump` of `clients` collection).

### 5.3 Type-change handling for `brand_vibe` and `language`

New form may write `List[str]`; old docs have `str`. Pydantic `Union[str, List[str]]` accepts both. `_recompute_derived` and `_get_tone` join lists with `", "` before substituting into prompts. No migration step required for this — values stay as-is on disk; only the read-side helpers normalize.

### 5.4 Quick Add path (`POST /api/clients`) — separate decision

Currently `POST /api/clients` creates clients **without `onboarding_data`**. New form is invoked only via `/onboarding`. Two options:
- **A (recommended):** Keep Quick Add as-is. It produces minimal docs that have no onboarding_data; readers already handle this. No change needed.
- **B:** Deprecate Quick Add; force every new client through the wizard. Out of scope for this plan.

Recommend A.

---

## 6. Implementation Order — with Recommended Skill / Agent per Step

Each step is independently shippable and reversible. Every step lists the **best skill** (from the user-invocable skill library) and **best subagent** (from the named-agent roster) for the work — pick these defaults unless a step has been re-scoped.

### 6.0 Skills & Agents Cheat Sheet

| Phase of work | Skill (`/skill-name`) | Subagent (`subagent_type`) | Why |
|---|---|---|---|
| Branch isolation before starting | `using-git-worktrees` | — | This is a cross-cutting schema change; isolate from `feat/creatomate-migration` so unrelated work stays bisectable. |
| Pre-flight context loading | `mem-search` → `learn-codebase` | `researcher` | Reuse the research already in `plans/`; only re-prime if a teammate picks up the plan cold. |
| Defect fixes (Step 1) | `systematic-debugging` + `test-driven-development` | `backend-dev` then `tester` | Write the failing test that proves `saveStrategy` wipes siblings BEFORE patching the handler. |
| New pure functions (`_recompute_derived`, `_get_tone`) | `test-driven-development` | `backend-dev` | Pure, idempotent functions deserve property tests + fixture-based tests for all three doc shapes (Quick-Add, pre-rewrite onboarded, post-rewrite onboarded). |
| Pydantic model + allow-list edits | `test-driven-development` | `backend-dev` | Round-trip test: payload → model → dict → Mongo shape → re-read → equal. |
| Mongo migration script | `verification-before-completion` | `backend-dev` then `tester` | Dry-run on a `mongodump` restore of prod into a sandbox. Idempotent re-run check. NEVER ship without backup. |
| Reader updates (`video_render_service.py:26`, prompt fallbacks) | `test-driven-development` | `backend-dev` | Fixture both shapes (old `strategy.topics_exclude` set, new `onboarding_data.not_to_do_list` set) and assert prompts contain the right value. |
| Frontend new form components | `brainstorming` → `ui-ux-pro-max` (or `ui-styling`) | `coder` (mobile/web) | Brainstorm form UX (sub-section ordering, microcopy, error states) before any JSX. Then build primitives once, reuse. |
| Multi-step form in parallel | `dispatching-parallel-agents` + `subagent-driven-development` | `coder` × N | Steps 1, 2, 3, 4 frontend implementations are largely independent after primitive components land — fan them out. |
| Strategy tab demotion | `test-driven-development` | `coder` | UI removal needs a regression test: confirm `saveStrategy` payload no longer contains `tone`/`topics_exclude`. |
| Cross-file refactor sanity | `pathfinder` | `system-architect` | Run before merging to confirm no NEW duplicates were introduced; produces a refreshed dup-map vs. the one from this plan. |
| Security review of write path | — | `security-architect` + `security-auditor` | `onboard_client` accepts user input that becomes prompt context; verify no injection paths via the new free-text fields (`personal_story`, `business_description`). |
| Performance review of migration | — | `performance-engineer` | Migration touches every doc; benchmark on a clone of prod-sized data before running. |
| Final integration review | `requesting-code-review` | `code-review-swarm` (multi-agent) | Multi-perspective review for a schema change blast-radius. |
| Marking work done | `verification-before-completion` | `production-validator` | Evidence before assertions. Run AI generation E2E against old AND new doc shapes; show prompt outputs. |
| Branch close-out | `finishing-a-development-branch` | `pr-manager` | Decide merge strategy; ensure migration ran on prod before merge. |

### 6.1 Step-by-step

1. **Defect fix: dot-path the `strategy` $set in PUT handler** (§3.3). One backend change, ~6 lines. Stops `saveStrategy` from wiping orphan keys. Ship first.
   - **Skill:** `systematic-debugging` (reproduce the wipe), then `test-driven-development` (failing test first).
   - **Agent:** `backend-dev` for the patch, `tester` for the regression test.
   - **Done when:** A test inserts a doc with `strategy.goals` set, posts a Strategy-tab save, and asserts `strategy.goals` is still present.

2. **Add `_recompute_derived` function + wire into `onboard_client` and `update_client`** (§3). Remove ad-hoc mirror blocks. Stop writing orphans. Verify with a manual onboarding round-trip.
   - **Skill:** `test-driven-development` — pure function, test it in isolation against all three doc shapes from §5.
   - **Agent:** `backend-dev`. Spawn a `reviewer` in parallel to audit "no direct mirror writes outside the function".
   - **Done when:** Every existing test still passes AND a new test confirms `_recompute_derived` is idempotent (running twice = same result).

3. **Run migration `002_onboarding_schema_dedup.py`** (§5.2) against staging Mongo. Verify every doc gets `schema_version: 2` and that mirrors are populated. Then run prod.
   - **Skill:** `verification-before-completion` — staging dry-run, then prod with backup.
   - **Agent:** `backend-dev` writes the script; `performance-engineer` benchmarks; `tester` validates idempotency by running it twice.
   - **Pre-flight (MANDATORY):** `mongodump --collection=clients` before prod run.
   - **Done when:** `db.clients.countDocuments({schema_version: 2})` equals total client count, AND a sample of 10 docs shows mirrors match canonical values, AND no key was deleted (compare against `mongodump`).

4. **Extend `OnboardingData` Pydantic model** (§2.3) with all new fields. Extend `_ONBOARDING_KEYS` allow-list to include new keys. Extend `ClientUpdate` mirrors. Ship; no UI change yet — new fields just default to empty.
   - **Skill:** `test-driven-development` for the model.
   - **Agent:** `backend-dev`.
   - **Done when:** Sending a payload with new fields via `POST /clients/onboard` persists them under `onboarding_data.*`; existing clients are unaffected.

5. **Add `_get_tone` helper + update `video_render_service.py:26`** (§4.2). Tests pass with old and new doc shapes.
   - **Skill:** `test-driven-development`.
   - **Agent:** `backend-dev`.
   - **Done when:** Both fixtures (old `strategy.topics_exclude` set, new `onboarding_data.not_to_do_list` set) produce prompts with the right "Never cover" line.

6. **Frontend: build the new 4-step onboarding form** per [onboarding-form-redesign.md](onboarding-form-redesign.md). Writes to the extended `OnboardingData`.
   - **Skill:** `brainstorming` first (UX), then `ui-ux-pro-max` for component design choices, then `subagent-driven-development` with `dispatching-parallel-agents` once the primitives (Phase 2 in the UI plan) are in.
   - **Agents:** spawn 4 `coder` agents named `step1-builder`, `step2-builder`, `step3-builder`, `step4-builder`, each owning one PDF step. Coordinate via `SendMessage` per the CLAUDE.md pipeline pattern.
   - **Done when:** End-to-end submit of the new form creates a Mongo doc with every new key populated.

7. **Frontend: remove Strategy tab's `tone` and `topics_exclude` editors** (§4.1) — replace with read-only mirrors. Update `saveStrategy` payload to not include those keys.
   - **Skill:** `test-driven-development` (regression test for payload shape).
   - **Agent:** `coder`.
   - **Done when:** `saveStrategy` network payload contains only `themes/hashtags/topics_include/video_hooks/video_prompt` — verified via test or network-tab inspection.

8. **Frontend: extend Profile tab edit form** to expose all new onboarding fields (per `onboarding-form-redesign.md` Phase 7-B).
   - **Skill:** `ui-styling` (extends existing Profile tab styling).
   - **Agent:** `coder`.
   - **Done when:** Every new field round-trips via the Profile-tab edit save.

9. **Verification pass** (§7).
   - **Skill:** `verification-before-completion` + `requesting-code-review`.
   - **Agents:** `production-validator` for E2E, `code-review-swarm` for multi-perspective review, `security-auditor` for prompt-injection audit of new free-text fields.
   - **Done when:** Every checklist item in §7 is checked, with evidence (logs, screenshots, test output) attached to the PR.

Steps 1, 2, 3 are independent of UI work and can land immediately. Steps 4–8 require the UI work from `onboarding-form-redesign.md`. Step 9 is final.

---

## 7. Verification

### 7.1 Schema invariants (post-release)
- [ ] Every write to `clients` collection goes through `onboard_client` or `update_client`. Grep `db.clients.update_one|db.clients.insert_one` in `backend/*.py` confirms only those two sites mutate the collection (modulo the migration script).
- [ ] After `_recompute_derived` runs, `client["_derived"]["industry"] == client["industry"]` and `client["_derived"]["brand_voice"] == client["brand_voice"]`. (Note: `_derived` is conceptual in this plan; if we choose to skip the literal `_derived` sub-doc, mirrors live directly at root — verify root parity instead.)
- [ ] `strategy.goals`, `strategy.cta_link`, `strategy.language` are NOT set on any newly-created doc post-release. Old docs unchanged.
- [ ] Every doc has `schema_version: 2`.

### 7.2 Reader integrity
- [ ] AI generation against an existing (pre-migration) client still produces valid output. No `KeyError`, no empty prompts.
- [ ] AI generation against a NEW client (created via new form) includes at least one new-field reference in the rendered prompt (verify by logging).
- [ ] `video_render_service` builds a "never cover" line that prefers `onboarding_data.not_to_do_list` over `strategy.topics_exclude`.
- [ ] Strategy tab in the UI no longer shows editable Tone or Topics-exclude inputs.

### 7.3 No-data-loss checks
- [ ] `db.clients.countDocuments({})` is unchanged before and after migration.
- [ ] For 10 random pre-existing docs, every key present before the migration is still present after (use `mongodump` diff or a simple Python script that snapshots and compares).
- [ ] `saveStrategy` round-trip preserves `strategy.goals/cta_link/language` if they were set on the doc before the save (confirm dot-path fix works).

### 7.4 Anti-pattern guards
- DO NOT delete any keys from existing docs in this release. Cleanup is a future, separate release with a clear retention window.
- DO NOT have any reader bypass the canonical key. If a reader wants brand tone, it goes through `_get_tone(client)` — there is one place to update if the source changes again.
- DO NOT add new writes to `strategy.goals/cta_link/language`. They are dead keys.
- DO NOT change the `bio` / `bio_template` split. They are not duplicates.
- DO NOT change `industry` / `target_audience` to derive from `niche` alone. The new form has explicit `industry_label` and `target_audience_description` inputs that override.

---

## 8. Out of Scope

- Deleting legacy keys from existing docs (`strategy.goals/cta_link/language`, `username`, `voice_notes_link`, etc.). Defer to a future cleanup release once we are confident no reader has slipped through.
- Splitting `clients` collection into multiple collections (clients/onboarding/strategy). One Mongo doc per client is fine; the dedup is per-key, not per-collection.
- Adding a real migration framework. Use one-shot scripts in `backend/migrations/` for now.
- Quick Add deprecation (§5.4 option B).
- AI prompt builder refactor to use a shared `ClientContext` value object. Worth doing later but not required for dedup.
