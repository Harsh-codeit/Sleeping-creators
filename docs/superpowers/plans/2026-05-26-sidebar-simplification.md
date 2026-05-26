# Sidebar Simplification Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans skill to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reduce sidebar from 14 to 9 items. Remove Music, Video, Logs, Dropbox from nav. Add Video + Music tabs to Templates page. Add Logs + Team tabs to Settings page. Add route redirects so old URLs still work.

**Spec:** `docs/superpowers/specs/2026-05-26-sidebar-simplification-design.md`

**Tech Stack:** React + React Router v6 (`useSearchParams` for URL-driven tabs), Tailwind CSS, Lucide React.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `frontend/src/components/Layout.js` | Remove 4 items from NAV array, remove unused icon imports |
| Modify | `frontend/src/pages/TemplateLibrary.js` | Add Music tab, embed VideoTemplatesAdmin + MusicLibraryPage, use URL query param |
| Modify | `frontend/src/pages/Settings.js` | Add 4-tab layout (General/Logs/Team), use URL query param |
| Modify | `frontend/src/App.js` | Add 3 redirects, remove /dropbox route |

---

## Task 1: Sidebar nav — remove 4 items

**File:** `frontend/src/components/Layout.js`

Reference: NAV array lines 13–28. Items to remove: `music`, `video-templates`, `logs`, `dropbox`.

- [ ] **Step 1: Read the file**
  Read `frontend/src/components/Layout.js` in full.

- [ ] **Step 2: Remove 4 nav items from NAV array**
  Delete these 4 objects from the NAV array (lines 18–21 approx):
  ```js
  { path: "/music",           label: "Music",   icon: Music2, resource: "music" },
  { path: "/video-templates", label: "Video",   icon: Film,   resource: "video_templates" },
  { path: "/dropbox",         label: "Dropbox", icon: Star,   resource: "dropbox" },
  { path: "/logs",            label: "Logs",    icon: Terminal, resource: "logs" },
  ```

- [ ] **Step 3: Remove unused icon imports**
  From the lucide-react import at the top of Layout.js, remove: `Music2`, `Film`, `Star`, `Terminal`.

- [ ] **Verify:** NAV array has exactly 10 items (14 minus 4). Count them. The `team` and `mail` items are `ownerOnly`, so visible user sees 8 (or 10 for owner).

---

## Task 2: Templates page — add Video and Music tabs with URL query param

**File:** `frontend/src/pages/TemplateLibrary.js`

Reference: current file uses `contentTab` local state (lines 18) with "carousel" and "video" values. Video tab (lines 168–178) currently shows a redirect button. Need: replace local state with `useSearchParams`, make Video tab render `<VideoTemplatesAdmin />`, add Music tab rendering `<MusicLibraryPage />`.

- [ ] **Step 1: Read the file**
  Read `frontend/src/pages/TemplateLibrary.js` in full.

- [ ] **Step 2: Add useSearchParams import**
  The file already imports `useNavigate` from `react-router-dom`. Add `useSearchParams` to that import:
  ```js
  import { useNavigate, useSearchParams } from "react-router-dom";
  ```

- [ ] **Step 3: Add imports for VideoTemplatesAdmin and MusicLibraryPage**
  Add at top:
  ```js
  import VideoTemplatesAdmin from "./VideoTemplatesAdmin";
  import MusicLibraryPage from "./MusicLibraryPage";
  ```

- [ ] **Step 4: Replace contentTab local state with URL query param**
  Remove: `const [contentTab, setContentTab] = useState("carousel");`
  Add:
  ```js
  const [searchParams, setSearchParams] = useSearchParams();
  const contentTab = searchParams.get("tab") || "carousel";
  const setContentTab = (t) => setSearchParams({ tab: t });
  ```

- [ ] **Step 5: Add Music tab button**
  Find the two tab buttons (Carousel, Video). Add a third button after Video:
  ```jsx
  <button
    onClick={() => setContentTab("music")}
    className={`px-3 py-1 text-xs font-mono font-semibold border transition-colors ${
      contentTab === "music"
        ? "bg-white text-black border-white"
        : "bg-transparent text-zinc-400 border-zinc-700 hover:text-white"
    }`}
  >
    Music
  </button>
  ```
  Match exact className pattern used by the Carousel and Video buttons.

- [ ] **Step 6: Replace Video tab content**
  Find the Video tab section (lines 168–178 approx) that currently shows a redirect message. Replace it entirely with:
  ```jsx
  {contentTab === "video" && <VideoTemplatesAdmin />}
  ```

- [ ] **Step 7: Add Music tab content**
  After the Video tab section, add:
  ```jsx
  {contentTab === "music" && <MusicLibraryPage />}
  ```

- [ ] **Verify:** Three tab buttons render. Clicking each switches content. `?tab=music` in URL loads Music content. `?tab=video` loads VideoTemplatesAdmin. Default (no ?tab) shows Carousel.

---

## Task 3: Settings page — add tabbed layout

**File:** `frontend/src/pages/Settings.js`

Reference: current file has no tabs. All content is one flat component. Need to add a 4-tab layout: General (existing content) | Logs (render `<Logs />`) | Team & Permissions (render `<TeamPage />`, owner-only tab visible check). Tab state driven by `?tab=general|logs|team` query param.

Note: "Integrations" tab is deferred — put all current Settings.js content under General for now.

- [ ] **Step 1: Read the file**
  Read `frontend/src/pages/Settings.js` in full.

- [ ] **Step 2: Add imports**
  Add to the top of the file:
  ```js
  import { useSearchParams } from "react-router-dom";
  import Logs from "./Logs";
  import TeamPage from "./TeamPage";
  ```
  The file already imports `useUser` — verify it does, or add it if missing.

- [ ] **Step 3: Add tab state inside the component**
  At the top of the `Settings` component function (after existing state declarations), add:
  ```js
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";
  const setTab = (t) => setSearchParams({ tab: t });
  const { user } = useUser();
  const isOwner = user?.role === "owner";
  ```

- [ ] **Step 4: Add tab bar at the top of the rendered JSX**
  Immediately inside the outermost container div, before any existing content, add:
  ```jsx
  {/* Tab bar */}
  <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-0">
    {[
      { key: "general", label: "General" },
      { key: "logs",    label: "Logs" },
      ...(isOwner ? [{ key: "team", label: "Team & Permissions" }] : []),
    ].map(({ key, label }) => (
      <button
        key={key}
        onClick={() => setTab(key)}
        className={`px-4 py-2 text-xs font-mono font-semibold border-b-2 transition-colors ${
          activeTab === key
            ? "border-white text-white"
            : "border-transparent text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
  ```

- [ ] **Step 5: Wrap existing settings content in General tab condition**
  Wrap all the existing settings sections (Telegram, Automation, etc.) in:
  ```jsx
  {activeTab === "general" && (
    // ... all existing settings content here ...
  )}
  ```

- [ ] **Step 6: Add Logs tab content**
  After the General block, add:
  ```jsx
  {activeTab === "logs" && <Logs />}
  ```

- [ ] **Step 7: Add Team & Permissions tab content**
  After the Logs block, add:
  ```jsx
  {activeTab === "team" && isOwner && <TeamPage />}
  ```

- [ ] **Verify:** Tab bar renders with 2 tabs (General, Logs) for non-owners; 3 tabs (General, Logs, Team & Permissions) for owners. Switching tabs changes `?tab=` URL. Default shows General content.

---

## Task 4: Router — add redirects, remove /dropbox

**File:** `frontend/src/App.js`

Reference: routes are defined inside `<Routes>` (lines 79–114). `Navigate` from react-router-dom is available (or needs importing). Need:
- `/music` → `<Navigate to="/templates?tab=music" replace />`
- `/video-templates` → `<Navigate to="/templates?tab=video" replace />`
- `/logs` → `<Navigate to="/settings?tab=logs" replace />`
- Remove `/dropbox` route entirely

- [ ] **Step 1: Read the file**
  Read `frontend/src/App.js` in full.

- [ ] **Step 2: Ensure Navigate is imported**
  Find the react-router-dom import. Add `Navigate` if not already there:
  ```js
  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  ```

- [ ] **Step 3: Replace /music route with redirect**
  Find: `<Route path="/music" element={<PermissionGate ...><MusicLibraryPage /></PermissionGate>} />`
  Replace with: `<Route path="/music" element={<Navigate to="/templates?tab=music" replace />} />`

- [ ] **Step 4: Replace /video-templates route with redirect**
  Find: `<Route path="/video-templates" element={<PermissionGate ...><VideoTemplatesAdmin /></PermissionGate>} />`
  Replace with: `<Route path="/video-templates" element={<Navigate to="/templates?tab=video" replace />} />`

- [ ] **Step 5: Replace /logs route with redirect**
  Find: `<Route path="/logs" element={<PermissionGate ...><Logs /></PermissionGate>} />`
  Replace with: `<Route path="/logs" element={<Navigate to="/settings?tab=logs" replace />} />`

- [ ] **Step 6: Remove /dropbox route**
  Find and delete: `<Route path="/dropbox" element={<PermissionGate resource="dropbox"><GlobalLibrary /></PermissionGate>} />`

- [ ] **Step 7: Clean up unused imports in App.js**
  Check if `MusicLibraryPage`, `VideoTemplatesAdmin`, `Logs`, `GlobalLibrary` imports are still needed elsewhere in App.js. If not, remove them.

- [ ] **Verify:** Navigate to `/music` → browser URL changes to `/templates?tab=music`. Navigate to `/dropbox` → falls through to `*` catch-all and redirects to `/`.

---

## Task 5: Final verification

- [ ] Sidebar has 9 items visible for non-owner users (Dashboard, Clients, Templates, Calendar, Studio, Analytics, Usage, Settings, Mail)
- [ ] Sidebar has 10 items for owners (adds Team)
- [ ] `/templates` shows 3 tabs: Carousel (default), Video, Music
- [ ] `/templates?tab=video` shows VideoTemplatesAdmin content
- [ ] `/templates?tab=music` shows MusicLibraryPage content
- [ ] `/settings` shows General tab by default
- [ ] `/settings?tab=logs` shows Logs content
- [ ] `/settings?tab=team` shows TeamPage for owners; hidden tab for non-owners
- [ ] Old routes redirect: `/music`, `/video-templates`, `/logs` all redirect correctly
- [ ] `/dropbox` → redirects to `/` (catch-all)
- [ ] No console errors about missing imports
