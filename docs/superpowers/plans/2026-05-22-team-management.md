# Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-user team support — owner creates members with granular View/Create/Edit/Delete permissions per section; permissions enforced server-side via JWT role + middleware path map.

**Architecture:** Additive team layer on top of existing single-admin auth. `_decode_token` identifies owner vs member. `AuthMiddleware` enforces a central `PERMISSION_MAP` for members. Frontend `UserContext` distributes `{ role, permissions }` to all components.

**Tech Stack:** FastAPI + Motor (MongoDB) + python-jose + passlib — backend. React + axios + lucide-react — frontend. Tests: pytest + FastAPI TestClient.

**Spec:** `docs/superpowers/specs/2026-05-22-team-management-design.md`
**Design guidelines:** `docs/design_guidelines.json`

---

## File Map

### Backend — `backend/server.py` (modify, ~6500 lines)
All backend changes go into this single file in the following sections (add new code near existing related code):
- Auth helpers block (~line 40): add `_decode_token`, update `_make_token`, add `_make_member_token`
- Auth helpers block: add `PERMISSION_MAP` dict + `_get_required_permission` function
- `AuthMiddleware` class (~line 77): rewrite `dispatch` to handle member tokens
- Pydantic models block (~line 96): add `TeamMemberCreate`, `TeamMemberUpdate`, `TeamLoginRequest`
- Auth routes block (~line 2924): add `/auth/team/login`, `/me`
- New section after auth routes: `/team` CRUD

### Backend — `backend/tests/test_team.py` (create)
All backend tests for the team feature.

### Frontend — new files
- `frontend/src/context/UserContext.js`
- `frontend/src/components/PermissionGate.js`
- `frontend/src/components/team/PermissionsMatrix.js`
- `frontend/src/components/team/MemberPanel.js`
- `frontend/src/pages/TeamPage.js`

### Frontend — modified files
- `frontend/src/App.js` — `UserProvider` wrapper, `/team` route, `PermissionGate` on routes
- `frontend/src/components/Layout.js` — `useUser`, filtered NAV, Team nav item
- `frontend/src/pages/Login.js` — optional email field, team login path
- `frontend/src/pages/Clients.js` — hide create/delete buttons per permissions

---

## Task 1: `_decode_token` + `_make_member_token`

**Files:**
- Modify: `backend/server.py` (auth helpers block, ~line 62)
- Create: `backend/tests/test_team.py`

- [ ] **Step 1: Create test file with decode tests**

Create `backend/tests/test_team.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app, _decode_token, _make_token, _make_member_token, _JWT_SECRET, _JWT_ALGO
from jose import jwt
from datetime import datetime, timezone, timedelta

client = TestClient(app)
OWNER_AUTH = {"Authorization": f"Bearer {_make_token()}"}


def test_decode_token_owner():
    token = _make_token()
    result = _decode_token(token)
    assert result == {"role": "owner", "user_id": None}


def test_decode_token_member():
    token = _make_member_token("abc123")
    result = _decode_token(token)
    assert result == {"role": "member", "user_id": "abc123"}


def test_decode_token_invalid():
    result = _decode_token("not-a-token")
    assert result is None


def test_decode_token_expired():
    expired = jwt.encode(
        {"sub": "admin", "role": "owner", "exp": datetime.now(timezone.utc) - timedelta(days=1)},
        _JWT_SECRET, algorithm=_JWT_ALGO
    )
    assert _decode_token(expired) is None


def test_decode_token_legacy_admin():
    # Old token without role field — should be treated as owner
    legacy = jwt.encode(
        {"sub": "admin", "exp": datetime.now(timezone.utc) + timedelta(days=30)},
        _JWT_SECRET, algorithm=_JWT_ALGO
    )
    result = _decode_token(legacy)
    assert result["role"] == "owner"
```

- [ ] **Step 2: Run tests — expect ImportError on `_decode_token` and `_make_member_token`**

```bash
cd backend && python -m pytest tests/test_team.py::test_decode_token_owner -v
```
Expected: `ImportError: cannot import name '_decode_token'`

- [ ] **Step 3: Add `_decode_token` and `_make_member_token` to `server.py`**

In `backend/server.py`, replace the existing `_make_token` and `_check_token` functions (around line 65) with:

```python
def _decode_token(token: str) -> dict | None:
    """Returns {"role": "owner"|"member", "user_id": str|None} or None if invalid/expired."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGO])
        sub = payload.get("sub")
        if not sub:
            return None
        if sub == "admin":
            return {"role": "owner", "user_id": None}
        role = payload.get("role", "member")
        return {"role": role, "user_id": sub}
    except JWTError:
        return None

def _check_token(token: str) -> bool:
    return _decode_token(token) is not None

def _make_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=_TOKEN_DAYS)
    return jwt.encode({"sub": "admin", "role": "owner", "exp": exp}, _JWT_SECRET, algorithm=_JWT_ALGO)

def _make_member_token(member_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=_TOKEN_DAYS)
    return jwt.encode({"sub": member_id, "role": "member", "exp": exp}, _JWT_SECRET, algorithm=_JWT_ALGO)
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "decode"
```
Expected: 5 tests PASS

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd backend && python -m pytest tests/test_music_api.py -v
```
Expected: all PASS (existing `@patch("server._check_token", return_value=True)` mocks still work)

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_team.py
git commit -m "feat(auth): add _decode_token, _make_member_token for multi-role JWT support"
```

---

## Task 2: `PERMISSION_MAP` + Extended `AuthMiddleware`

**Files:**
- Modify: `backend/server.py` (auth helpers + AuthMiddleware, ~line 40–94)
- Modify: `backend/tests/test_team.py`

- [ ] **Step 1: Add middleware permission tests to `test_team.py`**

Append to `backend/tests/test_team.py`:

```python
from bson import ObjectId

MEMBER_ID = str(ObjectId())
MEMBER_TOKEN = _make_member_token(MEMBER_ID)
MEMBER_AUTH = {"Authorization": f"Bearer {MEMBER_TOKEN}"}

ACTIVE_MEMBER = {
    "_id": ObjectId(MEMBER_ID),
    "name": "Jane", "email": "jane@test.com",
    "password_hash": "x", "is_active": True,
    "permissions": {
        "clients": {"view": True, "create": False, "edit": False, "delete": False}
    }
}

INACTIVE_MEMBER = {**ACTIVE_MEMBER, "is_active": False}


@patch("server.db")
def test_member_allowed_route(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.get("/api/clients", headers=MEMBER_AUTH)
    # 200 or downstream error (not 401/403) means permission passed
    assert resp.status_code != 401
    assert resp.status_code != 403


@patch("server.db")
def test_member_forbidden_route(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.post("/api/clients", json={}, headers=MEMBER_AUTH)
    assert resp.status_code == 403


@patch("server.db")
def test_member_inactive(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=INACTIVE_MEMBER)
    resp = client.get("/api/clients", headers=MEMBER_AUTH)
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()


@patch("server.db")
def test_member_me_always_accessible(mock_db):
    mock_db.team_members.find_one = AsyncMock(return_value=ACTIVE_MEMBER)
    resp = client.get("/api/me", headers=MEMBER_AUTH)
    # Should not be blocked by permission check (200 or data error, not 403)
    assert resp.status_code != 403
```

- [ ] **Step 2: Run — expect failures (middleware not yet extended)**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "member"
```
Expected: failures on `test_member_forbidden_route` (gets 422 not 403) and `test_member_inactive` (gets through not 401)

- [ ] **Step 3: Add `PERMISSION_MAP` and `_get_required_permission` to `server.py`**

Add after the auth helper functions (before the `AuthMiddleware` class, ~line 76):

```python
import re as _re

PERMISSION_MAP: dict[tuple[str, str], tuple[str, str]] = {
    # Clients
    ("GET",    r"^/api/clients$"):                        ("clients", "view"),
    ("POST",   r"^/api/clients$"):                        ("clients", "create"),
    ("GET",    r"^/api/clients/[^/]+$"):                  ("clients", "view"),
    ("PUT",    r"^/api/clients/[^/]+$"):                  ("clients", "edit"),
    ("DELETE", r"^/api/clients/[^/]+$"):                  ("clients", "delete"),
    ("GET",    r"^/api/clients/[^/]+/"):                  ("clients", "view"),
    ("POST",   r"^/api/clients/[^/]+/"):                  ("clients", "edit"),
    ("PATCH",  r"^/api/clients/[^/]+/"):                  ("clients", "edit"),
    ("DELETE", r"^/api/clients/[^/]+/"):                  ("clients", "delete"),
    ("POST",   r"^/api/clients/onboard"):                 ("clients", "create"),
    # Templates
    ("GET",    r"^/api/templates"):                       ("templates", "view"),
    ("POST",   r"^/api/templates$"):                      ("templates", "create"),
    ("PUT",    r"^/api/templates/[^/]+$"):                ("templates", "edit"),
    ("DELETE", r"^/api/templates/[^/]+$"):                ("templates", "delete"),
    # Calendar + Posts
    ("GET",    r"^/api/calendar"):                        ("calendar", "view"),
    ("GET",    r"^/api/posts$"):                          ("calendar", "view"),
    ("GET",    r"^/api/posts/[^/]+$"):                    ("calendar", "view"),
    ("POST",   r"^/api/posts$"):                          ("calendar", "create"),
    ("POST",   r"^/api/posts/generate"):                  ("calendar", "create"),
    ("POST",   r"^/api/posts/bulk-generate"):             ("calendar", "create"),
    ("PUT",    r"^/api/posts/[^/]+$"):                    ("calendar", "edit"),
    ("POST",   r"^/api/posts/[^/]+/schedule"):            ("calendar", "edit"),
    ("POST",   r"^/api/posts/[^/]+/approve"):             ("calendar", "edit"),
    ("POST",   r"^/api/posts/[^/]+/mark-published"):      ("calendar", "edit"),
    ("POST",   r"^/api/posts/[^/]+/retry-render"):        ("calendar", "edit"),
    ("DELETE", r"^/api/posts/[^/]+$"):                    ("calendar", "delete"),
    # Studio (Carousel)
    ("GET",    r"^/api/carousels"):                       ("studio", "view"),
    ("POST",   r"^/api/carousels$"):                      ("studio", "create"),
    ("POST",   r"^/api/carousel/"):                       ("studio", "create"),
    ("PUT",    r"^/api/carousels/[^/]+"):                 ("studio", "edit"),
    ("DELETE", r"^/api/carousels/[^/]+"):                 ("studio", "delete"),
    # Music
    ("GET",    r"^/api/music"):                           ("music", "view"),
    ("POST",   r"^/api/music/upload"):                    ("music", "create"),
    ("POST",   r"^/api/music/drive/import"):              ("music", "create"),
    ("PUT",    r"^/api/music/[^/]+"):                     ("music", "edit"),
    ("DELETE", r"^/api/music/[^/]+"):                     ("music", "delete"),
    # Video Templates (actual backend route: /shotstack-templates)
    ("GET",    r"^/api/shotstack-templates"):             ("video_templates", "view"),
    ("POST",   r"^/api/shotstack-templates"):             ("video_templates", "create"),
    ("PATCH",  r"^/api/shotstack-templates/[^/]+"):       ("video_templates", "edit"),
    ("DELETE", r"^/api/shotstack-templates/[^/]+"):       ("video_templates", "delete"),
    # Analytics
    ("GET",    r"^/api/dashboard/"):                      ("analytics", "view"),
    ("GET",    r"^/api/analytics/"):                      ("analytics", "view"),
    # Dropbox / Global Library
    ("GET",    r"^/api/dropbox/global"):                  ("dropbox", "view"),
    ("GET",    r"^/api/clients/[^/]+/dropbox"):           ("dropbox", "view"),
    ("PATCH",  r"^/api/posts/[^/]+/promote-global"):      ("dropbox", "edit"),
    # Logs
    ("GET",    r"^/api/logs$"):                           ("logs", "view"),
    # Usage
    ("GET",    r"^/api/usage/"):                          ("usage", "view"),
    # Settings
    ("GET",    r"^/api/settings$"):                       ("settings", "view"),
    ("PUT",    r"^/api/settings$"):                       ("settings", "edit"),
}

_MEMBER_EXEMPT = ("/api/me", "/api/auth/")

def _get_required_permission(method: str, path: str) -> tuple[str, str] | None:
    for (m, pattern), permission in PERMISSION_MAP.items():
        if m == method and _re.match(pattern, path):
            return permission
    return None
```

- [ ] **Step 4: Rewrite `AuthMiddleware.dispatch` in `server.py`**

Replace the existing `AuthMiddleware` class (~line 77):

```python
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in _AUTH_EXEMPT):
            return await call_next(request)
        if any(path.endswith(s) for s in _PUBLIC_SUFFIXES):
            return await call_next(request)
        if not path.startswith("/api/"):
            return await call_next(request)

        # Clip stream: token in query param
        if _is_clip_stream_path(path):
            stream_token = request.query_params.get("token", "")
            if stream_token and _check_token(stream_token):
                return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        token = auth[7:]
        token_info = _decode_token(token)

        # Fallback for mocked/test tokens that pass _check_token but can't be decoded
        if token_info is None:
            if _check_token(token):
                return await call_next(request)
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        # Owner: full access
        if token_info["role"] == "owner":
            return await call_next(request)

        # Member: always allow /api/me and /api/auth/
        if any(path.startswith(p) for p in _MEMBER_EXEMPT):
            return await call_next(request)

        # Member: look up in DB for is_active + permissions
        member_id = token_info["user_id"]
        try:
            member = await db.team_members.find_one({"_id": ObjectId(member_id)})
        except Exception:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        if not member:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        if not member.get("is_active", False):
            return JSONResponse({"detail": "Account inactive"}, status_code=401)

        required = _get_required_permission(request.method, path)
        if required is None:
            return JSONResponse({"detail": "Insufficient permissions"}, status_code=403)

        resource, action = required
        perms = member.get("permissions", {})
        if not perms.get(resource, {}).get(action, False):
            return JSONResponse({"detail": "Insufficient permissions"}, status_code=403)

        return await call_next(request)
```

- [ ] **Step 5: Run middleware tests — expect all pass**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "member"
```
Expected: 4 tests PASS

- [ ] **Step 6: Run full backend test suite to check for regressions**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: all previously passing tests still PASS

- [ ] **Step 7: Commit**

```bash
git add backend/server.py backend/tests/test_team.py
git commit -m "feat(auth): add PERMISSION_MAP and member permission enforcement in AuthMiddleware"
```

---

## Task 3: Team Pydantic Models + `/api/auth/team/login`

**Files:**
- Modify: `backend/server.py` (Pydantic models ~line 96, auth routes ~line 2924)
- Modify: `backend/tests/test_team.py`

- [ ] **Step 1: Add team login test to `test_team.py`**

Append to `backend/tests/test_team.py`:

```python
def test_team_login_success():
    from server import _hash_pw
    hashed = _hash_pw("secret123")
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": hashed, "is_active": True,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "secret123"})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_team_login_wrong_password():
    from server import _hash_pw
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": _hash_pw("correct"), "is_active": True,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "wrong"})
    assert resp.status_code == 401


def test_team_login_not_found():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=None)
        resp = client.post("/api/auth/team/login", json={"email": "nobody@test.com", "password": "x"})
    assert resp.status_code == 401


def test_team_login_inactive():
    from server import _hash_pw
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane",
        "email": "jane@test.com", "password_hash": _hash_pw("pw"), "is_active": False,
        "permissions": {}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.post("/api/auth/team/login", json={"email": "jane@test.com", "password": "pw"})
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()
```

- [ ] **Step 2: Run — expect 404 (endpoint not yet defined)**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "team_login"
```
Expected: FAIL with 404 or `ImportError`

- [ ] **Step 3: Add Pydantic models to `server.py`**

In the Pydantic models block (~line 96), add:

```python
class TeamLoginRequest(BaseModel):
    email: str
    password: str

class TeamMemberCreate(BaseModel):
    name: str
    email: str
    password: str
    permissions: dict = {}

class TeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None
    is_active: Optional[bool] = None
```

- [ ] **Step 4: Add `/api/auth/team/login` endpoint to `server.py`**

In the auth routes block, after the existing `/auth/login` endpoint (~line 2951), add:

```python
@api_router.post("/auth/team/login")
async def team_login(data: TeamLoginRequest):
    """Authenticate a team member with email + password."""
    member = await db.team_members.find_one({"email": data.email.lower().strip()})
    if not member or not _verify_pw(data.password, member.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    if not member.get("is_active", False):
        raise HTTPException(401, "Account inactive")
    return {"token": _make_member_token(str(member["_id"]))}
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "team_login"
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_team.py
git commit -m "feat(auth): add team member login endpoint"
```

---

## Task 4: `/api/me` Endpoint

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/tests/test_team.py`

- [ ] **Step 1: Add `/api/me` tests**

Append to `backend/tests/test_team.py`:

```python
def test_me_owner():
    resp = client.get("/api/me", headers=OWNER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "owner"
    assert data["permissions"] is None


def test_me_member():
    member_doc = {
        "_id": ObjectId(MEMBER_ID), "name": "Jane", "email": "jane@test.com",
        "is_active": True,
        "permissions": {"clients": {"view": True, "create": False, "edit": False, "delete": False}}
    }
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=member_doc)
        resp = client.get("/api/me", headers=MEMBER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "member"
    assert data["name"] == "Jane"
    assert data["permissions"]["clients"]["view"] is True
```

- [ ] **Step 2: Run — expect 404**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "test_me"
```
Expected: FAIL (404)

- [ ] **Step 3: Add `/api/me` endpoint to `server.py`**

After the `/auth/team/login` endpoint, add:

```python
@api_router.get("/me")
async def get_me(request: Request):
    """Return current user identity and permissions."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    token_info = _decode_token(token)
    if not token_info or token_info["role"] == "owner":
        return {"role": "owner", "name": "Admin", "email": "", "permissions": None}
    member = await db.team_members.find_one({"_id": ObjectId(token_info["user_id"])})
    if not member:
        raise HTTPException(401, "Not authenticated")
    return {
        "role": "member",
        "name": member.get("name", ""),
        "email": member.get("email", ""),
        "permissions": member.get("permissions", {}),
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "test_me"
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_team.py
git commit -m "feat(team): add /api/me endpoint"
```

---

## Task 5: `/api/team` CRUD Endpoints

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/tests/test_team.py`

- [ ] **Step 1: Add team CRUD tests**

Append to `backend/tests/test_team.py`:

```python
MEMBER_DOC = {
    "_id": ObjectId(MEMBER_ID), "name": "Jane", "email": "jane@test.com",
    "password_hash": "hash", "is_active": True, "permissions": {},
    "created_at": "2026-05-22T00:00:00"
}


def test_list_team_members():
    with patch("server.db") as mock_db:
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[MEMBER_DOC])
        mock_db.team_members.find.return_value = mock_cursor
        resp = client.get("/api/team", headers=OWNER_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Jane"
    assert "password_hash" not in data[0]


def test_create_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=None)  # no duplicate
        mock_db.team_members.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id=ObjectId(MEMBER_ID))
        )
        mock_db.team_members.find_one = AsyncMock(side_effect=[None, MEMBER_DOC])
        resp = client.post("/api/team", json={
            "name": "Jane", "email": "jane@test.com",
            "password": "secret123", "permissions": {}
        }, headers=OWNER_AUTH)
    assert resp.status_code == 201


def test_create_team_member_duplicate_email():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=MEMBER_DOC)
        resp = client.post("/api/team", json={
            "name": "Other", "email": "jane@test.com",
            "password": "pw", "permissions": {}
        }, headers=OWNER_AUTH)
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


def test_update_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(
            side_effect=[MEMBER_DOC, {**MEMBER_DOC, "name": "Janet"}]
        )
        mock_db.team_members.update_one = AsyncMock(return_value=MagicMock())
        resp = client.put(f"/api/team/{MEMBER_ID}", json={"name": "Janet"}, headers=OWNER_AUTH)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Janet"


def test_delete_team_member():
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value=MEMBER_DOC)
        mock_db.team_members.delete_one = AsyncMock(return_value=MagicMock())
        resp = client.delete(f"/api/team/{MEMBER_ID}", headers=OWNER_AUTH)
    assert resp.status_code == 204


def test_team_endpoints_require_owner():
    """Members cannot access /api/team endpoints."""
    with patch("server.db") as mock_db:
        mock_db.team_members.find_one = AsyncMock(return_value={**ACTIVE_MEMBER, "is_active": True})
        resp = client.get("/api/team", headers=MEMBER_AUTH)
    assert resp.status_code == 403
```

- [ ] **Step 2: Run — expect failures (endpoints not defined)**

```bash
cd backend && python -m pytest tests/test_team.py -v -k "team_member or list_team or create_team or update_team or delete_team or require_owner"
```
Expected: FAILs with 404/403

- [ ] **Step 3: Add `/api/team` CRUD to `server.py`**

Add a new section after the auth routes in `server.py`:

```python
# ─── Team Management Routes ───────────────────────────────────────────────────

def _serialize_member(m: dict) -> dict:
    """Convert ObjectId to str and strip password_hash from member doc."""
    return {
        "id": str(m["_id"]),
        "name": m.get("name", ""),
        "email": m.get("email", ""),
        "is_active": m.get("is_active", True),
        "permissions": m.get("permissions", {}),
        "created_at": str(m.get("created_at", "")),
    }

def _require_owner(request: Request) -> None:
    """Raise 403 if the request is from a team member (not owner)."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    info = _decode_token(token)
    if info and info["role"] != "owner":
        raise HTTPException(403, "Insufficient permissions")


@api_router.get("/team")
async def list_team_members(request: Request):
    _require_owner(request)
    cursor = db.team_members.find({})
    members = await cursor.to_list(length=None)
    return [_serialize_member(m) for m in members]


@api_router.post("/team", status_code=201)
async def create_team_member(data: TeamMemberCreate, request: Request):
    _require_owner(request)
    existing = await db.team_members.find_one({"email": data.email.lower().strip()})
    if existing:
        raise HTTPException(400, "A team member with this email already exists")
    doc = {
        "name": data.name.strip(),
        "email": data.email.lower().strip(),
        "password_hash": _hash_pw(data.password),
        "is_active": True,
        "permissions": data.permissions,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.team_members.insert_one(doc)
    created = await db.team_members.find_one({"_id": result.inserted_id})
    return _serialize_member(created)


@api_router.put("/team/{member_id}")
async def update_team_member(member_id: str, data: TeamMemberUpdate, request: Request):
    _require_owner(request)
    member = await db.team_members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(404, "Team member not found")
    updates: dict = {}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.email is not None:
        updates["email"] = data.email.lower().strip()
    if data.password is not None and data.password != "":
        updates["password_hash"] = _hash_pw(data.password)
    if data.permissions is not None:
        updates["permissions"] = data.permissions
    if data.is_active is not None:
        updates["is_active"] = data.is_active
    if updates:
        await db.team_members.update_one({"_id": ObjectId(member_id)}, {"$set": updates})
    updated = await db.team_members.find_one({"_id": ObjectId(member_id)})
    return _serialize_member(updated)


@api_router.delete("/team/{member_id}", status_code=204)
async def delete_team_member(member_id: str, request: Request):
    _require_owner(request)
    member = await db.team_members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(404, "Team member not found")
    await db.team_members.delete_one({"_id": ObjectId(member_id)})
```

- [ ] **Step 4: Also add `/api/team` to `PERMISSION_MAP` so members get 403 (not 404)**

In the `PERMISSION_MAP` dict, add near the top:

```python
    # Team management — owner only (will also be blocked by _require_owner, belt-and-suspenders)
    ("GET",    r"^/api/team$"):  ("_owner_only", "view"),
    ("POST",   r"^/api/team$"):  ("_owner_only", "create"),
    ("PUT",    r"^/api/team/"):  ("_owner_only", "edit"),
    ("DELETE", r"^/api/team/"):  ("_owner_only", "delete"),
```

Note: `_owner_only` is not a real permission key — members will never have it, so `perms.get("_owner_only", {}).get("view", False)` returns False → 403. The `_require_owner` check inside the route handler is additional protection.

- [ ] **Step 5: Run team CRUD tests**

```bash
cd backend && python -m pytest tests/test_team.py -v
```
Expected: all tests PASS

- [ ] **Step 6: Run full backend suite**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```
Expected: all previously passing tests still pass

- [ ] **Step 7: Commit**

```bash
git add backend/server.py backend/tests/test_team.py
git commit -m "feat(team): add /api/team CRUD endpoints"
```

---

## Task 6: `UserContext.js`

**Files:**
- Create: `frontend/src/context/UserContext.js`

- [ ] **Step 1: Create the context file**

Create `frontend/src/context/UserContext.js`:

```js
import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_USER = { role: "owner", name: "Admin", email: "", permissions: null };

const UserContext = createContext(DEFAULT_USER);

export function UserProvider({ children, token }) {
  const [user, setUser] = useState(DEFAULT_USER);

  useEffect(() => {
    if (!token) {
      setUser(DEFAULT_USER);
      return;
    }
    axios.get(`${API}/me`)
      .then(r => setUser(r.data))
      .catch(() => setUser(DEFAULT_USER));
  }, [token]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/context/UserContext.js
git commit -m "feat(frontend): add UserContext for role and permissions"
```

---

## Task 7: `PermissionGate.js`

**Files:**
- Create: `frontend/src/components/PermissionGate.js`

- [ ] **Step 1: Create the gate component**

Create `frontend/src/components/PermissionGate.js`:

```js
import { Navigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

export function PermissionGate({ resource, ownerOnly, children }) {
  const { role, permissions } = useUser();
  if (role === "owner") return children;
  if (ownerOnly) return <Navigate to="/" replace />;
  if (!resource) return children;
  if (!permissions || permissions[resource]?.view !== true) {
    return <Navigate to="/" replace />;
  }
  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PermissionGate.js
git commit -m "feat(frontend): add PermissionGate route guard"
```

---

## Task 8: Update `App.js`

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Read the current file**

Read `frontend/src/App.js` (already read in context — 114 lines).

- [ ] **Step 2: Wrap app with `UserProvider` and add `/team` route with `PermissionGate` guards**

Edit `frontend/src/App.js`:

Add imports at the top (after existing imports):
```js
import { UserProvider } from "./context/UserContext";
import { PermissionGate } from "./components/PermissionGate";
import TeamPage from "./pages/TeamPage";
```

In the `App` function, wrap the returned JSX so `<BrowserRouter>` is inside `<UserProvider token={token}>`:

```jsx
return (
  <UserProvider token={token}>
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/instagram/callback" element={<InstagramCallback />} />
        <Route path="/facebook/callback" element={<FacebookCallback />} />
        {token ? (
          <>
            <Route path="/" element={<Layout onLogout={handleLogout} />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<PermissionGate resource="clients"><Clients /></PermissionGate>} />
              <Route path="clients/:id" element={<PermissionGate resource="clients"><ClientDetail /></PermissionGate>} />
              <Route path="templates" element={<PermissionGate resource="templates"><TemplateLibrary /></PermissionGate>} />
              <Route path="templates/new" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
              <Route path="templates/:id/edit" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
              <Route path="templates/:id/clone" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
              <Route path="calendar" element={<PermissionGate resource="calendar"><CalendarPage /></PermissionGate>} />
              <Route path="analytics" element={<PermissionGate resource="analytics"><Analytics /></PermissionGate>} />
              <Route path="dropbox" element={<PermissionGate resource="dropbox"><GlobalLibrary /></PermissionGate>} />
              <Route path="settings" element={<PermissionGate resource="settings"><Settings /></PermissionGate>} />
              <Route path="logs" element={<PermissionGate resource="logs"><Logs /></PermissionGate>} />
              <Route path="usage" element={<PermissionGate resource="usage"><UsagePage /></PermissionGate>} />
              <Route path="carousel" element={<PermissionGate resource="studio"><Carousel /></PermissionGate>} />
              <Route path="music" element={<PermissionGate resource="music"><MusicLibraryPage /></PermissionGate>} />
              <Route path="video-templates" element={<PermissionGate resource="video_templates"><VideoTemplatesAdmin /></PermissionGate>} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="team" element={<PermissionGate ownerOnly><TeamPage /></PermissionGate>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  </UserProvider>
);
```

- [ ] **Step 3: Verify the app builds**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: build succeeds (may have warnings, no errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat(frontend): wrap app with UserProvider, add PermissionGate to routes"
```

---

## Task 9: Update `Login.js`

**Files:**
- Modify: `frontend/src/pages/Login.js`

- [ ] **Step 1: Add email field and team login logic**

Edit `frontend/src/pages/Login.js`. Add `email` state and the email input field above the password field. Change the submit handler to use the team endpoint when email is filled.

Add state after the existing state declarations:
```js
const [email, setEmail] = useState("");
```

Replace the `handleSubmit` function:
```js
const handleSubmit = async e => {
  e.preventDefault();
  if (!password) return toast.error("Enter a password");
  if (mode === "setup") {
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
  }
  setLoading(true);
  try {
    let data;
    if (email.trim()) {
      const resp = await axios.post(`${API}/auth/team/login`, { email: email.trim(), password });
      data = resp.data;
    } else {
      const endpoint = mode === "setup" ? "/auth/setup" : "/auth/login";
      const resp = await axios.post(`${API}${endpoint}`, { password });
      data = resp.data;
    }
    localStorage.setItem("sc_token", data.token);
    onLogin(data.token);
  } catch (err) {
    toast.error(err.response?.data?.detail || "Authentication failed");
  } finally {
    setLoading(false);
  }
};
```

Add the email input inside the card's `<form>` or `space-y-4` div, **above** the password field and only shown when `mode === "login"` (not during setup):

```jsx
{mode === "login" && (
  <div>
    <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
      Email
    </label>
    <input
      data-testid="email-input"
      type="email"
      value={email}
      onChange={e => setEmail(e.target.value)}
      placeholder="team@agency.com"
      className="w-full bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors rounded-none"
    />
    <p className="text-[10px] font-mono text-zinc-600 mt-1">
      TEAM MEMBERS ONLY — LEAVE BLANK FOR ADMIN
    </p>
  </div>
)}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Login.js
git commit -m "feat(frontend): add email field to login for team member auth"
```

---

## Task 10: Update `Layout.js`

**Files:**
- Modify: `frontend/src/components/Layout.js`

- [ ] **Step 1: Add `useUser`, Team nav item, and filtered nav**

Edit `frontend/src/components/Layout.js`.

Add import:
```js
import { useUser } from "../context/UserContext";
import { UserCog } from "lucide-react";
```

Replace the `NAV` array:
```js
const NAV = [
  { path: "/",               label: "Dashboard", icon: LayoutDashboard, exact: true,  resource: "dashboard" },
  { path: "/clients",        label: "Clients",   icon: Users,                          resource: "clients" },
  { path: "/templates",      label: "Templates", icon: LayoutTemplate,                 resource: "templates" },
  { path: "/calendar",       label: "Calendar",  icon: CalendarRange,                  resource: "calendar" },
  { path: "/carousel",       label: "Studio",    icon: Layers,                         resource: "studio" },
  { path: "/music",          label: "Music",     icon: Music2,                         resource: "music" },
  { path: "/video-templates",label: "Video",     icon: Film,                           resource: "video_templates" },
  { path: "/analytics",      label: "Analytics", icon: BarChart3,                      resource: "analytics" },
  { path: "/dropbox",        label: "Dropbox",   icon: Star,                           resource: "dropbox" },
  { path: "/logs",           label: "Logs",      icon: Terminal,                       resource: "logs" },
  { path: "/usage",          label: "Usage",     icon: Coins,                          resource: "usage" },
  { path: "/settings",       label: "Settings",  icon: Settings,                       resource: "settings" },
  { path: "/team",           label: "Team",      icon: UserCog,       ownerOnly: true, resource: null },
];
```

Inside the `Layout` component function, add after the existing `useLocation` and state:
```js
const { role, permissions } = useUser();

const visibleNav = NAV.filter(nav => {
  if (nav.ownerOnly) return role === "owner";
  if (role === "owner" || !permissions) return true;
  return permissions[nav.resource]?.view === true;
});
```

Replace `{NAV.map(...)}` with `{visibleNav.map(...)}` in the nav render.

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.js
git commit -m "feat(frontend): filter nav items by user permissions, add Team nav for owner"
```

---

## Task 11: `PermissionsMatrix.js`

**Files:**
- Create: `frontend/src/components/team/PermissionsMatrix.js`

- [ ] **Step 1: Create the component**

Create directory `frontend/src/components/team/` and the file `PermissionsMatrix.js`:

```js
const SECTIONS = [
  { key: "dashboard",       label: "Dashboard",  actions: ["view"] },
  { key: "clients",         label: "Clients",    actions: ["view", "create", "edit", "delete"] },
  { key: "templates",       label: "Templates",  actions: ["view", "create", "edit", "delete"] },
  { key: "calendar",        label: "Calendar",   actions: ["view", "create", "edit", "delete"] },
  { key: "studio",          label: "Studio",     actions: ["view", "create", "edit", "delete"] },
  { key: "music",           label: "Music",      actions: ["view", "create", "edit", "delete"] },
  { key: "video_templates", label: "Video",      actions: ["view", "create", "edit", "delete"] },
  { key: "analytics",       label: "Analytics",  actions: ["view"] },
  { key: "dropbox",         label: "Dropbox",    actions: ["view", "create", "edit", "delete"] },
  { key: "logs",            label: "Logs",       actions: ["view"] },
  { key: "usage",           label: "Usage",      actions: ["view"] },
  { key: "settings",        label: "Settings",   actions: ["view", "edit"] },
];

const ALL_ACTIONS = ["view", "create", "edit", "delete"];

export function PermissionsMatrix({ permissions, onChange }) {
  const toggle = (section, action) => {
    const current = permissions[section] ?? {};
    onChange({
      ...permissions,
      [section]: { ...current, [action]: !current[action] },
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="sticky top-0 bg-[#09090B] border-b border-zinc-800">
            <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest py-2 pr-4 w-32">Section</th>
            {ALL_ACTIONS.map(a => (
              <th key={a} className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest py-2 px-3 text-center">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map(({ key, label, actions }) => (
            <tr key={key} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors duration-200">
              <td className="text-sm text-zinc-300 font-mono py-2.5 pr-4">{label}</td>
              {ALL_ACTIONS.map(action => (
                <td key={action} className="py-2.5 px-3 text-center">
                  {actions.includes(action) ? (
                    <input
                      type="checkbox"
                      data-testid={`perm-${key}-${action}`}
                      checked={!!permissions[key]?.[action]}
                      onChange={() => toggle(key, action)}
                      className="w-4 h-4 accent-white cursor-pointer"
                    />
                  ) : (
                    <span className="text-zinc-700 select-none">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/team/PermissionsMatrix.js
git commit -m "feat(frontend): add PermissionsMatrix component"
```

---

## Task 12: `MemberPanel.js`

**Files:**
- Create: `frontend/src/components/team/MemberPanel.js`

- [ ] **Step 1: Create the slide-out panel**

Create `frontend/src/components/team/MemberPanel.js`:

```js
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { PermissionsMatrix } from "./PermissionsMatrix";

const EMPTY_PERMISSIONS = {
  dashboard: { view: false },
  clients: { view: false, create: false, edit: false, delete: false },
  templates: { view: false, create: false, edit: false, delete: false },
  calendar: { view: false, create: false, edit: false, delete: false },
  studio: { view: false, create: false, edit: false, delete: false },
  music: { view: false, create: false, edit: false, delete: false },
  video_templates: { view: false, create: false, edit: false, delete: false },
  analytics: { view: false },
  dropbox: { view: false, create: false, edit: false, delete: false },
  logs: { view: false },
  usage: { view: false },
  settings: { view: false, edit: false },
};

export function MemberPanel({ open, member, onClose, onSave }) {
  const isEdit = !!member;
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: EMPTY_PERMISSIONS });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setForm({ name: member.name, email: member.email, password: "", permissions: member.permissions ?? EMPTY_PERMISSIONS });
    } else {
      setForm({ name: "", email: "", password: "", permissions: EMPTY_PERMISSIONS });
    }
  }, [member, open]);

  const submit = async () => {
    if (!form.name.trim()) return;
    if (!isEdit && !form.password) return;
    setSaving(true);
    try {
      await onSave(form, isEdit ? member.id : null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        data-testid="team-panel-backdrop"
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#09090B] border-l border-zinc-800 flex flex-col z-50">
        {/* Header */}
        <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-bold text-base">
            {isEdit ? "Edit Member" : "Add Member"}
          </h2>
          <button
            data-testid="team-panel-close"
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors duration-200 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Name</label>
            <input
              data-testid="member-name-input"
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>
          {/* Email */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Email</label>
            <input
              data-testid="member-email-input"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@agency.com"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>
          {/* Password */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Password</label>
            <input
              data-testid="member-password-input"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
            {isEdit && (
              <p className="text-[10px] font-mono text-zinc-600 mt-1">LEAVE BLANK TO KEEP CURRENT PASSWORD</p>
            )}
          </div>
          {/* Permissions */}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Permissions</p>
            <PermissionsMatrix
              permissions={form.permissions}
              onChange={perms => setForm(f => ({ ...f, permissions: perms }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-sm font-mono transition-colors duration-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            data-testid="team-save-btn"
            onClick={submit}
            disabled={saving || !form.name.trim() || (!isEdit && !form.password)}
            className="bg-white text-black font-bold px-5 py-2.5 rounded-none hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-200 cursor-pointer text-sm"
          >
            {saving ? "Saving..." : "Save Member"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/team/MemberPanel.js
git commit -m "feat(frontend): add MemberPanel slide-out component"
```

---

## Task 13: `TeamPage.js`

**Files:**
- Create: `frontend/src/pages/TeamPage.js`

- [ ] **Step 1: Create the team management page**

Create `frontend/src/pages/TeamPage.js`:

```js
import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { MemberPanel } from "../components/team/MemberPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchMembers = async () => {
    try {
      const resp = await axios.get(`${API}/team`);
      setMembers(resp.data);
    } catch { toast.error("Failed to load team members"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const openAdd = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (m) => { setEditing(m); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setEditing(null); };

  const handleSave = async (form, memberId) => {
    try {
      if (memberId) {
        const payload = { name: form.name, email: form.email, permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await axios.put(`${API}/team/${memberId}`, payload);
        toast.success("Member updated");
      } else {
        await axios.post(`${API}/team`, form);
        toast.success("Member created");
      }
      await fetchMembers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save member");
      throw e;
    }
  };

  const toggleActive = async (member) => {
    try {
      await axios.put(`${API}/team/${member.id}`, { is_active: !member.is_active });
      toast.success(member.is_active ? "Member deactivated" : "Member activated");
      await fetchMembers();
    } catch { toast.error("Failed to update member status"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING TEAM...</div>;
  }

  return (
    <div className="p-6" data-testid="team-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Team Members</h1>
          <p className="text-[10px] font-mono text-zinc-500 mt-0.5">Manage access and permissions</p>
        </div>
        <button
          data-testid="team-add-member-btn"
          onClick={openAdd}
          className="bg-white text-black font-bold rounded-none px-4 py-2 hover:bg-zinc-200 transition-colors duration-200 text-sm cursor-pointer"
        >
          + Add Member
        </button>
      </div>

      {/* Table */}
      <div className="bg-zinc-950 border border-zinc-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Name</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Email</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Status</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-zinc-600 font-mono text-sm py-10">
                  No team members yet. Add one to get started.
                </td>
              </tr>
            )}
            {members.map(member => (
              <tr
                key={member.id}
                data-testid={`team-row-${member.id}`}
                className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors duration-200"
              >
                <td className="px-4 py-3 text-sm text-white font-sans">{member.name}</td>
                <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{member.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${member.is_active ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
                    <span className={`text-[10px] font-mono font-semibold ${member.is_active ? "text-emerald-400" : "text-zinc-500"}`}>
                      {member.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    data-testid={`team-edit-btn-${member.id}`}
                    onClick={() => openEdit(member)}
                    className="border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none text-xs font-mono px-3 py-1.5 transition-colors duration-200 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`team-toggle-btn-${member.id}`}
                    onClick={() => toggleActive(member)}
                    className="border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none text-xs font-mono px-3 py-1.5 transition-colors duration-200 cursor-pointer"
                  >
                    {member.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MemberPanel
        open={panelOpen}
        member={editing}
        onClose={closePanel}
        onSave={handleSave}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TeamPage.js
git commit -m "feat(frontend): add TeamPage with member list and slide-out panel"
```

---

## Task 14: Action-Level Permissions in `Clients.js`

**Files:**
- Modify: `frontend/src/pages/Clients.js`

- [ ] **Step 1: Add `useUser` and hide create/delete actions**

Edit `frontend/src/pages/Clients.js`.

Add import:
```js
import { useUser } from "../context/UserContext";
```

Inside the main `Clients` component function, add after existing state:
```js
const { role, permissions } = useUser();
const cp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
  : (permissions?.clients ?? { view: true, create: true, edit: true, delete: true });
```

Find the "Add Client" button (around `data-testid="add-client-btn"`) and wrap it:
```jsx
{cp.create && (
  <button data-testid="add-client-btn" onClick={() => setDialogOpen(true)} ...>
    <Plus size={14} /> Add Client
  </button>
)}
```

Find the "Onboard Client" button (`data-testid="onboard-client-btn"`) and wrap it:
```jsx
{cp.create && (
  <button data-testid="onboard-client-btn" ...>...</button>
)}
```

Find the delete handler invocation (in the row actions, look for `deleteClient`) and wrap the delete button:
```jsx
{cp.delete && (
  <button data-testid={`client-delete-btn-${client.id}`} onClick={e => deleteClient(client, e)} ...>
    <Trash2 size={13} />
  </button>
)}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Clients.js
git commit -m "feat(frontend): hide create/delete client actions based on permissions"
```

---

## Task 15: Action-Level Permissions in Remaining Pages

Apply the same pattern from Task 14 to the remaining pages. Each page follows the same pattern: import `useUser`, derive `p = permissions?.{resource} ?? fullAccess`, conditionally render action buttons.

**Files:**
- Modify: `frontend/src/pages/TemplateLibrary.js`
- Modify: `frontend/src/pages/CalendarPage.js`
- Modify: `frontend/src/pages/MusicLibraryPage.js`
- Modify: `frontend/src/pages/VideoTemplatesAdmin.js`

- [ ] **Step 1: `TemplateLibrary.js` — hide create/delete template buttons**

Add to `TemplateLibrary.js`:
```js
import { useUser } from "../context/UserContext";
// inside component:
const { role, permissions } = useUser();
const tp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
  : (permissions?.templates ?? { view: true, create: true, edit: true, delete: true });
```
Wrap "New Template" / "Create" buttons with `{tp.create && ...}`.
Wrap delete buttons with `{tp.delete && ...}`.

- [ ] **Step 2: `CalendarPage.js` — hide create/delete post buttons**

```js
const { role, permissions } = useUser();
const calp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
  : (permissions?.calendar ?? { view: true, create: true, edit: true, delete: true });
```
Wrap "Generate Post" / "Schedule" buttons with `{calp.create && ...}`.
Wrap delete post buttons with `{calp.delete && ...}`.

- [ ] **Step 3: `MusicLibraryPage.js` — hide upload/delete buttons**

```js
const { role, permissions } = useUser();
const mp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
  : (permissions?.music ?? { view: true, create: true, edit: true, delete: true });
```
Wrap upload buttons with `{mp.create && ...}`. Wrap delete buttons with `{mp.delete && ...}`.

- [ ] **Step 4: `VideoTemplatesAdmin.js` — hide create/delete video template buttons**

```js
const { role, permissions } = useUser();
const vp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
  : (permissions?.video_templates ?? { view: true, create: true, edit: true, delete: true });
```
Wrap create/import buttons with `{vp.create && ...}`. Wrap delete buttons with `{vp.delete && ...}`.

- [ ] **Step 5: Verify full build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: builds clean

- [ ] **Step 6: Run full backend test suite one more time**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 7: Final commit**

```bash
git add frontend/src/pages/TemplateLibrary.js frontend/src/pages/CalendarPage.js \
  frontend/src/pages/MusicLibraryPage.js frontend/src/pages/VideoTemplatesAdmin.js
git commit -m "feat(frontend): apply action-level permission guards to all content pages"
```

---

## Done

After Task 15 the feature is complete:
- Owner logs in as before (password only) — full access
- Owner can create team members at `/team` with custom per-section permissions
- Team members log in with email + password
- Backend enforces permissions via `PERMISSION_MAP` in middleware (403 on violations)
- Frontend hides nav items and action buttons per member's permissions
- Deactivated member tokens immediately rejected as `401 Account inactive`
