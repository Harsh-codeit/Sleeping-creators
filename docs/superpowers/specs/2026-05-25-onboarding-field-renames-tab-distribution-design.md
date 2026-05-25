# Onboarding Field Renames + Tab Distribution — Design Spec

## Goal

Align the SC admin onboarding wizard with the affiliation SC client-facing form field names, update
6 UI components in the admin form, and surface all onboarding data in the relevant ClientDetail tabs.

**Hard constraint: existing client records must never be broken.** Every rename uses a dual-read
fallback (new name → old name). No DB migration. No destructive writes.

---

## Field Renames

Three fields change names/types:

| Old key | New key | Type change | Old data handling |
|---------|---------|-------------|-------------------|
| `google_drive_images` | `high_quality_photos_link` | none (str) | Read `high_quality_photos_link \|\| google_drive_images` everywhere |
| `google_drive_videos` | `video_clips_link` | none (str) | Read `video_clips_link \|\| google_drive_videos` everywhere |
| `pr_links` (List[str]) | `pr_media_links` (str) | array → string | Display fallback: join old `pr_links` with `\n` if `pr_media_links` absent |

### Backend impact points

- `OnboardingCreate` Pydantic model: rename fields + update types
- `ClientData` Pydantic model: same
- `ClientUpdate` Pydantic model: same
- `_ONBOARDING_KEYS` frozenset: add new keys (keep old keys too — incoming data may still use old names)
- Carousel generation (`generate_carousel` endpoint): read `high_quality_photos_link or google_drive_images`
- Any other place `google_drive_images`, `google_drive_videos`, `pr_links` are referenced

### Frontend impact points

- `Onboarding.js` INITIAL state: use new keys
- `validators.js`: remove `pr_links` check, no requirement on `pr_media_links` (optional)
- `initEditForm` in `ClientDetail.js`: read `ob.high_quality_photos_link || ob.google_drive_images`, etc.
- Save payload in `ClientDetail.js`: no change needed (spread `editForm` already sends whatever keys are present)

---

## SC Admin Onboarding Form — 6 UI Changes

### 1. Profile Photo — file upload (Step 1)

Replace the `<Input type="url">` for `profile_photo_link` with a file upload component:

- `<input type="file" accept="image/*">` hidden behind a styled button
- On file select: POST multipart to `POST /api/upload`
- On success: store returned URL in `form.profile_photo_link`
- Show image preview (40×40 rounded) + "Remove" button while URL is set
- Show upload spinner during POST
- Falls back gracefully if no file selected (field stays optional)

### 2. PR / Media Links — textarea (Step 1)

Replace `<MultiInput>` (array of URL inputs) for `pr_links` with a single `<Textarea>` for
`pr_media_links`. Free text, no validation, optional.

### 3. Drive link renames (Step 1)

- Rename `google_drive_images` → `high_quality_photos_link` (label: "20+ High Quality Photos — Google Drive URL")
- Rename `google_drive_videos` → `video_clips_link` (label: "20+ Video Clips — Google Drive URL")
- No type/behavior change, just key and label updates

### 4. Daily Life — 4 sub-inputs (Step 2)

Replace the single `<Textarea>` for `daily_life` with 4 labeled `<Input>` fields:
- Morning routine
- Afternoon
- Evening
- Lifestyle

On change: join all 4 with `\n` and write to `form.daily_life`.
On mount: split existing `daily_life` string by `\n` to restore the 4 inputs.

### 5. Audience Age Range — dual range slider (Step 2)

Replace `<Input type="text">` for `audience_age_range` with a dual-thumb range slider:
- Two `<input type="range">` overlaid (lo: 13–80, hi: 13–80)
- Lo thumb capped at `hi - 1`, hi thumb capped at `lo + 1`
- Stored as `"{lo}–{hi} years"` string (e.g. `"18–35 years"`)
- On mount: parse existing string value back to `lo` / `hi` numbers
- Default: `18–35`
- Generation label (Gen Z / Millennial / Gen X / Boomer) shown below each thumb

### 6. Not-to-Do List — 5 prompted inputs (Step 3)

Replace `<CappedMultiInput>` for `not_to_do_list` with 5 fixed prompted rows:

```
"I will never post about ___"
"I refuse to ___"
"I won't create content that ___"
"I avoid ___"
"I don't do ___"
```

Each row is a `<div>` with the prompt prefix text + an `<Input>` for the blank.
Array stored as 5 strings (the user's completions, without the prompt prefix).
On mount: map existing `not_to_do_list[0..4]` to the 5 inputs.

---

## Tab Distribution

### Overview tab — new "Contact & Access" card

Added as a new card in the right column, below the DriveImagesFolderCard. Read-only.
Fields (with dual-read fallback):

```
email          whatsapp         city_country
website_url    linkedin_url     youtube_url     twitter_url
account_suspended (badge)       paid_ads_run (badge)
```

### Strategy tab — 2 new read-only cards

**Card: Niche & Content Direction** (below existing Topic Rules card):
- Niche (`niche`)
- Signature Topic (`signature_topic`)
- Language (`language` — first element if array)
- Disliked Content (`disliked_content`)

**Card: Audience Intelligence** (collapsible, default collapsed):
8 sections, each shown as a pill list or line list:
- Solutions Provided
- Audience Problems
- Desires & Dream Outcomes
- Myths They Believe
- Things They Tried
- Unique Selling Points
- Frequently Asked Questions
- Topics I Love

### Competitors tab — onboarding accounts list

At the top of the Competitors tab, before the existing `<CompetitorTab>` component:
- "From Onboarding" section showing `competitor_accounts` list as `@handle` chips
- Only rendered if `client.onboarding_data?.competitor_accounts?.length > 0`

---

## Safety Rules (enforced throughout implementation)

1. **Never delete old field names** from `_ONBOARDING_KEYS` — the backend must still accept and store `google_drive_images` etc. from any legacy payloads
2. **All reads use fallback**: `new_field || old_field` in every component and endpoint
3. **`pr_links` data**: displayed as joined text if `pr_media_links` is absent (`(ob.pr_links || []).join("\n")`)
4. **Validators**: `pr_links` check removed; no new required validations added for renamed fields
5. **initEditForm**: always reads `ob.high_quality_photos_link || ob.google_drive_images` etc.
