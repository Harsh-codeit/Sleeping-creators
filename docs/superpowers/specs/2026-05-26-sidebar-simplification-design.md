# Sidebar Simplification & Settings/Templates Redesign

**Date:** 2026-05-26
**Status:** Approved

---

## Goal

Reduce sidebar clutter from 14 items to 9 by consolidating Music, Video, and Logs into existing pages, removing Dropbox entirely, and giving Settings a tabbed layout.

---

## Sidebar Changes

### Before → After

| Before (14) | After (9) | Action |
|---|---|---|
| Dashboard | Dashboard | Keep |
| Clients | Clients | Keep |
| Templates | Templates | Keep (now 3 tabs) |
| Calendar | Calendar | Keep |
| Studio | Studio | Keep |
| Music | — | Move → Templates/Music tab |
| Video | — | Move → Templates/Video tab |
| Analytics | Analytics | Keep |
| Dropbox | — | Remove entirely |
| Logs | — | Move → Settings/Logs tab |
| Usage | Usage | Keep |
| Settings | Settings | Keep (now tabbed) |
| Team | Team | Keep (owner only) |
| Mail | Mail | Keep (owner only) |

### Route changes
- `/music` → redirect to `/templates?tab=music` (or keep route, just remove from nav)
- `/video-templates` → redirect to `/templates?tab=video`
- `/logs` → redirect to `/settings?tab=logs`
- `/dropbox` → remove route entirely

---

## Templates Page — 3 Tabs

**Route:** `/templates`

| Tab | Label | Content |
|---|---|---|
| 0 | Carousel | Existing Templates page (carousel template list, create/edit) |
| 1 | Video | Existing Video Templates page content |
| 2 | Music | Existing Music page content |

**Implementation:** Add a tab bar at the top of the Templates page. Each tab mounts the existing page component for that section. Default tab is Carousel.

Tab state is driven by a `?tab=carousel|video|music` query param so deep links work (e.g. from the pipeline wizard's music section).

---

## Settings Page — Tabbed Layout

**Route:** `/settings`

| Tab | Label | Content | Access |
|---|---|---|---|
| 0 | General | Existing settings content (brand, timezone, API keys, etc.) | All |
| 1 | Integrations | Existing integrations panel (Google Drive, Instagram, etc.) | All |
| 2 | Logs | Existing `/logs` page content | All |
| 3 | Team & Permissions | Existing `/team` page content | Owner only |

**Implementation:** Wrap the existing Settings page in a tab layout. Each tab renders the existing component for that section. Tab state driven by `?tab=general|integrations|logs|team` query param.

The "Team & Permissions" tab is only visible to users with `role === "owner"`.

---

## Files to Change

### Sidebar (`frontend/src/components/Layout.js`)
- Remove `music`, `video-templates`, `logs`, `dropbox` from the `NAV` array
- Result: 9 nav items

### Templates page (`frontend/src/pages/TemplatesPage.js` or equivalent)
- Add tab bar: Carousel | Video | Music
- Render existing components per tab
- Read/write `?tab=` query param

### Settings page (`frontend/src/pages/SettingsPage.js` or equivalent)
- Add tab bar: General | Integrations | Logs | Team & Permissions
- Render existing components per tab
- Read/write `?tab=` query param
- Hide Team tab for non-owners

### Router (`frontend/src/App.js` or router file)
- Add redirects: `/music` → `/templates?tab=music`, `/video-templates` → `/templates?tab=video`, `/logs` → `/settings?tab=logs`
- Remove `/dropbox` route

---

## Out of Scope
- Redesigning the content of any existing page (Settings General, Logs, etc.)
- Changing permissions logic
- Mobile/responsive changes beyond what the tab layout requires
