# SC ↔ Affiliation SC Integration — Design Spec

**Date:** 2026-05-24  
**Scope:** Wire the Affiliation SC onboarding form to the Sleeping Creators (SC) backend via bidirectional webhook integration.

---

## Problem

Three things are broken that prevent the onboarding form from working end-to-end:

1. `OnboardingForm.tsx` resolves `BACKEND` to `VITE_SC_BACKEND_URL` (port 8000, SC backend), but `/api/onboard-check/{token}` and `/api/onboard/{token}` only exist in the Affiliation SC backend (port 8001).
2. Affiliation SC backend calls `POST ${SC_WEBHOOK_URL}/api/webhooks/affiliate/new-client` after form submission, but that endpoint does not exist in the SC backend. `SC_WEBHOOK_URL` is also empty.
3. There is no status callback from SC → Affiliation SC when a client is approved/rejected, so Affiliation SC's `clients` collection stays stuck at `status: "pending"` forever.

---

## Architecture

```
[Client Browser]
    │
    ▼
[Affiliation SC Frontend]  (Vite, port 5173)
    │  GET  /api/onboard-check/{token}
    │  POST /api/onboard/{token}
    ▼
[Affiliation SC Backend]  (FastAPI, port 8001)
    │  stores → affiliate_db.clients
    │  creates → affiliate_db.leads  (status: pending_setter)
    │
    │  POST /api/webhooks/affiliate/new-client
    │  Header: X-Inter-App-Secret
    ▼
[SC Backend]  (FastAPI, port 8000)
    │  validates secret
    │  creates → sc_db.clients  (via existing onboard_client logic)
    │  returns {sc_client_id}
    │
    │  (later, on status change)
    │  POST /api/webhooks/sc/status-update
    │  Header: X-Inter-App-Secret
    ▼
[Affiliation SC Backend]
    updates affiliate_db.clients.status
```

---

## Changes

### 1. Fix env var in OnboardingForm.tsx

**File:** `affiliation SC/frontend/src/pages/OnboardingForm.tsx`

```ts
// Remove VITE_SC_BACKEND_URL — form operations go to Affiliation SC backend
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8001'
```

`VITE_SC_BACKEND_URL` is not needed by the form. It may be kept in `.env` for other future use but should not be the primary `BACKEND` here.

---

### 2. Add affiliate webhook endpoint to SC backend

**File:** `sleeping creators/backend/server.py`

New route (unauthenticated, secret-validated):

```
POST /api/webhooks/affiliate/new-client
Header: X-Inter-App-Secret: <shared-secret>
```

**Request body (from Affiliation SC):**
```json
{
  "affiliate_id": "<member ObjectId string>",
  "affiliate_client_id": "<affiliation_db client _id string>",
  "link_token": "<onboarding link token>",
  "client_data": {
    "name": "...",
    "brand_name": "...",
    "email": "...",
    "whatsapp": "...",
    "city_country": "...",
    "instagram_handle": "...",
    "instagram_password": "...",
    "instagram_profile_url": "...",
    "website_url": "...",
    ... (all 40+ OnboardingCreate fields)
  }
}
```

**Behaviour:**
1. Validate `X-Inter-App-Secret` header against `INTER_APP_SECRET` env var. Return 403 if mismatch.
2. Map `client_data` → `OnboardingCreate` model.
3. Call existing `onboard_client(data)` logic (inline or via helper) to create the SC client doc.
4. Store `affiliate_client_id` and `affiliate_id` on the SC client doc so status callbacks know who to notify.
5. Return `{"sc_client_id": "<new_sc_client_id>"}`.

**Error handling:** If `onboard_client` fails, return 500 — Affiliation SC already handles this gracefully (stores `sc_client_id: None` and continues).

---

### 3. Add status callback from SC → Affiliation SC

**File:** `sleeping creators/backend/server.py`

The mutation point is `PUT /api/clients/{client_id}` → `update_client()`. After the MongoDB update succeeds, if the updated client has `affiliate_client_id` set and the request contains a `status` field, fire a background HTTP call with the mapped status:

| SC `status` value | Affiliation SC `status` |
|---|---|
| `"active"` | `"approved"` |
| `"inactive"` | `"rejected"` |
| _(no direct mapping)_ | `"refund"` — SC admin must set explicitly via a future endpoint |

If `affiliate_client_id` is set on the client doc, fire:

```
POST ${AFFILIATE_SC_WEBHOOK_URL}/api/webhooks/sc/status-update
Header: X-Inter-App-Secret: <shared-secret>

{
  "affiliate_client_id": "<id>",
  "sc_client_id": "<id>",
  "status": "approved" | "rejected" | "refund",
  "reason": "<optional string>"
}
```

This endpoint already exists in Affiliation SC backend (`routes/webhooks.py`). The call should be fire-and-forget (don't block the SC response on it) — use `httpx.AsyncClient` with a short timeout.

---

### 4. Env vars

**Affiliation SC backend (`.env`):**
```
SC_WEBHOOK_URL=http://localhost:8000   # SC backend base URL
INTER_APP_SECRET=<shared-secret>       # already has placeholder value
```

**SC backend (`.env` or environment):**
```
INTER_APP_SECRET=<same-shared-secret>
AFFILIATE_SC_WEBHOOK_URL=http://localhost:8001   # Affiliation SC backend base URL
```

In production, these point to the deployed URLs and the secret is a random 32-byte hex string.

---

## Data Contract — `client_data` field mapping

The Affiliation SC `ClientData` model and SC's `OnboardingCreate` model share all fields. A few naming differences to handle:

| Affiliation SC field | SC field | Notes |
|---|---|---|
| `pr_media_links` (string) | `pr_links` (List[str]) | Split on newlines (`\n`) |
| `high_quality_photos_link` | `google_drive_images` | Rename |
| `video_clips_link` | `google_drive_videos` | Rename |
| `cta_link` | `lead_magnet_link` | Rename |

All other fields match by name. Fields absent from the form submission default to `None`/`[]` per SC's `OnboardingCreate` defaults.

---

## Error & Edge Cases

| Scenario | Behaviour |
|---|---|
| SC backend down when Affiliation SC submits | `_notify_sc()` catches exception, returns `None`. Client stored in Affiliation SC with `sc_client_id: None`. Retry is manual (admin can trigger). |
| Invalid/expired token | Affiliation SC returns 404 or `{active: false}`. Form shows "Link not found" or "Link closed" screen. No SC call made. |
| Duplicate submission (same token, same user) | Affiliation SC creates a second client doc. SC creates a second client. Affiliation SC admin can deduplicate via the Clients page. |
| Status callback fails (Affiliation SC down) | SC logs the error, continues. Affiliation SC status stays `pending`. Manual sync is possible. |
| `INTER_APP_SECRET` mismatch | Both backends return 403. No data is written. |

---

## Out of Scope

- Moving the onboarding form to the SC frontend (separate decision)
- Instagram OAuth connection in Step 5 (currently a stub — no SC backend call)
- Affiliate commission/payment tracking
- Deduplication logic for double submissions
- SC dashboard showing affiliate source info (deferred to a future spec)
