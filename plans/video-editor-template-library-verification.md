# Plan: Verify Video Editor + Template Library Simplification

## Context

Two files were simplified in commit `570c9a0`:

- **`frontend/src/components/VideoEditor.js`** — 3-column → 2-column layout, Style tab +
  `VideoStylePicker` removed, template picker is now a plain `<select>`, publish payload
  reduced to 9 clean fields (no per-field style overrides).
- **`frontend/src/pages/TemplateLibrary.js`** — stripped from 476 → ~190 lines; filter
  dropdowns, context menus, preview modal, and clone-for-client modal removed; inline
  Edit/Clone/Delete buttons on cards.

The implementation is already on `main`. This plan covers **verification** and any fixes
needed to make the end-to-end flow reliable.

---

## Phase 0 — Discovery (already done)

Key files confirmed:

| File | Purpose |
|------|---------|
| `frontend/src/components/VideoEditor.js` | Studio video editor (2-col layout) |
| `frontend/src/components/VideoCanvasPreview.js` | Live preview with overlay renderer |
| `frontend/src/components/VideoTemplateCard.js` | Card in TemplateLibrary video tab |
| `frontend/src/components/VideoTemplateEditor.js` | Full template form (inline in TemplateLibrary) |
| `frontend/src/pages/TemplateLibrary.js` | Template browser (carousel + video tabs) |
| `backend/server.py` | All API routes — `VideoPostCreate`, `VideoTemplateCreate`, `VideoTemplateUpdate` |

### Confirmed API routes

| Method | Endpoint | Used by |
|--------|----------|---------|
| `POST` | `/api/videos/create` | VideoEditor → handlePublish |
| `GET` | `/api/video-templates` | VideoEditor (template list), TemplateLibrary |
| `POST` | `/api/video-templates` | VideoTemplateEditor → create |
| `PUT` | `/api/video-templates/:id` | VideoTemplateEditor → update |
| `DELETE` | `/api/video-templates/:id` | VideoTemplateCard → handleDelete |
| `POST` | `/api/video-templates/seed` | TemplateLibrary → useEffect |

### Confirmed model state

- `VideoTemplateCreate` and `VideoTemplateUpdate` both have `model_config = ConfigDict(extra="allow")` — all extra fields (aspect_ratio, cta_text_bg_shape, cta_button_icon, gradient/glass/glow fields) are persisted to MongoDB without listing each one.
- `VideoPostCreate` accepts: `client_id`, `clip_id`, `template_id`, `clip_trim_start`, `clip_trim_end`, `caption`, `hashtags`, `platforms`, `scheduled_at` — matches VideoEditor's simplified payload exactly.

---

## Phase 1 — Fix `VideoPostCreate` to ignore removed style fields

**Context:** The backend `VideoPostCreate` model still declares optional style-override fields
(`font_preset`, `overlay_style`, `cta_button_bg_color`, etc.) that VideoEditor no longer
sends. This is harmless since they're all `Optional` with defaults, but the model can be
cleaned up to match the simplified frontend.

**What to do in `backend/server.py`:**

1. Read `VideoPostCreate` (lines ~223–246).
2. Remove the style-override fields that VideoEditor no longer sends:
   - `font_preset`, `overlay_style`, `overlay_color`, `overlay_opacity`
   - `mood_tags` (list)
   - `cta_button_border_radius`, `cta_button_shadow`, `cta_animation`, `cta_delay`
   - `cta_button_text`, `cta_button_bg_color`, `cta_button_text_color`
3. Keep: `client_id`, `clip_id`, `platforms`, `scheduled_at`, `template_id`, `priority`,
   `caption`, `hashtags`, `clip_trim_start`, `clip_trim_end`.
4. Check that the video creation handler downstream (wherever it processes `VideoPostCreate`)
   doesn't break when those fields are absent — they should be looked up from the resolved
   `template_id` instead.

**Verification:**
```bash
grep -n "VideoPostCreate\|font_preset\|overlay_style" backend/server.py | head -40
```
Confirm no remaining reference to removed fields crashes the handler.

**Anti-pattern:** Do NOT remove fields that the handler code still reads directly from the
request body rather than from the template — check the handler before deleting.

---

## Phase 2 — Verify VideoEditor → backend round-trip

**What to check:**

1. Open `VideoEditor.js` line ~137–161 (`handlePublish`). Confirm payload:
   ```js
   { client_id, clip_id, template_id, clip_trim_start, clip_trim_end,
     caption, hashtags (array), platforms (array), scheduled_at }
   ```
2. Open `backend/server.py`, find `POST /api/videos/create` handler. Confirm it:
   - Reads `template_id` and looks up the template from MongoDB to get style fields.
   - Queues a Celery task with clip + template data.
   - Returns `{ message, status }` that VideoEditor toasts.
3. If the handler still reads style fields directly from request body instead of from the
   template, patch it to fall back to the template's fields when the request field is None.

**Verification grep:**
```bash
grep -n "template_id\|video_templates" backend/server.py | grep -A5 "videos/create"
```

---

## Phase 3 — Verify TemplateLibrary video tab CRUD

**What to check:**

1. **Create:** `VideoTemplateEditor.handleSave` POSTs to `/api/video-templates`, receives
   `r.data` (full saved template), calls `onSaved(r.data)`. TemplateLibrary adds it to
   `videoTemplates` state. ✓ Already fixed in commit `46fa408`.

2. **Read:** `loadVideoTemplates` GETs `/api/video-templates` (no `client_id` filter in
   TemplateLibrary). Confirm global templates appear. Confirm client-scoped templates
   appear for the correct client only when a `client_id` is passed by VideoEditor.

3. **Update:** `VideoTemplateEditor.handleSave` on an existing template PUTs to
   `/api/video-templates/:id`. TemplateLibrary maps the updated object in state.
   `onSaved(r.data)` must receive the complete updated document.

4. **Delete:** `VideoTemplateCard.handleDelete` calls
   `DELETE ${REACT_APP_BACKEND_URL}/api/video-templates/:id`.
   - `API` constant in VideoTemplateCard.js is `process.env.REACT_APP_BACKEND_URL || ""`
     (NOT `…/api`), so the full path `/api/video-templates/:id` is correct.
   - `onDeleted(template.id)` removes it from `videoTemplates` state in TemplateLibrary.

**Verification:**
- In browser devtools Network tab: create → edit → delete a video template. Confirm
  status 201 on create, 200 on update, 200 on delete. Confirm the list updates in-place
  without a full page refresh.

---

## Phase 4 — Verify VideoCanvasPreview renders with simplified props

**Context:** VideoEditor now passes `template={activeTemplate}` where `activeTemplate` is
the full template object from the `/api/video-templates` list, or `null` if "None" is
selected.

**What to check in `VideoCanvasPreview.js`:**

1. When `template` is `null`, the preview renders a gradient placeholder (no crash).
2. When a template is selected, the container uses `aspect-ratio` from the template's
   `aspect_ratio` field (e.g. `"9:16"`) — confirm `VideoCanvasPreview` parses it correctly.
3. CTA overlays (text + button) render using the template's saved fields.
4. The preview resizes correctly when the browser window changes — ResizeObserver fires and
   updates internal `dims` state.

**Verification:**
- Start frontend dev server: `cd frontend && yarn start`
- Open the Studio tab for any client → Video sub-tab.
- Select a clip → select a template → confirm the preview updates without error.
- Resize browser window → confirm preview doesn't collapse to 0px height.

---

## Phase 5 — Final smoke test checklist

Run through this in the browser after all patches:

- [ ] **TemplateLibrary / Carousel tab:** cards show Edit/Clone/Delete; no context menu.
- [ ] **TemplateLibrary / Video tab:** `+ New Video Template` opens inline editor; saving
      adds card to grid; editing an existing card opens editor pre-filled; deleting removes
      card.
- [ ] **VideoEditor:** template `<select>` populates from API; selecting a template updates
      preview; publishing sends correct payload; toast confirms success.
- [ ] **No blank screen** after saving a video template (onSaved receives full object).
- [ ] **No 404 on delete** (VideoTemplateCard URL resolves correctly).
- [ ] **Preview always has height** (never 0×0 with no clip selected).

---

## Known non-issues (do NOT fix)

- `VideoStylePicker.js` is now unreferenced — leave the file in place; it does not affect
  bundle size significantly and may be re-used later.
- `VideoPostCreate` style-override fields being `Optional` defaults to `None` — harmless
  until Phase 1 cleanup is done.
- `plans/` directory contains untracked plan files — do not commit them unless asked.
