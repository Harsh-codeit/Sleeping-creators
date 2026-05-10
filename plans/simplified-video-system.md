# Plan: Simplified Video System

## Goal

Three locked-together pieces:

1. **Template** — agency designs it once; locks all style decisions. Only clip, overlay text, and CTA button text ever change.
2. **Studio** (Video tab in ClientDetail) — 3-panel UI: pick template + clip on the left, full preview in the center, write overlay/CTA text on the right, then publish.
3. **Pipeline** — new `"video"` pipeline type: template + Drive folder + static overlay text + CTA text. On each run, pick a random clip, render, publish.

---

## Phase 0 — Discovered APIs (do not invent)

### Backend confirmed endpoints

| Method | Path | File:line | Notes |
|--------|------|-----------|-------|
| `GET` | `/api/video-templates` | server.py ~3651 | optional `?client_id=` |
| `POST` | `/api/video-templates` | server.py ~3659 | `VideoTemplateCreate` model |
| `PUT` | `/api/video-templates/:id` | server.py ~3677 | `VideoTemplateUpdate` model |
| `DELETE` | `/api/video-templates/:id` | server.py ~3688 | |
| `POST` | `/api/videos/create` | server.py ~5213 | `VideoPostCreate`, enqueues Celery |
| `GET` | `/api/clients/:id/drive-clips` | server.py | returns cached Drive clips |
| `POST` | `/api/clients/:id/drive-clips/sync` | server.py | syncs from Drive |
| `POST` | `/api/clients/:id/clips/upload` | server.py ~4985 | multipart, stores on R2 |

### Backend confirmed functions

| Function | File:line | Signature |
|----------|-----------|-----------|
| `create_video_post` | video_service.py ~363 | `(db, client_id, clip_id, platforms, scheduled_at, template_id, *, caption, hashtags, clip_trim_start, clip_trim_end, **kwargs) -> dict` |
| `enqueue_video_job` | video_worker.py ~49 | `(job_payload: dict) -> str (task_id)` |
| `pick_clip` | video_service.py ~352 | `(clips: list, sequence_mode: str, sequence_index: int) -> dict` — pass `sequence_mode="random"` |
| `list_clips` | google_drive_service.py ~63 | `(refresh_token, folder_id) -> list[dict]` |
| `execute_pipeline` | server.py ~810 | `(pipeline: dict, now: datetime, stagger_minutes: int) -> int` |

### Backend confirmed models

**`VideoPostCreate`** (server.py ~223) — fields that matter:
```
client_id, clip_id, platforms, scheduled_at, template_id, priority,
caption, hashtags, clip_trim_start, clip_trim_end
+ optional style overrides (all Optional, will be ignored in new flow)
```

**`PipelineCreate`** (server.py ~254) — current fields:
```
name, pipeline_type, content_type, carousel_template, carousel_slide_count,
carousel_slide_format, carousel_topics, global_instructions, cta_keyword, cta_offer,
max_posts_per_day, platforms, schedule_type, interval_hours, specific_times,
require_approval
```

### Frontend confirmed components

| Component | File | Props |
|-----------|------|-------|
| `VideoStudio` | components/VideoStudio.js | `{ clientId }` — rendered by ClientDetail Video tab |
| `VideoEditor` | components/VideoEditor.js | `{ clientId, onPublished }` — NOT used by ClientDetail |
| `VideoCanvasPreview` | components/VideoCanvasPreview.js | `{ clip, template, aspectRatio, videoRef, hideBuiltInControls, onPlaybackChange }` |
| `ClipPickerModal` | components/ClipPickerModal.js | `{ clientId, onSelect, onClose }` — already has Drive + Upload tabs |
| `VideoTemplateEditor` | components/VideoTemplateEditor.js | `{ initial, onSaved, onCancel }` |
| `VideoTemplateCard` | components/VideoTemplateCard.js | `{ template, onDeleted, onEdit, clients }` |
| `PipelineWizard` | components/pipeline/PipelineWizard.js | `{ open, onClose, onSave, saving, initial, clientId }` |

### Frontend confirmed constants

`frontend/src/components/pipeline/constants.js`:
- `PIPELINE_TYPES` array (lines ~10–51) — add `"video"` entry here
- `EMPTY_FORM` object (lines ~74–91) — add video-specific fields here
- `TYPE_SETTINGS` object (lines ~94–100) — add `"video"` visibility flags here
- `ALL_PLATFORMS` — already correct

---

## Phase 1 — Backend: Text Overrides on VideoPostCreate

**File:** `backend/server.py`

**What to do:**

1. In `VideoPostCreate` (lines ~223–246), add two new optional fields after `clip_trim_end`:
   ```python
   cta_text_override: Optional[str] = None        # overrides template's cta_text
   cta_button_text_override: Optional[str] = None # overrides template's cta_button_text
   ```

2. In the `POST /api/videos/create` handler (lines ~5213–5218), the call is:
   ```python
   task_id = enqueue_video_job(data.model_dump())
   ```
   `model_dump()` serializes everything, so the new fields will flow automatically into `create_video_post` via `**kwargs`.

3. In `video_service.py`, in `create_video_post()` (lines ~425–436), after loading the template from MongoDB, apply overrides before passing to the renderer:
   ```python
   if template:
       if cta_text_override is not None:
           template["cta_text"] = cta_text_override
       if cta_button_text_override is not None:
           template["cta_button_text"] = cta_button_text_override
   ```
   (`cta_text_override` and `cta_button_text_override` arrive via `**kwargs` from `enqueue_video_job` → `create_video_post`)

**Verification:**
```bash
grep -n "cta_text_override\|cta_button_text_override" backend/server.py backend/video_service.py
```
Should appear in `VideoPostCreate` and `create_video_post`.

**Anti-pattern:** Do NOT rename existing template fields. Only override them in memory before passing to renderer.

---

## Phase 2 — Backend: Video Pipeline Type

**File:** `backend/server.py`

### 2a — Extend PipelineCreate model

Add four new optional fields to `PipelineCreate` (lines ~254–270):
```python
# Video pipeline fields
video_template_id: Optional[str] = None     # which video template to use
drive_folder_id: Optional[str] = None       # Drive folder to pick random clips from
overlay_text: Optional[str] = None          # static overlay text (verbatim)
video_cta_text: Optional[str] = None        # static CTA button text (verbatim)
```

### 2b — Persist video fields in pipeline document

In `create_pipeline()` handler (lines ~3925–3956), add to the `pipeline` dict being inserted:
```python
"video_template_id": data.video_template_id,
"drive_folder_id": data.drive_folder_id,
"overlay_text": data.overlay_text,
"video_cta_text": data.video_cta_text,
```

### 2c — Execute pipeline "video" branch

In `execute_pipeline()` (lines ~810–1043), add a `"video"` branch alongside the existing type branches. Pattern to follow: copy the structure of the `"standard"` branch but replace content generation with video job queuing.

The branch should:
1. Check `pipeline.get("video_template_id")` — if missing, log error and return 0
2. Get client from DB to access `refresh_token` (same as existing branches use client data)
3. Fetch clips from `db.drive_clips` filtered by `client_id` (already cached) OR use `list_clips()` with `drive_folder_id` if `db.drive_clips` is empty for this folder:
   ```python
   clips = list(db.drive_clips.find({"client_id": pipeline["client_id"]}))
   if not clips:
       clips = list_clips(client.get("google_refresh_token"), pipeline["drive_folder_id"])
   ```
4. Pick random: `clip = random.choice(clips)` — use `pick_clip(clips, "random", 0)` from `video_service.py`
5. Determine `scheduled_at` using existing `calculate_next_run()` helper or `stagger_minutes`
6. Call:
   ```python
   from video_service import create_video_post
   result = await create_video_post(
       db=db,
       client_id=pipeline["client_id"],
       clip_id=clip.get("drive_file_id") or clip.get("id"),
       platforms=pipeline["platforms"],
       scheduled_at=scheduled_at_iso,
       template_id=pipeline["video_template_id"],
       caption=None,
       hashtags=[],
       cta_text_override=pipeline.get("overlay_text"),
       cta_button_text_override=pipeline.get("video_cta_text"),
   )
   ```
7. Increment `total_runs`, `successful_runs`, update `next_run_at` (copy pattern from other branches)

**Verification:**
```bash
grep -n '"video"' backend/server.py | head -20
```
Should show the pipeline type branch and content_type guard.

**Anti-pattern:** Do NOT call `enqueue_video_job` directly from the pipeline runner — call `create_video_post` to get post IDs back for logging (same pattern as AI content generation).

---

## Phase 3 — Frontend: VideoStudio — 3-Panel Rewrite

**File:** `frontend/src/components/VideoStudio.js`

Rewrite this component. The current VideoStudio is a different, older UI. The new version replaces it entirely.

**Layout:**
```
┌──────────────┬──────────────────────────────┬────────────────┐
│  LEFT 280px  │       CENTER (flex-1)        │  RIGHT 280px   │
│              │                              │                │
│  Templates   │   VideoCanvasPreview         │  Overlay text  │
│  (mini grid) │   (full height, aspect-ratio)│  CTA text      │
│  ─────────   │                              │  ─────────     │
│  Clip picker │   ▶ ━━━●━━━━━━━ 0:12         │  Caption       │
│  (button →   │                              │  Hashtags      │
│  ClipPicker  │                              │  Platforms     │
│  Modal)      │                              │  Schedule      │
│              │                              │  [Publish]     │
└──────────────┴──────────────────────────────┴────────────────┘
```

**State:**
```javascript
const [templates, setTemplates] = useState([]);
const [templateId, setTemplateId] = useState(null);
const [activeTemplate, setActiveTemplate] = useState(null);
const [clip, setClip] = useState(null);
const [clipOpen, setClipOpen] = useState(false);
const [trimStart, setTrimStart] = useState(0);
const [trimEnd, setTrimEnd] = useState(null);
const [overlayText, setOverlayText] = useState("");
const [ctaText, setCtaText] = useState("");
const [caption, setCaption] = useState("");
const [hashtags, setHashtags] = useState("");
const [platforms, setPlatforms] = useState([]);
const [scheduleAt, setScheduleAt] = useState("");
const [publishing, setPublishing] = useState(false);
// playback
const videoRef = useRef(null);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const [playing, setPlaying] = useState(false);
```

**Left panel:**
- Fetch templates: `GET /api/video-templates?client_id=${clientId}`
- Show a scrollable grid of mini template cards — copy `VideoTemplateCard`'s static CSS preview (gradient + cta_text + button text overlay). Selected template gets white border ring.
- Below template grid: "Choose clip…" button that opens `<ClipPickerModal>`. Show selected clip name when set.

**Center panel:**
- `<VideoCanvasPreview clip={clip} template={previewTemplate} aspectRatio={activeTemplate?.aspect_ratio || "9:16"} videoRef={videoRef} hideBuiltInControls onPlaybackChange={...} />`
- `previewTemplate` = `{ ...activeTemplate, cta_text: overlayText || activeTemplate?.cta_text, cta_button_text: ctaText || activeTemplate?.cta_button_text }` — merge overrides for live preview
- TimelineBar + play/pause (copy from VideoEditor.js lines 25–99)

**Right panel:**
```javascript
// Overlay text
<textarea rows={2} value={overlayText} onChange={e => setOverlayText(e.target.value)} placeholder={activeTemplate?.cta_text || "Overlay text…"} />

// CTA button text
<input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder={activeTemplate?.cta_button_text || "Button text…"} />

// Caption, Hashtags, Platforms, Schedule (copy from VideoEditor.js lines 340–410)
```

**handlePublish payload:**
```javascript
{
  client_id: clientId,
  clip_id: clip.drive_file_id || clip.id,
  template_id: templateId,
  clip_trim_start: trimStart,
  clip_trim_end: trimEnd,
  caption,
  hashtags: hashtags.split(/\s+/).filter(Boolean),
  platforms,
  scheduled_at: scheduleAt || null,
  cta_text_override: overlayText || null,
  cta_button_text_override: ctaText || null,
}
```

**Copy patterns from:**
- TimelineBar component: `VideoEditor.js` lines 25–99 (copy verbatim)
- `buildClipPreviewUrl`: `VideoEditor.js` lines 12–17
- `fmt`: `VideoEditor.js` lines 19–23
- ClipPickerModal usage: `VideoEditor.js` lines 212–425
- handlePublish error handling: `VideoEditor.js` lines 137–162

**Verification:**
- `yarn start` → go to any client → Video tab
- Select a template → mini card highlights
- Click "Choose clip…" → ClipPickerModal opens with Drive + Upload tabs
- After selecting clip and template → center preview shows video with overlays
- Type in overlay text → preview updates in real time
- Click Publish → toast "Video queued"

---

## Phase 4 — Frontend: Pipeline Wizard — Video Type

### 4a — `frontend/src/components/pipeline/constants.js`

1. Add to `PIPELINE_TYPES` array (after "experimental"):
   ```javascript
   {
     value: "video",
     label: "Video",
     desc: "Pick a random clip from Drive, apply a video template, publish automatically",
     icon: "🎬",  // or use Film icon reference
   }
   ```

2. Add to `EMPTY_FORM` object:
   ```javascript
   video_template_id: "",
   drive_folder_id: "",
   overlay_text: "",
   video_cta_text: "",
   ```

3. Add to `TYPE_SETTINGS`:
   ```javascript
   video: {
     showTemplate: false,        // carousel template — hidden
     showSlideCount: false,
     showFormat: false,
     showTopics: false,
     showVideoConfig: true,      // new flag for video-specific fields
   }
   ```

### 4b — `frontend/src/components/pipeline/PipelineWizardStep2.js`

When `TYPE_SETTINGS[form.pipeline_type]?.showVideoConfig` is true, render video config section instead of carousel config:

```jsx
{settings.showVideoConfig && (
  <div className="space-y-4">
    {/* Template picker */}
    <div>
      <label>Video Template</label>
      <select value={form.video_template_id} onChange={e => setForm(f => ({...f, video_template_id: e.target.value}))}>
        <option value="">Select template…</option>
        {videoTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>

    {/* Drive folder */}
    <div>
      <label>Drive Folder URL or ID</label>
      <input value={form.drive_folder_id} onChange={e => setForm(f => ({...f, drive_folder_id: e.target.value}))}
        placeholder="https://drive.google.com/drive/folders/…" />
    </div>

    {/* Overlay text */}
    <div>
      <label>Overlay Text</label>
      <textarea rows={2} value={form.overlay_text} onChange={e => setForm(f => ({...f, overlay_text: e.target.value}))}
        placeholder="Text shown on screen (e.g. 'Follow for daily tips')" />
    </div>

    {/* CTA button text */}
    <div>
      <label>CTA Button Text</label>
      <input value={form.video_cta_text} onChange={e => setForm(f => ({...f, video_cta_text: e.target.value}))}
        placeholder="Book a call →" />
    </div>
  </div>
)}
```

Fetch video templates inside this component (or pass as prop):
```javascript
const [videoTemplates, setVideoTemplates] = useState([]);
useEffect(() => {
  if (form.pipeline_type === "video") {
    axios.get(`${API}/video-templates?client_id=${clientId}`)
      .then(r => setVideoTemplates(r.data || []));
  }
}, [form.pipeline_type, clientId]);
```

**API constant:** copy from VideoEditor.js line 8: `const API = \`${process.env.REACT_APP_BACKEND_URL}/api\`;`

### 4c — `frontend/src/components/pipeline/PipelineCard.js`

Add "video" badge styling — copy the pattern used for existing pipeline type badges. If a pipeline has `pipeline_type === "video"`, display a distinct color badge (e.g. blue-violet).

**Verification:**
- Open pipeline wizard for any client → Step 1 → select "Video" type
- Step 2 should show template dropdown, Drive folder input, overlay text, CTA text
- Step 3 is platforms + schedule (unchanged)
- Save → pipeline appears in list with "video" badge
- Check MongoDB: pipeline doc has `video_template_id`, `drive_folder_id`, `overlay_text`, `video_cta_text`

---

## Phase 5 — Verification & Smoke Test

### Backend checks
```bash
# Confirm new fields in VideoPostCreate
grep -n "cta_text_override\|cta_button_text_override" backend/server.py

# Confirm video branch in execute_pipeline
grep -n '"video"' backend/server.py

# Confirm pipeline model has video fields
grep -n "video_template_id\|drive_folder_id\|overlay_text\|video_cta_text" backend/server.py
```

### Frontend checks
```bash
# Confirm VideoStudio is rewritten (3 panels)
grep -n "overlayText\|ctaText\|cta_text_override" frontend/src/components/VideoStudio.js

# Confirm pipeline constants updated
grep -n '"video"' frontend/src/components/pipeline/constants.js

# Confirm pipeline wizard step 2 handles video config
grep -n "showVideoConfig\|video_template_id" frontend/src/components/pipeline/PipelineWizardStep2.js
```

### End-to-end flow

**Template → Studio → Publish:**
1. Go to Templates → Video tab → Create a new video template (e.g. "Agency Reel 9:16" with gradient overlay, bold font, "Follow for tips" default overlay, "Book a call →" default CTA button)
2. Go to any client → Video tab
3. Select the template → mini card highlights, preview shows gradient + default text
4. Click "Choose clip…" → pick from Drive OR upload a local file
5. Preview updates with real video + overlays
6. Type custom overlay text → preview updates live
7. Fill caption, platforms → Publish Now → toast "Video queued"

**Pipeline run:**
1. Go to any client → Pipelines → New Pipeline
2. Step 1: name "Daily Reel", type "Video"
3. Step 2: pick template, paste Drive folder URL, write overlay text, CTA text
4. Step 3: platform = instagram, schedule = every 24h
5. Save → pipeline appears with "video" badge
6. Trigger manually (or wait for scheduler) → check MongoDB `posts` collection for new video post with `status="scheduled"`

### Known non-issues (do NOT fix)
- `VideoEditor.js` and `VideoStylePicker.js` are now unused by ClientDetail but harmless — leave them.
- `VideoPostCreate` style-override fields (font_preset, overlay_style, etc.) remain in the model as `Optional` — they will be ignored when not sent.
