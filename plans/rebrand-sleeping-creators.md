# Rebrand: AutoMonk → Sleeping Creators

**Goal:** Replace all user-visible (and internal) references to "AutoMonk" with "Sleeping Creators", and swap in the `frontend/public/Sleeping Creators.png` logo throughout the UI.

**Logo:** `frontend/public/Sleeping Creators.png` — circular dark tile with zzZ letters. Already in place; no file copy needed.

**Scope confirmed by audit:** 30+ files across frontend, backend, tests, and docs.

---

## Phase 0: Findings Summary (Documentation Discovery — Complete)

### What exists
| Category | Finding |
|---|---|
| Logo file | `frontend/public/Sleeping Creators.png` — 53 KB PNG, already present |
| Current page title | `<title>AutoMonk \| Content Engine</title>` in `frontend/public/index.html:24` |
| No favicon | `index.html` has no `<link rel="icon">` tag |
| Login brand block | `Login.js:53-58` — white square with "AM" initials + `<h1>AutoMonk</h1>` |
| Sidebar logo | `Layout.js:51-57` — Zap icon + "AutoMonk" text + "CONTENT ENGINE" subtitle |
| localStorage key | `"automonk_token"` used in 7 files |
| Backend Telegram | `telegram_service.py:23,57,93` — "🤖 AutoMonk" prefix in all notifications |
| Google Sheets name | `sheets_service.py:65` — `f"AutoMonk — {client_name}"` |
| API status string | `server.py:2631` — `"AutoMonk API running"` |
| Approval page title | `server.py:2028` — `<title>{title} — AutoMonk</title>` |
| Legal pages | `PrivacyPolicy.js` (4 occurrences), `TermsOfService.js` (8 occurrences) |
| Env defaults | `storage.py`, `video_service.py`, `video_worker.py`, `.env.example` |

### Anti-patterns to avoid
- Do NOT rename `automonk_status` variable in `server.py:2589-2592` — it is a local variable holding a status string value, not user-visible brand text.
- Do NOT change storage bucket paths already in production (`.env` file), only update the `.env.example` defaults and comments.
- Logo file has a space in its name (`Sleeping Creators.png`). In JSX use `src="/Sleeping Creators.png"` (CRA serves `public/` at root). In `index.html` use `%PUBLIC_URL%/Sleeping Creators.png`. Both are valid.

---

## Phase 1: HTML Head — Title + Favicon

**File:** `frontend/public/index.html`

### Tasks
1. Replace `<title>AutoMonk | Content Engine</title>` (line 24) with:
   ```html
   <title>Sleeping Creators | Content Engine</title>
   ```
2. Add favicon link tag **before** the `<title>` tag:
   ```html
   <link rel="icon" type="image/png" href="%PUBLIC_URL%/Sleeping Creators.png" />
   ```

### Verification
- `grep -n "AutoMonk" frontend/public/index.html` → zero results
- Browser tab shows "Sleeping Creators | Content Engine" and the zzZ logo as favicon

---

## Phase 2: Frontend UI — Login Page

**File:** `frontend/src/pages/Login.js`

### Tasks
1. **Replace the "AM" monogram brand block** (lines 52–59). The current block:
   ```jsx
   <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl mb-5">
     <span className="text-black font-black text-xl tracking-tight">AM</span>
   </div>
   <h1 className="text-2xl font-bold text-white tracking-tight">AutoMonk</h1>
   ```
   Replace with:
   ```jsx
   <img
     src="/Sleeping Creators.png"
     alt="Sleeping Creators"
     className="w-14 h-14 rounded-2xl mb-5 mx-auto"
   />
   <h1 className="text-2xl font-bold text-white tracking-tight">Sleeping Creators</h1>
   ```

2. **Replace footer tagline** (line 137):
   ```
   AUTOMONK · CONTENT ENGINE
   ```
   →
   ```
   SLEEPING CREATORS · CONTENT ENGINE
   ```

3. **Rename localStorage key** (line 32):
   ```js
   localStorage.setItem("automonk_token", data.token);
   ```
   →
   ```js
   localStorage.setItem("sc_token", data.token);
   ```

### Verification
- `grep -n "automonk\|AutoMonk" frontend/src/pages/Login.js` → zero results
- Login page renders the zzZ logo above the title

---

## Phase 3: Frontend UI — Layout Sidebar

**File:** `frontend/src/components/Layout.js`

### Tasks
1. **Replace the logo block** (lines 50–57). The current block:
   ```jsx
   <div className="w-7 h-7 bg-white flex items-center justify-center">
     <Zap size={14} className="text-black" />
   </div>
   <div>
     <div className="text-sm font-bold tracking-tight text-white">AutoMonk</div>
     <div className="text-[10px] text-zinc-500 font-mono">CONTENT ENGINE</div>
   </div>
   ```
   Replace with:
   ```jsx
   <img src="/Sleeping Creators.png" alt="Sleeping Creators" className="w-7 h-7 rounded" />
   <div>
     <div className="text-sm font-bold tracking-tight text-white">Sleeping Creators</div>
     <div className="text-[10px] text-zinc-500 font-mono">CONTENT ENGINE</div>
   </div>
   ```
2. Remove the unused `Zap` import from line 2 if it is no longer referenced elsewhere in the file.

### Verification
- `grep -n "AutoMonk\|Zap" frontend/src/components/Layout.js` → zero results (unless Zap is used elsewhere)
- Sidebar header shows zzZ logo + "Sleeping Creators"

---

## Phase 4: Frontend UI — Other Components

### 4a. Onboarding.js
**File:** `frontend/src/pages/Onboarding.js:684`

Replace:
```jsx
<span className="text-sm font-bold text-white">AutoMonk</span>
```
→
```jsx
<span className="text-sm font-bold text-white">Sleeping Creators</span>
```

### 4b. LegalDocument.js
**File:** `frontend/src/components/LegalDocument.js:46`

Replace:
```jsx
<div className="text-sm font-bold tracking-tight text-white">AutoMonk</div>
```
→
```jsx
<div className="text-sm font-bold tracking-tight text-white">Sleeping Creators</div>
```

### 4c. Settings.js — brand text + localStorage key
**File:** `frontend/src/pages/Settings.js`

- Line 187: `"AutoMonk can create and sync..."` → `"Sleeping Creators can create and sync..."`
- Line 188: `"Authorize AutoMonk to create..."` → `"Authorize Sleeping Creators to create..."`
- Line 353: `localStorage.setItem("automonk_token", data.token)` → `localStorage.setItem("sc_token", data.token)`

### 4d. PrivacyPolicy.js
**File:** `frontend/src/pages/PrivacyPolicy.js`

Replace all 4 occurrences of `AutoMonk` with `Sleeping Creators`. Lines 7, 26, 66, 76.

### 4e. TermsOfService.js
**File:** `frontend/src/pages/TermsOfService.js`

Replace all 8 occurrences of `AutoMonk` with `Sleeping Creators`. Lines 7, 8, 15, 39, 45, 53, 67, 77.

### Verification
```bash
grep -rn "AutoMonk\|automonk" frontend/src/pages/ frontend/src/components/
```
→ zero results

---

## Phase 5: Frontend — localStorage Key Rename (App.js + VideoEditor)

**Context:** Renaming `automonk_token` → `sc_token`. This will log out all currently logged-in users on first load — acceptable for an internal admin tool.

### Files to update

| File | Line | Old | New |
|------|------|-----|-----|
| `frontend/src/App.js` | 27 | `localStorage.getItem("automonk_token")` | `localStorage.getItem("sc_token")` |
| `frontend/src/App.js` | 50 | `localStorage.removeItem("automonk_token")` | `localStorage.removeItem("sc_token")` |
| `frontend/src/App.js` | 65 | `localStorage.removeItem("automonk_token")` | `localStorage.removeItem("sc_token")` |
| `frontend/src/components/VideoEditor.js` | 13 | `localStorage.getItem("automonk_token")` | `localStorage.getItem("sc_token")` |
| `frontend/src/components/VideoEditor.test.js` | 34 | `localStorage.setItem("automonk_token", ...)` | `localStorage.setItem("sc_token", ...)` |

### Verification
```bash
grep -rn "automonk_token" frontend/src/
```
→ zero results

---

## Phase 6: Backend — Service Strings

### 6a. telegram_service.py
**File:** `backend/telegram_service.py`

| Line | Old | New |
|------|-----|-----|
| 23 | `f"🤖 AutoMonk\n\n{message}"` | `f"🤖 Sleeping Creators\n\n{message}"` |
| 57 | `f"🤖 AutoMonk — Approval Required\n\n"` | `f"🤖 Sleeping Creators — Approval Required\n\n"` |
| 93 | `"📊 Weekly AutoMonk Report\n\n"` | `"📊 Weekly Sleeping Creators Report\n\n"` |

### 6b. sheets_service.py
**File:** `backend/sheets_service.py`

| Line | Old | New |
|------|-----|-----|
| 2 | docstring `AutoMonk` | `Sleeping Creators` |
| 65 | `f"AutoMonk — {client_name}"` | `f"Sleeping Creators — {client_name}"` |

**Note:** This only affects newly created Sheets. Existing client Sheets in Google Drive retain their old names — no migration needed.

### 6c. server.py
**File:** `backend/server.py`

| Line | Old | New |
|------|-----|-----|
| 2028 | `<title>{title} — AutoMonk</title>` | `<title>{title} — Sleeping Creators</title>` |
| 2453 | `"AutoMonk test message: Telegram connection is working!"` | `"Sleeping Creators test message: Telegram connection is working!"` |
| 2631 | `"AutoMonk API running"` | `"Sleeping Creators API running"` |

**Skip:** `automonk_status` variable at lines 2589–2592 — it is a Python variable name holding a mapped status string value, not brand text.

### Verification
```bash
grep -n "AutoMonk\|automonk" backend/telegram_service.py backend/sheets_service.py backend/server.py
```
→ zero results (except the `automonk_status` variable name, which is acceptable)

---

## Phase 7: Infrastructure Defaults

These are fallback default values when env vars are not set. They do not affect production (which reads from `.env`). Update for consistency.

### 7a. storage.py
**File:** `backend/storage.py`

| Line | Old default | New default |
|------|-------------|-------------|
| 11 (comment) | `e.g. automonk` | `e.g. sleeping-creators` |
| 19 (comment) | `e.g. automonk-media` | `e.g. sleeping-creators-media` |
| 44 | `"automonk-media"` | `"sleeping-creators-media"` |
| 52 | `"automonk"` | `"sleeping-creators"` |

### 7b. video_service.py
**File:** `backend/video_service.py:15`

```python
TEMP_DIR = Path("/tmp/automonk")
```
→
```python
TEMP_DIR = Path("/tmp/sleeping-creators")
```

### 7c. video_worker.py
**File:** `backend/video_worker.py:32`

```python
db_name = os.environ.get("DB_NAME", "automonk")
```
→
```python
db_name = os.environ.get("DB_NAME", "sleeping-creators")
```

### 7d. .env.example
**File:** `backend/.env.example`

| Line | Old | New |
|------|-----|-----|
| 4 | `DB_NAME=automonk` | `DB_NAME=sleeping-creators` |
| 35 | `R2_BUCKET_NAME=automonk` | `R2_BUCKET_NAME=sleeping-creators` |
| 43 | `# MINIO_BUCKET=automonk-media` | `# MINIO_BUCKET=sleeping-creators-media` |
| 44 | `# MINIO_PUBLIC_URL=http://localhost:9000/automonk-media` | `# MINIO_PUBLIC_URL=http://localhost:9000/sleeping-creators-media` |

### 7e. migrate_to_r2.py
**File:** `backend/migrate_to_r2.py`

Update default bucket name references at lines 41 and 47 (same pattern as storage.py above).

### Verification
```bash
grep -n "automonk" backend/storage.py backend/video_service.py backend/video_worker.py backend/.env.example backend/migrate_to_r2.py
```
→ zero results

---

## Phase 8: Test Fixtures

Test files reference `"automonk"` as fixture strings for bucket names and URLs. These are unit-test fixtures that match the `.env.example` defaults — update them to match the new defaults.

### Files
- `backend/tests/test_migrate_to_r2.py` — ~15 occurrences (bucket names, URL strings)
- `backend/tests/test_r2_storage.py` — ~12 occurrences (bucket names, URL strings)
- `backend/tests/test_local_fallback.py` — 4 occurrences (URL strings with `monkmedia.io/automonk/...`)

### Approach
For each file, replace:
- `"automonk"` (as a bucket name string) → `"sleeping-creators"`
- `"automonk-media"` → `"sleeping-creators-media"`
- URL path segment `/automonk/` → `/sleeping-creators/`

**Note for `test_local_fallback.py`:** URLs contain `monkmedia.io/automonk/...` — this is a storage domain path that reflects production bucket layout. Only update the `automonk` path segment, not the domain `monkmedia.io`.

After updating, run:
```bash
cd backend && pytest tests/test_migrate_to_r2.py tests/test_r2_storage.py tests/test_local_fallback.py -v
```
→ all tests must pass

---

## Phase 9: Documentation Files

Update internal/planning docs for consistency. These are non-executable files.

| File | Change |
|------|--------|
| `CLAUDE.md:7` | `AutoMonk — an AI-powered...` → `Sleeping Creators — an AI-powered...` |
| `setup-claude-skills.sh:3` | `# AutoMonk-EM — Claude Skills Setup` → `# Sleeping Creators — Claude Skills Setup` |
| `SETUP_PROMPT.md:1` | heading: `AutoMonk-EM` → `Sleeping Creators` |
| `PRD-new-features.md:2,6` | `AutoMonk-EM` → `Sleeping Creators` |
| `memory/PRD.md:1` | `# AutoMonk — Content Automation Platform` → `# Sleeping Creators — Content Automation Platform` |
| `how-content-is-generated.txt:4,110` | both `AutoMonk` occurrences → `Sleeping Creators` |
| `docs/competitor-intelligence-client-explainer.md` | all 8 occurrences of `AutoMonk` → `Sleeping Creators` |
| `GOOGLE_SHEETS_PLAN.md` | all `AutoMonk` occurrences → `Sleeping Creators` |
| `plans/bundle-social-integration.md` | all `AutoMonk` occurrences → `Sleeping Creators` |
| `superpowers/specs/2026-04-06-trend-driven-content-generation-design.md` | `AutoMonk-EM` → `Sleeping Creators` |

### Verification
```bash
grep -rn "AutoMonk\|automonk" . \
  --include="*.md" \
  --include="*.txt" \
  --include="*.sh" \
  --exclude-dir=node_modules \
  --exclude-dir=.git
```
→ zero results

---

## Phase 10: Final End-to-End Verification

Run this complete audit grep — it must return zero results:

```bash
grep -rn "AutoMonk\|automonk_token\|AUTOMONK" . \
  --include="*.js" \
  --include="*.jsx" \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.py" \
  --include="*.html" \
  --include="*.md" \
  --include="*.txt" \
  --include="*.sh" \
  --include="*.example" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=build
```

**Acceptable survivors:** The `automonk_status` Python variable name at `backend/server.py:2589-2592` (local variable, not brand text).

Then visually confirm:
1. Browser tab shows zzZ favicon + "Sleeping Creators | Content Engine" title
2. Login page shows zzZ logo + "Sleeping Creators" heading
3. Sidebar shows zzZ logo + "Sleeping Creators" nav header
4. Telegram test notification reads "🤖 Sleeping Creators"
5. `yarn test` passes (VideoEditor.test.js uses updated `sc_token`)
6. `pytest tests/ -v` passes (all test fixtures updated)
