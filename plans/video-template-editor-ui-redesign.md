# Video Template Editor — UI Redesign Plan

## Goal
Fix three core problems in the video template editor and expand the styling toolkit:

1. **Preview invisible** — users can't see the live preview while editing controls
2. **Changes not reflecting** — CTA overlays don't appear unless the container has measured dimensions and a clip is loaded
3. **Limited CTA styles** — only 4 button presets, no advanced styling for button or overlay text

---

## Phase 0: Documentation Discovery (Completed)

### Files confirmed via exploration

| File | Role |
|------|------|
| `frontend/src/components/VideoTemplateEditor.js` (318 lines) | Main editor form + layout |
| `frontend/src/components/VideoCanvasPreview.js` (345 lines) | Live preview with draggable overlays |
| `frontend/src/constants/videoStyles.js` (133 lines) | Preset constants (overlay, font, mood, button) |
| `frontend/src/components/video/OverlayPicker.js` (39 lines) | Grid picker for overlay style |
| `frontend/src/components/video/FontPicker.js` (32 lines) | Grid picker for font preset |
| `frontend/src/components/video/ChipGroup.js` (21 lines) | Button group for S/M/L, on/off |
| `frontend/src/components/video/VideoField.js` (11 lines) | Label wrapper |
| `frontend/src/components/video/MoodTagPicker.js` (37 lines) | Mood tag buttons |

### Root-cause analysis

**Preview not visible:** The right column uses `grid-cols-1 lg:grid-cols-2 gap-6` inside a scrollable parent. As the user scrolls the left column, the right column (preview) scrolls out of view. The preview has no `sticky` or `fixed` positioning.

**Changes not reflecting:** `CTATextOverlay` and `CTAButtonOverlay` inside `VideoCanvasPreview.js` only render when `dims.w > 0`. Dims come from measuring the container div via ResizeObserver/ref. If the preview panel is off-screen or has `height: 0`, dims stay 0 and overlays never render. Additionally the "No clip selected" state still shows a dark box but the overlays are meant to sit on top—the issue is that without a clip, the container might collapse to a small height.

**Style gaps:** Only 4 button presets. No text-shadow, text-stroke, letter-spacing, text-transform, gradient backgrounds, or border control for either the text overlay or button.

---

## Phase 1: Layout Redesign — Sticky Preview Panel

### What to implement

Restructure `VideoTemplateEditor.js` so the right preview column is sticky and fills the viewport height while the left form column scrolls independently.

### Changes

**`VideoTemplateEditor.js`** — outer wrapper and column classes:

```jsx
// BEFORE (current)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div className="space-y-5"> {/* left: form */} </div>
  <div className="space-y-2"> {/* right: preview */} </div>
</div>

// AFTER
<div className="flex gap-6 items-start">
  {/* Left: scrollable form */}
  <div className="flex-1 min-w-0 space-y-5 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
    {/* all form sections unchanged */}
  </div>

  {/* Right: sticky preview */}
  <div className="w-[380px] shrink-0 sticky top-4 space-y-2">
    <p className="text-xs text-zinc-500 uppercase tracking-widest">
      Live Preview — drag overlays to reposition
    </p>
    <VideoCanvasPreview
      template={form}
      aspectRatio={form.aspect_ratio}
      editable
      onPositionChange={handlePositionChange}
    />
    <p className="text-[11px] text-zinc-600">
      Button animation previews after its delay when you play a clip.
    </p>
  </div>
</div>
```

The preview width of `380px` gives enough room for a 9:16 preview at reasonable scale while leaving space for the form. The left column has explicit `max-h` and `overflow-y-auto` so it scrolls independently.

### Verification
- Scroll the form down: the preview stays visible on the right
- Resize window to below `lg` breakpoint: stack vertically (add responsive fallback: `flex-col lg:flex-row`)

### Anti-pattern guards
- Do NOT use `position: fixed` for the preview — it would break when editor is embedded in a modal (TemplateLibrary.js)
- Do NOT remove the `editable` prop from VideoCanvasPreview

---

## Phase 2: Fix Preview Rendering — Always Show Overlays

### Problem detail

In `VideoCanvasPreview.js`, the overlay render gate is:
```jsx
{dims.w > 0 && (
  <>
    <CTATextOverlay ... />
    <CTAButtonOverlay ... />
  </>
)}
```

`dims` comes from measuring the container div. Two failure modes:
1. The container has `height: 0` when the preview is first mounted (common when it's off-screen or in a collapsed parent)
2. The "No clip selected" placeholder div might not establish the right height

### What to implement

**`VideoCanvasPreview.js`** — two fixes:

**Fix A — Placeholder background so overlays are always visible:**
Replace the empty dark box with a rich gradient placeholder that matches the aspect ratio, ensuring `dims.w > 0` from mount.

```jsx
// Replace the current "No clip" block
{clip?.url ? (
  <video ... />
) : (
  <div
    className="absolute inset-0"
    style={{
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    }}
  >
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
      <svg ... /> {/* film-reel or play icon at 40px */}
      <span className="text-xs text-white tracking-widest uppercase">No clip</span>
    </div>
  </div>
)}
```

**Fix B — Ensure the outer container always has explicit height:**
The aspect-ratio container in VideoCanvasPreview uses a padding-bottom trick or CSS `aspect-ratio`. Verify it works without a video:

```jsx
// Confirm the container wrapper uses aspect-ratio so it's never 0-height:
<div
  ref={containerRef}
  className="relative w-full overflow-hidden rounded-lg bg-zinc-900"
  style={{ aspectRatio: RATIO_MAP[aspectRatio] ?? "9/16" }}
>
```

**Fix C — Force dims update on mount:**
If ResizeObserver fires before layout settles, dims may read 0. Add a fallback:

```jsx
useEffect(() => {
  if (containerRef.current && dims.w === 0) {
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width > 0) setDims({ w: width, h: height });
  }
}, []); // run once on mount
```

### Verification
- Open editor for any template: CTA text and button overlays must appear immediately over the gradient placeholder
- Dragging overlays must still update position ratios
- No video = overlays still visible. With video = overlays on top of video

### Anti-pattern guards
- Do NOT remove the `dims.w > 0` guard entirely — it prevents divide-by-zero in position calculations
- Do NOT use a hardcoded pixel height for the container — use `aspect-ratio` CSS so it adapts to column width

---

## Phase 3: More CTA Button Style Presets

### What to implement

Add a `ButtonStylePicker` component (modeled after `OverlayPicker`) with 8 visual presets. Each preset renders a mini button preview inside a dark card.

**New file: `frontend/src/components/video/ButtonStylePicker.js`**

```jsx
// 8 presets — each is a mini button rendered with the style's own CSS
const BUTTON_PRESETS = [
  {
    id: "solid_white",
    label: "Solid",
    style: { background: "#fff", color: "#000", borderRadius: 4 }
  },
  {
    id: "pill_outline",
    label: "Outline",
    style: { background: "transparent", color: "#fff", border: "2px solid #fff", borderRadius: 999 }
  },
  {
    id: "dark_solid",
    label: "Dark",
    style: { background: "#111", color: "#fff", borderRadius: 6, boxShadow: "2px 2px 0 rgba(0,0,0,0.4)" }
  },
  {
    id: "brand_purple",
    label: "Purple",
    style: { background: "#6366f1", color: "#fff", borderRadius: 8 }
  },
  {
    id: "pill_gradient",
    label: "Gradient",
    style: { background: "linear-gradient(90deg,#a855f7,#ec4899)", color: "#fff", borderRadius: 999 }
  },
  {
    id: "neon_glow",
    label: "Neon",
    style: { background: "#0f0f0f", color: "#39ff14", borderRadius: 4, boxShadow: "0 0 8px #39ff14, 0 0 20px #39ff1444" }
  },
  {
    id: "frosted",
    label: "Frosted",
    style: { background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)" }
  },
  {
    id: "brand_orange",
    label: "Orange",
    style: { background: "#f97316", color: "#fff", borderRadius: 6 }
  },
];

export function ButtonStylePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BUTTON_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`rounded-lg p-2 border flex flex-col items-center gap-1.5 transition-all
            ${value === p.id
              ? "border-white ring-1 ring-white bg-zinc-700"
              : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
            }`}
        >
          {/* Mini button preview */}
          <div className="w-full h-6 flex items-center justify-center text-[9px] font-bold" style={p.style}>
            CTA →
          </div>
          <span className="text-[9px] text-zinc-400">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
```

**`frontend/src/constants/videoStyles.js`** — add the 4 new preset style definitions (pill_gradient, neon_glow, frosted, brand_orange) in `BUTTON_STYLE_PRESETS`.

**`VideoTemplateEditor.js`** — in the CTA Button section, add the `ButtonStylePicker` above the color pickers. When a preset is selected, it auto-fills `cta_button_bg_color`, `cta_button_text_color`, `cta_button_border_radius`, and `cta_button_shadow` via a `applyButtonPreset(presetId)` helper. Users can then override individual values in the controls below.

Add state field `cta_button_style_preset: "solid_white"` to DEFAULTS.

**`VideoCanvasPreview.js`** — `CTAButtonOverlay` must handle `frosted` preset's `backdropFilter` and `neon_glow` multi-shadow. Apply via inline style rather than Tailwind classes since these values are dynamic.

### Verification
- Selecting a preset auto-fills the color/radius/shadow fields below
- Mini previews accurately represent each style
- Existing 4 presets continue to work (ids unchanged)

### Anti-pattern guards
- Do NOT hardcode gradient CSS in `CTAButtonOverlay` — compute it from form fields so it works for both presets and custom values

---

## Phase 4: Advanced CTA Button Styling

### What to implement

Add a collapsible "Advanced" accordion inside the CTA Button section of `VideoTemplateEditor.js`. Collapsed by default.

**New state fields to add to DEFAULTS:**

```js
// Gradient background
cta_button_gradient: false,          // toggle
cta_button_gradient_from: "#a855f7", // hex
cta_button_gradient_to: "#ec4899",   // hex
cta_button_gradient_dir: "90deg",    // "90deg"|"135deg"|"180deg"|"45deg"

// Border
cta_button_border_enabled: false,    // toggle
cta_button_border_width: 2,          // 1-4 px
cta_button_border_color: "#ffffff",  // hex
cta_button_border_style: "solid",    // "solid"|"dashed"|"dotted"

// Typography
cta_button_text_transform: "none",   // "none"|"uppercase"|"capitalize"
cta_button_letter_spacing: 0,        // -2 to 8 px

// Shadow/Glow
cta_button_glow: "none",             // "none"|"soft"|"hard"|"neon"
cta_button_glow_color: "#ffffff",    // hex

// Padding
cta_button_padding_x: 20,            // 8-48 px
cta_button_padding_y: 8,             // 4-24 px

// Icon
cta_button_icon: "arrow",            // "none"|"arrow"|"play"|"plus"|"star"|"chevron"
```

**Advanced section UI (inside CTA Button, collapsible):**

```
▼ Advanced Styling

[Gradient Background toggle]
  ├─ [if on] From color | To color | Direction chips (→ ↘ ↓ ↗)

[Border toggle]
  ├─ [if on] Width slider | Style chips (solid/dashed/dotted) | Color picker

[Text Transform] chips: Normal / UPPER / Capitalize
[Letter Spacing] slider: -2 to 8px

[Glow/Shadow] chips: None / Soft / Hard / Neon
  └─ [if Neon] Glow Color picker

[Padding] Horizontal: 8-48px | Vertical: 4-24px

[Icon] chips: None / → / ▶ / + / ★ / ›
```

**`VideoCanvasPreview.js` — `CTAButtonOverlay` updates:**

Compute button inline style from all new fields:

```js
const buttonStyle = {
  // existing
  backgroundColor: gradient ? undefined : cta_button_bg_color,
  background: gradient
    ? `linear-gradient(${cta_button_gradient_dir}, ${cta_button_gradient_from}, ${cta_button_gradient_to})`
    : undefined,
  color: cta_button_text_color,
  borderRadius: cta_button_border_radius,
  fontSize: SIZE_PX[cta_button_size],
  padding: `${cta_button_padding_y}px ${cta_button_padding_x}px`,
  textTransform: cta_button_text_transform,
  letterSpacing: `${cta_button_letter_spacing}px`,
  border: cta_button_border_enabled
    ? `${cta_button_border_width}px ${cta_button_border_style} ${cta_button_border_color}`
    : "none",
  boxShadow: computeGlow(cta_button_glow, cta_button_glow_color, cta_button_shadow),
};
```

Add a `computeGlow(glow, color, shadow)` helper in `VideoCanvasPreview.js`:

```js
function computeGlow(glow, color, shadow) {
  const shadows = [];
  if (shadow) shadows.push("3px 3px 0 rgba(0,0,0,0.4)");
  if (glow === "soft") shadows.push(`0 0 12px ${color}88`);
  if (glow === "hard") shadows.push(`0 0 4px ${color}, 0 0 8px ${color}`);
  if (glow === "neon") shadows.push(`0 0 6px ${color}, 0 0 20px ${color}88, 0 0 40px ${color}44`);
  return shadows.join(", ") || "none";
}
```

Replace the current `cta_button_arrow` boolean with `cta_button_icon` string. Render the icon:

```js
const ICON_MAP = {
  none: null,
  arrow: "→",
  play: "▶",
  plus: "+",
  star: "★",
  chevron: "›",
};
```

Keep `cta_button_arrow` in DEFAULTS as `true` and migrate: if `cta_button_arrow === true` and `cta_button_icon` is absent, default icon to `"arrow"`.

### Verification
- Toggle gradient: preview shows gradient immediately
- Enable neon glow: glowing box-shadow visible in preview
- Letter spacing change: live-reflects in preview button text
- Padding change: button resizes in preview

### Anti-pattern guards
- Do NOT remove the existing `cta_button_shadow` toggle — keep it as "Hard Drop" option for backward compat with saved templates
- Do NOT use Tailwind classes for dynamic button styles in the preview — use inline styles only

---

## Phase 5: Advanced Overlay Text Styling

### What to implement

Add a collapsible "Advanced" accordion inside the CTA Text section.

**New state fields:**

```js
// Text styling
cta_text_transform: "none",          // "none"|"uppercase"|"capitalize"|"lowercase"
cta_text_letter_spacing: 0,          // -2 to 8 px
cta_text_font_weight: "inherit",     // "inherit"|"400"|"600"|"700"|"900"
cta_text_align: "center",            // "left"|"center"|"right"
cta_text_max_width: 80,              // 20-100% of canvas width
cta_text_multiline: false,           // toggle — switches input to textarea

// Text shadow
cta_text_shadow_enabled: false,      // toggle
cta_text_shadow_color: "#000000",    // hex
cta_text_shadow_x: 2,                // -10 to 10 px
cta_text_shadow_y: 2,                // -10 to 10 px
cta_text_shadow_blur: 4,             // 0-20 px

// Text stroke (outline text)
cta_text_stroke_enabled: false,      // toggle
cta_text_stroke_width: 1,            // 1-4 px
cta_text_stroke_color: "#000000",    // hex

// Background shape (extends current pill toggle)
cta_text_bg_shape: "pill",           // "none"|"pill"|"box"|"blur"|"underline"|"highlight"
```

Note: `cta_text_bg_shape` replaces the current boolean `cta_text_bg`. Migrate: if `cta_text_bg === true`, default `cta_text_bg_shape` to `"pill"`.

**CTA Text section UI restructure:**

```
[Text input / textarea toggle]
  └─ [if multiline] textarea (4 rows) | [else] input

[Grid 2-col] Color | Size (S/M/L)

[Background Shape] chips: None / Pill / Box / Blur / Underline / Highlight
  └─ [if not none] Bg Color | Opacity

▼ Advanced Styling

[Text Transform] chips: Normal / UPPER / lower / Capitalize
[Letter Spacing] slider: -2 to 8px
[Font Weight] chips: Light / Normal / Bold / Black
[Align] chips: ← | ↔ | →
[Max Width] slider: 20-100%

[Text Shadow toggle]
  └─ [if on] Color | X offset (-10 to 10) | Y offset (-10 to 10) | Blur (0-20)

[Text Stroke toggle]
  └─ [if on] Stroke Width (1-4) | Stroke Color
```

**`VideoCanvasPreview.js` — `CTATextOverlay` updates:**

```js
const textStyle = {
  color: cta_text_color,
  fontSize: SIZE_PX[cta_text_size],
  fontFamily: FONT_MAP[font_preset],
  textTransform: cta_text_transform,
  letterSpacing: `${cta_text_letter_spacing}px`,
  fontWeight: cta_text_font_weight === "inherit" ? undefined : cta_text_font_weight,
  textAlign: cta_text_align,
  maxWidth: `${cta_text_max_width}%`,
  whiteSpace: cta_text_multiline ? "pre-wrap" : "nowrap",
  wordBreak: cta_text_multiline ? "break-word" : "normal",
  textShadow: cta_text_shadow_enabled
    ? `${cta_text_shadow_x}px ${cta_text_shadow_y}px ${cta_text_shadow_blur}px ${cta_text_shadow_color}`
    : "none",
  WebkitTextStroke: cta_text_stroke_enabled
    ? `${cta_text_stroke_width}px ${cta_text_stroke_color}`
    : "0px transparent",
};
```

Background shape rendering:

```js
function buildTextBgStyle(shape, color, opacity) {
  const rgba = hexAlpha(color, opacity);
  switch (shape) {
    case "pill":    return { background: rgba, padding: "4px 12px", borderRadius: 999 };
    case "box":     return { background: rgba, padding: "4px 8px", borderRadius: 4 };
    case "blur":    return { background: rgba, padding: "4px 12px", backdropFilter: "blur(8px)", borderRadius: 8 };
    case "underline": return { borderBottom: `3px solid ${rgba}`, paddingBottom: 2 };
    case "highlight": return { background: rgba, padding: "2px 6px", borderRadius: 2, mixBlendMode: "multiply" };
    default:        return {};
  }
}
```

### Verification
- Type multi-line text with `cta_text_multiline` on: text wraps in preview
- Enable text stroke + shadow: both render simultaneously in preview
- Change background shape to "blur": frosted background visible in preview

### Anti-pattern guards
- Do NOT use `text-stroke` (non-standard) — use `-webkit-text-stroke` which is widely supported
- Do NOT break backward compat with `cta_text_bg` boolean — migrate old templates gracefully

---

## Phase 6: Backend — Extend Template Schema

### What to implement

The backend `server.py` stores video templates directly in MongoDB. The new fields need to round-trip through the API without any schema migration (MongoDB is schemaless). Verify that the `PUT /api/video-templates/{id}` endpoint doesn't strip unknown keys.

In `server.py`, find the `VideoTemplate` Pydantic model and confirm it either:
- Uses `model_config = ConfigDict(extra="allow")` (Pydantic v2), or
- Uses `class Config: extra = "allow"` (Pydantic v1)

If neither, add it. This allows all new fields to persist without listing each one.

### Verification
- Save a template with `cta_button_gradient: true` set
- Reload the editor for that template: `cta_button_gradient` must be `true`
- Check MongoDB document has the new fields

### Anti-pattern guards
- Do NOT add every new field to the Pydantic model individually — `extra="allow"` is the right approach for this extensible schema

---

## Phase 7: Final Verification Checklist

Run through each fix manually in the browser:

### Preview layout
- [ ] Open any video template for editing
- [ ] Scroll the left form panel to the bottom: preview stays visible on the right
- [ ] Open on a narrow viewport: form and preview stack vertically

### Preview rendering
- [ ] With no clip assigned: gradient placeholder visible, CTA overlays rendered on top
- [ ] Change CTA text: updates immediately in preview
- [ ] Change button color: updates immediately in preview
- [ ] Drag overlay: position persists in the editor

### Button style presets
- [ ] ButtonStylePicker shows 8 presets with mini visual buttons
- [ ] Clicking a preset auto-fills color/radius fields below
- [ ] All 4 original presets still work (solid_white, pill_outline, dark_solid, brand_purple)

### Advanced button styling
- [ ] Toggle gradient: preview switches from solid to gradient
- [ ] Set glow to "neon" with a green color: green glow visible in preview
- [ ] Set letter spacing to 4: button text spaced out in preview
- [ ] Save + reload: all advanced fields persist

### Advanced text styling
- [ ] Enable multiline: textarea appears, line breaks render in preview
- [ ] Enable text stroke (white, 2px): outline effect visible in preview
- [ ] Enable text shadow: shadow visible in preview
- [ ] Change background shape to "blur": frosted bg visible

### Run tests
```bash
cd frontend && yarn test --watchAll=false --testPathPattern="VideoTemplateEditor|VideoCanvasPreview"
```

---

## Implementation Order (for a single session)

1. Phase 1 — Layout fix (10 min) — pure CSS change, no logic
2. Phase 2 — Preview rendering fix (20 min) — logic in VideoCanvasPreview
3. Phase 3 — ButtonStylePicker + presets (25 min) — new component + wiring
4. Phase 4 — Advanced button styling (30 min) — state + UI + preview rendering
5. Phase 5 — Advanced overlay text styling (30 min) — state + UI + preview rendering
6. Phase 6 — Backend schema check (5 min) — one-line Pydantic fix

Total: ~2 hours

---

## Key File Locations

- Editor form: [VideoTemplateEditor.js](../frontend/src/components/VideoTemplateEditor.js)
- Preview canvas: [VideoCanvasPreview.js](../frontend/src/components/VideoCanvasPreview.js)
- Style constants: [videoStyles.js](../frontend/src/constants/videoStyles.js)
- New picker component: `frontend/src/components/video/ButtonStylePicker.js` (create new)
- Backend model: `backend/server.py` — search for `class VideoTemplate`
