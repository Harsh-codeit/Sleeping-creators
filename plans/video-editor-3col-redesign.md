# Plan: Video Studio Editor — 3-Column Redesign

**Target file:** [frontend/src/components/VideoEditor.js](frontend/src/components/VideoEditor.js)
**Mounted in:** [frontend/src/pages/Carousel.js:1046](frontend/src/pages/Carousel.js#L1046)
**Test file (must keep green):** [frontend/src/components/VideoEditor.test.js](frontend/src/components/VideoEditor.test.js)

## Goal

Convert `VideoEditor` from a 2-column form/preview into a **3-column studio**:

```
┌────────────┬────────────────────────────┬───────────────────┐
│ TEMPLATES  │ PREVIEW (wider)            │ PUBLISH SETTINGS  │
│ card list  │ ┌──────────────────────┐   │ caption           │
│ active     │ │   <video> 9:16       │   │ hashtags          │
│ state      │ │                      │   │ platforms         │
│            │ └──────────────────────┘   │ schedule          │
│            │ ▶  ◉━━━━━━━━━━━ 0:12       │ [Publish Now]     │
│            │   trim handles on bar      │                   │
└────────────┴────────────────────────────┴───────────────────┘
```

### Confirmed decisions (from clarifications)
- **Right column = Publish settings** (caption, hashtags, platforms, schedule, publish button).
- **Clip selection = keep `ClipPickerModal`**, triggered by a "Change clip" / filename button above the preview.
- **Playback bar = scrubber with draggable trim handles** (in/out handles set `trimStart`/`trimEnd`; play/pause + current-time/duration sit alongside).

### Non-goals
- No backend changes. POST `/api/videos/create` payload stays identical (verified in Phase 0 §9).
- No template editor changes; we only consume `GET /api/video-templates`.
- No new platform UI (priority field stays unsent; backend defaults to `"normal"`).

---

## Phase 0 — Allowed APIs & Patterns (Reference)

These were verified by Phase 0 discovery. Treat this list as the source of truth; do not invent props, fields, or routes outside it.

### Components (reuse — do not rewrite)
| Component | Path | Props we use |
|---|---|---|
| `ClipPickerModal` | [frontend/src/components/ClipPickerModal.js](frontend/src/components/ClipPickerModal.js) | `clientId`, `onSelect(clip)`, `onClose()` |
| `VideoCanvasPreview` | [frontend/src/components/VideoCanvasPreview.js](frontend/src/components/VideoCanvasPreview.js) | `clip`, `template`, `aspectRatio`, `editable`, `onPositionChange` |
| `Slider` (shadcn/Radix) | [frontend/src/components/ui/slider.jsx](frontend/src/components/ui/slider.jsx) | Radix `SliderPrimitive.Root` props (`min`, `max`, `step`, `value`, `onValueChange`) |

### Backend contract (DO NOT change)
- `POST /api/videos/create` — fields verified at [backend/server.py:218-228](backend/server.py#L218-L228):
  `client_id, clip_id, platforms, scheduled_at, template_id, priority, caption, hashtags, clip_trim_start, clip_trim_end`.
- `GET /api/video-templates?client_id={id}` — returns `[{ id, name, aspect_ratio, ... }]`.
- `GET /api/clients/{client_id}/clips/{drive_file_id}/stream?token=...` — auth via querystring token (current pattern at [VideoEditor.js:11-16](frontend/src/components/VideoEditor.js#L11-L16)).

### Clip object shape (from `ClipPickerModal.onSelect`)
- `drive_file_id` (string) — primary id sent as `clip_id`
- `name` (string) — display
- `duration` (number, seconds) — timeline max
- `r2_url` (string, optional) — direct URL when uploaded
- `source` ("drive" | "upload")

### Visual conventions (copy verbatim)
| Use | Class string |
|---|---|
| Section label | `text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block` |
| Input | `w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500` |
| Toggle button (inactive) | `border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800` |
| Toggle button (active) | `bg-white text-black border-white` |
| Card surface | `bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors` |
| Container box | `border border-zinc-800 p-4 space-y-3` |
| Primary CTA | `w-full py-2.5 bg-white text-black text-sm font-mono font-bold hover:bg-zinc-200 disabled:opacity-40` |

Source examples: [VideoEditor.js:84](frontend/src/components/VideoEditor.js#L84), [VideoEditor.js:134-135](frontend/src/components/VideoEditor.js#L134-L135), [VideoTemplateCard.js:36](frontend/src/components/VideoTemplateCard.js#L36).

### Anti-patterns (do not do)
- ❌ Do not rename payload fields (e.g. don't send `trim_start` instead of `clip_trim_start`).
- ❌ Do not capitalize platform names in the button label — tests assert lowercase `"instagram"` ([VideoEditor.test.js:87](frontend/src/components/VideoEditor.test.js#L87)).
- ❌ Do not change the trigger button label from `"Choose clip…"` ([VideoEditor.test.js:56](frontend/src/components/VideoEditor.test.js#L56)) until you've confirmed the test is also updated.
- ❌ Do not invent shadcn components not present in [frontend/src/components/ui/](frontend/src/components/ui/). Verified present: `slider.jsx`, `button.jsx`, `input.jsx`, `textarea.jsx`, `dialog.jsx`, `tabs.jsx`.
- ❌ Do not alter `VideoCanvasPreview`'s public props beyond what's listed in this Phase 0 unless Phase 2 explicitly requires it (and only in the way Phase 2 prescribes).
- ❌ Do not add a `priority` UI field — backend defaults it.

### Test selectors that must keep working ([VideoEditor.test.js](frontend/src/components/VideoEditor.test.js))
| Test line | Query | Where it lives in new UI |
|---|---|---|
| 56 | `getByRole("button", { name: /Choose clip/ })` | Middle column, above preview (clip not yet chosen) |
| 60, 67 | `getByRole("button", { name: /50 MB \.mp4/ })` | After selection: filename button above preview |
| 80 | `getByRole("button", { name: "Podcast Clip" })` | Left column template card |
| 81 | `getByPlaceholderText(/Write your caption/)` | Right column textarea |
| 84 | `getByPlaceholderText("#marketing #business")` | Right column input |
| 87 | `getByRole("button", { name: "instagram" })` | Right column platform chip |
| 88 | `getByRole("button", { name: "Publish Now" })` | Right column primary CTA |

---

## Phase 1 — Expose video element control to `VideoEditor`

**Why first:** the new playback bar (Phase 4) needs to read `currentTime` / `duration` and call `play() / pause() / seek()` on the same `<video>` that `VideoCanvasPreview` already renders. Today `videoRef` is private to `VideoCanvasPreview` ([VideoCanvasPreview.js:216](frontend/src/components/VideoCanvasPreview.js#L216)) and there's a built-in Play overlay button at [VideoCanvasPreview.js:264-283](frontend/src/components/VideoCanvasPreview.js#L264-L283).

### What to implement
Add **two new optional props** to `VideoCanvasPreview` (keeps backward compatibility with all other call sites):
1. `videoRef` — a `React.MutableRefObject` the parent passes in. Inside, do:
   ```js
   const internalRef = useRef(null);
   const ref = videoRef ?? internalRef;
   ```
   and pass `ref={ref}` to the `<video>`.
2. `onPlaybackChange({ currentTime, duration, playing })` — invoked from the existing `onTimeUpdate`/`onLoadedMetadata`/play/pause handlers. Default no-op.
3. `hideBuiltInControls` (boolean, default `false`) — when `true`, do not render the inline Play/Pause button at lines 264–283. The new editor has its own bar.

### Files to touch
- [frontend/src/components/VideoCanvasPreview.js](frontend/src/components/VideoCanvasPreview.js) — additive only.

### Verification checklist
- [ ] `grep -n "VideoCanvasPreview" frontend/src` — every existing call site still compiles (no required props added).
- [ ] Manual smoke: open the current Carousel page; the existing 2-column editor still plays/pauses via the built-in button (no `hideBuiltInControls` passed).
- [ ] `cd frontend && yarn test VideoEditor` — existing tests still pass (preview is mocked, so this should be unaffected).

### Anti-pattern guards
- ❌ Do not delete the built-in Play button — gate it on `hideBuiltInControls` instead.
- ❌ Do not change existing prop names (`clip`, `template`, `aspectRatio`, `editable`, `onPositionChange`).
- ❌ Do not switch the internal ref pattern in a way that breaks the reset-on-clip-change effect at [VideoCanvasPreview.js:188-191](frontend/src/components/VideoCanvasPreview.js#L188-L191).

---

## Phase 2 — Build the 3-column shell with placeholders

### What to implement
Replace the top-level grid in [VideoEditor.js:79](frontend/src/components/VideoEditor.js#L79) with a 3-column layout, using the same responsive pattern as today:

```jsx
<div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6 items-start">
  <aside>{/* Phase 3: template sidebar */}</aside>
  <main>{/* Phase 4: clip + preview + transport */}</main>
  <aside>{/* Phase 5: publish settings */}</aside>
</div>
```

For this phase, leave each column as a labeled placeholder `<div>` containing only the section heading (e.g. `TEMPLATES`, `PREVIEW`, `PUBLISH`) styled with the section-label class from Phase 0. Keep all existing state/handlers intact above the JSX so the behavior is unchanged once the columns are populated.

Do **not** delete the existing form/preview JSX yet — copy it into a temporary `{/* TODO: removed in phase 5 */}` block below the grid so the file still works during incremental edits, **or** stash the file and re-derive piece by piece. The implementer's choice; the rule is "no broken intermediate commits."

### Files to touch
- [frontend/src/components/VideoEditor.js](frontend/src/components/VideoEditor.js)

### Verification checklist
- [ ] Page renders without console errors at three placeholder columns at `lg:` and stacks to one column below `lg:`.
- [ ] Existing tests still pass (placeholders may break them — that's expected; record which ones break for Phases 3–5 to fix).

### Anti-pattern guards
- ❌ Do not introduce a new CSS framework or module — use Tailwind classes only.
- ❌ Do not add `max-w-*` wrappers; the editor renders inside `Carousel.js` which is full-bleed (Phase 0 §1).

---

## Phase 3 — Left column: template sidebar cards with active state

### What to implement
Render the `templates` array (already fetched in `useEffect` at [VideoEditor.js:35-39](frontend/src/components/VideoEditor.js#L35-L39)) as a vertical list of compact cards. Each card:
- Shows template `name` (required by test).
- Has a small thumbnail strip (use the template `aspect_ratio` to size a placeholder rectangle; do not try to render a real preview here — the middle column does that).
- Toggles active state on click via existing `setTemplateId(t.id)`.
- Includes a "None" card at the top that calls `setTemplateId(null)`.

**Active state styling — copy from [VideoEditor.js:134-135](frontend/src/components/VideoEditor.js#L134-L135):**
```js
const cls = (active) => active
  ? "bg-white text-black border-white"
  : "border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800";
```

**Card container** — derive from the template-card surface at [VideoTemplateCard.js:36](frontend/src/components/VideoTemplateCard.js#L36) but trimmed to sidebar size. Suggested: `w-full text-left p-3 border transition-colors` plus the `cls(active)` toggle.

> **Important — do NOT reuse `VideoTemplateCard.js` directly.** Phase 0 §4 confirmed it's too tall (full 9:16 preview + edit/delete buttons). Build the sidebar card inline inside `VideoEditor.js` — it's only ~15 lines of JSX. No new component file needed unless it grows past 25 lines.

### Empty state
If `templates.length === 0`, render the same message that's at [VideoEditor.js:128](frontend/src/components/VideoEditor.js#L128): `"No templates yet — create one in the Templates tab."`

### Files to touch
- [frontend/src/components/VideoEditor.js](frontend/src/components/VideoEditor.js)

### Verification checklist
- [ ] `cd frontend && yarn test VideoEditor` — `getByRole("button", { name: "Podcast Clip" })` at [VideoEditor.test.js:80](frontend/src/components/VideoEditor.test.js#L80) still resolves. The sidebar card must be a `<button>` with the template name as its accessible name.
- [ ] Clicking a card visibly applies `bg-white text-black` (white = active).
- [ ] Clicking "None" deselects.

### Anti-pattern guards
- ❌ Do not wrap the template name in extra spans/icons that break `name: "Podcast Clip"` matching — the accessible name must be exactly the template name.
- ❌ Do not introduce a new `useState` for active template; reuse `templateId`.

---

## Phase 4 — Middle column: clip picker trigger + preview + scrubber-with-trim-handles

### 4a. Clip trigger above preview
- Above the preview, render a single button:
  - When no clip: `"Choose clip…"` (opens modal). Tests at [VideoEditor.test.js:56](frontend/src/components/VideoEditor.test.js#L56) require this exact label including the ellipsis.
  - When clip selected: the filename (`clip.filename || clip.name || clip.id`). Tests at [VideoEditor.test.js:67](frontend/src/components/VideoEditor.test.js#L67) require the button's accessible name to be the filename.
- Style: copy [VideoEditor.js:85-90](frontend/src/components/VideoEditor.js#L85-L90).
- Reuse the existing `ClipPickerModal` exactly as today (no API changes).

### 4b. Preview
- Render `<VideoCanvasPreview>` with the new props from Phase 1:
  ```jsx
  <VideoCanvasPreview
    clip={clip}
    template={activeTemplate}
    aspectRatio={activeTemplate?.aspect_ratio || "9:16"}
    videoRef={videoRef}
    hideBuiltInControls
    onPlaybackChange={({ currentTime, duration, playing }) => {
      setCurrentTime(currentTime);
      setDuration(duration);
      setPlaying(playing);
    }}
  />
  ```
- New `useRef` and three new `useState`s in `VideoEditor`: `videoRef`, `currentTime` (default 0), `duration` (default 0), `playing` (default false).

### 4c. Transport bar (scrubber with trim handles)
This is the trickiest part. Use Radix's two-thumb pattern via the shadcn `Slider`.

**Approach: dual-purpose timeline using a 3-thumb Radix slider.**

Radix `Slider` accepts an array `value` and renders one thumb per value. Use **3 thumbs** in this order:
1. `trimStart` (in-handle)
2. `currentTime` (playhead)
3. `trimEnd` (out-handle)

```jsx
<Slider
  min={0}
  max={duration || (clip?.duration ?? 0)}
  step={0.1}
  value={[trimStart, currentTime, trimEnd ?? (clip?.duration ?? 0)]}
  onValueChange={([s, t, e]) => {
    // Disambiguate which thumb moved by index — Radix preserves order.
    setTrimStart(Math.min(s, e));
    setTrimEnd(Math.max(s, e));
    if (t !== currentTime && videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  }}
  className="w-full"
/>
```

> **Verify this is what Radix actually does** before implementing: [Radix Slider docs — multiple thumbs](https://www.radix-ui.com/primitives/docs/components/slider). If the version pinned in `frontend/package.json` does not preserve thumb-index identity on drag, fall back to a custom layout: render the Slider with 1 thumb for `currentTime`, and overlay two absolutely-positioned drag handles for `trimStart`/`trimEnd` (the slider then becomes purely a playhead and the trim region is a colored band between the absolute handles). Confirm the Radix version in `frontend/package.json` first; do not assume.

**Color/style override:** the shadcn `Slider` uses `--primary` CSS variables (Phase 0 §7). Override with `className` to use zinc/white tokens, e.g.:
```
className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-white [&>span]:bg-zinc-800 [&>span>span]:bg-white"
```
(Adjust selectors after inspecting the rendered DOM — the exact `[&_...]` selectors depend on shadcn's internal markup.)

**Play/pause + time readout:**
```jsx
<div className="flex items-center gap-3 mt-2">
  <button onClick={() => playing ? videoRef.current?.pause() : videoRef.current?.play()}
          className="w-9 h-9 flex items-center justify-center border border-zinc-700 text-white hover:bg-zinc-800">
    {playing ? <Pause size={14}/> : <Play size={14}/>}
  </button>
  <Slider ... />
  <span className="font-mono text-xs text-zinc-500 tabular-nums">
    {fmt(currentTime)} / {fmt(duration || clip?.duration || 0)}
  </span>
</div>
```
Use `Play, Pause` from `lucide-react` (already used at [VideoEditor.js:4](frontend/src/components/VideoEditor.js#L4)).

### 4d. Remove the numeric Trim inputs
The trim region is now expressed via slider handles. Delete the old `Trim` block at [VideoEditor.js:94-122](frontend/src/components/VideoEditor.js#L94-L122). The state (`trimStart`, `trimEnd`) and its propagation into the publish payload remain unchanged.

### Files to touch
- [frontend/src/components/VideoEditor.js](frontend/src/components/VideoEditor.js)

### Verification checklist
- [ ] Manual: select a clip → see preview, see "0:00 / 0:20" appear after metadata loads.
- [ ] Click play → playhead advances, time readout updates.
- [ ] Drag in-handle → `trimStart` updates; drag out-handle → `trimEnd` updates.
- [ ] Drag playhead → video seeks to that time.
- [ ] `cd frontend && yarn test VideoEditor` — first test (clip preview flow) still passes; the test only checks for the `data-testid="video-preview"` mock and the `"Choose clip…"` / filename button.
- [ ] `clip_trim_start` and `clip_trim_end` in the POST payload still match values set via the handles (verified by second test).

### Anti-pattern guards
- ❌ Do not call `videoRef.current.play()` without a null check — clip can be unset.
- ❌ Do not assume `duration` from `clip.duration`; prefer the live `<video>` `duration` (more accurate after metadata load), fall back to `clip.duration`.
- ❌ Do not use `<input type="range">` instead of the Radix slider — the project standard is the shadcn primitive.
- ❌ Do not change the `"Choose clip…"` button label.

---

## Phase 5 — Right column: publish settings panel

### What to implement
Move (cut, don't recreate) the following blocks from current [VideoEditor.js](frontend/src/components/VideoEditor.js) into the right column, preserving every accessible name and placeholder:

| Block | Source lines | Notes |
|---|---|---|
| Caption textarea | [156-164](frontend/src/components/VideoEditor.js#L156-L164) | Placeholder must stay `"Write your caption…"` |
| Hashtags input | [167-175](frontend/src/components/VideoEditor.js#L167-L175) | Placeholder must stay `"#marketing #business"` |
| Platforms toggle row | [177-193](frontend/src/components/VideoEditor.js#L177-L193) | Buttons must keep lowercase platform names as their text |
| Schedule datetime-local | [195-206](frontend/src/components/VideoEditor.js#L195-L206) | Keep label and input |
| Publish/Schedule CTA | [208-214](frontend/src/components/VideoEditor.js#L208-L214) | Keep `"Publish Now"` / `"Schedule Video"` text toggle exactly |

Wrap the right column in `<aside className="space-y-5 lg:sticky lg:top-6">` to mirror the sticky behavior the preview had before.

The `handlePublish` function at [VideoEditor.js:50-74](frontend/src/components/VideoEditor.js#L50-L74) and the payload at lines 55–65 are unchanged. **Do not edit them.**

### Files to touch
- [frontend/src/components/VideoEditor.js](frontend/src/components/VideoEditor.js)

### Verification checklist
- [ ] All test selectors in the table at the end of Phase 0 resolve.
- [ ] `yarn test VideoEditor` — both tests pass.
- [ ] Manual: publish flow still toasts success and calls `onPublished`.

### Anti-pattern guards
- ❌ Do not change platform button text to `capitalize`d strings — the test asserts exact `name: "instagram"`.
- ❌ Do not consolidate caption + hashtags into a single textarea.
- ❌ Do not introduce React Hook Form here — the rest of the file uses raw `useState`; keep it consistent.

---

## Phase 6 — Verification & sign-off

### Automated
- [ ] `cd frontend && yarn test VideoEditor` — both existing tests pass.
- [ ] `cd frontend && yarn build` — production build compiles with no new warnings.
- [ ] `grep -n "VideoCanvasPreview" frontend/src` — confirm every other call site of `VideoCanvasPreview` (e.g. inside `Carousel.js`, `VideoTemplateEditor.js` if any) still works because Phase 1 was additive.

### Manual smoke (the golden path)
1. `cd frontend && yarn start`, navigate to the Carousel page, pick a client.
2. Confirm 3 columns render at desktop width; columns stack on narrow widths.
3. Click a template card on the left → it activates (white background) and the preview updates with template overlays.
4. Click "Choose clip…" → modal opens, pick a clip → modal closes, filename appears as the trigger button label.
5. Hit play → `<video>` plays, scrubber advances, time readout updates.
6. Drag the in-handle right and the out-handle left → trim region tightens visibly.
7. Type a caption + hashtags, toggle `instagram` + `youtube`, click "Publish Now" → toast success.
8. Open DevTools Network and confirm the payload to `POST /api/videos/create` contains `clip_trim_start` matching the in-handle position and `clip_trim_end` matching the out-handle position.

### Anti-pattern grep guards
- [ ] `grep -n "trim_start\b\|trim_end\b" frontend/src/components/VideoEditor.js` — should return **zero** matches; only `clip_trim_start` / `clip_trim_end` are valid.
- [ ] `grep -n "Instagram\|Facebook\|YouTube\|TikTok\|LinkedIn\|Twitter" frontend/src/components/VideoEditor.js` — should return **zero** matches in button labels; platform buttons stay lowercase.
- [ ] `grep -rn "VideoCanvasPreview" frontend/src/components/` — every existing usage compiles; no required-prop regressions from Phase 1.

### Out of scope for this PR (file as follow-ups if observed)
- Mobile-optimized stacking order of the 3 columns (currently just `grid-cols-1` stack — top-to-bottom is templates → preview → publish, which may not be ideal on phones).
- Drag-and-drop of trim region as a whole (only handles are draggable).
- Keyboard shortcuts (space = play/pause, J/K/L scrub).
- Saving in/out trim points to a server-side draft.

---

## Phase ordering rationale

- **1 before 4** — the playback bar can't exist until `VideoCanvasPreview` exposes a `videoRef`.
- **2 before 3/4/5** — having the empty 3-column shell first makes the next three phases mechanical "fill in this column."
- **3, 4, 5 are independent within their column** — could be parallelized across sessions if needed, as long as Phase 2 is merged first. Phase 4 carries the most risk (Radix multi-thumb slider).
- **6 last** — verification only makes sense once the editor is whole again.
