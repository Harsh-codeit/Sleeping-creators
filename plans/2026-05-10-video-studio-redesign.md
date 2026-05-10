# Video Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign VideoStudio to show live element-map previews in the template picker, overlay template elements on the canvas, fix timeline styling, and align the entire UI with the command-center design guidelines.

**Architecture:** All changes are confined to `VideoStudio.js` (one file). A `MiniElement` inline helper handles element rendering in the template picker. A read-only `TemplateOverlay` component renders template elements on the center canvas. No new files are needed.

**Tech Stack:** React, Tailwind CSS, lucide-react, axios, design_guidelines.json (dark command-center aesthetic: zinc palette only, sharp edges, font-mono for data, bg-white/text-black primary actions)

---

## Context for the implementer

### What VideoStudio currently does
`frontend/src/components/VideoStudio.js` is a 3-column layout:
- **Left sidebar (w-64):** Template selector (text list) + Clip picker (text button)
- **Center:** `<video>` player + `TimelineBar` component with amber trim handles
- **Right sidebar (w-72):** Dynamic override inputs → Caption → Hashtags → Platforms → Schedule → Render/Publish buttons

### Current problems to fix
1. **Template picker** shows just "X elements" text inside a gradient box — needs actual element map
2. **TimelineBar** uses `bg-amber-400` handles — violates design guidelines (zinc/white only)
3. **Center panel** shows "No clip" empty state when no clip is loaded even if a template is selected — should show template element layout
4. **Left sidebar** uses `bg-gradient-to-br` — violates design guidelines (no gradients)
5. **Right sidebar** has no section dividers, feels like one long form

### Design guidelines (key rules for this UI)
- **Colors:** zinc palette only. No amber, blue, green accents. Accent = white.
- **Buttons:** Primary = `bg-white text-black hover:bg-zinc-200`. Secondary = `border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white`.
- **Surfaces:** `bg-zinc-950` base, `bg-zinc-900` cards, `border border-zinc-800` dividers.
- **Typography:** Data/labels = `font-mono text-[10px] text-zinc-500 uppercase tracking-widest`. Names = `text-xs font-semibold text-white`.
- **Backgrounds:** Blueprint grid texture for preview areas: `backgroundImage: "linear-gradient(rgba(39,39,42,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.6) 1px, transparent 1px)", backgroundSize: "25% 25%"`.
- **Sharp edges everywhere:** no `rounded-lg`, no `rounded-full` on UI chrome (only on element content like CTA pill shapes).

### How MiniElement rendering works (from VideoTemplateCard.js)
Elements have `x_ratio` and `y_ratio` (0–1) for position, `props` for styling. Use percentage-based absolute positioning:
```jsx
style={{ position: "absolute", left: `${el.x_ratio * 100}%`, top: `${el.y_ratio * 100}%`, transform: "translate(-50%, -50%)" }}
```
Element types to render: `cta_button`, `text_overlay`, `lower_third`, `cta_text`, `link_in_bio`, `countdown`, `rectangle`, `circle`, `line`, `logo`, `watermark`.

---

## File Structure

**Modify only:** `frontend/src/components/VideoStudio.js`

Internal structure after redesign:
```
VideoStudio.js
├── fmt(s)                    — keep as-is
├── buildClipUrl(clip, id)    — keep as-is
├── MiniElement({ el })       — NEW: renders one element in a preview box (percentage-based)
├── TemplateOverlay({ elements }) — NEW: renders all elements on the center canvas (read-only)
├── TimelineBar(...)          — keep logic, fix amber → white styling
└── VideoStudio({ clientId }) — main component, redesigned layout
```

---

## Task 1: Fix TimelineBar — replace amber with white/zinc

**Files:**
- Modify: `frontend/src/components/VideoStudio.js:58-66`

- [ ] **Step 1: Replace amber-400 with white in TimelineBar**

Find these two `div`s in `TimelineBar` (lines ~58–63) and update:

```jsx
// BEFORE (trim-in handle)
<div className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
  style={{ left: pct(trimStart), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "in")} onClick={e => e.stopPropagation()} />
<div className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
  style={{ left: pct(trimEndVal), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "out")} onClick={e => e.stopPropagation()} />

// AFTER
<div className="absolute w-2 h-6 bg-white cursor-ew-resize z-20"
  style={{ left: pct(trimStart), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "in")} onClick={e => e.stopPropagation()} />
<div className="absolute w-2 h-6 bg-white cursor-ew-resize z-20"
  style={{ left: pct(trimEndVal), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "out")} onClick={e => e.stopPropagation()} />
```

Also update the playhead (white circle → sharper):
```jsx
// BEFORE
<div className="absolute w-3 h-3 rounded-full bg-white border-2 border-zinc-400 shadow cursor-grab z-30"
  style={{ left: pct(currentTime), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "playhead")} onClick={e => e.stopPropagation()} />

// AFTER
<div className="absolute w-2 h-4 bg-white cursor-grab z-30"
  style={{ left: pct(currentTime), transform: "translateX(-50%)" }}
  onMouseDown={e => startDrag(e, "playhead")} onClick={e => e.stopPropagation()} />
```

Also update the trim zone fill (line ~57) — change from `bg-zinc-600` to `bg-zinc-500`:
```jsx
// BEFORE
<div className="absolute h-1 bg-zinc-600 rounded-full pointer-events-none"
  style={{ left: pct(trimStart), width: pct(trimEndVal - trimStart) }} />

// AFTER
<div className="absolute h-px bg-zinc-400 pointer-events-none"
  style={{ left: pct(trimStart), width: pct(trimEndVal - trimStart) }} />
```

Also update the full timeline track (line ~55):
```jsx
// BEFORE
<div className="w-full h-1 bg-zinc-800 rounded-full" />

// AFTER
<div className="w-full h-px bg-zinc-800" />
```

- [ ] **Step 2: Run the build to verify no errors**

```bash
cd frontend && yarn build 2>&1 | tail -5
```
Expected: `Done in X.XXs.`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/VideoStudio.js
git commit -m "fix(studio): replace amber timeline handles with white, sharp design"
```

---

## Task 2: Add MiniElement helper + redesign left sidebar template picker

**Files:**
- Modify: `frontend/src/components/VideoStudio.js` (add `MiniElement`, replace template picker JSX)

- [ ] **Step 1: Add the MiniElement helper function**

Insert this after the `fmt()` function (before `TimelineBar`):

```jsx
function MiniElement({ el }) {
  const p = el.props || {};
  const base = {
    position: "absolute",
    left: `${el.x_ratio * 100}%`,
    top: `${el.y_ratio * 100}%`,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  };

  if (el.type === "cta_button") {
    return (
      <div style={{
        ...base,
        background: p.bg_color || "#fff",
        color: p.text_color || "#000",
        borderRadius: p.border_radius ?? 999,
        padding: "1px 5px",
        fontSize: 5.5,
        fontWeight: "bold",
        whiteSpace: "nowrap",
        maxWidth: "75%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {p.text || "CTA"}{p.arrow ? " →" : ""}
      </div>
    );
  }

  if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
    const hasBg = p.bg_shape && p.bg_shape !== "none";
    return (
      <div style={{
        ...base,
        color: p.color || "#fff",
        fontSize: 5.5,
        fontWeight: "700",
        textAlign: "center",
        whiteSpace: "nowrap",
        maxWidth: "80%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        background: hasBg ? `${p.bg_color || "#000"}99` : "transparent",
        borderRadius: hasBg ? (p.bg_shape === "pill" ? 999 : 1) : 0,
        padding: hasBg ? "1px 3px" : 0,
      }}>
        {p.text || el.type}
      </div>
    );
  }

  if (el.type === "link_in_bio") {
    return (
      <div style={{
        ...base,
        background: p.bg_color || "#000",
        color: p.text_color || "#fff",
        borderRadius: 2,
        padding: "1px 4px",
        fontSize: 5,
        fontWeight: "bold",
        whiteSpace: "nowrap",
      }}>
        {p.text || "link in bio"} ↗
      </div>
    );
  }

  if (el.type === "countdown") {
    return <div style={{ ...base, color: p.color || "#fff", fontSize: 9, fontWeight: "bold" }}>00:10</div>;
  }

  if (el.type === "rectangle") {
    return (
      <div style={{
        ...base,
        width: `${(p.width_ratio || 0.8) * 100}%`,
        height: `${(p.height_ratio || 0.1) * 100}%`,
        background: `${p.fill_color || "#000"}80`,
      }} />
    );
  }

  if (el.type === "circle") {
    const pct = `${(p.width_ratio || 0.1) * 100}%`;
    return <div style={{ ...base, width: pct, paddingBottom: pct, borderRadius: "50%", background: `${p.fill_color || "#fff"}60` }} />;
  }

  if (el.type === "line") {
    return <div style={{ ...base, width: `${(p.width_ratio || 0.8) * 100}%`, height: 1, background: p.color || "rgba(255,255,255,0.5)" }} />;
  }

  if (["logo", "watermark"].includes(el.type)) {
    return (
      <div style={{
        ...base,
        width: `${(p.width_ratio || 0.15) * 100}%`,
        height: `${(p.height_ratio || 0.08) * 100}%`,
        border: "1px dashed rgba(255,255,255,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 4.5, color: "rgba(255,255,255,0.3)" }}>
          {el.type === "logo" ? "LOGO" : "WM"}
        </span>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Replace the template picker section in the left sidebar**

Find this block in the left `<aside>` (starts around line 208):
```jsx
<div className="p-4 border-b border-zinc-800">
  <p className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Template</p>
  {templates.length === 0 ? (
    ...
  ) : (
    <div className="space-y-1.5">
      <button onClick={() => setTemplateId(null)} ...>None</button>
      {templates.map(t => (
        <button key={t.id} onClick={() => setTemplateId(t.id)} ...>
          ...gradient box... 
        </button>
      ))}
    </div>
  )}
</div>
```

Replace the entire `<div className="p-4 border-b border-zinc-800">` block for Template with:

```jsx
<div className="border-b border-zinc-800">
  <div className="px-4 pt-4 pb-2 flex items-center justify-between">
    <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Template</p>
    {templateId && (
      <button
        onClick={() => setTemplateId(null)}
        className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        clear
      </button>
    )}
  </div>

  {templates.length === 0 ? (
    <p className="text-[10px] font-mono text-zinc-600 px-4 pb-4">
      No templates — create one in Templates → Video.
    </p>
  ) : (
    <div className="px-3 pb-3 flex flex-col gap-1.5">
      <button
        onClick={() => setTemplateId(null)}
        className={`w-full text-left px-3 py-2 text-[10px] font-mono border transition-colors ${
          templateId === null
            ? "bg-white text-black border-white"
            : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
        }`}
      >
        No template
      </button>

      {templates.map(t => {
        const els = t.elements || [];
        const ar = t.aspect_ratio || "9:16";
        const isSelected = templateId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`w-full text-left border transition-colors duration-150 overflow-hidden group ${
              isSelected ? "border-white" : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            {/* Mini element map */}
            <div
              className="relative overflow-hidden"
              style={{
                height: 72,
                background: "#09090B",
                backgroundImage:
                  "linear-gradient(rgba(39,39,42,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.6) 1px, transparent 1px)",
                backgroundSize: "25% 25%",
              }}
            >
              {els.length === 0 ? (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-zinc-700">empty</span>
              ) : (
                <div className="absolute inset-0">
                  {[...els]
                    .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
                    .map(el => <MiniElement key={el.id} el={el} />)}
                </div>
              )}
              <div className="absolute top-1 right-1 text-[8px] font-mono text-zinc-600 bg-black/60 px-1 py-0.5 border border-zinc-800">
                {ar}
              </div>
            </div>

            {/* Info row */}
            <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-900 border-t border-zinc-800">
              <p className={`text-[10px] font-mono truncate ${isSelected ? "text-white" : "text-zinc-400"}`}>
                {t.name}
              </p>
              <p className="text-[9px] font-mono text-zinc-600 shrink-0 ml-2">
                {els.length}el
              </p>
            </div>
          </button>
        );
      })}
    </div>
  )}
</div>
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && yarn build 2>&1 | tail -5
```
Expected: `Done in X.XXs.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoStudio.js
git commit -m "feat(studio): mini element-map template picker in left sidebar"
```

---

## Task 3: Add TemplateOverlay + redesign center panel empty state

**Files:**
- Modify: `frontend/src/components/VideoStudio.js` (add `TemplateOverlay`, update center panel)

- [ ] **Step 1: Add TemplateOverlay helper**

Insert this after the `MiniElement` function:

```jsx
function TemplateOverlay({ elements }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[...elements]
        .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
        .map(el => {
          const p = el.props || {};
          const base = {
            position: "absolute",
            left: `${el.x_ratio * 100}%`,
            top: `${el.y_ratio * 100}%`,
            transform: "translate(-50%, -50%)",
          };

          if (el.type === "cta_button") {
            return (
              <div key={el.id} style={{
                ...base,
                background: p.bg_color || "#fff",
                color: p.text_color || "#000",
                borderRadius: p.border_radius ?? 999,
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}>
                {p.text || "CTA"}{p.arrow ? " →" : ""}
              </div>
            );
          }

          if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
            const hasBg = p.bg_shape && p.bg_shape !== "none";
            const width = p.width_ratio ? `${p.width_ratio * 100}%` : "70%";
            return (
              <div key={el.id} style={{
                ...base,
                color: p.color || "#fff",
                fontSize: p.size_px ? p.size_px * 0.45 : 12,
                fontWeight: "700",
                textAlign: p.align || "center",
                width,
                wordBreak: "break-word",
                background: hasBg ? `${p.bg_color || "#000"}99` : "transparent",
                borderRadius: hasBg ? (p.bg_shape === "pill" ? 999 : 3) : 0,
                padding: hasBg ? "2px 8px" : 0,
                opacity: p.opacity ?? 1,
              }}>
                {p.text || el.type}
              </div>
            );
          }

          if (el.type === "link_in_bio") {
            return (
              <div key={el.id} style={{
                ...base,
                background: p.bg_color || "#000",
                color: p.text_color || "#fff",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 9,
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}>
                {p.text || "link in bio"} ↗ {p.handle || ""}
              </div>
            );
          }

          if (el.type === "countdown") {
            return (
              <div key={el.id} style={{ ...base, color: p.color || "#fff", fontSize: p.size_px ? p.size_px * 0.45 : 20, fontWeight: "bold" }}>
                00:10
              </div>
            );
          }

          if (el.type === "rectangle") {
            return (
              <div key={el.id} style={{
                ...base,
                width: `${(p.width_ratio || 0.8) * 100}%`,
                height: `${(p.height_ratio || 0.1) * 100}%`,
                background: `${p.fill_color || "#000"}80`,
                border: p.border_width ? `${p.border_width * 0.5}px solid ${p.border_color || "#fff"}` : "none",
              }} />
            );
          }

          if (el.type === "line") {
            return (
              <div key={el.id} style={{
                ...base,
                width: `${(p.width_ratio || 0.8) * 100}%`,
                height: Math.max((p.thickness || 2) * 0.5, 1),
                background: p.color || "#fff",
              }} />
            );
          }

          if (["logo", "watermark"].includes(el.type)) {
            return (
              <div key={el.id} style={{
                ...base,
                width: `${(p.width_ratio || 0.15) * 100}%`,
                height: `${(p.height_ratio || 0.08) * 100}%`,
                border: "1px dashed rgba(255,255,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
                  {el.type === "logo" ? "LOGO" : "WM"}
                </span>
              </div>
            );
          }

          return null;
        })}
    </div>
  );
}
```

- [ ] **Step 2: Update center panel to show TemplateOverlay when no clip**

Find the center `<main>` area (around line 282). The video preview `<div>` currently contains:

```jsx
{clip?.url ? (
  <video ... />
) : (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
    <svg .../>
    <span ...>No clip</span>
  </div>
)}
```

Replace the entire content of the preview `<div>` (the one with `className="relative bg-black flex-1 min-h-0 overflow-hidden"`) with:

```jsx
{/* Blueprint grid shown when no clip */}
{!clip?.url && (
  <div
    className="absolute inset-0"
    style={{
      background: "#09090B",
      backgroundImage:
        "linear-gradient(rgba(39,39,42,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.5) 1px, transparent 1px)",
      backgroundSize: "10% 10%",
    }}
  />
)}

{/* Video player */}
{clip?.url && (
  <video
    ref={videoRef}
    src={clip.url}
    className="absolute inset-0 w-full h-full object-cover"
    onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
    onPlay={() => setPlaying(true)}
    onPause={() => setPlaying(false)}
    onEnded={() => setPlaying(false)}
    onLoadedMetadata={e => {
      if (videoRef.current) videoRef.current.currentTime = 0.01;
      setDuration(e.target.duration || 0);
    }}
    playsInline
    muted
    preload="metadata"
  />
)}

{/* Template element overlay — shown when template selected */}
{activeTemplate?.elements?.length > 0 && (
  <TemplateOverlay elements={activeTemplate.elements} />
)}

{/* No template + no clip empty state */}
{!clip?.url && !activeTemplate && (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
      <rect x="2" y="2" width="20" height="20" rx="2.5" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
    </svg>
    <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">Select a template</span>
  </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && yarn build 2>&1 | tail -5
```
Expected: `Done in X.XXs.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoStudio.js
git commit -m "feat(studio): template element overlay on canvas, blueprint grid bg"
```

---

## Task 4: Redesign right sidebar and clip section

**Files:**
- Modify: `frontend/src/components/VideoStudio.js` (left sidebar clip section + right sidebar)

- [ ] **Step 1: Redesign the clip section in left sidebar**

Find the clip section `<div className="p-4">` (around line 257). Replace with:

```jsx
<div className="px-3 py-3">
  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-1 mb-2">Clip</p>
  {activeTemplate && activeTemplate.video_overridable === false ? (
    <p className="text-[10px] font-mono text-zinc-700 px-1">Locked to template</p>
  ) : clip ? (
    <div className="border border-zinc-700 overflow-hidden">
      {clip.thumbnail_url && (
        <img src={clip.thumbnail_url} alt={clip.name} className="w-full aspect-video object-cover" />
      )}
      <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-900">
        <p className="text-[10px] font-mono text-zinc-300 truncate flex-1 min-w-0">
          {clip.name || clip.filename || clip.id}
        </p>
        <button
          onClick={() => setClip(null)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors ml-2 shrink-0 text-[10px] font-mono"
        >
          ✕
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setClipOpen(true)}
      className="w-full border border-zinc-800 px-3 py-2.5 text-[10px] font-mono text-left text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
    >
      Choose clip…
    </button>
  )}
</div>
```

- [ ] **Step 2: Redesign the right sidebar**

Find the right `<aside className="w-72 ...">` (around line 352). Replace everything inside it with:

```jsx
<aside className="w-72 shrink-0 border-l border-zinc-800 overflow-y-auto flex flex-col">
  <div className="flex flex-col gap-0 divide-y divide-zinc-800">

    {/* Overrides */}
    {(() => {
      const overridableEls = activeTemplate?.elements?.filter(e => e.overridable && e.override_key) || [];
      if (!overridableEls.length) return null;
      return (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Overrides</p>
          {overridableEls.map(el => (
            <div key={el.id} className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
                <span className="text-[8px] font-mono text-zinc-700 border border-zinc-800 px-1 py-0.5">
                  {el.type.replace(/_/g, " ")}
                </span>
                {el.override_key.replace(/_/g, " ")}
              </label>
              <input
                value={overrides[el.override_key] ?? ""}
                onChange={e => setOverrides(prev => ({ ...prev, [el.override_key]: e.target.value }))}
                placeholder={el.props?.text || el.override_key}
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
              />
            </div>
          ))}
        </div>
      );
    })()}

    {/* Caption */}
    <div className="p-4 flex flex-col gap-2">
      <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Caption</label>
      <textarea
        rows={4}
        value={caption}
        onChange={e => setCaption(e.target.value)}
        placeholder="Write your caption…"
        className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
      />
    </div>

    {/* Hashtags */}
    <div className="p-4 flex flex-col gap-2">
      <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Hashtags</label>
      <input
        value={hashtags}
        onChange={e => setHashtags(e.target.value)}
        placeholder="#marketing #brand"
        className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
      />
    </div>

    {/* Platforms */}
    <div className="p-4 flex flex-col gap-2">
      <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Platforms</label>
      <div className="flex flex-wrap gap-1.5">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => togglePlatform(p)}
            className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
              platforms.includes(p)
                ? "bg-white text-black border-white"
                : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>

    {/* Schedule */}
    <div className="p-4 flex flex-col gap-2">
      <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
        Schedule <span className="normal-case text-zinc-700">(optional)</span>
      </label>
      <input
        type="datetime-local"
        value={scheduleAt}
        onChange={e => setScheduleAt(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
      />
    </div>

    {/* Actions */}
    <div className="p-4 flex flex-col gap-2">
      <button
        onClick={handleRender}
        disabled={rendering || (!clip && !(activeTemplate && activeTemplate.video_overridable === false))}
        data-testid="studio-render-btn"
        className="w-full py-2 border border-zinc-700 text-white text-xs font-mono font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-colors"
      >
        {rendering ? "Rendering…" : "Render & Download"}
      </button>
      <button
        onClick={handlePublish}
        disabled={publishing}
        data-testid="studio-publish-btn"
        className="w-full py-2.5 bg-white text-black text-xs font-mono font-bold hover:bg-zinc-200 disabled:opacity-30 transition-colors"
      >
        {publishing ? "Publishing…" : scheduleAt ? "Schedule Video" : "Publish Now"}
      </button>
    </div>

  </div>
</aside>
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && yarn build 2>&1 | tail -5
```
Expected: `Done in X.XXs.`

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/components/VideoStudio.js
git commit -m "feat(studio): redesign clip section and right sidebar to match design guidelines"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Template picker shows mini element map cards (Task 2)
- ✅ Amber timeline handles fixed → white (Task 1)
- ✅ Template elements overlaid on center canvas (Task 3)
- ✅ Blueprint grid bg in preview area (Task 3)
- ✅ Right sidebar with section dividers (Task 4)
- ✅ Override inputs show element type context (Task 4)
- ✅ Clip section shows thumbnail when clip selected (Task 4)
- ✅ No amber, blue, green anywhere — zinc/white only
- ✅ No gradients, no rounded-lg UI chrome

**Placeholder scan:** No TBDs, no "add appropriate handling" — every code block is complete.

**Type consistency:**
- `MiniElement({ el })` defined Task 2, referenced Task 2 ✅
- `TemplateOverlay({ elements })` defined Task 3, rendered Task 3 ✅
- `activeTemplate.elements` — used in Tasks 2, 3, 4; always guarded with `?.` or `|| []` ✅
- `overrides`, `overridableEls`, `setOverrides` — same variable names throughout ✅
