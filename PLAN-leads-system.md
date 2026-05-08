# Leads Generation System - Implementation Plan

## Overview

A comment-keyword monitoring + DM auto-reply system for each client's Instagram posts. When a commenter uses a configured keyword, they are captured as a lead. The system can reply to their comment and auto-respond when they DM.

## Critical API Constraint

**Instagram does NOT allow cold DMs.** You cannot send a DM to someone just because they commented. The user must message your business first (24-hour response window). The standard flow is:

1. User comments a keyword (e.g., "INFO") on your post
2. System replies to the comment: "Check your DMs!" (or custom reply)
3. System sends a DM **only if** the user has an existing conversation with you, OR waits for them to DM first
4. When user DMs, the system auto-responds with the configured message/file

This is the industry-standard "comment automation" pattern used by ManyChat, etc.

## Required New OAuth Scopes

Current: `instagram_business_basic,instagram_business_content_publish`

**Add:**
- `instagram_business_manage_comments` — read/reply to comments
- `instagram_business_manage_messages` — send/receive DMs

Users will need to **reconnect** Instagram after this change to grant new permissions.

---

## Phase 1: Database Models & Backend API (Foundation)

### Files to modify:
- `backend/server.py` — Add new Pydantic models, MongoDB collections, API endpoints

### 1.1 New MongoDB Collections

**`leads` collection:**
```python
{
    "id": "lead_uuid",
    "client_id": "client_uuid",
    "post_id": "post_uuid",                    # Which post they commented on
    "platform": "instagram",
    "platform_post_id": "ig_media_id",
    "comment_id": "ig_comment_id",
    "keyword_matched": "INFO",                  # Which keyword triggered
    "username": "commenter_username",
    "user_id": "ig_user_igsid",                 # Instagram-scoped ID (for DMs)
    "comment_text": "I want INFO please",
    "status": "new",                            # new | replied | dm_sent | dm_received | converted | ignored
    "dm_status": "pending",                     # pending | sent | failed | not_applicable
    "dm_message_id": null,                      # Message ID if DM was sent
    "comment_reply_id": null,                   # Comment reply ID if reply was posted
    "notes": "",                                # Manual notes by user
    "created_at": "iso8601",
    "updated_at": "iso8601"
}
```

**`keyword_configs` collection:**
```python
{
    "id": "config_uuid",
    "client_id": "client_uuid",
    "keywords": ["INFO", "PRICE", "DM"],        # Keywords to monitor (case-insensitive)
    "auto_comment_reply": "Thanks! Check your DMs 🔥",  # Reply to the comment
    "auto_dm_message": "Hey {{username}}! Here's the info you requested...",  # DM text
    "auto_dm_file_url": "https://s3.../brochure.pdf",   # Optional file to send via DM
    "monitored_post_ids": ["post_uuid_1", "post_uuid_2"],  # Which posts to monitor (empty = all)
    "enabled": true,
    "created_at": "iso8601",
    "updated_at": "iso8601"
}
```

### 1.2 Pydantic Models

```python
class KeywordConfigCreate(BaseModel):
    keywords: List[str]
    auto_comment_reply: str = ""
    auto_dm_message: str = ""
    auto_dm_file_url: str = ""
    monitored_post_ids: List[str] = []  # empty = monitor all published posts
    enabled: bool = True

class KeywordConfigUpdate(BaseModel):
    keywords: Optional[List[str]] = None
    auto_comment_reply: Optional[str] = None
    auto_dm_message: Optional[str] = None
    auto_dm_file_url: Optional[str] = None
    monitored_post_ids: Optional[List[str]] = None
    enabled: Optional[bool] = None

class LeadUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
```

### 1.3 API Endpoints

**Keyword Config endpoints:**
```
GET    /api/clients/{client_id}/keyword-config     → get config (single per client)
PUT    /api/clients/{client_id}/keyword-config      → create/update config (upsert)
DELETE /api/clients/{client_id}/keyword-config      → delete config
POST   /api/clients/{client_id}/keyword-config/upload-file → upload DM file to S3
```

**Leads endpoints:**
```
GET    /api/clients/{client_id}/leads               → list leads (with filters: status, keyword, date range)
GET    /api/clients/{client_id}/leads/stats          → lead counts by status
PUT    /api/leads/{lead_id}                          → update lead (status, notes)
DELETE /api/leads/{lead_id}                          → delete lead
POST   /api/leads/{lead_id}/send-dm                  → manually trigger DM to a lead
POST   /api/leads/{lead_id}/reply-comment             → manually reply to the comment
```

### 1.4 Verification
- [ ] All endpoints return proper responses
- [ ] MongoDB indexes: `leads.client_id`, `leads.status`, `leads.created_at`, `keyword_configs.client_id` (unique)
- [ ] Pydantic validation rejects invalid status values

---

## Phase 2: Instagram Comment Polling & Lead Detection

### Files to modify:
- `backend/server.py` — OAuth scopes, new scheduler job, comment polling logic

### 2.1 Update OAuth Scopes

In `server.py`, update:
```python
IG_SCOPES = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages"
```

### 2.2 Comment Polling Service

New async function `poll_comments()` added as a scheduler job (every 5 minutes):

```python
async def poll_comments():
    """Poll Instagram comments on monitored posts for keyword matches."""
    # 1. Find all clients with instagram_connected=True and an enabled keyword_config
    # 2. For each client:
    #    a. Get their keyword_config
    #    b. Get monitored posts (either specific or all published Instagram posts)
    #    c. For each post with a platform_post_id:
    #       - GET /{platform_post_id}/comments?fields=id,text,timestamp,username,from
    #       - For each comment, check if any keyword is in comment text (case-insensitive)
    #       - Check if this comment_id already exists in leads collection (dedup)
    #       - If new match: create lead, optionally auto-reply to comment
    # 3. Store last_polled_at per post to avoid re-processing
```

**Instagram API call pattern (from docs):**
```python
async with httpx.AsyncClient() as http:
    resp = await http.get(
        f"https://graph.instagram.com/v23.0/{platform_post_id}/comments",
        params={
            "fields": "id,text,timestamp,username,from",
            "access_token": client["instagram_access_token"],
            "limit": 50
        }
    )
```

**Comment reply (from docs):**
```python
# Reply to a comment
resp = await http.post(
    f"https://graph.instagram.com/v23.0/{comment_id}/replies",
    params={
        "message": auto_comment_reply,
        "access_token": client["instagram_access_token"]
    }
)
```

### 2.3 Track Processed Comments

Add a `last_comment_check` field to track progress. Use comment timestamps to avoid re-processing. Also store processed comment IDs in the lead itself for dedup.

### 2.4 Add Scheduler Job

```python
scheduler.add_job(poll_comments, 'interval', minutes=5, id='poll_comments')
```

### 2.5 Verification
- [ ] New scopes in OAuth URL
- [ ] Scheduler job runs every 5 minutes
- [ ] Duplicate comments are not stored as duplicate leads
- [ ] Rate limiting respected (200 calls/user/hour)
- [ ] Failed API calls logged but don't crash the job

---

## Phase 3: DM Sending Capability

### Files to modify:
- `backend/server.py` — DM sending functions, manual DM endpoint

### 3.1 Send DM Function

```python
async def send_instagram_dm(client: dict, recipient_igsid: str, message: str = None, file_url: str = None):
    """
    Send a DM via Instagram Messaging API.
    Recipient must have an existing conversation (Instagram policy).
    """
    ig_user_id = client["instagram_user_id"]
    access_token = client["instagram_access_token"]

    # Text message
    if message:
        payload = {
            "recipient": {"id": recipient_igsid},
            "message": {"text": message}
        }
        resp = await http.post(
            f"https://graph.instagram.com/v23.0/{ig_user_id}/messages",
            json=payload,
            params={"access_token": access_token}
        )

    # File/image attachment
    if file_url:
        file_type = detect_file_type(file_url)  # image, video, audio, file
        payload = {
            "recipient": {"id": recipient_igsid},
            "message": {
                "attachment": {
                    "type": file_type,
                    "payload": {"url": file_url}
                }
            }
        }
        resp = await http.post(
            f"https://graph.instagram.com/v23.0/{ig_user_id}/messages",
            json=payload,
            params={"access_token": access_token}
        )
```

### 3.2 Manual DM Endpoint

`POST /api/leads/{lead_id}/send-dm` — allows the user to manually send a custom message or file to a lead:

```python
class SendDMRequest(BaseModel):
    message: str = ""
    file_url: str = ""

@api_router.post("/leads/{lead_id}/send-dm")
async def send_lead_dm(lead_id: str, body: SendDMRequest, user=Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead: raise HTTPException(404)
    client = await db.clients.find_one({"id": lead["client_id"]})
    if not client or not client.get("instagram_connected"):
        raise HTTPException(400, "Instagram not connected")

    result = await send_instagram_dm(client, lead["user_id"], body.message, body.file_url)
    # Update lead status
    await db.leads.update_one({"id": lead_id}, {"$set": {
        "dm_status": "sent" if result.ok else "failed",
        "status": "replied",
        "updated_at": now_iso()
    }})
    return {"success": result.ok}
```

### 3.3 Auto-DM on Comment Detection (Best Effort)

When a new lead is created from a keyword match, attempt to send the auto-DM immediately. If it fails (no existing conversation), mark `dm_status: "pending"` — the user can manually trigger later or wait for the lead to DM first.

### 3.4 File Upload for DM Attachments

`POST /api/clients/{client_id}/keyword-config/upload-file` — upload a PDF/image to S3 that will be auto-sent via DM:

```python
@api_router.post("/clients/{client_id}/keyword-config/upload-file")
async def upload_dm_file(client_id: str, file: UploadFile, user=Depends(get_current_user)):
    # Validate file size (25MB max for Instagram DMs)
    # Upload to S3 using existing storage.py patterns
    # Return URL
    # Update keyword_config.auto_dm_file_url
```

### 3.5 Verification
- [ ] DM sends successfully when user has existing conversation
- [ ] DM fails gracefully when no conversation exists (no crash)
- [ ] File upload works and URL is accessible
- [ ] Lead status updates correctly after DM attempt

---

## Phase 4: Frontend — Leads Tab in Client Detail

### Files to modify:
- `frontend/src/pages/ClientDetail.js` — Add "Leads" tab

### 4.1 Add Tab

Update the TABS constant:
```javascript
const TABS = ["Overview", "Strategy", "Platforms", "Posts", "Pipeline", "Leads", "Profile"];
```

Add conditional rendering:
```javascript
{activeTab === "Leads" && (
  <LeadsTab clientId={id} client={client} posts={posts} />
)}
```

### 4.2 LeadsTab Component (inline in ClientDetail.js)

**Sub-sections within the Leads tab:**

**A. Keyword Configuration Panel (top section)**
- Keywords input (multi-input pattern, like `EMultiInput`)
- Auto comment reply text field
- Auto DM message text field
- File upload for DM attachment (follow `ProfilePhotoEditor` pattern)
- Post selector: checkboxes to pick which published posts to monitor (or "All Posts")
- Enable/disable toggle
- Save button

**B. Leads Table (main section)**
- Filters: status dropdown, keyword filter, date range
- Stats bar: counts by status (new, replied, dm_sent, converted)
- Table columns: Username, Comment, Keyword, Post, Status, DM Status, Date, Actions
- Actions: Send DM (opens mini form), Reply to Comment, Mark as Converted, Delete
- Pagination or infinite scroll

**C. Send DM Dialog**
- Text message input
- File upload or select existing file
- Send button
- Shows status (sent/failed)

### 4.3 Data Fetching

```javascript
// In LeadsTab component
useEffect(() => {
  const fetchLeadsData = async () => {
    const [configResp, leadsResp, statsResp] = await Promise.all([
      axios.get(`${API}/clients/${clientId}/keyword-config`).catch(() => ({ data: null })),
      axios.get(`${API}/clients/${clientId}/leads?limit=50`),
      axios.get(`${API}/clients/${clientId}/leads/stats`)
    ]);
    setConfig(configResp.data);
    setLeads(leadsResp.data);
    setStats(statsResp.data);
  };
  fetchLeadsData();
}, [clientId]);
```

### 4.4 UI Design (Dark Theme, Matching Existing Patterns)

- Use existing Tailwind classes: `bg-zinc-900`, `border-zinc-800`, `text-white`, `text-zinc-500`
- Use `stat-card` class for stats display
- Use `data-row` class for table rows
- Use `ELabel`, `EInput`, `ETextarea` helper components for forms
- Lucide icons: `MessageCircle`, `Send`, `Users`, `Search`, `Filter`, `Download`, `Upload`, `Check`, `X`, `Eye`
- Toast notifications via `toast.success()` / `toast.error()`

### 4.5 Verification
- [ ] Tab appears and renders without errors
- [ ] Keyword config saves and loads correctly
- [ ] Leads table displays data with correct formatting
- [ ] Send DM dialog works
- [ ] Status updates reflect immediately in UI
- [ ] Empty states shown when no config or no leads

---

## Phase 5: Verification & Polish

### 5.1 End-to-End Testing
- [ ] Connect Instagram with new scopes
- [ ] Configure keywords for a client
- [ ] Select posts to monitor
- [ ] Verify comment polling detects keyword comments
- [ ] Verify leads are created with correct data
- [ ] Verify auto-comment-reply is posted
- [ ] Verify DM sending (manual + auto)
- [ ] Verify file upload and DM with attachment
- [ ] Verify lead status management

### 5.2 Error Handling
- [ ] Token expired: graceful error, prompt reconnect
- [ ] Rate limit hit: backoff and retry
- [ ] Instagram API errors: logged, lead marked with error
- [ ] Network failures: don't crash scheduler

### 5.3 Edge Cases
- [ ] Post with no comments
- [ ] Comment with multiple keywords (only one lead created)
- [ ] Same user comments keyword on multiple posts (separate leads)
- [ ] Keyword config disabled while polling
- [ ] Client disconnects Instagram mid-polling

---

## File Impact Summary

| File | Changes |
|------|---------|
| `backend/server.py` | OAuth scopes, 2 new collections, ~8 new endpoints, scheduler job, DM function |
| `frontend/src/pages/ClientDetail.js` | Add "Leads" tab, LeadsTab component (~400-500 lines) |

## Execution Order

1. **Phase 1** → Database + API endpoints (backend foundation)
2. **Phase 2** → Comment polling + lead detection (backend automation)
3. **Phase 3** → DM capability (backend messaging)
4. **Phase 4** → Frontend Leads tab (UI)
5. **Phase 5** → Testing & polish
