# SC ↔ Affiliation SC Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Affiliation SC public onboarding form to the Sleeping Creators backend via bidirectional webhook so submitted client data flows into SC and status changes flow back.

**Architecture:** The form submits to Affiliation SC backend, which stores the record and POSTs to SC backend via a shared-secret webhook. SC creates the client and returns `sc_client_id`. When an SC admin activates a client who came from an affiliate, SC fires a status callback back to Affiliation SC.

**Tech Stack:** Python 3.11 / FastAPI / httpx (both backends), React 19 / TypeScript / Vite (Affiliation SC frontend), MongoDB via Motor async driver, Pydantic v2

---

## File Map

| File | Action | What changes |
|---|---|---|
| `C:\Users\talib\OneDrive\Documents\apps\affiliation SC\frontend\src\pages\OnboardingForm.tsx` | Modify | Fix `BACKEND` env var (1 line) |
| `C:\Users\talib\OneDrive\Documents\apps\sleeping creators\backend\server.py` | Modify | Add affiliate webhook endpoint + status callback |
| `C:\Users\talib\OneDrive\Documents\apps\affiliation SC\backend\.env` | Modify | Set `SC_WEBHOOK_URL` |
| `C:\Users\talib\OneDrive\Documents\apps\sleeping creators\backend\.env` (create if absent) | Create/Modify | Set `INTER_APP_SECRET` + `AFFILIATE_SC_WEBHOOK_URL` |

---

## Task 1: Fix BACKEND env var in OnboardingForm.tsx

The form resolves `BACKEND` to `VITE_SC_BACKEND_URL` (port 8000, SC backend), but `/api/onboard-check/{token}` and `/api/onboard/{token}` only exist in the Affiliation SC backend (port 8001). One line fix.

**Files:**
- Modify: `C:\Users\talib\OneDrive\Documents\apps\affiliation SC\frontend\src\pages\OnboardingForm.tsx:8`

- [ ] **Step 1: Read the current line**

Open `affiliation SC/frontend/src/pages/OnboardingForm.tsx`. Find line ~8:

```ts
const BACKEND = import.meta.env.VITE_SC_BACKEND_URL ?? import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8001'
```

- [ ] **Step 2: Replace it**

```ts
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8001'
```

- [ ] **Step 3: Verify manually**

Run the Affiliation SC frontend in dev (`npm run dev` in `affiliation SC/frontend`). Open a browser at `http://localhost:5173/onboard/<any-token>`. The page should hit `http://localhost:8001/api/onboard-check/<token>` (visible in browser DevTools → Network). It should return 404 from Affiliation SC backend (because the token doesn't exist yet) — that's correct; just confirm the request goes to port 8001, not 8000.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\talib\OneDrive\Documents\apps\affiliation SC"
git add frontend/src/pages/OnboardingForm.tsx
git commit -m "fix(onboarding): fix BACKEND URL to call affiliation SC backend not SC backend"
```

---

## Task 2: Add affiliate webhook endpoint to SC backend

SC backend needs a new `POST /api/webhooks/affiliate/new-client` endpoint that:
1. Validates `X-Inter-App-Secret` header
2. Maps incoming `client_data` → `OnboardingCreate`
3. Creates the SC client (reusing existing `onboard_client` logic)
4. Stores `affiliate_client_id` + `affiliate_id` on the SC client doc
5. Returns `{"sc_client_id": "<uuid>"}`

**Files:**
- Modify: `C:\Users\talib\OneDrive\Documents\apps\sleeping creators\backend\server.py`
  - Line 50: add to `_AUTH_EXEMPT`
  - After line 7590 (`app.include_router(api_router)`): add new endpoint

- [ ] **Step 1: Add the new route to `_AUTH_EXEMPT`**

Find line 50 in `server.py`:

```python
_AUTH_EXEMPT = ("/api/auth/", "/api/static/", "/api/instagram/callback", "/api/facebook/callback", "/webhooks/bundle", "/api/mail/webhook/")
```

Replace with:

```python
_AUTH_EXEMPT = ("/api/auth/", "/api/static/", "/api/instagram/callback", "/api/facebook/callback", "/webhooks/bundle", "/api/mail/webhook/", "/api/webhooks/affiliate/")
```

- [ ] **Step 2: Add the Pydantic request model**

Find the `OnboardingCreate` class (line 577). Directly after the closing of that class (after the `platforms: List[str] = []` line), add:

```python
class AffiliateClientData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    brand_name: str = ""
    email: str = ""
    whatsapp: str = ""
    city_country: str = ""
    instagram_handle: str = ""
    instagram_profile_url: str = ""
    instagram_password: str = ""
    website_url: str = ""
    linkedin_url: str = ""
    youtube_url: str = ""
    twitter_url: str = ""
    pr_media_links: str = ""           # newline-separated; mapped to pr_links
    high_quality_photos_link: str = "" # mapped to google_drive_images
    video_clips_link: str = ""         # mapped to google_drive_videos
    profile_photo_link: str = ""
    logo_link: str = ""
    account_suspended: bool = False
    paid_ads_run: bool = False
    personal_story: str = ""
    business_description: str = ""
    niche: str = ""
    daily_life: str = ""
    target_audience_description: str = ""
    audience_age_range: str = ""
    audience_emotional_state: List[str] = []
    solutions_provided: List[str] = []
    audience_problems: List[str] = []
    audience_desires: List[str] = []
    audience_myths: List[str] = []
    audience_failed_attempts: List[str] = []
    unique_selling_points: List[str] = []
    frequent_questions: List[str] = []
    love_topics: List[str] = []
    has_case_studies: bool = False
    case_study_1: str = ""
    case_study_2: str = ""
    signature_topic: str = ""
    brand_vibe: List[str] = []
    language: List[str] = []
    niche_working_topics: str = ""
    niche_oversaturated_topics: str = ""
    niche_underserved_topics: str = ""
    competitor_accounts: List[str] = []
    disliked_content: str = ""
    not_to_do_list: List[str] = []
    account_goals: str = ""
    next_step_after_view: str = ""
    cta_link: str = ""                 # mapped to lead_magnet_link


class AffiliateNewClientWebhook(BaseModel):
    affiliate_id: str
    affiliate_client_id: str
    link_token: str
    client_data: AffiliateClientData
```

- [ ] **Step 3: Add the endpoint**

Find the block after `app.include_router(api_router)` (line 7590). Add the following right after that line (before the `import json as _json` line):

```python
@app.post("/api/webhooks/affiliate/new-client", include_in_schema=False)
async def affiliate_new_client(
    body: AffiliateNewClientWebhook,
    request: Request,
):
    secret = os.getenv("INTER_APP_SECRET", "")
    incoming = request.headers.get("X-Inter-App-Secret", "")
    if not secret or not incoming or incoming != secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    cd = body.client_data
    onboarding_data = OnboardingCreate(
        name=cd.name,
        brand_name=cd.brand_name,
        email=cd.email,
        whatsapp=cd.whatsapp,
        city_country=cd.city_country,
        instagram_handle=cd.instagram_handle,
        instagram_profile_url=cd.instagram_profile_url,
        instagram_password=cd.instagram_password,
        website_url=cd.website_url,
        linkedin_url=cd.linkedin_url,
        youtube_url=cd.youtube_url,
        twitter_url=cd.twitter_url,
        pr_links=[l.strip() for l in cd.pr_media_links.split("\n") if l.strip()],
        profile_photo_link=cd.profile_photo_link,
        logo_link=cd.logo_link,
        google_drive_images=cd.high_quality_photos_link,
        google_drive_videos=cd.video_clips_link,
        account_suspended=cd.account_suspended,
        paid_ads_run=cd.paid_ads_run,
        personal_story=cd.personal_story,
        business_description=cd.business_description,
        niche=cd.niche,
        daily_life=cd.daily_life,
        target_audience_description=cd.target_audience_description,
        audience_age_range=cd.audience_age_range,
        audience_emotional_state=cd.audience_emotional_state,
        solutions_provided=cd.solutions_provided,
        audience_problems=cd.audience_problems,
        audience_desires=cd.audience_desires,
        audience_myths=cd.audience_myths,
        audience_failed_attempts=cd.audience_failed_attempts,
        unique_selling_points=cd.unique_selling_points,
        frequent_questions=cd.frequent_questions,
        love_topics=cd.love_topics,
        has_case_studies=cd.has_case_studies,
        case_study_1=cd.case_study_1,
        case_study_2=cd.case_study_2,
        signature_topic=cd.signature_topic,
        brand_vibe=cd.brand_vibe,
        language=cd.language,
        niche_working_topics=cd.niche_working_topics,
        niche_oversaturated_topics=cd.niche_oversaturated_topics,
        niche_underserved_topics=cd.niche_underserved_topics,
        competitor_accounts=cd.competitor_accounts,
        disliked_content=cd.disliked_content,
        not_to_do_list=cd.not_to_do_list,
        account_goals=cd.account_goals,
        next_step_after_view=cd.next_step_after_view,
        lead_magnet_link=cd.cta_link,
        platforms=[],
    )

    client = await onboard_client(onboarding_data)
    sc_client_id = client["id"]

    await db.clients.update_one(
        {"id": sc_client_id},
        {"$set": {
            "affiliate_client_id": body.affiliate_client_id,
            "affiliate_id": body.affiliate_id,
            "affiliate_link_token": body.link_token,
        }},
    )

    return {"sc_client_id": sc_client_id}
```

- [ ] **Step 4: Test the endpoint manually**

Start the SC backend (`uvicorn server:app --reload --port 8000`). Run:

```bash
curl -X POST http://localhost:8000/api/webhooks/affiliate/new-client \
  -H "Content-Type: application/json" \
  -H "X-Inter-App-Secret: test-secret" \
  -d '{
    "affiliate_id": "abc123",
    "affiliate_client_id": "def456",
    "link_token": "tok_test",
    "client_data": {
      "name": "Test Creator",
      "niche": "fitness",
      "email": "test@example.com",
      "instagram_handle": "testcreator"
    }
  }'
```

Expected with correct secret (set `INTER_APP_SECRET=test-secret` in env):
```json
{"sc_client_id": "<some-uuid>"}
```

Expected with wrong/missing secret:
```json
{"detail": "Forbidden"}
```

Verify the client was created in MongoDB:
```bash
# In a Python shell or mongo shell:
# db.clients.find_one({"affiliate_client_id": "def456"})
# Should show the client doc with affiliate fields set
```

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\talib\OneDrive\Documents\apps\sleeping creators"
git add backend/server.py
git commit -m "feat(webhooks): add affiliate new-client webhook endpoint to SC backend"
```

---

## Task 3: Add status callback from SC → Affiliation SC

When an SC admin activates a client (via `POST /clients/{client_id}/resume`), if that client has `affiliate_client_id` set, SC should fire a background call to Affiliation SC's `/api/webhooks/sc/status-update` endpoint with `status: "approved"`.

**Files:**
- Modify: `C:\Users\talib\OneDrive\Documents\apps\sleeping creators\backend\server.py`
  - `resume_client` function (line ~2583)

- [ ] **Step 1: Add the helper function**

Find the `resume_client` function (around line 2583). **Above** it, add this helper:

```python
async def _notify_affiliate_sc_status(affiliate_client_id: str, sc_client_id: str, status: str, reason: str = None):
    url = os.getenv("AFFILIATE_SC_WEBHOOK_URL", "")
    secret = os.getenv("INTER_APP_SECRET", "")
    if not url or not secret:
        return
    payload = {
        "affiliate_client_id": affiliate_client_id,
        "sc_client_id": sc_client_id,
        "status": status,
    }
    if reason:
        payload["reason"] = reason
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            await http.post(
                f"{url}/api/webhooks/sc/status-update",
                json=payload,
                headers={"X-Inter-App-Secret": secret},
            )
    except Exception:
        pass
```

- [ ] **Step 2: Call it from `resume_client`**

Find `resume_client` (around line 2583):

```python
@api_router.post("/clients/{client_id}/resume")
async def resume_client(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$set": {"status": "active"}})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    await add_log("success", f"Automation resumed for {client.get('name', client_id)}", client_id, client.get('name'))
    return {"status": "active"}
```

Replace with:

```python
@api_router.post("/clients/{client_id}/resume")
async def resume_client(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$set": {"status": "active"}})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    await add_log("success", f"Automation resumed for {client.get('name', client_id)}", client_id, client.get('name'))
    affiliate_client_id = client.get("affiliate_client_id")
    if affiliate_client_id:
        asyncio.create_task(_notify_affiliate_sc_status(affiliate_client_id, client_id, "approved"))
    return {"status": "active"}
```

- [ ] **Step 3: Test manually**

With both backends running:
1. Create an affiliate-sourced SC client (either via Task 2's webhook, or by manually inserting a doc with `affiliate_client_id: "test-aff-id"` into `sc_db.clients`).
2. Call `POST http://localhost:8000/api/clients/<sc_client_id>/resume` with a valid JWT.
3. Check Affiliation SC backend logs — it should log a `POST /api/webhooks/sc/status-update` request.
4. Check `affiliate_db.clients` — the doc with `_id = test-aff-id` should have `status: "approved"`.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\talib\OneDrive\Documents\apps\sleeping creators"
git add backend/server.py
git commit -m "feat(webhooks): notify Affiliation SC when affiliate client is activated"
```

---

## Task 4: Configure env vars

Wire the real values so both backends can talk to each other. This task has no code changes — just env file edits.

**Files:**
- Modify: `C:\Users\talib\OneDrive\Documents\apps\affiliation SC\backend\.env`
- Create/Modify: `C:\Users\talib\OneDrive\Documents\apps\sleeping creators\backend\.env`

- [ ] **Step 1: Update Affiliation SC backend `.env`**

Open `affiliation SC/backend/.env`. Find the line:

```
SC_WEBHOOK_URL=
```

Replace with (local dev values):

```
SC_WEBHOOK_URL=http://localhost:8000
INTER_APP_SECRET=dev-inter-app-secret-change-in-prod
```

The `INTER_APP_SECRET` line already exists with a placeholder. Update its value to match what you'll set in the SC backend.

- [ ] **Step 2: Update SC backend `.env`**

Check if `sleeping creators/backend/.env` exists. If not, create it. Add:

```
INTER_APP_SECRET=dev-inter-app-secret-change-in-prod
AFFILIATE_SC_WEBHOOK_URL=http://localhost:8001
```

The two `INTER_APP_SECRET` values **must match exactly** in both backends.

- [ ] **Step 3: Verify the full flow end-to-end**

With both backends and the Affiliation SC frontend running:

1. Create a test onboarding link in Affiliation SC admin (`POST /api/links` → copy the token).
2. Open `http://localhost:5173/onboard/<token>` in a browser.
3. Fill in and submit Steps 1–4 of the form.
4. Check:
   - Affiliation SC `clients` collection: a new doc with `status: "pending"` and `sc_client_id: "<uuid>"` set (not `null`).
   - SC `clients` collection: a new doc with `affiliate_client_id` set.
   - Affiliation SC `leads` collection: a new lead with `status: "pending_setter"`.
5. In SC, activate the client: `POST http://localhost:8000/api/clients/<sc_client_id>/resume` (with JWT).
6. Check Affiliation SC `clients` collection: `status` should now be `"approved"`.

- [ ] **Step 4: Do NOT commit `.env` files**

`.env` files must never be committed. Verify they are gitignored:

```bash
# In each repo:
cat .gitignore | grep env
# Should show .env or *.env
```

If not present, add `.env` to `.gitignore` and commit that:

```bash
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .env"
```

---

## Production Deployment Notes

These are not tasks — they're notes for when you deploy:

- Replace `INTER_APP_SECRET` in both backends with the same 32-byte random hex: `python -c "import secrets; print(secrets.token_hex(32))"`
- `SC_WEBHOOK_URL` → the deployed SC backend URL (e.g. `https://api.sleepingcreators.com`)
- `AFFILIATE_SC_WEBHOOK_URL` → the deployed Affiliation SC backend URL
- Both backends must be able to reach each other over the network (same VPC, or public URLs)
