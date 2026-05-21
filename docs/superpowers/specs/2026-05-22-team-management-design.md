# Team Management Feature — Design Spec
**Date:** 2026-05-22
**Branch:** feat/team-management (to be created)
**Status:** Approved

---

## Overview

Add multi-user team support to the Sleeping Creators dashboard. The owner (current admin) can create team member accounts with fully custom, granular permissions (View / Create / Edit / Delete per section). The existing admin login flow is unchanged. Team members log in with email + password and see only the nav items and actions their permissions allow.

---

## Approach

**Additive team layer** — keep existing admin auth untouched. Add a `team_members` MongoDB collection and a new team login endpoint. JWTs gain a `role` field. Backend middleware enforces permissions via a central path map. Frontend reads `/api/me` on load and filters nav + actions accordingly.

---

## Section 1: Data Model & Auth

### `team_members` MongoDB Collection

```json
{
  "_id": "ObjectId",
  "name": "Jane Smith",
  "email": "jane@agency.com",
  "password_hash": "bcrypt hash",
  "is_active": true,
  "permissions": {
    "dashboard":       { "view": true },
    "clients":         { "view": true,  "create": false, "edit": true,  "delete": false },
    "templates":       { "view": true,  "create": true,  "edit": true,  "delete": false },
    "calendar":        { "view": true,  "create": true,  "edit": true,  "delete": false },
    "studio":          { "view": true,  "create": true,  "edit": true,  "delete": true  },
    "music":           { "view": true,  "create": false, "edit": false, "delete": false },
    "video_templates": { "view": true,  "create": false, "edit": false, "delete": false },
    "analytics":       { "view": true  },
    "dropbox":         { "view": true,  "create": false, "edit": false, "delete": false },
    "logs":            { "view": false },
    "usage":           { "view": false },
    "settings":        { "view": false, "edit": false }
  },
  "created_at": "datetime"
}
```

**Notes:**
- `dashboard`, `analytics`, `logs`, `usage` have only `view` — create/edit/delete are not applicable.
- `settings` has `view` and `edit` only.
- All other sections have the full four: `view`, `create`, `edit`, `delete`.

### JWT Changes (backward-compatible)

| Token type | Payload |
|------------|---------|
| Owner (existing) | `{ "sub": "admin", "exp": ... }` — still valid as-is |
| Owner (new) | `{ "sub": "admin", "role": "owner", "exp": ... }` |
| Team member | `{ "sub": "<member_id>", "role": "member", "exp": ... }` |

Tokens without a `role` field are treated as owner (backward compat).

---

## Section 2: Backend API

### New Endpoints

```
POST /api/auth/team/login      { email, password } → { token }
GET  /api/me                   → { role, name, email, permissions }

GET    /api/team               → list members (owner only)
POST   /api/team               → create member (owner only)
PUT    /api/team/{id}          → update member — name, password, permissions, is_active (owner only)
DELETE /api/team/{id}          → delete member (owner only)
```

### Permission Enforcement — Central Path Map

`AuthMiddleware` in `server.py` is extended with a `PERMISSION_MAP` dict mapping `(method, path_pattern)` to `(resource, action)`. Owner tokens bypass the map. Member tokens that hit an unmapped path are denied by default (allowlist model).

```python
PERMISSION_MAP = {
    ("GET",    r"^/api/clients$"):              ("clients", "view"),
    ("POST",   r"^/api/clients$"):              ("clients", "create"),
    ("PUT",    r"^/api/clients/[^/]+$"):        ("clients", "edit"),
    ("DELETE", r"^/api/clients/[^/]+$"):        ("clients", "delete"),
    ("GET",    r"^/api/templates"):             ("templates", "view"),
    ("POST",   r"^/api/templates"):             ("templates", "create"),
    ("PUT",    r"^/api/templates/[^/]+"):       ("templates", "edit"),
    ("DELETE", r"^/api/templates/[^/]+"):       ("templates", "delete"),
    ("GET",    r"^/api/calendar"):              ("calendar", "view"),
    ("POST",   r"^/api/calendar"):              ("calendar", "create"),
    ("PUT",    r"^/api/calendar/[^/]+"):        ("calendar", "edit"),
    ("DELETE", r"^/api/calendar/[^/]+"):        ("calendar", "delete"),
    ("GET",    r"^/api/carousels"):             ("studio", "view"),
    ("POST",   r"^/api/carousels"):             ("studio", "create"),
    ("PUT",    r"^/api/carousels/[^/]+"):       ("studio", "edit"),
    ("DELETE", r"^/api/carousels/[^/]+"):       ("studio", "delete"),
    ("GET",    r"^/api/music"):                 ("music", "view"),
    ("POST",   r"^/api/music"):                 ("music", "create"),
    ("PUT",    r"^/api/music/[^/]+"):           ("music", "edit"),
    ("DELETE", r"^/api/music/[^/]+"):           ("music", "delete"),
    ("GET",    r"^/api/video-templates"):       ("video_templates", "view"),
    ("POST",   r"^/api/video-templates"):       ("video_templates", "create"),
    ("PUT",    r"^/api/video-templates/[^/]+"): ("video_templates", "edit"),
    ("DELETE", r"^/api/video-templates/[^/]+"): ("video_templates", "delete"),
    ("GET",    r"^/api/analytics"):             ("analytics", "view"),
    ("GET",    r"^/api/drive"):                 ("dropbox", "view"),
    ("POST",   r"^/api/drive"):                 ("dropbox", "create"),
    ("PUT",    r"^/api/drive/[^/]+"):           ("dropbox", "edit"),
    ("DELETE", r"^/api/drive/[^/]+"):           ("dropbox", "delete"),
    ("GET",    r"^/api/logs"):                  ("logs", "view"),
    ("GET",    r"^/api/usage"):                 ("usage", "view"),
    ("GET",    r"^/api/settings"):              ("settings", "view"),
    ("PUT",    r"^/api/settings"):              ("settings", "edit"),
}
```

Routes always accessible to members (no permission check): `/api/me`, `/api/auth/`.

### Error Responses

| Scenario | HTTP | Message |
|----------|------|---------|
| Wrong team credentials | 401 | "Invalid email or password" |
| Inactive account | 401 | "Account inactive" |
| Forbidden route | 403 | "Insufficient permissions" |
| Duplicate email | 400 | "A team member with this email already exists" |
| Owner-only endpoint called by member | 403 | "Insufficient permissions" |

---

## Section 3: Frontend

### New Files

| File | Type | Purpose |
|------|------|---------|
| `src/context/UserContext.js` | Named export (`useUser`, `UserProvider`) | Stores `{ role, name, email, permissions }` from `/api/me` |
| `src/pages/TeamPage.js` | Default export | Team member list + management |
| `src/components/team/MemberPanel.js` | Named export | Add/Edit slide-out panel |
| `src/components/team/PermissionsMatrix.js` | Named export | Checkbox grid component |
| `src/components/PermissionGate.js` | Named export | Route-level permission guard |

### UserContext

Fetched once after login via `/api/me`. If the call fails or token has no `role`, defaults to `{ role: "owner" }` (backward compat). Exposed via `useUser()` hook.

### Login Page Changes

Add optional `EMAIL` field above the password input:
- Input: `rounded-none bg-zinc-900 border border-zinc-800 text-white focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500`
- Label: `text-[10px] font-mono text-zinc-500 uppercase tracking-widest`
- Hint: `text-[10px] font-mono text-zinc-600 mt-1` — "TEAM MEMBERS ONLY — LEAVE BLANK FOR ADMIN"
- If email filled → `POST /api/auth/team/login`; if empty → existing `POST /api/auth/login`

### Layout.js — Nav Filtering

```js
const { role, permissions } = useUser();

const visibleNav = NAV.filter(nav => {
  if (nav.ownerOnly) return role === "owner";
  if (!permissions) return true; // owner sees all
  return permissions[nav.resource]?.view !== false;
});
```

Add `resource` and `ownerOnly` keys to each NAV item. `Team` nav item has `ownerOnly: true`.

### App.js — Route Protection

Wrap page routes with `<PermissionGate resource="clients">` which redirects to `/` if `permissions[resource]?.view !== true`. Owner bypasses all gates.

### Action-Level UI Pattern

Within each page, read permissions from context and conditionally render buttons:

```js
const { permissions } = useUser();
const p = permissions?.clients ?? { view: true, create: true, edit: true, delete: true };

// Hide "Add Client" if !p.create
// Hide delete button if !p.delete
// Disable edit form submit if !p.edit
```

### `/team` Page — Member List

Dense table. No alternating rows. Font: IBM Plex Mono for email/dates, IBM Plex Sans for names.

```
NAME              EMAIL                  STATUS     ACTIONS
──────────────────────────────────────────────────────────
Jane Smith        jane@agency.com        ● ACTIVE   [Edit] [Deactivate]
Carlos R.         carlos@agency.com      ○ INACTIVE [Edit] [Activate]
```

- Row: `border-b border-zinc-800 hover:bg-zinc-900 transition-colors duration-200`
- Status dot: `w-1.5 h-1.5 rounded-full` — `bg-emerald-400 animate-pulse` (active) / `bg-zinc-600` (inactive)
- `[Add Member]`: `data-testid="team-add-member-btn"` — `bg-white text-black font-bold rounded-none px-4 py-2 hover:bg-zinc-200 transition-colors duration-200`
- Action buttons: `border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none text-xs font-mono px-3 py-1.5 transition-colors duration-200`

### Add / Edit Slide-out Panel

```
fixed right-0 top-0 h-full w-[480px] bg-[#09090B] border-l border-zinc-800 flex flex-col z-50
```
Backdrop: `bg-black/60`.

**Header:** `border-b border-zinc-800 px-6 py-4` — title in IBM Plex Sans bold, close button `data-testid="team-panel-close"`.

**Fields:** Name, Email, Password — all `rounded-none bg-zinc-900 border border-zinc-800 text-white focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500`. Password on Edit: hint `text-[10px] font-mono text-zinc-600` — "LEAVE BLANK TO KEEP CURRENT PASSWORD".

### Permissions Matrix

```
SECTION        VIEW   CREATE   EDIT   DELETE
─────────────────────────────────────────────
Dashboard       ☑      —        —       —
Clients         ☑      ☐        ☑       ☐
Templates       ☑      ☑        ☑       ☐
Calendar        ☑      ☑        ☑       ☐
Studio          ☑      ☑        ☑       ☑
Music           ☑      ☐        ☐       ☐
Video           ☑      ☐        ☐       ☐
Analytics       ☑      —        —       —
Dropbox         ☑      ☐        ☐       ☐
Logs            ☐      —        —       —
Usage           ☐      —        —       —
Settings        ☐      —        ☐       —
```

- Header: `text-[10px] font-mono text-zinc-500 uppercase tracking-widest sticky top-0 bg-[#09090B] border-b border-zinc-800`
- `—` cells: `text-zinc-700 select-none` (non-interactive)
- Checkboxes: `accent-white w-4 h-4`
- Section name: `text-sm text-zinc-300 font-mono`
- Row: `border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors duration-200`
- Wrapper: `overflow-x-auto` for mobile

**Panel Footer** (fixed bottom): `border-t border-zinc-800 px-6 py-4 flex justify-between`
- Cancel: `text-zinc-500 hover:text-white text-sm font-mono transition-colors duration-200`
- Save: `data-testid="team-save-btn"` — `bg-white text-black font-bold px-5 py-2.5 rounded-none hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-200`

---

## Section 4: Error Handling & Edge Cases

- **Empty permissions** — valid. Member logs in, sees blank nav, lands on a "no access" `<div>` message on `/`.
- **`/api/me` failure on load** — treat as owner (fail open, backward compat with old tokens).
- **Direct URL access without permission** — `<PermissionGate>` redirects to `/` via `<Navigate to="/" replace />`.
- **`/team` accessed by non-owner** — `<PermissionGate ownerOnly>` redirects to `/`.
- **Owner deletion** — not possible via `/api/team`; owner has no document in `team_members`.
- **Deactivated member token** — middleware returns `401 "Account inactive"` → frontend 401 interceptor logs them out.
- **All API errors** — displayed via `sonner` `toast.error(...)`.
- **Panel save during submit** — Save button disabled + loading state until response resolves.

---

## Files Changed

### Backend (`backend/server.py`)
- Extend `_check_token` to return `{ role, user_id }` instead of a bool
- Extend `AuthMiddleware` with `PERMISSION_MAP` and member permission check
- Add `team_members` collection queries
- Add endpoints: `/api/auth/team/login`, `/api/me`, `/api/team` CRUD

### Frontend
- `src/App.js` — wrap routes with `<PermissionGate>`, add `/team` route
- `src/components/Layout.js` — filter NAV by permissions, add Team nav item
- `src/pages/Login.js` — add optional email field
- `src/context/UserContext.js` — new
- `src/pages/TeamPage.js` — new
- `src/components/team/MemberPanel.js` — new
- `src/components/team/PermissionsMatrix.js` — new
- `src/components/PermissionGate.js` — new

---

## Design Constraints (from `design_guidelines.json`)

- `rounded-none` on all inputs and buttons
- IBM Plex Sans for headings, IBM Plex Mono for data/labels
- No gradients, no shadows — 1px `border-zinc-800` borders only
- `transition-colors duration-200` on all interactive elements
- `data-testid` in kebab-case on every interactive element
- Named exports for components, default exports for pages
- Icons from `lucide-react` or `@phosphor-icons/react`
- Toasts via `sonner`
- Sharp status dots with `animate-pulse` for active states
