from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form, Body, Depends, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import List, Optional, Dict, Union
from client_utils import _recompute_derived, _get_tone, _expand_derived_into_doc
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from passlib.context import CryptContext
from jose import JWTError, jwt
import os, uuid, logging, random, secrets, asyncio, tempfile, re
import sheets_service
import httpx
import bundle_service
import mail_service
import storage
from urllib.parse import urlencode, quote
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Ensure static directory exists at startup
STATIC_DIR = Path(__file__).parent / "static" / "carousels"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_client = AsyncIOMotorClient(mongo_url)
db = db_client[os.environ['DB_NAME']]

scheduler = AsyncIOScheduler()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Auth helpers ────────────────────────────────────────────────────────────

_JWT_SECRET  = os.environ.get("JWT_SECRET_KEY", secrets.token_hex(32))
_JWT_ALGO    = "HS256"
_TOKEN_DAYS  = 30
_pwd_ctx     = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Routes that don't need a JWT (prefix match)
_AUTH_EXEMPT = ("/api/auth/", "/api/static/", "/api/instagram/callback", "/api/facebook/callback", "/webhooks/bundle", "/api/mail/webhook/", "/api/webhooks/affiliate/")
# Exact path suffixes that are public (Telegram approve/reject links)
_PUBLIC_SUFFIXES = ("/approve", "/reject")

def _is_clip_stream_path(path: str) -> bool:
    parts = path.strip("/").split("/")
    return (
        len(parts) == 6
        and parts[0] == "api"
        and parts[1] == "clients"
        and parts[3] == "clips"
        and parts[5] == "stream"
    )

def _hash_pw(pw: str) -> str:   return _pwd_ctx.hash(pw)
def _verify_pw(pw: str, h: str) -> bool: return _pwd_ctx.verify(pw, h)

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


import re as _re

PERMISSION_MAP: dict[tuple[str, str], tuple[str, str]] = {
    # Team management — owner only (will also be blocked by _require_owner, belt-and-suspenders)
    ("GET",    r"^/api/team$"):  ("_owner_only", "view"),
    ("POST",   r"^/api/team$"):  ("_owner_only", "create"),
    ("PUT",    r"^/api/team/"):  ("_owner_only", "edit"),
    ("DELETE", r"^/api/team/"):  ("_owner_only", "delete"),
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

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    industry: str = ""
    brand_voice: str = "professional"
    target_audience: str = ""
    platforms: List[str] = []
    avatar: str = ""
    strategy: dict = {}
    auto_approve: Optional[bool] = False
    brand_overrides: Optional[dict] = None

class ClientUpdate(BaseModel):
    # Root client fields
    name: Optional[str] = None
    bio: Optional[str] = None
    industry: Optional[str] = None
    brand_voice: Optional[str] = None
    target_audience: Optional[str] = None
    platforms: Optional[List[str]] = None
    strategy: Optional[dict] = None
    avatar: Optional[str] = None
    platform_configs: Optional[dict] = None
    profile_photo_url: Optional[str] = None
    # Onboarding fields (stored in onboarding_data)
    username: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    website_url: Optional[str] = None
    pr_links: Optional[List[str]] = None
    instagram_handle: Optional[str] = None
    instagram_access_link: Optional[str] = None
    instagram_password: Optional[str] = None  # WARNING: stored as plaintext per user decision
    niche: Optional[str] = None
    problem_solved: Optional[str] = None
    brand_vibe: Optional[Union[str, List[str]]] = None
    account_goals: Optional[str] = None
    cta_link: Optional[str] = None
    language: Optional[Union[str, List[str]]] = None
    branding_assets_link: Optional[str] = None
    google_drive_images: Optional[str] = None
    google_drive_videos: Optional[str] = None
    lead_magnets: Optional[List[str]] = None
    automation_keywords: Optional[List[str]] = None
    competitor_accounts: Optional[List[str]] = None
    lead_sheet_link: Optional[str] = None
    bio_template: Optional[str] = None
    voice_notes_link: Optional[str] = None
    not_to_do_list: Optional[List[str]] = None
    preferred_carousel_template: Optional[str] = None
    preferred_video_template: Optional[str] = None
    # New onboarding fields (added with schema v2)
    brand_name: Optional[str] = None
    city_country: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    youtube_url: Optional[str] = None
    twitter_url: Optional[str] = None
    profile_photo_link: Optional[str] = None
    logo_link: Optional[str] = None
    account_suspended: Optional[bool] = None
    paid_ads_run: Optional[bool] = None
    personal_story: Optional[str] = None
    business_description: Optional[str] = None
    industry_label: Optional[str] = None
    daily_life: Optional[str] = None
    target_audience_description: Optional[str] = None
    audience_age_range: Optional[str] = None
    audience_emotional_state: Optional[List[str]] = None
    solutions_provided: Optional[List[str]] = None
    audience_problems: Optional[List[str]] = None
    audience_desires: Optional[List[str]] = None
    audience_myths: Optional[List[str]] = None
    audience_failed_attempts: Optional[List[str]] = None
    unique_selling_points: Optional[List[str]] = None
    frequent_questions: Optional[List[str]] = None
    love_topics: Optional[List[str]] = None
    has_case_studies: Optional[bool] = None
    case_study_1: Optional[str] = None
    case_study_2: Optional[str] = None
    signature_topic: Optional[str] = None
    niche_working_topics: Optional[str] = None
    niche_oversaturated_topics: Optional[str] = None
    niche_underserved_topics: Optional[str] = None
    disliked_content: Optional[str] = None
    next_step_after_view: Optional[str] = None
    lead_magnet_link: Optional[str] = None
    # Google Drive fields
    drive_folder_id: Optional[str] = None
    video_sequence_mode: Optional[str] = None   # "sequential" | "random"
    video_sequence_index: Optional[int] = None
    video_recurring_schedule: Optional[dict] = None
    video_default_priority: Optional[str] = None  # "high" | "normal" | "low"
    drive_images_folder_id: Optional[str] = None   # Drive folder for image rotation
    auto_approve: Optional[bool] = None
    brand_overrides: Optional[dict] = None
    auto_story_enabled: Optional[bool] = None

class PostCreate(BaseModel):
    client_id: str
    platform: str
    content_type: str = "text_post"
    text: str
    image_url: Optional[str] = None
    hashtags: List[str] = []
    scheduled_at: Optional[str] = None

class PostUpdate(BaseModel):
    text: Optional[str] = None
    image_url: Optional[str] = None
    hashtags: Optional[List[str]] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None
    carousel_data: Optional[dict] = None

class GenerateRequest(BaseModel):
    client_id: str
    platform: str
    content_type: str = "text_post"
    topic: Optional[str] = None
    scheduled_at: Optional[str] = None

class ContentPlanScheduleItem(BaseModel):
    day: str
    date: str
    topic: str
    format: str
    caption: str
    template_id: str
    slide_count: int = 5
    rationale: str = ""

class ContentPlanScheduleRequest(BaseModel):
    posts: List[ContentPlanScheduleItem]
    pipeline_id: Optional[str] = None

class SheetCreateRequest(BaseModel):
    share_with_email: str

class BulkGenerateRequest(BaseModel):
    client_id: str
    platforms: List[str]
    count_per_platform: int = 1

class SettingsUpdate(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    ai_model: Optional[str] = None
    ai_provider: Optional[str] = None
    auto_publish: Optional[bool] = None
    require_approval: Optional[bool] = None
    posts_per_day_per_client: Optional[int] = None
    automation_enabled: Optional[bool] = None
    competitor_scrape_limit: Optional[int] = None
    # Global video content-generation prompt. Used by generate_video_content
    # for every client unless that client overrides via strategy.video_prompt.
    # Empty string is meaningful — clears the global so renders fall back to
    # the built-in _CONTENT_PROMPT.
    global_video_prompt: Optional[str] = None
    # Default carousel template applied to the auto-created pipeline for new clients.
    # None means AI decides per-post.
    default_carousel_template: Optional[str] = None
    # Hours to wait after client creation before the first pipeline run. 0 = start immediately.
    onboard_pipeline_delay_hours: Optional[int] = None
    # Default daily posting time (HH:MM) for the auto-created pipeline.
    onboard_pipeline_posting_time: Optional[str] = None
    # Default slide count for the auto-created pipeline. None = 5 (AI default).
    onboard_pipeline_slide_count: Optional[int] = None

class BundleSettingsUpdate(BaseModel):
    bundle_api_key: Optional[str] = None
    bundle_webhook_secret: Optional[str] = None

# ─── Shotstack models ─────────────────────────────────────────────────────────

class ShotstackMergeField(BaseModel):
    find: str
    replace: str = ""
    role: str = "ai_text"  # ai_text|static_text|clip|logo|audio
    ai_hint: Optional[str] = None
    max_chars: Optional[int] = None
    inferred: bool = True

class ShotstackTemplate(BaseModel):
    id: str
    shotstack_template_id: str
    name: str
    thumbnail_url: Optional[str] = None
    audio_url: Optional[str] = None
    merge_fields: List[ShotstackMergeField] = []
    imported_at: Optional[str] = None
    last_synced_at: Optional[str] = None
    status: str = "draft"  # draft|active|inactive

class ShotstackTemplatePatch(BaseModel):
    status: Optional[str] = None
    merge_fields: Optional[List[ShotstackMergeField]] = None

class BrandOverrides(BaseModel):
    color: Optional[str] = None
    font_family: Optional[str] = None
    default_music_url: Optional[str] = None
    logo_url: Optional[str] = None

class RenderJobStatus(BaseModel):
    id: str
    post_id: Optional[str] = None
    client_id: str
    template_id: str
    shotstack_render_id: Optional[str] = None
    status: str  # submitted|succeeded|failed|cancelled
    submitted_at: Optional[str] = None
    completed_at: Optional[str] = None
    output_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    r2_video_url: Optional[str] = None
    r2_snapshot_url: Optional[str] = None
    error: Optional[str] = None
    retry_count: int = 0

class VideoCreateRequest(BaseModel):
    client_id: str
    pipeline_id: Optional[str] = None
    template_id: str  # shotstack_templates.id
    scheduled_at: Optional[str] = None
    music_url: Optional[str] = None
    clip_drive_ids: Optional[List[str]] = None
    ai_text_overrides: Optional[dict] = None       # {find_name: text} — skips Claude
    generated_merge_values: Optional[dict] = None  # from /videos/generate-content
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    prompt: Optional[str] = None
    filter_name: Optional[str] = None  # greyscale|boost|contrast|darken|lighten|muted|negative|blur
    instagram_thumbnail_offset_ms: Optional[int] = 4000  # Reel cover frame timestamp in ms
    also_post_story: Optional[bool] = True

class VideoGenerateTextRequest(BaseModel):
    template_id: str
    client_id: str
    topic: Optional[str] = None

class VideoGenerateContentRequest(BaseModel):
    template_id: str
    client_id: str
    prompt: str

class TelegramTestRequest(BaseModel):
    bot_token: str = ""
    chat_id: str = ""

class AuthSetupRequest(BaseModel):
    password: str

class AuthLoginRequest(BaseModel):
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

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

class ClientKeywordsUpdate(BaseModel):
    custom_trend_keywords: List[str]

    @field_validator("custom_trend_keywords", mode="before")
    @classmethod
    def cap_keyword_length(cls, v):
        return [str(kw)[:100] for kw in v]

class PromoteGlobalRequest(BaseModel):
    promoted: bool

class VideoPostCreate(BaseModel):
    client_id: str
    clip_id: Optional[str] = None
    platforms: List[str]
    scheduled_at: Optional[str] = None
    template_id: Optional[str] = None
    priority: str = "normal"
    caption: Optional[str] = None
    hashtags: List[str] = []
    clip_trim_start: float = 0.0
    clip_trim_end: Optional[float] = None
    overrides: Dict[str, str] = Field(default_factory=dict)

class VideoScheduleCreate(BaseModel):
    cron: str           # e.g. "0 9 * * *"
    platforms: List[str]
    template_id: Optional[str] = None
    priority: str = "normal"

class PipelineCreate(BaseModel):
    name: str
    pipeline_type: str = "standard"  # standard | trend | competitor | strategy | experimental | video
    content_type: str = "carousel"
    carousel_template: Optional[str] = None   # None = AI decides
    carousel_slide_count: Optional[int] = None # None = AI decides
    carousel_slide_format: Optional[str] = None   # None = AI picks best format for topic
    carousel_topics: List[str] = []
    global_instructions: Optional[str] = None
    cta_keyword: Optional[str] = None
    cta_offer: Optional[str] = None
    max_posts_per_day: int = 10
    platforms: List[str] = []
    schedule_type: str = "interval"
    interval_hours: int = 6
    specific_times: List[str] = ["09:00"]
    require_approval: bool = False
    # Video pipeline fields
    video_template_id: Optional[str] = None
    video_template_strategy: Optional[str] = "pick"  # pick | random
    drive_folder_id: Optional[str] = None
    overlay_text: Optional[str] = None
    video_cta_text: Optional[str] = None
    # Autopilot video config
    video_filter_name: Optional[str] = None       # greyscale|boost|contrast|darken|lighten|muted|negative|blur
    video_audio_url: Optional[str] = None         # override timeline.soundtrack.src
    video_hook_strategy: Optional[str] = "rotate" # rotate | random | none
    video_use_ai_content: Optional[bool] = True   # call generate_video_content for caption/hashtags/text
    video_clip_ids: List[str] = []                # subset of client's drive_clips to use (empty = use all)
    video_clip_strategy: Optional[str] = "random" # random | sequential
    next_clip_index: Optional[int] = 0            # sequential rotation cursor
    video_audio_tags: List[str] = []              # pick random track whose mood_tags intersect any of these
    instagram_thumbnail_offset_ms: Optional[int] = 4000  # Reel cover frame timestamp in ms
    # Gap scheduling (video)
    days_between_posts: Optional[int] = None  # None = use interval_hours logic
    post_time: Optional[str] = None           # "HH:MM" UTC, used with days_between_posts
    # Music multi-select
    video_audio_ids: List[str] = []           # selected track IDs
    video_audio_strategy: Optional[str] = "rotate"  # rotate | random

class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    pipeline_type: Optional[str] = None
    content_type: Optional[str] = None
    carousel_template: Optional[str] = None
    carousel_slide_count: Optional[int] = None
    carousel_slide_format: Optional[str] = None
    carousel_topics: Optional[List[str]] = None
    global_instructions: Optional[str] = None
    cta_keyword: Optional[str] = None
    cta_offer: Optional[str] = None
    max_posts_per_day: Optional[int] = None
    platforms: Optional[List[str]] = None
    schedule_type: Optional[str] = None
    interval_hours: Optional[int] = None
    specific_times: Optional[List[str]] = None
    require_approval: Optional[bool] = None
    status: Optional[str] = None
    video_template_id: Optional[str] = None
    video_template_strategy: Optional[str] = None
    video_filter_name: Optional[str] = None
    video_audio_url: Optional[str] = None
    video_hook_strategy: Optional[str] = None
    video_use_ai_content: Optional[bool] = None
    video_clip_ids: Optional[List[str]] = None
    video_clip_strategy: Optional[str] = None
    video_audio_tags: Optional[List[str]] = None
    instagram_thumbnail_offset_ms: Optional[int] = None
    days_between_posts: Optional[int] = None
    post_time: Optional[str] = None
    video_audio_ids: Optional[List[str]] = None
    video_audio_strategy: Optional[str] = None
    next_audio_index: Optional[int] = None

class OnboardingCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # — Step 1A: Personal & Contact —
    name: str
    brand_name: str = ""
    email: str = ""
    whatsapp: str = ""
    city_country: str = ""

    # — Step 1B: Social & Online —
    instagram_handle: str = ""
    instagram_profile_url: str = ""
    instagram_access_link: str = ""
    instagram_password: str = ""  # WARNING: stored as plaintext per user decision
    website_url: str = ""
    linkedin_url: str = ""
    youtube_url: str = ""
    twitter_url: str = ""
    pr_links: List[str] = []
    pr_media_links: str = ""
    high_quality_photos_link: str = ""
    video_clips_link: str = ""

    # — Step 1C: Assets (Drive links) —
    profile_photo_link: str = ""
    logo_link: str = ""
    google_drive_images: str = ""
    google_drive_videos: str = ""
    branding_assets_link: str = ""

    # — Step 1D: Account Health —
    account_suspended: bool = False
    paid_ads_run: bool = False

    # — Step 2A: Story & Business —
    personal_story: str = ""
    business_description: str = ""
    niche: str = ""
    industry_label: str = ""
    daily_life: str = ""

    # — Step 2B: Audience —
    target_audience_description: str = ""
    audience_age_range: str = ""
    audience_emotional_state: List[str] = []

    # — Step 2C: Deep Audience Intelligence (cap 5 each) —
    solutions_provided: List[str] = []
    audience_problems: List[str] = []
    audience_desires: List[str] = []
    audience_myths: List[str] = []
    audience_failed_attempts: List[str] = []
    unique_selling_points: List[str] = []
    frequent_questions: List[str] = []
    love_topics: List[str] = []
    problem_solved: str = ""

    # — Step 2D: Case Studies —
    has_case_studies: bool = False
    case_study_1: str = ""
    case_study_2: str = ""

    # — Step 3A: Positioning —
    signature_topic: str = ""
    brand_vibe: Union[str, List[str]] = ""
    language: Union[str, List[str]] = "English"

    # — Step 3B: Competitive Landscape —
    niche_working_topics: str = ""
    niche_oversaturated_topics: str = ""
    niche_underserved_topics: str = ""

    # — Step 3C: Competitors —
    competitor_accounts: List[str] = []

    # — Step 3D: Boundaries —
    disliked_content: str = ""
    not_to_do_list: List[str] = []

    # — Step 4A: Goal & Next Step —
    account_goals: str = "followers"
    next_step_after_view: str = ""

    # — Step 4B: Lead Magnet & Funnel —
    lead_magnets: List[str] = []
    lead_magnet_link: str = ""
    cta_link: str = ""

    # — Deprecated but kept for backward compat —
    username: str = ""
    lead_sheet_link: str = ""
    bio_template: str = ""
    voice_notes_link: str = ""
    automation_keywords: List[str] = []
    preferred_carousel_template: str = "full_white"
    preferred_video_template: str = ""

    # Platforms (root field, not stored in onboarding_data)
    platforms: List[str] = ["instagram"]

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
    pr_links: List[str] = []
    google_drive_images: str = ""
    google_drive_videos: str = ""
    pr_media_links: str = ""
    high_quality_photos_link: str = ""
    video_clips_link: str = ""
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
    cta_link: str = ""


class AffiliateNewClientWebhook(BaseModel):
    affiliate_id: str
    affiliate_client_id: str
    link_token: str
    client_data: AffiliateClientData

class KeywordConfigCreate(BaseModel):
    keywords: List[str]
    auto_comment_reply: str = ""
    auto_dm_message: str = ""
    auto_dm_file_url: str = ""
    monitored_post_ids: List[str] = []
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

class CompetitorCreate(BaseModel):
    handle: str
    platform: str  # "instagram" | "linkedin"

class CompetitorToggle(BaseModel):
    is_active: bool

class SendDMRequest(BaseModel):
    message: str = ""
    file_url: str = ""

# ─── Helpers ─────────────────────────────────────────────────────────────────

def clean_doc(doc):
    if doc is None:
        return None
    if '_id' in doc:
        doc['id'] = str(doc.pop('_id'))
    return doc

def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _extract_r2_key(url: str | None, r2_base: str) -> str | None:
    """Return the R2 object key for a URL, or None if it's not an R2 URL."""
    if not url:
        return None
    base = r2_base.rstrip("/")
    if url.startswith(base + "/"):
        key = url[len(base) + 1:]
        if key.startswith("clips/") or key.startswith("video-clips/"):
            return None
        return key
    return None


def _compute_engagement_score(performance: dict) -> int:
    """Likes + comments*3 + shares*5."""
    return (
        int(performance.get("likes", 0)) +
        int(performance.get("comments", 0)) * 3 +
        int(performance.get("shares", 0)) * 5
    )


async def _maybe_auto_flag_winner(post_id: str, client_id: str, performance: dict):
    """
    Auto-flag a post as winner if its engagement_score is in the top 20%
    of all published posts for this client. Skips posts already manually starred.
    """
    post = await db.posts.find_one({"id": post_id}, {"_id": 0, "winner_source": 1, "is_winner": 1})
    if not post:
        return
    # Never override a manual star
    if post.get("winner_source") == "manual":
        return

    score = _compute_engagement_score(performance)

    # Fetch all published posts' engagement scores for this client
    published = await db.posts.find(
        {"client_id": client_id, "status": "published"},
        {"_id": 0, "performance": 1}
    ).to_list(1000)

    if len(published) < 5:
        # Not enough data for meaningful percentile; skip
        return

    scores = sorted(
        [_compute_engagement_score(p.get("performance") or {}) for p in published],
        reverse=True
    )
    # 80th percentile = top 20%
    cutoff_idx = max(0, int(len(scores) * 0.2) - 1)
    threshold = scores[cutoff_idx]

    if threshold == 0:
        return  # Avoid flagging everything when there's no engagement data

    now = datetime.now(timezone.utc).isoformat()
    if score >= threshold:
        await db.posts.update_one({"id": post_id}, {"$set": {
            "is_winner": True,
            "winner_source": "auto",
            "winner_added_at": now,
            "engagement_score": score,
        }})
    else:
        # If previously auto-flagged but no longer qualifies, un-flag
        if post.get("is_winner") and post.get("winner_source") == "auto":
            await db.posts.update_one({"id": post_id}, {"$set": {
                "is_winner": False,
                "promoted_global": False,
                "winner_source": None,
                "winner_added_at": None,
            }})


async def add_log(level: str, message: str, client_id=None, client_name=None, post_id=None, platform=None):
    log = {
        "id": str(uuid.uuid4()),
        "level": level,
        "message": message,
        "client_id": client_id,
        "client_name": client_name,
        "post_id": post_id,
        "platform": platform,
        "created_at": now_iso()
    }
    await db.logs.insert_one(log)

async def get_settings():
    s = await db.settings.find_one({"key": "global"}, {"_id": 0})
    if not s:
        s = {
            "key": "global",
            "telegram_bot_token": "",
            "telegram_chat_id": "",
            "ai_model": "claude-sonnet-4-5-20250929",
            "ai_provider": "anthropic",
            "auto_publish": False,
            "require_approval": True,
            "posts_per_day_per_client": 3,
            "automation_enabled": True,
            "competitor_scrape_limit": 10,
            "created_at": now_iso()
        }
        await db.settings.insert_one({**s})
    return s

# ─── Seed Data ────────────────────────────────────────────────────────────────

async def seed_sample_data():
    # Seeding disabled — app starts clean
    return

    clients = [
        {
            "id": str(uuid.uuid4()),
            "name": "TechFlow Inc",
            "industry": "SaaS / Technology",
            "brand_voice": "innovative and authoritative",
            "target_audience": "B2B CTOs and tech decision-makers",
            "platforms": ["linkedin", "twitter", "instagram"],
            "avatar": "TF",
            "status": "active",
            "strategy": {
                "themes": ["product updates", "industry insights", "thought leadership"],
                "tone": "Professional, data-driven",
                "hashtags": ["#SaaS", "#TechInnovation", "#B2B"]
            },
            "platform_configs": {
                "linkedin": {"enabled": True, "posts_per_day": 2, "posting_times": ["09:00", "16:00"]},
                "twitter": {"enabled": True, "posts_per_day": 3, "posting_times": ["08:00", "12:00", "18:00"]},
                "instagram": {"enabled": True, "posts_per_day": 1, "posting_times": ["11:00"]}
            },
            "posts_today": 5,
            "posts_total": 142,
            "last_post_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
            "created_at": (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Wellness Path",
            "industry": "Health & Fitness",
            "brand_voice": "warm, motivational, and empathetic",
            "target_audience": "Health-conscious adults 25-45",
            "platforms": ["instagram", "facebook", "threads"],
            "avatar": "WP",
            "status": "active",
            "strategy": {
                "themes": ["wellness tips", "client transformations", "nutrition"],
                "tone": "Warm, encouraging, scientific",
                "hashtags": ["#Wellness", "#HealthyLiving", "#FitLife"]
            },
            "platform_configs": {
                "instagram": {"enabled": True, "posts_per_day": 2, "posting_times": ["07:00", "19:00"]},
                "facebook": {"enabled": True, "posts_per_day": 1, "posting_times": ["10:00"]},
                "threads": {"enabled": True, "posts_per_day": 3, "posting_times": ["08:00", "14:00", "20:00"]}
            },
            "posts_today": 3,
            "posts_total": 89,
            "last_post_at": (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(),
            "created_at": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Urban Eats",
            "industry": "Food & Beverage",
            "brand_voice": "vibrant, fun, and community-driven",
            "target_audience": "Foodies and local diners 20-40",
            "platforms": ["instagram", "facebook", "youtube", "threads"],
            "avatar": "UE",
            "status": "paused",
            "strategy": {
                "themes": ["daily specials", "behind the scenes", "chef spotlights"],
                "tone": "Playful, mouth-watering, local pride",
                "hashtags": ["#FoodLover", "#LocalEats", "#Foodie"]
            },
            "platform_configs": {
                "instagram": {"enabled": True, "posts_per_day": 3, "posting_times": ["11:30", "17:30", "21:00"]},
                "facebook": {"enabled": True, "posts_per_day": 2, "posting_times": ["12:00", "18:00"]},
                "youtube": {"enabled": False, "posts_per_day": 1, "posting_times": ["15:00"]},
                "threads": {"enabled": True, "posts_per_day": 2, "posting_times": ["12:00", "19:00"]}
            },
            "posts_today": 0,
            "posts_total": 67,
            "last_post_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
            "created_at": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
        }
    ]

    await db.clients.insert_many(clients)

    platforms_by_client = {
        clients[0]["id"]: ["linkedin", "twitter", "instagram"],
        clients[1]["id"]: ["instagram", "facebook", "threads"],
        clients[2]["id"]: ["instagram", "facebook"],
    }

    sample_texts = {
        "linkedin": "Excited to share our latest insights on AI-driven automation in enterprise workflows. The future of SaaS is autonomous.",
        "twitter": "Just shipped a new feature that saves our users 3 hours/week. Small wins, big impact. #SaaS",
        "instagram": "Behind the scenes at TechFlow HQ — our team building the future of automation.",
        "facebook": "Wellness tip of the day: Start your morning with 10 minutes of mindful breathing. Your productivity will thank you.",
        "threads": "Hot take: The best workout is the one you actually show up for. Consistency > perfection.",
    }
    hashtags_by_platform = {
        "linkedin": ["#SaaS", "#B2B", "#Innovation"],
        "twitter": ["#Tech", "#Startup"],
        "instagram": ["#TechLife", "#Innovation"],
        "facebook": ["#Wellness", "#Health"],
        "threads": ["#FitLife", "#Motivation"],
    }

    posts = []
    statuses = ["published", "published", "published", "scheduled", "draft", "failed"]
    for client in clients:
        for platform in platforms_by_client.get(client["id"], []):
            for i in range(6):
                status = statuses[i % len(statuses)]
                scheduled_offset = timedelta(hours=random.randint(1, 48)) if status == "scheduled" else timedelta(hours=-random.randint(1, 72))
                post = {
                    "id": str(uuid.uuid4()),
                    "client_id": client["id"],
                    "client_name": client["name"],
                    "platform": platform,
                    "content_type": "text_post",
                    "text": sample_texts.get(platform, "Great content incoming!"),
                    "image_url": None,
                    "hashtags": hashtags_by_platform.get(platform, []),
                    "status": status,
                    "scheduled_at": (datetime.now(timezone.utc) + scheduled_offset).isoformat(),
                    "published_at": now_iso() if status == "published" else None,
                    "error_message": "API rate limit exceeded" if status == "failed" else None,
                    "performance": {
                        "likes": random.randint(10, 500),
                        "comments": random.randint(2, 50),
                        "shares": random.randint(1, 30),
                        "impressions": random.randint(500, 10000)
                    } if status == "published" else {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                    "ai_generated": True,
                    "created_at": (datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 120))).isoformat()
                }
                posts.append(post)

    if posts:
        await db.posts.insert_many(posts)

    logs_data = [
        {"level": "success", "message": "Published 3 posts for TechFlow Inc", "client_name": "TechFlow Inc"},
        {"level": "info", "message": "Automation cycle started. Checking 3 active clients.", "client_name": None},
        {"level": "success", "message": "Generated 5 posts for Wellness Path using Claude AI", "client_name": "Wellness Path"},
        {"level": "warning", "message": "Twitter API rate limit approaching for TechFlow Inc", "client_name": "TechFlow Inc", "platform": "twitter"},
        {"level": "error", "message": "Failed to publish post: Instagram API token expired for Urban Eats", "client_name": "Urban Eats", "platform": "instagram"},
        {"level": "info", "message": "Weekly report generated and sent via Telegram", "client_name": None},
        {"level": "success", "message": "Content strategy applied for Wellness Path: 3 posts generated", "client_name": "Wellness Path"},
    ]
    logs_to_insert = []
    for i, l in enumerate(logs_data):
        logs_to_insert.append({
            "id": str(uuid.uuid4()),
            "level": l["level"],
            "message": l["message"],
            "client_id": None,
            "client_name": l.get("client_name"),
            "post_id": None,
            "platform": l.get("platform"),
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=i * 20)).isoformat()
        })
    await db.logs.insert_many(logs_to_insert)
    logger.info("Seed data inserted.")

# ─── Scheduler Tasks ─────────────────────────────────────────────────────────

async def fire_scheduled_emails():
    now = datetime.now(timezone.utc).isoformat()
    pending = await db.scheduled_emails.find(
        {"status": "pending", "scheduled_at": {"$lte": now}}
    ).to_list(50)
    for doc in pending:
        try:
            resend_id = mail_service.send_email(
                to=doc["to"], subject=doc["subject"], html=doc["html"],
                cc=doc.get("cc"), reply_to=doc.get("reply_to"),
            )
            await db.scheduled_emails.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": "sent", "resend_id": resend_id,
                           "sent_at": datetime.now(timezone.utc).isoformat(),
                           "delivery_status": "queued"}},
            )
            await db.email_logs.insert_one({
                "type": doc["type"], "client_id": doc["client_id"],
                "to": doc["to"], "cc": doc.get("cc", []),
                "subject": doc["subject"], "resend_id": resend_id,
                "status": "sent", "delivery_status": "queued",
                "sent_by": doc.get("created_by", "scheduler"),
                "sent_at": datetime.now(timezone.utc).isoformat(), "error": None,
            })
        except Exception as e:
            await db.scheduled_emails.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": "failed", "error": str(e)}},
            )


async def process_scheduled_posts():
    try:
        settings = await get_settings()
        if not settings.get("automation_enabled", True):
            return
        now = datetime.now(timezone.utc)
        # Per-platform throttling: IG's app-level container creation limit
        # silently returns {"id": "0"} when too many publishes hit at once.
        # When N clients all schedule for the same minute (very common), a 30s
        # gap between publishes per platform keeps us under the burst threshold.
        _PLATFORM_MIN_GAP_SEC = {"instagram": 30, "facebook": 10}
        last_publish_at: dict[str, datetime] = {}
        cursor = db.posts.find({"status": "scheduled"}, {"_id": 0})
        async for post in cursor:
            try:
                published_on_platform = False  # set True the moment the platform accepts the post
                sched = datetime.fromisoformat(post["scheduled_at"].replace("Z", "+00:00"))
                if sched <= now:
                    # Atomically claim the post to prevent double-publishing
                    # (guards against concurrent scheduler runs or a simultaneous manual publish)
                    claimed = await db.posts.update_one(
                        {"id": post["id"], "status": "scheduled"},
                        {"$set": {"status": "publishing"}}
                    )
                    if claimed.modified_count == 0:
                        continue  # Already claimed by another process

                    platform = post.get("platform", "")
                    min_gap = _PLATFORM_MIN_GAP_SEC.get(platform, 0)
                    last_at = last_publish_at.get(platform)
                    if min_gap and last_at:
                        elapsed = (datetime.now(timezone.utc) - last_at).total_seconds()
                        if elapsed < min_gap:
                            wait_sec = min_gap - elapsed
                            logger.info(f"Throttling {platform} publish for post {post['id'][:8]} — sleeping {wait_sec:.1f}s to respect burst limit")
                            await asyncio.sleep(wait_sec)

                    client = await db.clients.find_one({"id": post["client_id"]}, {"_id": 0}) or {}
                    from publisher import publish
                    result = await publish(post, client)
                    last_publish_at[platform] = datetime.now(timezone.utc)
                    if result["status"] == "published":
                        published_on_platform = True  # platform accepted — must not revert to scheduled
                        update = {
                            "status": "published",
                            "published_at": now_iso(),
                            "error_message": None,
                            "retry_count": 0,
                            "platform_post_id": result.get("platform_post_id"),
                            "performance": result.get("metrics", {})
                        }
                        unset = {}
                        if result.get("clear_pending_carousel_container_id") or post.get("pending_carousel_container_id"):
                            unset["pending_carousel_container_id"] = ""
                        update_op = {"$set": update}
                        if unset:
                            update_op["$unset"] = unset
                        await db.posts.update_one({"id": post["id"]}, update_op)
                        await _maybe_auto_flag_winner(post["id"], post["client_id"], result.get("metrics", {}))
                        await db.clients.update_one({"id": post["client_id"]}, {"$inc": {"posts_today": 1, "posts_total": 1}, "$set": {"last_post_at": now_iso()}})
                        await add_log("success", f"Published post on {post['platform']} for {post['client_name']}", post["client_id"], post["client_name"], post["id"], post["platform"])
                        asyncio.create_task(_trigger_sheet_sync(post["client_id"], ["Posts"]))
                    else:
                        retry_count = post.get("retry_count", 0) + 1
                        _MAX_RETRIES = 3
                        is_pending_resume = bool(result.get("pending_carousel_container_id"))
                        _err_msg = result.get("error", "")
                        if "temporarily restricted" in (_err_msg or ""):
                            # IG error 368 — account is platform-restricted, retrying won't help.
                            # Mark as published so the scheduler never touches this post again.
                            unset_fields = {}
                            if post.get("pending_carousel_container_id"):
                                unset_fields["pending_carousel_container_id"] = ""
                            update_op = {"$set": {"status": "published", "published_at": now_iso(), "error_message": None, "retry_count": 0}}
                            if unset_fields:
                                update_op["$unset"] = unset_fields
                            await db.posts.update_one({"id": post["id"]}, update_op)
                            await add_log("warning", f"Post marked published after IG community restriction (error 368) — no retry: {_err_msg}", post["client_id"], post["client_name"], post["id"], post["platform"])
                        elif retry_count < _MAX_RETRIES:
                            retry_at = (now + timedelta(minutes=5 * retry_count)).isoformat()
                            set_fields = {
                                "status": "scheduled",
                                "scheduled_at": retry_at,
                                "retry_count": retry_count,
                                "error_message": result.get("error"),
                            }
                            unset_fields = {}
                            if result.get("pending_carousel_container_id"):
                                set_fields["pending_carousel_container_id"] = result["pending_carousel_container_id"]
                            elif result.get("clear_pending_carousel_container_id") or post.get("pending_carousel_container_id"):
                                unset_fields["pending_carousel_container_id"] = ""
                            update_op = {"$set": set_fields}
                            if unset_fields:
                                update_op["$unset"] = unset_fields
                            await db.posts.update_one({"id": post["id"]}, update_op)
                            attempt_label = f"resuming carousel, attempt {retry_count}/{_MAX_RETRIES}" if is_pending_resume else f"attempt {retry_count}/{_MAX_RETRIES}"
                            await add_log("warning", f"Publish deferred ({attempt_label}), retrying in {5 * retry_count}m: {result.get('error', '')}", post["client_id"], post["client_name"], post["id"], post["platform"])
                        else:
                            set_fields = {
                                "status": "failed",
                                "error_message": result.get("error"),
                                "retry_count": retry_count,
                            }
                            unset_fields = {}
                            if post.get("pending_carousel_container_id"):
                                unset_fields["pending_carousel_container_id"] = ""
                            update_op = {"$set": set_fields}
                            if unset_fields:
                                update_op["$unset"] = unset_fields
                            await db.posts.update_one({"id": post["id"]}, update_op)
                            await db.clients.update_one({"id": post["client_id"]}, {"$inc": {"posts_failed": 1}})
                            await add_log("error", f"Failed to publish on {post['platform']} after {_MAX_RETRIES} attempts: {result.get('error', 'Unknown error')}", post["client_id"], post["client_name"], post["id"], post["platform"])
                            asyncio.create_task(_trigger_sheet_sync(post["client_id"], ["Posts"]))
                            from telegram_service import send_alert
                            bot_token = settings.get("telegram_bot_token", "")
                            chat_id = settings.get("telegram_chat_id", "")
                            if bot_token and chat_id:
                                await send_alert(f"FAIL (final): {post['client_name']} → {post['platform']}: {result.get('error')}", bot_token, chat_id)
            except Exception as e:
                logger.error(f"Error processing post {post.get('id')}: {e}")
                if published_on_platform:
                    # Platform already accepted the post — must not revert to scheduled or
                    # the next scheduler run will re-publish it (double post).
                    # Force-write published status even though the earlier DB update failed.
                    await db.posts.update_one(
                        {"id": post.get("id")},
                        {"$set": {"status": "published", "published_at": now_iso()}}
                    )
                    await add_log("warning", f"Post published but post-publish update failed — marked published to prevent re-publish: {e}", post.get("client_id"), post.get("client_name"), post.get("id"), post.get("platform"))
                else:
                    # Publish not confirmed — safe to revert so the next run can retry
                    await db.posts.update_one(
                        {"id": post.get("id"), "status": "publishing"},
                        {"$set": {"status": "scheduled"}}
                    )
    except Exception as e:
        logger.error(f"Scheduler error: {e}")

async def daily_content_reset():
    await db.clients.update_many({}, {"$set": {"posts_today": 0, "posts_failed": 0}})
    await add_log("info", "Daily post counters reset")

# ─── Pipeline Execution ───────────────────────────────────────────────────────

def calculate_next_run(pipeline: dict, now: datetime) -> str:
    # Video gap scheduling: post every N days at a fixed time
    days = pipeline.get("days_between_posts")
    if days:
        post_time = pipeline.get("post_time", "09:00") or "09:00"
        try:
            h, m = map(int, post_time.split(":"))
        except Exception:
            h, m = 9, 0
        next_run = (now + timedelta(days=int(days))).replace(hour=h, minute=m, second=0, microsecond=0)
        return next_run.isoformat()

    schedule_type = pipeline.get("schedule_type", "interval")
    if schedule_type == "specific_times":
        times = sorted(pipeline.get("specific_times", []))
        for time_str in times:
            try:
                h, m = map(int, time_str.split(":"))
                candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
                if candidate > now:
                    return candidate.isoformat()
            except Exception:
                pass
        if times:
            h, m = map(int, times[0].split(":"))
            return (now + timedelta(days=1)).replace(hour=h, minute=m, second=0, microsecond=0).isoformat()
        # Fallback if times is empty
        return (now + timedelta(hours=6)).isoformat()
    hours = max(1, pipeline.get("interval_hours", 6))
    return (now + timedelta(hours=hours)).isoformat()

async def _build_carousel_post_text(carousel_data: dict) -> tuple[str, dict]:
    """Build post text and extra dict from carousel_data."""
    import re as _re
    from carousel_templates.base import _get_slide_content
    _all_slides = carousel_data.get("slides", [])
    slides_preview = "\n\n".join([_get_slide_content(s) for s in _all_slides])
    # Strip markdown bold/italic markers so captions are plain text
    slides_preview = _re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", slides_preview)
    _cta_sub = carousel_data.get("cta_sub", "")
    _cta_text = carousel_data.get("cta_text", "")
    _cta_footer = f"\n\n{_cta_sub}" if _cta_sub else ""
    if _cta_text and _cta_text not in slides_preview:
        _cta_footer += f" | {_cta_text}" if _cta_sub else f"\n\n{_cta_text}"
    # Use AI-generated caption if present; fall back to title + slide dump (no [CAROUSEL] prefix)
    post_text = carousel_data.get("caption") or f"{carousel_data.get('title', 'Untitled')}\n\n{slides_preview}{_cta_footer}"
    return post_text, {"carousel_data": carousel_data}


async def execute_pipeline(pipeline: dict, now: datetime, stagger_minutes: int = 0, auto_publish: bool = False) -> int:
    import random as _random

    # Determine the intended publish time.
    # When triggered early (5 min before), next_run_at is still in the future —
    # use it so the post waits and publishes at the exact scheduled moment.
    # If next_run_at is missing or already past, publish immediately (now).
    _raw_nra = pipeline.get("next_run_at")
    if _raw_nra:
        try:
            _target = datetime.fromisoformat(_raw_nra.replace("Z", "+00:00"))
            scheduled_time = _target if _target > now else now
        except Exception:
            scheduled_time = now
    else:
        scheduled_time = now

    if stagger_minutes:
        scheduled_time = scheduled_time + timedelta(minutes=stagger_minutes)

    client = await db.clients.find_one({"id": pipeline["client_id"]}, {"_id": 0})
    if not client or client.get("status") != "active":
        return 0
    settings = await get_settings()
    posts_created = []
    content_type = pipeline.get("content_type", "carousel")
    pipeline_type = pipeline.get("pipeline_type", "standard")
    pipeline_id = pipeline["id"]

    # Daily cap check — count posts created today by this pipeline
    max_per_day = pipeline.get("max_posts_per_day", 10)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_count = await db.posts.count_documents({
        "pipeline_id": pipeline_id,
        "created_at": {"$gte": today_start}
    })
    if today_count >= max_per_day:
        logger.info(f"Pipeline {pipeline_id} hit daily cap ({max_per_day}), skipping run")
        # Schedule next run to tomorrow morning
        tomorrow = (now + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        await db.pipelines.update_one({"id": pipeline_id}, {"$set": {"next_run_at": tomorrow.isoformat()}})
        return 0

    # Step 0: Load cached trends, fetch live if cache is empty
    from trend_service import get_cached_trends, fetch_trends_for_client
    trends = await get_cached_trends(pipeline["client_id"], db)
    if not trends:
        try:
            trends = await fetch_trends_for_client(client, db)
        except Exception as e:
            logger.warning(f"Live trend fetch failed for pipeline {pipeline_id}: {e}")
            trends = []

    # ── Type-specific pre-generation setup ───────────────────────────────────

    # For competitor type: find next best unrecreated competitor post
    competitor_post = None
    if pipeline_type == "competitor":
        competitor_post = await db.competitor_posts.find_one(
            {"client_id": pipeline["client_id"], "recreated": {"$ne": True}, "recreation_error": {"$ne": True}},
            sort=[("engagement_score", -1)]
        )
        if not competitor_post:
            logger.info(f"Pipeline {pipeline_id} (competitor): no unrecreated posts available, retrying in 1h")
            retry_time = (now + timedelta(hours=1)).isoformat()
            await db.pipelines.update_one({"id": pipeline_id}, {"$set": {"next_run_at": retry_time}})
            await add_log("warning", f"Pipeline '{pipeline['name']}': no competitor posts available, retry in 1h",
                          pipeline["client_id"], client["name"])
            return 0

    # ── Determine generation params by pipeline_type (once per run, not per platform) ──
    from ai_service import generate_carousel, generate_content
    topic = None
    slide_format = pipeline.get("carousel_slide_format") or None
    hook_inspiration = None
    extra_global_instructions = pipeline.get("global_instructions") or ""
    pipeline_content_type = content_type

    if pipeline_type == "standard":
        # Bug fix: cycle through topics using total_runs, not always topics[0]
        topics = pipeline.get("carousel_topics", [])
        if topics:
            topic = topics[pipeline.get("total_runs", 0) % len(topics)]

    elif pipeline_type == "trend":
        sorted_trends = sorted(trends or [], key=lambda t: t.get("volume", 0), reverse=True)
        if sorted_trends:
            run_count = pipeline.get("total_runs", 0)
            topic = sorted_trends[run_count % min(3, len(sorted_trends))].get("topic")
        # Bug fix: respect user's carousel_slide_format instead of forcing tips/step_by_step
        pipeline_content_type = "carousel"

    elif pipeline_type == "competitor":
        slide_texts = competitor_post.get("slide_texts", [])
        graphic_texts = [t for t in slide_texts if t and t.strip()]
        # Use the actual graphic hook (slide 1 text) — more accurate than the caption
        hook_inspiration = (
            graphic_texts[0] if graphic_texts
            else (competitor_post.get("caption", "") or None)
        )
        if graphic_texts:
            extra_global_instructions += (
                "\n\nCOMPETITOR HOOK ARSENAL — these are real hooks that drove engagement."
                " Study the psychological trigger in each (curiosity gap, pain, controversy, bold claim)."
                " Rebuild every one of them from scratch in " + (client.get("name") or "the client") + "'s voice:\n"
                + "\n".join(f"Hook {i+1}: {t}" for i, t in enumerate(graphic_texts[:6]))
            )
        pipeline_content_type = "carousel"

    elif pipeline_type == "strategy":
        themes = client.get("strategy", {}).get("themes", [])
        if themes:
            pillar_index = pipeline.get("strategy_pillar_index", 0) % len(themes)
            topic = themes[pillar_index]
        pipeline_content_type = "carousel"

    elif pipeline_type == "experimental":
        # Bug fix: pick format and topic once before the platform loop so all platforms
        # get the same format/topic in a single run
        sorted_trends = sorted(trends or [], key=lambda t: t.get("volume", 0), reverse=True)
        themes = client.get("strategy", {}).get("themes", [])
        pool = [t.get("topic") for t in sorted_trends[:3] if t.get("topic")] + themes
        topic = _random.choice(pool) if pool else None
        extra_global_instructions = (
            "Take an unexpected, contrarian, or provocative angle. "
            "Challenge common assumptions. Be bold and surprising. "
            "Avoid safe, generic advice — make the reader stop scrolling."
            + (" " + extra_global_instructions if extra_global_instructions else "")
        )
        pipeline_content_type = "carousel"
        # Experimental always rotates format regardless of pipeline config
        slide_format = None

    elif pipeline_type == "video":
        # Autopilot video pipeline:
        # 1) Pick a hook from client.strategy.video_hooks per video_hook_strategy
        # 2) AI-generate caption/hashtags/ai_text merge values (if enabled)
        # 3) Pick clips for the template's clip slots
        # 4) Create a post doc shaped like POST /videos/create produces
        # 5) Enqueue via the same worker — submit_render_for_post handles the rest
        video_template_strategy = pipeline.get("video_template_strategy", "pick")
        if video_template_strategy == "random":
            active_templates = await db.shotstack_templates.find({"status": "active"}).to_list(None)
            if not active_templates:
                await add_log("warning", f"Pipeline '{pipeline['name']}': no active video templates found for random selection", pipeline["client_id"], client["name"])
                return 0
            template_doc = random.choice(active_templates)
            video_template_id = template_doc["id"]
        else:
            video_template_id = pipeline.get("video_template_id")
            if not video_template_id:
                await add_log("warning", f"Pipeline '{pipeline['name']}': no video template configured", pipeline["client_id"], client["name"])
                return 0
            template_doc = await db.shotstack_templates.find_one({"id": video_template_id, "status": "active"})
            if not template_doc:
                await add_log("warning", f"Pipeline '{pipeline['name']}': Shotstack template not active", pipeline["client_id"], client["name"])
                return 0

        # Required clips: count clip-role merge fields on the template
        required_clip_count = sum(1 for f in template_doc.get("merge_fields", []) if f.get("role") == "clip")
        all_client_clips = await db.drive_clips.find({"client_id": pipeline["client_id"]}).to_list(500)

        # Per-pipeline clip subset — preserve user-defined order
        configured_clip_ids = pipeline.get("video_clip_ids") or []
        if configured_clip_ids:
            clip_by_id = {(c.get("drive_file_id") or c.get("id")): c for c in all_client_clips}
            pool = [clip_by_id[cid] for cid in configured_clip_ids if cid in clip_by_id]
            if len(pool) < len(configured_clip_ids):
                logger.warning(f"Pipeline {pipeline_id}: {len(configured_clip_ids) - len(pool)} configured clip(s) no longer in drive_clips")
        else:
            pool = all_client_clips

        if required_clip_count > 0 and len(pool) < required_clip_count:
            await add_log("warning",
                          f"Pipeline '{pipeline['name']}': needs {required_clip_count} clip(s), pool has {len(pool)}",
                          pipeline["client_id"], client["name"])
            return 0

        # Pick N clips per strategy. Sequential preserves the user's ordering;
        # random samples without replacement within the pool.
        clip_strategy = pipeline.get("video_clip_strategy") or "random"
        next_clip_index = pipeline.get("next_clip_index", 0) or 0
        if required_clip_count == 0:
            picked_clips = []
        elif clip_strategy == "sequential" and configured_clip_ids:
            picked_clips = []
            for i in range(required_clip_count):
                picked_clips.append(pool[(next_clip_index + i) % len(pool)])
            next_clip_index = (next_clip_index + required_clip_count) % len(pool)
        else:
            picked_clips = _random.sample(pool, required_clip_count)
        clip_drive_ids = [c.get("drive_file_id") or c.get("id") for c in picked_clips]

        # Diagnostic — surfaces the actual selection in logs so "clips not
        # changing" / "filter not applying" complaints can be debugged without
        # opening the DB shell.
        clip_role_count = sum(1 for f in template_doc.get("merge_fields", []) if f.get("role") == "clip")
        ai_text_count = sum(1 for f in template_doc.get("merge_fields", []) if f.get("role") == "ai_text")
        logger.info(
            f"Pipeline {pipeline_id[:8]} video config: "
            f"template={template_doc.get('name')!r} "
            f"pool_size={len(pool)} required_clips={required_clip_count} picked={clip_drive_ids} "
            f"strategy={clip_strategy} "
            f"role_counts={{clip:{clip_role_count}, ai_text:{ai_text_count}}} "
            f"filter={pipeline.get('video_filter_name')!r} "
            f"audio_strategy={'tags' if pipeline.get('video_audio_tags') else ('url' if pipeline.get('video_audio_url') else 'default')}"
        )
        if clip_role_count == 0 and template_doc.get("merge_fields"):
            logger.warning(
                f"Pipeline {pipeline_id[:8]}: template '{template_doc.get('name')}' has merge fields but NONE "
                f"are tagged role='clip' — clip picks will not be applied. Open the template in /video-templates "
                f"and fix the field roles in the drawer."
            )

        # Hook selection (rotate / random / none)
        hooks = (client.get("strategy") or {}).get("video_hooks") or []
        hook_strategy = pipeline.get("video_hook_strategy") or "rotate"
        chosen_hook = None
        next_hook_index = pipeline.get("next_hook_index", 0) or 0
        if hooks and hook_strategy != "none":
            if hook_strategy == "random":
                chosen_hook = _random.choice(hooks)
            else:  # rotate
                idx = next_hook_index % len(hooks)
                chosen_hook = hooks[idx]
                next_hook_index = (idx + 1) % len(hooks)

        prompt_text = (chosen_hook or {}).get("prompt") or pipeline.get("global_instructions") or topic or ""

        # Optional AI content generation — caption, hashtags, ai_text merge values
        generated_merge_values: dict = {}
        caption: str = ""
        hashtags: list = []
        if pipeline.get("video_use_ai_content") is not False and prompt_text.strip():
            ai_text_fields = [f for f in template_doc.get("merge_fields", []) if f.get("role") == "ai_text"]
            try:
                from video_render_service import generate_video_content
                r = await generate_video_content(prompt_text, client, ai_text_fields, db=db)
                generated_merge_values = r.get("merge_values") or {}
                caption = r.get("caption") or ""
                hashtags = r.get("hashtags") or []
            except Exception as _ge:
                logger.warning(f"Pipeline {pipeline_id} AI content gen failed: {_ge}")

        # Resolve audio override:
        #   1) Pick Tracks (video_audio_ids) — rotate or random from selected tracks
        #   2) By Tag (video_audio_tags) — random track matching any tag
        #   3) Pinned URL (video_audio_url) — legacy single-track pin
        #   4) Template default
        resolved_audio_url = pipeline.get("video_audio_url") or ""
        audio_tags = pipeline.get("video_audio_tags") or []
        audio_ids = pipeline.get("video_audio_ids") or []
        audio_pick_strategy = "url" if resolved_audio_url else "default"

        if not resolved_audio_url and audio_ids:
            id_tracks = await db.music_tracks.find(
                {"id": {"$in": audio_ids}},
                {"_id": 0, "r2_url": 1, "name": 1, "id": 1},
            ).to_list(500)
            if id_tracks:
                strat = pipeline.get("video_audio_strategy") or "rotate"
                if strat == "rotate":
                    cursor = pipeline.get("next_audio_index", 0) or 0
                    chosen_track = id_tracks[cursor % len(id_tracks)]
                    await db.pipelines.update_one(
                        {"id": pipeline_id},
                        {"$set": {"next_audio_index": (cursor + 1) % len(id_tracks)}}
                    )
                else:
                    chosen_track = _random.choice(id_tracks)
                resolved_audio_url = chosen_track.get("r2_url") or ""
                audio_pick_strategy = "ids"
                logger.info(f"Pipeline {pipeline_id}: id-pick chose '{chosen_track.get('name')}' (strategy={strat})")

        if not resolved_audio_url and audio_tags:
            candidates = await db.music_tracks.find(
                {"mood_tags": {"$in": audio_tags}},
                {"_id": 0, "r2_url": 1, "name": 1, "id": 1, "mood_tags": 1},
            ).to_list(500)
            if candidates:
                chosen_track = _random.choice(candidates)
                resolved_audio_url = chosen_track.get("r2_url") or ""
                audio_pick_strategy = "tags"
                logger.info(
                    f"Pipeline {pipeline_id}: tag-pick chose '{chosen_track.get('name')}' "
                    f"from {len(candidates)} matches (tags={audio_tags})"
                )
            else:
                logger.warning(f"Pipeline {pipeline_id}: no tracks match tags {audio_tags}")

        post_doc = {
            "id": str(uuid.uuid4()),
            "client_id": pipeline["client_id"],
            "client_name": client.get("name", ""),
            "pipeline_id": pipeline_id,
            "kind": "video",
            "platform": (pipeline.get("platforms") or client.get("platforms") or ["instagram"])[0],
            "target_platforms": pipeline.get("platforms") or client.get("platforms", []),
            "template_id": video_template_id,
            "scheduled_at": scheduled_time.isoformat(),
            "status": "rendering",
            "music_url": resolved_audio_url or None,
            "audio_tags": audio_tags,
            "audio_pick_strategy": audio_pick_strategy,
            "filter_name": pipeline.get("video_filter_name"),
            "clip_drive_ids": clip_drive_ids,
            "generated_merge_values": generated_merge_values,
            "caption": caption,
            "hashtags": hashtags,
            "prompt": prompt_text,
            "topic": (chosen_hook or {}).get("title") or topic,
            "hook_id": (chosen_hook or {}).get("id"),
            "auto_publish_after_render": bool(auto_publish),
            "instagram_thumbnail_offset_ms": pipeline.get("instagram_thumbnail_offset_ms", 4000),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            from video_worker import enqueue_video_job as _enqueue_video_job
            await db.posts.insert_one(post_doc)
            _task_id = _enqueue_video_job(post_doc["id"])
            video_posts_created = [post_doc["id"]]
            hook_label = (chosen_hook or {}).get("title") or "(no hook)"
            await add_log("info", f"Video pipeline render enqueued — hook: {hook_label} (task {_task_id})", pipeline["client_id"], client["name"])
        except Exception as _ve:
            logger.error(f"Video pipeline {pipeline_id} failed: {_ve}")
            video_posts_created = []

        pipeline_updates_v: dict = {
            "last_run_at": now.isoformat(),
            "next_run_at": calculate_next_run(pipeline, scheduled_time),
            "next_hook_index": next_hook_index,
            "next_clip_index": next_clip_index,
            "total_runs": pipeline.get("total_runs", 0) + 1,
            "successful_runs": pipeline.get("successful_runs", 0) + (1 if video_posts_created else 0),
            "status": "active",
        }
        await db.pipelines.update_one({"id": pipeline_id}, {"$set": pipeline_updates_v})
        level = "success" if video_posts_created else "warning"
        await add_log(level, f"Pipeline '{pipeline['name']}' [video]: {len(video_posts_created)} post(s) created", pipeline["client_id"], client["name"])
        return len(video_posts_created)

    # When the pipeline has no locked format (user picked "Auto"), walk a deterministic
    # round-robin so every format appears once before repeating.  Each pipeline stores its
    # own shuffled order (set at creation) and a counter that advances each successful run.
    if pipeline_content_type in ("carousel", "mixed") and not slide_format:
        rotation_order = pipeline.get("format_rotation_order") or [
            "tips", "story", "myth_bust", "case_study", "step_by_step"
        ]
        idx = pipeline.get("format_rotation_index", 0) % len(rotation_order)
        slide_format = rotation_order[idx]

    for platform in pipeline.get("platforms", []):
        try:
            # ── Generate content ──────────────────────────────────────────
            if pipeline_content_type in ("carousel", "mixed"):
                # Competitor type uses its own slide count
                if pipeline_type == "competitor" and competitor_post:
                    slide_count = max(5, min(7, len(competitor_post.get("slide_texts", [])) or 5))
                else:
                    slide_count = pipeline.get("carousel_slide_count", 5) or 5

                carousel_data = await generate_carousel(
                    client, platform,
                    pipeline.get("carousel_template", "full_white"),
                    topic, slide_count, settings,
                    cta_keyword=pipeline.get("cta_keyword"),
                    cta_offer=pipeline.get("cta_offer"),
                    trends=trends,
                    hook_inspiration=hook_inspiration,
                    global_instructions=extra_global_instructions or None,
                    slide_format=slide_format,
                    db=db,
                )
                post_text, extra = await _build_carousel_post_text(carousel_data)
            else:
                winners = await db.posts.find(
                    {"client_id": client["id"], "is_winner": True},
                    {"_id": 0, "text": 1, "content_type": 1, "performance": 1, "engagement_score": 1}
                ).sort("engagement_score", -1).limit(3).to_list(3)
                content = await generate_content(client, platform, "text_post", None, settings, trends=trends, winners=winners, db=db)
                post_text = content["text"]
                extra = {"hashtags": content.get("hashtags", [])}

            needs_approval = bool(pipeline.get("require_approval"))
            approval_token = str(uuid.uuid4()) if needs_approval else None

            # Assign drive image index for carousel posts so preview and export stay in sync
            drive_image_index_for_post = None
            if pipeline_content_type in ("carousel", "mixed") and client.get("drive_images_folder_id"):
                drive_image_index_for_post = client.get("drive_images_index", 0)
                await db.clients.update_one({"id": pipeline["client_id"]}, {"$inc": {"drive_images_index": 1}})
                client = await db.clients.find_one({"id": pipeline["client_id"]}, {"_id": 0}) or client

            post = {
                "id": str(uuid.uuid4()),
                "client_id": pipeline["client_id"],
                "client_name": client["name"],
                "platform": platform,
                "content_type": pipeline_content_type,
                "text": post_text,
                "image_url": None,
                "hashtags": (carousel_data.get("hashtags") if pipeline_content_type in ("carousel", "mixed") else None) or client.get("strategy", {}).get("hashtags", []),
                "status": "draft" if needs_approval else "scheduled",
                "approval_token": approval_token,
                "scheduled_at": scheduled_time.isoformat(),
                "published_at": None,
                "error_message": None,
                "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                "ai_generated": True,
                "trend_source": [t["hashtag"] for t in sorted(trends or [], key=lambda t: t.get("volume", 0), reverse=True)[:3] if t.get("hashtag")],
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline["name"],
                "pipeline_type": pipeline_type,
                "carousel_template": pipeline.get("carousel_template", "full_white"),
                "drive_image_index": drive_image_index_for_post,
                "engagement_score": 0,
                "created_at": now_iso(),
                **({"competitor_post_id": competitor_post.get("id"),
                    "competitor_hook_text": hook_inspiration[:200] if hook_inspiration else None,
                    "competitor_username": competitor_post.get("username") or competitor_post.get("account_username"),
                    } if pipeline_type == "competitor" and competitor_post else {}),
                **extra
            }
            await db.posts.insert_one({**post})
            posts_created.append(post)

            # Telegram approval notification
            if needs_approval and approval_token:
                bot_token = settings.get("telegram_bot_token", "")
                chat_id   = settings.get("telegram_chat_id", "")
                if bot_token and chat_id:
                    try:
                        from telegram_service import send_approval_request
                        base_url = os.environ.get("FRONTEND_URL", "")
                        await send_approval_request(
                            post_id=post["id"],
                            approval_token=approval_token,
                            client_name=client.get("name", "Unknown"),
                            platform=platform,
                            content_preview=post_text,
                            content_type=pipeline_content_type,
                            template=pipeline.get("carousel_template", ""),
                            slide_count=pipeline.get("carousel_slide_count", 5),
                            bot_token=bot_token,
                            chat_id=chat_id,
                            base_url=base_url,
                        )
                    except Exception as tg_err:
                        logger.error(f"Telegram approval notification failed: {tg_err}")
        except Exception as e:
            logger.error(f"Pipeline {pipeline_id} platform {platform}: {e}")

    # ── Post-run state updates ────────────────────────────────────────────────
    pipeline_updates: dict = {
        "last_run_at": now.isoformat(),
        "next_run_at": calculate_next_run(pipeline, scheduled_time),
        "total_runs": pipeline.get("total_runs", 0) + 1,
        "successful_runs": pipeline.get("successful_runs", 0) + (1 if posts_created else 0),
        "status": "active",
    }

    # Mark competitor post as recreated
    if pipeline_type == "competitor" and competitor_post and posts_created:
        await db.competitor_posts.update_one(
            {"id": competitor_post["id"]},
            {"$set": {"recreated": True, "recreated_post_id": posts_created[0]["id"]}}
        )

    # Advance strategy pillar index
    if pipeline_type == "strategy" and posts_created:
        pipeline_updates["strategy_pillar_index"] = pipeline.get("strategy_pillar_index", 0) + 1

    # Advance format rotation counter (only when format was auto-picked, not user-locked)
    if posts_created and not pipeline.get("carousel_slide_format"):
        pipeline_updates["format_rotation_index"] = pipeline.get("format_rotation_index", 0) + 1

    await db.pipelines.update_one({"id": pipeline_id}, {"$set": pipeline_updates})
    level = "success" if posts_created else "warning"
    await add_log(level, f"Pipeline '{pipeline['name']}' [{pipeline_type}]: {len(posts_created)} posts created for {', '.join(pipeline.get('platforms', []))}", pipeline["client_id"], client["name"])
    return len(posts_created)

async def run_pipelines():
    try:
        now = datetime.now(timezone.utc)
        # Start generation 5 minutes early so content is ready at the scheduled time
        early_window = (now + timedelta(minutes=5)).isoformat()
        cursor = db.pipelines.find({
            "status": "active",
            "$or": [
                {"next_run_at": {"$lte": early_window}},
                {"next_run_at": None},
                {"next_run_at": ""}
            ]
        }, {"_id": 0})
        # Collect first so we can stagger posts across clients by 3 min each,
        # preventing all clients from landing at the exact same scheduled_at time.
        due_pipelines = await cursor.to_list(length=None)
        total = 0
        for idx, pipeline in enumerate(due_pipelines):
            try:
                total += await execute_pipeline(pipeline, now, stagger_minutes=idx * 3, auto_publish=True)
            except Exception as e:
                logger.error(f"Pipeline error {pipeline.get('id')}: {e}")
                await db.pipelines.update_one(
                    {"id": pipeline["id"]},
                    {"$set": {"status": "error", "last_error": str(e), "next_run_at": calculate_next_run(pipeline, now)}}
                )
        if total:
            logger.info(f"Pipeline runner: {total} posts created")
            # Immediately publish newly created posts — don't wait for the next scheduler tick
            await process_scheduled_posts()
    except Exception as e:
        logger.error(f"run_pipelines error: {e}")

async def refresh_all_trends():
    """Scheduler job: refresh trend cache for all active clients every 6h."""
    from trend_service import fetch_trends_for_client
    try:
        clients = await db.clients.find({"status": "active"}, {"_id": 0}).to_list(1000)
        for client in clients:
            try:
                docs = await fetch_trends_for_client(client, db)
                logger.info(f"Trend refresh: {len(docs)} trends for client {client['id']}")
            except Exception as e:
                logger.error(f"Trend refresh failed for client {client.get('id')}: {e}")
                await add_log("warning", f"Trend refresh failed for {client.get('name', client.get('id'))}", client.get("id"), client.get("name"))
    except Exception as e:
        logger.error(f"refresh_all_trends error: {e}")
        await add_log("error", f"Trend refresh scheduler failed: {e}")

async def _generate_and_schedule_plan_for_client(client: dict):
    """Generate a content plan and immediately schedule all 7 posts for one client."""
    import anthropic, json as _json, re as _re
    from usage_service import record_usage
    from trend_service import get_cached_trends
    from datetime import date, timedelta

    client_id = client["id"]
    client_name = client.get("name", client_id)

    pipeline = await db.pipelines.find_one(
        {"client_id": client_id, "status": "active"},
        {"_id": 0}
    )
    if not pipeline:
        logger.info(f"auto_content_plan: no active pipeline for client {client_id}, skipping")
        return

    onboarding = client.get("onboarding_data", {})
    niche = onboarding.get("niche") or client.get("industry", "general")
    strategy = client.get("strategy", {})
    themes = strategy.get("content_themes") or strategy.get("themes", "")
    topics_include = strategy.get("topics_include", [])
    topics_exclude = strategy.get("topics_exclude", [])
    competitor_strategy = client.get("competitor_strategy", {})
    competitor_insight = competitor_strategy.get("insight_summary", "") if competitor_strategy else ""
    competitor_themes = competitor_strategy.get("themes", []) if competitor_strategy else []

    trends = await get_cached_trends(client_id, db, limit=10)
    trend_topics = [t.get("hashtag") or t.get("topic", "") for t in (trends or []) if t.get("hashtag") or t.get("topic")]

    start_date = date.today() + timedelta(days=1)
    days = [(start_date + timedelta(days=i)).strftime("%A %Y-%m-%d") for i in range(7)]
    days_block = "\n".join(f"- {d}" for d in days)

    system_msg = (
        "You are an expert social media content strategist. "
        "Generate a 7-day content plan as a JSON array. "
        "Return ONLY valid JSON — no markdown, no explanation. "
        "Each item must have exactly these keys: "
        "day (string), date (YYYY-MM-DD), topic (string), format (carousel|video|reel), "
        "caption (string, full Instagram-ready caption with line breaks — NO emojis), "
        "rationale (string, 1 sentence). "
        "Do not include emojis anywhere in the output."
    )
    user_msg = (
        f"Client niche: {niche}\n"
        f"Content themes: {themes}\n"
        f"Topics to include: {', '.join(topics_include) if topics_include else 'none specified'}\n"
        f"Topics to avoid: {', '.join(topics_exclude) if topics_exclude else 'none'}\n"
        f"Trending topics this week: {', '.join(trend_topics[:8]) if trend_topics else 'none'}\n"
        f"Competitor insight: {competitor_insight}\n"
        f"Competitor themes: {', '.join(competitor_themes) if competitor_themes else 'none'}\n\n"
        f"Plan for these 7 days:\n{days_block}\n\n"
        "Return the JSON array of 7 content plan items now."
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.error("auto_content_plan: ANTHROPIC_API_KEY not set")
        return

    ai_client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await ai_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=system_msg,
        messages=[{"role": "user", "content": user_msg}],
    )
    await record_usage(db, message, generation_type="content_plan_auto",
                       client_id=client_id, client_name=client_name)
    raw_text = message.content[0].text.strip()

    try:
        cleaned = raw_text
        if "```" in cleaned:
            for part in cleaned.split("```"):
                p = part.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("["):
                    cleaned = p
                    break
        plan = _json.loads(cleaned)
        if not isinstance(plan, list) or len(plan) == 0:
            raise ValueError("empty plan")
    except Exception:
        m = _re.search(r"\[.*\]", raw_text, _re.DOTALL)
        if not m:
            raise ValueError(f"unparseable plan for client {client_id}")
        plan = _json.loads(m.group())

    # Save plan to client doc
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"content_plan": plan, "content_plan_generated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Schedule all posts immediately
    platforms = pipeline.get("platforms", ["instagram"])
    require_approval = pipeline.get("require_approval", False)
    post_time_str = pipeline.get("post_time", "09:00") or "09:00"
    pipeline_id = pipeline.get("id")
    pipeline_name = pipeline.get("name", "Content Plan")
    carousel_template = pipeline.get("carousel_template") or "dark_card"
    carousel_slide_count = pipeline.get("carousel_slide_count") or 5

    try:
        ph, pm = map(int, post_time_str.split(":"))
    except Exception:
        ph, pm = 9, 0

    now_str = datetime.now(timezone.utc).isoformat()
    created = 0
    for item in plan:
        try:
            from datetime import datetime as dt
            post_date = dt.strptime(item["date"], "%Y-%m-%d").replace(
                hour=ph, minute=pm, second=0, tzinfo=timezone.utc
            )
        except Exception:
            post_date = datetime.now(timezone.utc) + timedelta(days=1)

        for platform in platforms:
            post_doc = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "client_name": client_name,
                "platform": platform,
                "content_type": "carousel",
                "text": item.get("caption", ""),
                "image_url": None,
                "hashtags": strategy.get("hashtags", []),
                "status": "draft" if require_approval else "scheduled",
                "approval_token": str(uuid.uuid4()) if require_approval else None,
                "scheduled_at": post_date.isoformat(),
                "published_at": None,
                "error_message": None,
                "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                "ai_generated": True,
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "pipeline_type": "standard",
                "carousel_template": carousel_template,
                "carousel_slide_count": carousel_slide_count,
                "carousel_topic": item.get("topic", ""),
                "engagement_score": 0,
                "created_at": now_str,
                "source": "content_plan_auto",
            }
            await db.posts.insert_one(post_doc)
            created += 1

    # Clear plan from client doc after scheduling
    await db.clients.update_one(
        {"id": client_id},
        {"$unset": {"content_plan": "", "content_plan_generated_at": ""}}
    )
    logger.info(f"auto_content_plan: scheduled {created} posts for client {client_id} ({client_name})")
    await add_log("info", f"Auto content plan: scheduled {created} posts", client_id, client_name)

async def auto_generate_all_content_plans():
    """Scheduler job: generate and schedule a weekly content plan for every active client."""
    try:
        clients = await db.clients.find({"status": "active"}, {"_id": 0}).to_list(1000)
        logger.info(f"auto_content_plan: starting for {len(clients)} active clients")
        for client in clients:
            try:
                await _generate_and_schedule_plan_for_client(client)
            except Exception as e:
                logger.error(f"auto_content_plan failed for client {client.get('id')}: {e}")
                await add_log("error", f"Auto content plan failed: {e}", client.get("id"), client.get("name"))
    except Exception as e:
        logger.error(f"auto_generate_all_content_plans error: {e}")

async def _run_competitor_scans():
    """Weekly job: scan all clients with active competitors."""
    from competitor_service import run_weekly_scan
    clients = await db.clients.find({}, {"id": 1, "_id": 0}).to_list(1000)
    for c in clients:
        client_id = c["id"]
        has_active = await db.competitors.find_one({"client_id": client_id, "is_active": True})
        if not has_active:
            continue
        try:
            result = await run_weekly_scan(client_id, db)
            await add_log("info", f"Weekly competitor scan: {result}", client_id=client_id)
        except Exception as e:
            logger.error(f"Weekly scan failed for client {client_id}: {e}")

# ─── Comment Polling (Leads) ─────────────────────────────────────────────────

async def poll_comments():
    """Poll Instagram comments on monitored posts and create leads for keyword matches."""
    try:
        cursor = db.clients.find({"instagram_connected": True}, {"_id": 0})
        async for client in cursor:
            try:
                config = await db.keyword_configs.find_one({"client_id": client["id"]}, {"_id": 0})
                if not config or not config.get("enabled", False):
                    continue
                keywords = [k.lower() for k in config.get("keywords", []) if k]
                if not keywords:
                    continue

                access_token = client.get("instagram_access_token", "")
                if not access_token:
                    continue

                # Determine which posts to monitor
                monitored_ids = config.get("monitored_post_ids", [])
                if monitored_ids:
                    posts = []
                    for pid in monitored_ids:
                        post = await db.posts.find_one({"id": pid}, {"_id": 0})
                        if post:
                            posts.append(post)
                else:
                    posts = await db.posts.find(
                        {"client_id": client["id"], "platform": "instagram", "status": "published", "platform_post_id": {"$exists": True, "$ne": None}},
                        {"_id": 0}
                    ).to_list(100)

                async with httpx.AsyncClient() as http:
                    for post in posts:
                        platform_post_id = post.get("platform_post_id")
                        if not platform_post_id:
                            continue
                        try:
                            resp = await http.get(
                                f"https://graph.instagram.com/v23.0/{platform_post_id}/comments",
                                params={"fields": "id,text,timestamp,username,from", "limit": 50, "access_token": access_token}
                            )
                            if resp.status_code != 200:
                                logger.warning(f"Failed to fetch comments for post {platform_post_id}: {resp.text}")
                                continue
                            comments = resp.json().get("data", [])
                            for comment in comments:
                                comment_id = comment.get("id")
                                comment_text = (comment.get("text") or "").lower()
                                matched_keyword = None
                                for kw in keywords:
                                    if kw in comment_text:
                                        matched_keyword = kw
                                        break
                                if not matched_keyword:
                                    continue

                                # Deduplicate
                                existing = await db.leads.find_one({"comment_id": comment_id})
                                if existing:
                                    continue

                                lead = {
                                    "id": str(uuid.uuid4()),
                                    "client_id": client["id"],
                                    "post_id": post.get("id"),
                                    "platform_post_id": platform_post_id,
                                    "comment_id": comment_id,
                                    "comment_text": comment.get("text", ""),
                                    "username": comment.get("username", ""),
                                    "user_id": comment.get("from", {}).get("id", "") if isinstance(comment.get("from"), dict) else "",
                                    "keyword_matched": matched_keyword,
                                    "status": "new",
                                    "dm_status": None,
                                    "comment_reply_id": None,
                                    "notes": "",
                                    "created_at": now_iso(),
                                    "updated_at": now_iso(),
                                }
                                await db.leads.insert_one({**lead})
                                await add_log("info", f"New lead from @{lead['username']} (keyword: {matched_keyword})", client["id"], client.get("name"))

                                # Auto-reply to comment if configured
                                auto_reply = config.get("auto_comment_reply", "")
                                if auto_reply:
                                    try:
                                        reply_resp = await http.post(
                                            f"https://graph.instagram.com/v23.0/{comment_id}/replies",
                                            data={"message": auto_reply, "access_token": access_token}
                                        )
                                        if reply_resp.status_code == 200:
                                            reply_data = reply_resp.json()
                                            await db.leads.update_one(
                                                {"id": lead["id"]},
                                                {"$set": {"comment_reply_id": reply_data.get("id"), "status": "replied", "updated_at": now_iso()}}
                                            )
                                    except Exception as reply_err:
                                        logger.error(f"Auto-reply failed for comment {comment_id}: {reply_err}")

                                # Auto-DM if configured
                                auto_dm = config.get("auto_dm_message", "")
                                auto_dm_file = config.get("auto_dm_file_url", "")
                                user_id = lead.get("user_id")
                                if (auto_dm or auto_dm_file) and user_id:
                                    try:
                                        dm_result = await send_instagram_dm(client, user_id, auto_dm or None, auto_dm_file or None)
                                        if dm_result.get("success"):
                                            await db.leads.update_one(
                                                {"id": lead["id"]},
                                                {"$set": {"dm_status": "sent", "status": "dm_sent", "updated_at": now_iso()}}
                                            )
                                    except Exception as dm_err:
                                        logger.error(f"Auto-DM failed for lead {lead['id']}: {dm_err}")

                        except Exception as post_err:
                            logger.error(f"Error polling comments for post {platform_post_id}: {post_err}")
            except Exception as client_err:
                logger.error(f"Error polling comments for client {client.get('id')}: {client_err}")
    except Exception as e:
        logger.error(f"poll_comments error: {e}")


async def send_instagram_dm(client, recipient_igsid, message=None, file_url=None):
    """Send a DM via Instagram Messaging API."""
    access_token = client.get("instagram_access_token", "")
    ig_user_id = client.get("instagram_user_id", "")
    if not access_token or not ig_user_id:
        return {"success": False, "message_id": None, "error": "Missing Instagram credentials"}

    results = []
    async with httpx.AsyncClient() as http:
        endpoint = f"https://graph.instagram.com/v23.0/{ig_user_id}/messages"
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

        # Send text message
        if message:
            payload = {"recipient": {"id": recipient_igsid}, "message": {"text": message}}
            try:
                resp = await http.post(endpoint, json=payload, headers=headers)
                data = resp.json()
                if resp.status_code == 200:
                    results.append({"success": True, "message_id": data.get("message_id"), "error": None})
                else:
                    results.append({"success": False, "message_id": None, "error": data.get("error", {}).get("message", str(data))})
            except Exception as e:
                results.append({"success": False, "message_id": None, "error": str(e)})

        # Send file attachment
        if file_url:
            ext = file_url.rsplit(".", 1)[-1].lower() if "." in file_url else ""
            if ext in ("pdf", "doc", "docx"):
                file_type = "file"
            elif ext in ("jpg", "jpeg", "png", "gif", "webp"):
                file_type = "image"
            elif ext in ("mp4", "mov"):
                file_type = "video"
            elif ext in ("mp3", "wav"):
                file_type = "audio"
            else:
                file_type = "file"
            payload = {"recipient": {"id": recipient_igsid}, "message": {"attachment": {"type": file_type, "payload": {"url": file_url}}}}
            try:
                resp = await http.post(endpoint, json=payload, headers=headers)
                data = resp.json()
                if resp.status_code == 200:
                    results.append({"success": True, "message_id": data.get("message_id"), "error": None})
                else:
                    results.append({"success": False, "message_id": None, "error": data.get("error", {}).get("message", str(data))})
            except Exception as e:
                results.append({"success": False, "message_id": None, "error": str(e)})

    if not results:
        return {"success": False, "message_id": None, "error": "No message or file provided"}
    # Return first failure if any, otherwise first success
    for r in results:
        if not r["success"]:
            return r
    return results[0]


# ─── Google Sheets Scheduler Jobs ────────────────────────────────────────────

async def sync_all_sheets():
    """Outbound: push all 4 tabs to every connected client's sheet. Staggered 10s apart."""
    clients = await db.clients.find(
        {"google_sheet.sheet_id": {"$exists": True}}
    ).to_list(None)
    for i, client in enumerate(clients):
        if i > 0:
            await asyncio.sleep(10)  # avoid quota spikes
        try:
            await _run_full_sync(str(client["_id"]))
        except Exception as e:
            logging.error(f"[sheets] outbound sync failed for {client.get('name')}: {e}")


async def pull_sheet_approvals():
    """Inbound: read the Posts Status column from every connected sheet and apply approved/rejected changes to DB."""
    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        return  # Google not connected yet — skip silently

    clients = await db.clients.find(
        {"google_sheet.sheet_id": {"$exists": True}}
    ).to_list(None)
    for client in clients:
        sheet_id = client["google_sheet"]["sheet_id"]
        client_id = client.get("id", str(client["_id"]))
        try:
            rows = await sheets_service.read_post_statuses(refresh_token, sheet_id)
            for row in rows:
                post_id = row.get("id", "").strip()
                new_status = row.get("status", "").strip().lower()
                if not post_id or new_status not in sheets_service.ALLOWED_INBOUND_STATUSES:
                    continue
                try:
                    post = await db.posts.find_one({"id": post_id, "client_id": client_id})
                    if post and post.get("status") != new_status:
                        await db.posts.update_one(
                            {"id": post_id},
                            {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
                        )
                except Exception:
                    pass
        except Exception as e:
            logging.error(f"[sheets] inbound pull failed for {client.get('name')}: {e}")


async def _iter_db_cursor(cursor):
    """Yield items from a Motor cursor, compatible with AsyncMock-based test stubs.

    In tests, cursor.__aiter__ is an AsyncMock that returns a sync iterator when
    awaited.  In production Motor returns an async iterator directly.
    """
    aiter_result = cursor.__aiter__()
    if asyncio.iscoroutine(aiter_result):
        # Test stub: await to get the underlying sync iterator, then yield each item.
        sync_iter = await aiter_result
        for item in sync_iter:
            yield item
    else:
        # Real Motor cursor: already an async iterator.
        async for item in aiter_result:
            yield item


async def purge_published_media():
    """Hourly job: delete R2 media for posts published >24h ago."""
    r2_base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if not r2_base:
        logger.warning("purge_published_media: R2_PUBLIC_URL not set — skipping")
        return

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = db.posts.find({
        "status": "published",
        "published_at": {"$lte": cutoff},
        "r2_media_purged": {"$ne": True},
    })

    purged = 0
    async for post in _iter_db_cursor(cursor):
        keys = []

        for url in [
            post.get("r2_video_url"),
            post.get("r2_snapshot_url"),
            post.get("image_url"),
        ]:
            key = _extract_r2_key(url, r2_base)
            if key:
                keys.append(key)

        for url in ((post.get("carousel_data") or {}).get("exported_images") or []):
            key = _extract_r2_key(url, r2_base)
            if key:
                keys.append(key)

        for key in keys:
            try:
                storage.delete_file(key)
            except Exception as e:
                logger.warning(f"purge_published_media: delete failed for {key!r}: {e}")

        try:
            await db.posts.update_one(
                {"id": post["id"]},
                {"$set": {"r2_media_purged": True, "r2_media_purged_at": now_iso()}},
            )
            purged += 1
        except Exception as e:
            logger.error(f"purge_published_media: stamp failed for post {post.get('id')}: {e}")

    if purged:
        logger.info(f"purge_published_media: stamped {purged} post(s)")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_sample_data()
    import storage as _storage
    _storage.ensure_bucket()
    _now = datetime.now(timezone.utc)
    scheduler.add_job(process_scheduled_posts, 'interval', minutes=1, id='process_posts',
                      start_date=_now + timedelta(seconds=0))
    scheduler.add_job(daily_content_reset, 'cron', hour=0, minute=0, id='daily_reset')
    scheduler.add_job(run_pipelines, 'interval', minutes=5, id='run_pipelines',
                      start_date=_now + timedelta(seconds=90))
    scheduler.add_job(poll_comments, 'interval', minutes=10, id='poll_comments',
                      start_date=_now + timedelta(seconds=180))
    scheduler.add_job(
        _run_competitor_scans,
        'cron',
        day=1,
        hour=0,
        minute=0,
        id='competitor_monthly_scan'
    )
    scheduler.add_job(refresh_all_trends, 'interval', weeks=1, id='trend_refresh',
                      start_date=_now + timedelta(seconds=270))
    scheduler.add_job(auto_generate_all_content_plans, 'cron',
                      day_of_week='mon', hour=6, minute=0, id='auto_content_plans')
    scheduler.add_job(sync_all_sheets, 'interval', minutes=15, id='sheets_outbound_sync',
                      start_date=_now + timedelta(seconds=330))
    scheduler.add_job(pull_sheet_approvals, 'interval', minutes=15, id='sheets_inbound_sync',
                      start_date=_now + timedelta(seconds=390))
    scheduler.add_job(purge_published_media, 'interval', hours=1, id='purge_media',
                      start_date=_now + timedelta(seconds=450))
    scheduler.add_job(fire_scheduled_emails, 'interval', seconds=60, id='fire_scheduled_emails')
    scheduler.add_job(refresh_all_analytics, 'cron', hour=2, minute=0, id='daily_analytics_sync')
    scheduler.start()
    # Verify competitor weekly scan job is registered and log next fire time
    _competitor_job = scheduler.get_job('competitor_weekly_scan')
    if _competitor_job:
        logger.info(
            f"Scheduler: 'competitor_weekly_scan' registered, next run at {_competitor_job.next_run_time}"
        )
    else:
        logger.error(
            "Scheduler: 'competitor_weekly_scan' job NOT found after scheduler.start() — "
            "competitor scans will not fire automatically"
        )
    # Leads indexes
    await db.leads.create_index("client_id")
    await db.leads.create_index("comment_id", unique=True, sparse=True)
    await db.keyword_configs.create_index("client_id", unique=True)
    await db.competitors.create_index("client_id")
    await db.competitor_posts.create_index("client_id")
    await db.competitor_posts.create_index("post_url", unique=True, sparse=True)
    await db.competitor_posts.create_index([("client_id", 1), ("engagement_score", -1)])
    await db.trends.create_index("client_id")
    await db.trends.create_index("expires_at")
    await db.trends.create_index([("client_id", 1), ("expires_at", 1)])
    await db.posts.create_index([("client_id", 1), ("is_winner", 1)])
    await db.posts.create_index("promoted_global")
    # Scheduler query indexes — prevent full collection scans every 5 min
    await db.posts.create_index("status")
    await db.posts.create_index([("status", 1), ("scheduled_at", 1)])
    await db.pipelines.create_index("status")
    await db.pipelines.create_index([("status", 1), ("next_run_at", 1)])
    await db.clients.create_index("status")
    await db.clients.create_index([("status", 1), ("instagram_connected", 1)])
    await db.token_usage.create_index([("client_id", 1), ("created_at", -1)])
    await db.token_usage.create_index([("created_at", -1)])
    await db.apify_usage.create_index([("client_id", 1), ("created_at", -1)])
    await db.apify_usage.create_index([("created_at", -1)])
    # Analytics & logs query indexes
    await db.logs.create_index([("created_at", -1)])
    await db.logs.create_index([("client_id", 1), ("created_at", -1)])
    await db.posts.create_index([("published_at", -1)])
    await db.posts.create_index([("client_id", 1), ("status", 1)])
    await db.posts.create_index([("status", 1), ("published_at", -1)])
    await db.posts.create_index([("status", 1), ("client_id", 1)])
    # Clean up any ig-temp dirs left over from a crash during a previous fallback publish
    _ig_temp = Path(__file__).parent / "static" / "ig-temp"
    if _ig_temp.exists():
        import shutil as _shutil
        _cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        for _d in _ig_temp.iterdir():
            if _d.is_dir():
                _mtime = datetime.fromtimestamp(_d.stat().st_mtime, tz=timezone.utc)
                if _mtime < _cutoff:
                    _shutil.rmtree(_d, ignore_errors=True)
                    logger.info(f"Startup cleanup: removed stale ig-temp dir {_d.name}")
    # Restore recurring video schedules from DB
    async for client in db.clients.find({"video_recurring_schedule": {"$ne": None}}):
        schedule = client.get("video_recurring_schedule", {})
        if not schedule or not schedule.get("enabled"):
            continue
        cron = schedule.get("cron", "")
        if not cron:
            continue
        try:
            from apscheduler.triggers.cron import CronTrigger
            parts = cron.split()
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1],
                day=parts[2], month=parts[3], day_of_week=parts[4]
            )
            job_id = f"video_recurring_{client['id']}"
            scheduler.add_job(
                _run_video_recurring, trigger=trigger,
                id=job_id, args=[client["id"]], replace_existing=True
            )
        except Exception as e:
            logger.warning(f"Failed to restore video schedule for {client['id']}: {e}")
    await add_log("info", "Automation engine started")
    yield
    scheduler.shutdown()
    db_client.close()
    try:
        from carousel_renderer import close_browser_pool
        await close_browser_pool()
    except Exception:
        pass

app = FastAPI(lifespan=lifespan, redirect_slashes=False)
class MailSendRequest(BaseModel):
    type: str
    client_id: str
    to: Union[str, List[str]]
    cc: Optional[List[str]] = None
    reply_to: Optional[str] = None
    subject: str
    html: str

class MailScheduleRequest(BaseModel):
    type: str
    client_id: str
    to: Union[str, List[str]]
    cc: Optional[List[str]] = None
    reply_to: Optional[str] = None
    subject: str
    html: str
    scheduled_at: str  # ISO datetime string

class OnboardingCompleteRequest(BaseModel):
    to: Union[str, List[str]]
    subject: str
    html: str
    cc: Optional[List[str]] = None
    reply_to: Optional[str] = None

class BulkReportRequest(BaseModel):
    period: str

api_router = APIRouter(prefix="/api")

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Client Routes ────────────────────────────────────────────────────────────

@api_router.get("/clients")
async def list_clients():
    clients, scheduled_raw, failed_raw, pipeline_raw = await asyncio.gather(
        db.clients.find({}, {"_id": 0}).to_list(1000),
        db.posts.aggregate([
            {"$match": {"status": "scheduled"}},
            {"$group": {"_id": "$client_id", "count": {"$sum": 1}}},
        ]).to_list(None),
        db.posts.aggregate([
            {"$match": {"status": "failed", "error_message": {"$nin": [None, ""]}}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$client_id", "error": {"$first": "$error_message"}}},
        ]).to_list(None),
        db.pipelines.aggregate([
            {"$group": {"_id": "$client_id", "count": {"$sum": 1}}},
        ]).to_list(None),
    )
    scheduled_map = {r["_id"]: r["count"] for r in scheduled_raw}
    failed_map = {r["_id"]: r["error"] for r in failed_raw}
    pipeline_map = {r["_id"]: r["count"] for r in pipeline_raw}
    for c in clients:
        c["scheduled_count"] = scheduled_map.get(c["id"], 0)
        c["last_post_error"] = failed_map.get(c["id"])
        c["pipeline_count"] = pipeline_map.get(c["id"], 0)
    return clients

@api_router.post("/clients", status_code=201)
async def create_client(data: ClientCreate):
    client = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "industry": data.industry,
        "brand_voice": data.brand_voice,
        "target_audience": data.target_audience,
        "platforms": data.platforms,
        "avatar": data.avatar or data.name[:2].upper(),
        "status": "active",
        "strategy": data.strategy or {"themes": [], "tone": data.brand_voice, "hashtags": []},
        "platform_configs": {p: {"enabled": True, "posts_per_day": 2, "posting_times": ["09:00", "17:00"]} for p in data.platforms},
        "posts_today": 0,
        "posts_total": 0,
        "posts_failed": 0,
        "last_post_at": None,
        "created_at": now_iso()
    }
    await db.clients.insert_one({**client})
    await add_log("info", f"Client '{data.name}' added to automation engine")
    return client

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    return client

_ONBOARDING_KEYS = frozenset({
    # Existing fields
    "username", "whatsapp", "email", "website_url", "pr_links",
    "instagram_handle", "instagram_access_link", "instagram_password", "niche", "problem_solved",
    "brand_vibe", "account_goals", "cta_link", "language", "branding_assets_link",
    "google_drive_images", "google_drive_videos", "lead_magnets",
    "automation_keywords", "competitor_accounts", "lead_sheet_link", "bio_template",
    "voice_notes_link", "not_to_do_list", "preferred_carousel_template",
    "preferred_video_template",
    # New fields (schema v2)
    "brand_name", "city_country", "instagram_profile_url", "linkedin_url",
    "youtube_url", "twitter_url", "profile_photo_link", "logo_link",
    "account_suspended", "paid_ads_run", "personal_story", "business_description",
    "industry_label", "daily_life", "target_audience_description", "audience_age_range",
    "audience_emotional_state", "solutions_provided", "audience_problems",
    "audience_desires", "audience_myths", "audience_failed_attempts",
    "unique_selling_points", "frequent_questions", "love_topics",
    "has_case_studies", "case_study_1", "case_study_2", "signature_topic",
    "niche_working_topics", "niche_oversaturated_topics", "niche_underserved_topics",
    "disliked_content", "next_step_after_view", "lead_magnet_link",
    "pr_media_links", "high_quality_photos_link", "video_clips_link",
})

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientUpdate):
    raw = data.model_dump()
    set_doc = {}

    for k, v in raw.items():
        if v is None:
            continue
        if k == "strategy" and isinstance(v, dict):
            # dot-path so we don't trample sibling strategy.* keys
            for sk, sv in v.items():
                set_doc[f"strategy.{sk}"] = sv
        elif k in _ONBOARDING_KEYS:
            set_doc[f"onboarding_data.{k}"] = v
        else:
            set_doc[k] = v

    # Derive avatar from name (root field, not an onboarding mirror)
    if raw.get("name") is not None and "avatar" not in set_doc:
        set_doc["avatar"] = raw["name"][:2].upper()

    # Recompute all derived mirrors from whatever onboarding fields are in this update
    in_memory_ob = {
        k.removeprefix("onboarding_data."): v
        for k, v in set_doc.items()
        if k.startswith("onboarding_data.")
    }
    if in_memory_ob:
        set_doc.update(_recompute_derived({"onboarding_data": in_memory_ob}))

    if not set_doc:
        raise HTTPException(400, "No fields to update")

    await db.clients.update_one({"id": client_id}, {"$set": set_doc})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    asyncio.create_task(_trigger_sheet_sync(client_id, ["Client Info"]))
    return client

@api_router.post("/clients/{client_id}/recompute-derived")
async def recompute_derived_endpoint(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    updates = _recompute_derived(client)
    if updates:
        await db.clients.update_one({"id": client_id}, {"$set": updates})
    return {"updated_keys": list(updates.keys())}

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    await db.posts.delete_many({"client_id": client_id})
    return {"message": "Client deleted"}

# ─── Competitor Routes ────────────────────────────────────────────────────────

@api_router.get("/clients/{client_id}/competitors")
async def list_competitors(client_id: str):
    docs = await db.competitors.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    return docs

@api_router.post("/clients/{client_id}/competitors", status_code=201)
async def add_competitor(client_id: str, data: CompetitorCreate):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "handle": data.handle if data.handle.startswith("@") else f"@{data.handle}",
        "platform": data.platform,
        "added_by": "admin",
        "last_scraped_at": None,
        "is_active": True,
        "created_at": now_iso(),
    }
    await db.competitors.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/clients/{client_id}/competitors/scan")
async def scan_competitors(client_id: str, background_tasks: BackgroundTasks):
    from competitor_service import run_weekly_scan
    async def _run():
        result = await run_weekly_scan(client_id, db)
        await add_log("info", f"Manual competitor scan: {result}", client_id=client_id)
    background_tasks.add_task(_run)
    return {"status": "scan started"}

@api_router.delete("/clients/{client_id}/competitors/{comp_id}", status_code=204)
async def delete_competitor(client_id: str, comp_id: str):
    result = await db.competitors.delete_one({"id": comp_id, "client_id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Competitor not found")

@api_router.patch("/clients/{client_id}/competitors/{comp_id}")
async def toggle_competitor(client_id: str, comp_id: str, data: CompetitorToggle):
    result = await db.competitors.update_one(
        {"id": comp_id, "client_id": client_id},
        {"$set": {"is_active": data.is_active}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Competitor not found")
    return {"ok": True}

@api_router.get("/clients/{client_id}/competitor-posts")
async def list_competitor_posts(
    client_id: str,
    competitor_id: str = None,
    platform: str = None,
    post_type: str = None,
    skip: int = 0,
    limit: int = 50,
):
    query = {"client_id": client_id}
    if competitor_id:
        query["competitor_id"] = competitor_id
    if platform:
        query["platform"] = platform
    if post_type:
        query["post_type"] = post_type
    docs = await db.competitor_posts.find(query, {"_id": 0}).sort(
        "engagement_score", -1
    ).skip(skip).limit(limit).to_list(limit)
    return docs

@api_router.post("/competitor-posts/{post_id}/recreate")
async def recreate_competitor_post(post_id: str):
    from competitor_service import recreate_post
    comp_post = await db.competitor_posts.find_one({"id": post_id}, {"_id": 0})
    if not comp_post:
        raise HTTPException(404, "Competitor post not found")
    client = await db.clients.find_one({"id": comp_post["client_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    new_post_id = await recreate_post(comp_post, client, db)
    if not new_post_id:
        raise HTTPException(500, "AI recreation failed")
    return {"post_id": new_post_id}

@api_router.post("/clients/{client_id}/competitor-strategy/refresh")
async def refresh_competitor_strategy(client_id: str):
    from competitor_service import generate_competitor_strategy
    try:
        strategy = await generate_competitor_strategy(client_id, db)
        if strategy is None:
            raise HTTPException(400, "Not enough competitor data")
        return {"strategy": strategy}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"refresh_competitor_strategy error for client {client_id}: {e}")
        raise HTTPException(500, "Unexpected error generating competitor strategy")

@api_router.post("/admin/content-plan/generate-all")
async def trigger_auto_content_plans():
    """Manually trigger the weekly auto content plan job for all active clients."""
    import asyncio
    asyncio.create_task(auto_generate_all_content_plans())
    return {"status": "started", "message": "Auto content plan generation started for all active clients"}

@api_router.post("/clients/{client_id}/content-plan/generate")
async def generate_content_plan(client_id: str):
    import anthropic, json as _json, re as _re
    from usage_service import record_usage
    from trend_service import get_cached_trends

    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    onboarding = client.get("onboarding_data", {})
    niche = onboarding.get("niche") or client.get("industry", "general")
    strategy = client.get("strategy", {})
    themes = strategy.get("content_themes") or strategy.get("themes", "")
    topics_include = strategy.get("topics_include", [])
    topics_exclude = strategy.get("topics_exclude", [])
    competitor_strategy = client.get("competitor_strategy", {})
    competitor_insight = competitor_strategy.get("insight_summary", "") if competitor_strategy else ""
    competitor_themes = competitor_strategy.get("themes", []) if competitor_strategy else []

    trends = await get_cached_trends(client_id, db, limit=10)
    trend_topics = [t.get("hashtag") or t.get("topic", "") for t in (trends or []) if t.get("hashtag") or t.get("topic")]

    pipeline = await db.pipelines.find_one(
        {"client_id": client_id, "status": "active", "pipeline_type": {"$in": ["standard", "trend"]}},
        {"_id": 0}
    )
    default_template = (pipeline or {}).get("carousel_template", "dark_card")

    from datetime import date, timedelta
    start_date = date.today() + timedelta(days=1)
    days = [(start_date + timedelta(days=i)).strftime("%A %Y-%m-%d") for i in range(7)]
    days_block = "\n".join(f"- {d}" for d in days)

    system_msg = (
        "You are an expert social media content strategist. "
        "Generate a 7-day content plan as a JSON array. "
        "Return ONLY valid JSON — no markdown, no explanation. "
        "Each item must have exactly these keys: "
        "day (string), date (YYYY-MM-DD), topic (string), format (carousel|video|reel), "
        "caption (string, full Instagram-ready caption with line breaks — NO emojis), "
        "rationale (string, 1 sentence). "
        "Do not include emojis anywhere in the output."
    )
    user_msg = (
        f"Client niche: {niche}\n"
        f"Content themes: {themes}\n"
        f"Topics to include: {', '.join(topics_include) if topics_include else 'none specified'}\n"
        f"Topics to avoid: {', '.join(topics_exclude) if topics_exclude else 'none'}\n"
        f"Trending topics this week: {', '.join(trend_topics[:8]) if trend_topics else 'none'}\n"
        f"Competitor insight: {competitor_insight}\n"
        f"Competitor themes: {', '.join(competitor_themes) if competitor_themes else 'none'}\n"
        f"Default template: {default_template}\n\n"
        f"Plan for these 7 days:\n{days_block}\n\n"
        "Return the JSON array of 7 content plan items now."
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")

    try:
        ai_client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await ai_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=3000,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )
        await record_usage(db, message, generation_type="content_plan",
                           client_id=client_id, client_name=client.get("name"))
        raw_text = message.content[0].text.strip()
    except Exception as e:
        logger.error(f"generate_content_plan: Claude API error: {e}")
        raise HTTPException(500, f"AI generation failed: {e}")

    try:
        cleaned = raw_text
        if "```" in cleaned:
            for part in cleaned.split("```"):
                p = part.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("["):
                    cleaned = p
                    break
        plan = _json.loads(cleaned)
        if not isinstance(plan, list) or len(plan) == 0:
            raise ValueError("Expected a non-empty JSON array")
    except Exception:
        m = _re.search(r"\[.*\]", raw_text, _re.DOTALL)
        if not m:
            raise HTTPException(500, "AI returned non-parseable content plan")
        plan = _json.loads(m.group())

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"content_plan": plan, "content_plan_generated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"plan": plan}

@api_router.get("/clients/{client_id}/content-plan")
async def get_content_plan(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "content_plan": 1})
    if not client:
        raise HTTPException(404, "Client not found")
    return {"plan": client.get("content_plan") or []}

@api_router.post("/clients/{client_id}/content-plan/schedule")
async def schedule_content_plan(client_id: str, req: ContentPlanScheduleRequest):
    from datetime import datetime as dt, timezone, timedelta

    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    pipeline = None
    if req.pipeline_id:
        pipeline = await db.pipelines.find_one({"id": req.pipeline_id, "client_id": client_id}, {"_id": 0})
    if not pipeline:
        pipeline = await db.pipelines.find_one(
            {"client_id": client_id, "status": "active"},
            {"_id": 0}
        )

    platforms = (pipeline or {}).get("platforms", ["instagram"])
    require_approval = (pipeline or {}).get("require_approval", False)
    post_time_str = (pipeline or {}).get("post_time", "09:00") or "09:00"
    pipeline_id = (pipeline or {}).get("id")
    pipeline_name = (pipeline or {}).get("name", "Content Plan")

    try:
        ph, pm = map(int, post_time_str.split(":"))
    except Exception:
        ph, pm = 9, 0

    created_posts = []
    now_str = datetime.now(timezone.utc).isoformat()

    for item in req.posts:
        try:
            post_date = dt.strptime(item.date, "%Y-%m-%d").replace(
                hour=ph, minute=pm, second=0, tzinfo=timezone.utc
            )
        except Exception:
            post_date = datetime.now(timezone.utc) + timedelta(days=1)

        for platform in platforms:
            post_doc = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "client_name": client.get("name", ""),
                "platform": platform,
                "content_type": "carousel",
                "text": item.caption,
                "image_url": None,
                "hashtags": client.get("strategy", {}).get("hashtags", []),
                "status": "draft" if require_approval else "scheduled",
                "approval_token": str(uuid.uuid4()) if require_approval else None,
                "scheduled_at": post_date.isoformat(),
                "published_at": None,
                "error_message": None,
                "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                "ai_generated": True,
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "pipeline_type": "standard",
                "carousel_template": (pipeline or {}).get("carousel_template") or "dark_card",
                "carousel_slide_count": (pipeline or {}).get("carousel_slide_count") or 5,
                "carousel_topic": item.topic,
                "engagement_score": 0,
                "created_at": now_str,
                "source": "content_plan",
            }
            await db.posts.insert_one(post_doc)
            post_doc.pop("_id", None)
            created_posts.append(post_doc)

    await db.clients.update_one(
        {"id": client_id},
        {"$unset": {"content_plan": "", "content_plan_generated_at": ""}}
    )
    return {"scheduled": len(created_posts), "posts": [p["id"] for p in created_posts]}

@api_router.get("/clients/{client_id}/trends")
async def list_client_trends(client_id: str, limit: int = 20):
    """Return latest cached trends for a client."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from trend_service import get_cached_trends
    trends = await get_cached_trends(client_id, db, limit=limit)
    return trends

@api_router.post("/clients/{client_id}/trends/refresh")
async def refresh_client_trends(client_id: str):
    """Force a live trend fetch for a client, bypassing the cache."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from trend_service import fetch_trends_for_client
    docs = await fetch_trends_for_client(client, db)
    return {"fetched": len(docs), "trends": docs}

@api_router.get("/clients/{client_id}/trend-keywords")
async def get_trend_keywords(client_id: str):
    """Return auto-derived keywords + custom keywords for a client."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from trend_service import _get_keywords_for_client
    auto_keywords = _get_keywords_for_client(client)
    custom = client.get("custom_trend_keywords") or []
    return {
        "auto_keywords": auto_keywords,
        "custom_keywords": custom,
    }

@api_router.patch("/clients/{client_id}/trend-keywords")
async def update_trend_keywords(client_id: str, body: ClientKeywordsUpdate):
    """Overwrite the client's custom trend keywords list."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    # Normalise: strip, lowercase, deduplicate, cap at 20
    cleaned = []
    seen: set = set()
    for kw in body.custom_trend_keywords:
        kw_clean = str(kw).strip().lower()
        if kw_clean and kw_clean not in seen:
            seen.add(kw_clean)
            cleaned.append(kw_clean)
        if len(cleaned) >= 20:
            break
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"custom_trend_keywords": cleaned}}
    )
    return {"custom_keywords": cleaned}

# ── Dropbox / Winning Content ────────────────────────────────────────────────

@api_router.post("/posts/{post_id}/winner")
async def toggle_winner(post_id: str):
    """Toggle is_winner on a post (manual curation)."""
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    now = datetime.now(timezone.utc).isoformat()
    if post.get("is_winner"):
        # un-star
        await db.posts.update_one({"id": post_id}, {"$set": {
            "is_winner": False, "promoted_global": False,
            "winner_source": None, "winner_added_at": None
        }})
    else:
        perf = post.get("performance") or {}
        score = _compute_engagement_score(perf)
        await db.posts.update_one({"id": post_id}, {"$set": {
            "is_winner": True,
            "winner_source": "manual",
            "winner_added_at": now,
            "engagement_score": score,
        }})
    return await db.posts.find_one({"id": post_id}, {"_id": 0})


@api_router.get("/clients/{client_id}/dropbox")
async def get_client_dropbox(client_id: str):
    """Return all winner posts for a client, sorted by engagement_score desc."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    posts = await db.posts.find(
        {"client_id": client_id, "is_winner": True},
        {"_id": 0}
    ).sort("engagement_score", -1).to_list(100)
    return posts


@api_router.get("/dropbox/global")
async def get_global_dropbox(
    platform: Optional[str] = None,
    content_type: Optional[str] = None
):
    """Return all globally promoted posts across all clients."""
    query: dict = {"promoted_global": True}
    if platform:
        query["platform"] = platform
    if content_type:
        query["content_type"] = content_type
    posts = await db.posts.find(query, {"_id": 0}).sort("engagement_score", -1).to_list(200)
    return posts


@api_router.patch("/posts/{post_id}/promote-global")
async def promote_global(post_id: str, body: PromoteGlobalRequest):
    """Set or clear promoted_global on a winner post."""
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    if not post.get("is_winner"):
        raise HTTPException(400, "Post must be a winner before promoting globally")
    promoted = body.promoted
    await db.posts.update_one({"id": post_id}, {"$set": {"promoted_global": promoted}})
    return await db.posts.find_one({"id": post_id}, {"_id": 0})

@api_router.post("/clients/{client_id}/pause")
async def pause_client(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$set": {"status": "paused"}})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    await add_log("warning", f"Automation paused for {client.get('name', client_id)}", client_id, client.get('name'))
    return {"status": "paused"}

@api_router.post("/clients/{client_id}/upload-photo")
async def upload_client_photo(client_id: str, file: UploadFile = File(...)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only JPEG, PNG, WebP or GIF images are allowed")

    # Read file (limit to 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{client_id}.{ext}"

    import storage as _storage
    if _storage.is_enabled():
        # Upload to MinIO
        key = f"uploads/profiles/{filename}"
        photo_url = _storage.upload_bytes(contents, key, content_type=file.content_type)
        if not photo_url:
            raise HTTPException(500, "Failed to upload photo to storage")
    else:
        # Fall back to local static directory
        upload_dir = Path(__file__).parent / "static" / "uploads" / "profiles"
        upload_dir.mkdir(parents=True, exist_ok=True)
        out_path = upload_dir / filename
        out_path.write_bytes(contents)
        frontend_url = os.environ.get("FRONTEND_URL", "")
        photo_url = f"{frontend_url}/api/static/uploads/profiles/{filename}"

    await db.clients.update_one({"id": client_id}, {"$set": {"profile_photo_url": photo_url}})
    return {"profile_photo_url": photo_url}


@api_router.post("/upload")
async def upload_asset(file: UploadFile = File(...)):
    """Generic image upload for template assets (backgrounds, image elements)."""
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only JPEG, PNG, WebP or GIF images are allowed")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}_{file.filename}"

    import storage as _storage
    if _storage.is_enabled():
        key = f"uploads/assets/{filename}"
        url = _storage.upload_bytes(contents, key, content_type=file.content_type)
        if not url:
            raise HTTPException(500, "Failed to upload to storage")
    else:
        upload_dir = Path(__file__).parent / "static" / "uploads" / "assets"
        upload_dir.mkdir(parents=True, exist_ok=True)
        out_path = upload_dir / filename
        out_path.write_bytes(contents)
        frontend_url = os.environ.get("FRONTEND_URL", "")
        url = f"{frontend_url}/api/static/uploads/assets/{filename}"

    return {"url": url}


async def _notify_affiliate_sc_status(affiliate_client_id: str, sc_client_id: str, status: str, reason: str = None):
    url = os.getenv("AFFILIATE_SC_WEBHOOK_URL", "")
    secret = os.getenv("INTER_APP_SECRET", "")
    if not url or not secret:
        return
    payload = {"affiliate_client_id": affiliate_client_id, "sc_client_id": sc_client_id, "status": status}
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


@api_router.post("/clients/{client_id}/resume")
async def resume_client(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$set": {"status": "active"}})
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    await add_log("success", f"Automation resumed for {client.get('name', client_id)}", client_id, client.get('name'))
    affiliate_client_id = client.get("affiliate_client_id")
    if affiliate_client_id:
        asyncio.create_task(_notify_affiliate_sc_status(affiliate_client_id, client_id, "approved"))
    return {"status": "active"}

@api_router.post("/clients/onboard", status_code=201)
async def onboard_client(data: OnboardingCreate):
    # Normalize next_step_after_view to short-key format
    raw_ns = (data.next_step_after_view or "").strip().lower()
    data.next_step_after_view = _NEXT_STEP_NORMALIZE.get(raw_ns, data.next_step_after_view)

    # All onboarding concepts in one place — the SSOT
    onboarding_data = data.model_dump(exclude={"name", "platforms"})

    client = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "industry": "",         # populated by _recompute_derived below
        "brand_voice": "",      # populated by _recompute_derived below
        "target_audience": "",  # populated by _recompute_derived below
        "platforms": data.platforms,
        "avatar": data.name[:2].upper(),
        "status": "active",
        "strategy": {
            "themes": [],
            "hashtags": [],
            # tone/topics_exclude populated by _recompute_derived below
            # goals/cta_link/language intentionally NOT written (orphans per §2.2)
        },
        "platform_configs": {p: {"enabled": True, "posts_per_day": 2, "posting_times": ["09:00", "17:00"]} for p in data.platforms},
        "onboarding_data": onboarding_data,
        "onboarding_complete": True,
        "posts_today": 0,
        "posts_total": 0,
        "posts_failed": 0,
        "last_post_at": None,
        "created_at": now_iso()
    }

    # Promote drive links from onboarding_data to root fields used by the overview cards
    if data.google_drive_images:
        client["drive_images_folder_id"] = data.google_drive_images
    if data.google_drive_videos:
        client["drive_folder_id"] = data.google_drive_videos

    # Recompute all derived mirrors and expand dot-path keys into nested doc
    _expand_derived_into_doc(client, _recompute_derived(client))

    await db.clients.insert_one({**client})
    await add_log("success", f"Client '{data.name}' onboarded via wizard", None, data.name)

    # Auto-add competitor_accounts from onboarding into the competitors collection
    if data.competitor_accounts:
        comp_docs = [
            {
                "id": str(uuid.uuid4()),
                "client_id": client["id"],
                "handle": h.strip() if h.strip().startswith("@") else f"@{h.strip()}",
                "platform": "instagram",
                "added_by": "onboarding",
                "last_scraped_at": None,
                "is_active": True,
                "created_at": now_iso(),
            }
            for h in data.competitor_accounts if h and h.strip()
        ]
        if comp_docs:
            await db.competitors.insert_many(comp_docs)

    # Auto-create default pipeline using the template configured in settings
    try:
        app_settings = await db.settings.find_one({"key": "global"}, {"_id": 0}) or {}
        default_template = app_settings.get("default_carousel_template") or None
        delay_hours = int(app_settings.get("onboard_pipeline_delay_hours") or 0)
        posting_time = app_settings.get("onboard_pipeline_posting_time") or "09:00"
        slide_count = app_settings.get("onboard_pipeline_slide_count") or None
        require_approval = bool(app_settings.get("require_approval", False))
        created = await create_pipeline(client["id"], PipelineCreate(
            name="Daily Content",
            pipeline_type="standard",
            content_type="carousel",
            carousel_template=default_template,
            carousel_slide_count=slide_count,
            max_posts_per_day=1,
            platforms=client["platforms"],
            schedule_type="specific_times",
            specific_times=[posting_time],
            require_approval=require_approval,
        ))
        if delay_hours > 0:
            start_after = datetime.now(timezone.utc) + timedelta(hours=delay_hours)
            delayed_next_run = calculate_next_run(
                {"schedule_type": "specific_times", "specific_times": [posting_time]},
                start_after,
            )
            await db.pipelines.update_one(
                {"id": created["id"]},
                {"$set": {"next_run_at": delayed_next_run}},
            )
    except Exception as e:
        logger.warning(f"Auto-pipeline creation failed for {client['id']}: {e}")

    # Schedule onboarding welcome email 30 minutes after signup
    if data.email:
        send_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        ig = f"@{data.instagram_handle}" if data.instagram_handle else ""
        niche_line = f"<p style='color:#555;margin-bottom:8px'>Niche: {data.niche}</p>" if data.niche else ""
        ig_line = f"<p style='color:#555;margin-bottom:8px'>Instagram: {ig}</p>" if ig else ""
        onboarding_html = f"""<html><body style="font-family:sans-serif;color:#111;max-width:600px;margin:auto;padding:32px">
<h1 style="font-size:22px;margin-bottom:4px">Welcome to Sleeping Creators, {data.name}!</h1>
<p style="color:#888;font-size:13px;margin-bottom:24px">Your account is set up and automation is ready to go.</p>
{ig_line}{niche_line}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<h2 style="font-size:16px;margin-bottom:12px">What happens next</h2>
<ul style="color:#555;line-height:1.8;padding-left:20px;margin:0">
  <li>Your daily content pipeline has been created automatically</li>
  <li>Posts will start scheduling based on your configured posting times</li>
  <li>You can review and approve content before it goes live</li>
</ul>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="color:#888;font-size:12px">Sleeping Creators — automated content engine</p>
</body></html>"""
        try:
            await db.scheduled_emails.insert_one({
                "type": "onboarding",
                "client_id": client["id"],
                "to": data.email,
                "cc": [],
                "subject": f"Welcome to Sleeping Creators, {data.name}!",
                "html": onboarding_html,
                "scheduled_at": send_at,
                "status": "pending",
                "created_by": "system",
                "created_at": now_iso(),
                "sent_at": None, "resend_id": None, "delivery_status": None, "error": None,
            })
        except Exception as e:
            logger.warning(f"Failed to schedule onboarding email for {client['id']}: {e}")

    asyncio.create_task(_trigger_sheet_sync(client["id"], None))
    return client

# ─── Post Routes ──────────────────────────────────────────────────────────────

@api_router.get("/calendar")
async def calendar_posts(start: str, end: str, client_id: Optional[str] = None, platform: Optional[str] = None):
    """Return posts within a date range for the calendar view."""
    query = {
        "$or": [
            {"scheduled_at": {"$gte": start, "$lte": end}},
            {"scheduled_at": None, "created_at": {"$gte": start, "$lte": end}},
        ]
    }
    if client_id:
        query["client_id"] = client_id
    if platform:
        query["platform"] = platform
    posts = await db.posts.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    return {"posts": posts}

@api_router.get("/posts")
async def list_posts(status: Optional[str] = None, client_id: Optional[str] = None, platform: Optional[str] = None, limit: int = 100, kind: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if platform:
        query["platform"] = platform
    if kind:
        query["kind"] = kind
    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return posts

@api_router.post("/posts", status_code=201)
async def create_post(data: PostCreate):
    client = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    post = {
        "id": str(uuid.uuid4()),
        "client_id": data.client_id,
        "client_name": client["name"],
        "platform": data.platform,
        "content_type": data.content_type,
        "text": data.text,
        "image_url": data.image_url,
        "hashtags": data.hashtags,
        "status": "scheduled" if data.scheduled_at else "draft",
        "scheduled_at": data.scheduled_at or now_iso(),
        "published_at": None,
        "error_message": None,
        "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
        "ai_generated": False,
        "created_at": now_iso()
    }
    await db.posts.insert_one({**post})
    return post

@api_router.get("/posts/{post_id}")
async def get_post(post_id: str):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    return post


class PostScheduleRequest(BaseModel):
    scheduled_at: Optional[str] = None  # ISO string; omit = post in 2 minutes

@api_router.post("/posts/{post_id}/schedule")
async def schedule_post_route(post_id: str, req: PostScheduleRequest):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    if not post.get("r2_video_url"):
        raise HTTPException(400, "Render not complete — r2_video_url missing")
    scheduled_at = req.scheduled_at or (
        datetime.now(timezone.utc) + timedelta(minutes=2)
    ).isoformat()
    await db.posts.update_one({"id": post_id}, {"$set": {"scheduled_at": scheduled_at}})
    post["scheduled_at"] = scheduled_at
    from video_render_service import handoff_to_bundle
    await handoff_to_bundle(db, post, post["r2_video_url"], post.get("r2_snapshot_url"))
    updated = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return updated


@api_router.put("/posts/{post_id}")
async def update_post(post_id: str, data: PostUpdate):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "No fields to update")
    # When scheduled_at is updated without an explicit status, auto-promote
    # draft/failed posts to "scheduled" so the scheduler will pick them up.
    if "scheduled_at" in update and "status" not in update:
        current = await db.posts.find_one({"id": post_id}, {"_id": 0, "status": 1})
        if current and current.get("status") in ("draft", "failed"):
            update["status"] = "scheduled"
    await db.posts.update_one({"id": post_id}, {"$set": update})
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return post

@api_router.post("/posts/{post_id}/mark-published")
async def mark_post_published(post_id: str):
    """Manually mark a failed/scheduled post as published so the scheduler ignores it."""
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    await db.posts.update_one({"id": post_id}, {
        "$set": {
            "status": "published",
            "published_at": now_iso(),
            "error_message": None,
            "retry_count": 0,
        },
        "$unset": {"pending_carousel_container_id": ""},
    })
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return post


@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str):
    result = await db.posts.delete_one({"id": post_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Post not found")
    return {"message": "Post deleted"}

@api_router.post("/posts/{post_id}/retry-render")
async def retry_video_render(post_id: str):
    """Re-run Shotstack render for a failed_render or stuck-rendering post.
    Keeps the post's caption/hashtags/merge values/clip selection — only
    nukes the render artifacts and re-queues. Useful when a transient
    Shotstack failure caused a render to fail, OR when a render task died
    silently and left the post in 'rendering' status with no worker watching."""
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    if post.get("kind") != "video":
        raise HTTPException(400, "Only video posts can be re-rendered")
    # Allow force-retry from 'rendering' too — a stuck post is functionally
    # indistinguishable from a failed one to the admin. The previous render
    # task (if alive) will see the cleared artifacts and exit; the new one
    # owns the post from here.
    if post.get("status") not in ("failed_render", "rendering", "succeeded", "pending_approval"):
        raise HTTPException(400, f"Can only re-render from status 'failed_render', 'rendering', 'succeeded', or 'pending_approval' (current: {post.get('status')!r})")

    await db.posts.update_one(
        {"id": post_id},
        {
            "$set": {"status": "rendering", "error_message": None},
            "$unset": {"r2_video_url": "", "r2_snapshot_url": "", "video_url": "", "snapshot_url": ""},
        },
    )
    try:
        from video_worker import enqueue_video_job as _enqueue_video_job
        _enqueue_video_job(post_id)
    except Exception as e:
        # Roll status back so the UI doesn't show stuck "Rendering"
        await db.posts.update_one(
            {"id": post_id},
            {"$set": {"status": "failed_render", "error_message": f"Retry enqueue failed: {e}"}},
        )
        raise HTTPException(500, f"Failed to enqueue render: {e}")
    return {"ok": True, "post_id": post_id, "status": "rendering"}


@api_router.post("/posts/{post_id}/approve")
async def approve_post_manual(post_id: str):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "scheduled"}})
    # Video handoff on approval
    if post.get("kind") == "video" and post.get("status") == "pending_approval":
        try:
            rj = await db.render_jobs.find_one({"id": post.get("render_job_id")}) if post.get("render_job_id") else None
            if rj and rj.get("r2_video_url"):
                from video_render_service import handoff_to_bundle
                await handoff_to_bundle(db, post, rj["r2_video_url"], rj.get("r2_snapshot_url"))
            elif post.get("video_url"):
                from video_render_service import handoff_to_bundle
                await handoff_to_bundle(db, post, post["video_url"], post.get("snapshot_url"))
        except Exception as _e:
            logger.warning(f"handoff_to_bundle failed on approval: {_e}")
    return {"status": "scheduled"}


def _approval_page(icon: str, title: str, message: str, color: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{title} — Sleeping Creators</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;
          display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}}
    .card{{text-align:center;max-width:420px}}
    .icon{{font-size:60px;margin-bottom:16px}}
    h1{{font-size:22px;font-weight:700;color:{color};margin-bottom:10px}}
    p{{color:#888;font-size:14px;line-height:1.6}}
    .brand{{margin-top:32px;font-size:10px;color:#333;font-family:monospace;letter-spacing:.1em}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    <p class="brand">SLEEPING CREATORS · CONTENT ENGINE</p>
  </div>
</body>
</html>"""


@api_router.get("/posts/{post_id}/approve", response_class=HTMLResponse)
async def approve_post_telegram(post_id: str, token: str = ""):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        return HTMLResponse(_approval_page("❌", "Not Found", "Post not found.", "#dc2626"), status_code=404)
    if not token or post.get("approval_token") != token:
        return HTMLResponse(_approval_page("⛔", "Invalid Link", "This approval link is invalid or has already been used.", "#dc2626"), status_code=403)
    if post.get("status") != "draft":
        return HTMLResponse(_approval_page("ℹ️", "Already Processed", f"This post was already {post.get('status', 'processed')}.", "#6b7280"))
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "scheduled", "approval_token": None}})
    return HTMLResponse(_approval_page("✅", "Post Approved!", "The post has been scheduled and will be published shortly.", "#22c55e"))


@api_router.get("/posts/{post_id}/reject", response_class=HTMLResponse)
async def reject_post_telegram(post_id: str, token: str = ""):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        return HTMLResponse(_approval_page("❌", "Not Found", "Post not found.", "#dc2626"), status_code=404)
    if not token or post.get("approval_token") != token:
        return HTMLResponse(_approval_page("⛔", "Invalid Link", "This approval link is invalid or has already been used.", "#dc2626"), status_code=403)
    if post.get("status") != "draft":
        return HTMLResponse(_approval_page("ℹ️", "Already Processed", f"This post was already {post.get('status', 'processed')}.", "#6b7280"))
    await db.posts.update_one({"id": post_id}, {"$set": {"approval_token": None}})
    return HTMLResponse(_approval_page("❌", "Post Rejected", "The post has been kept as draft and will not be published automatically.", "#ef4444"))

@api_router.post("/posts/{post_id}/publish")
async def publish_post_now(post_id: str, local_fallback: bool = Query(False)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")

    if local_fallback:
        # Phase 2: post was set to failed+retrying_local by phase 1 — re-claim it
        claimed = await db.posts.update_one(
            {"id": post_id, "status": "failed", "error_message": "retrying_local"},
            {"$set": {"status": "publishing"}}
        )
        if claimed.modified_count == 0:
            raise HTTPException(409, "Post is not in retrying_local state")
    else:
        # Claim the post atomically. Allow re-publishing "published" posts so the
        # user can push updated content to Bundle after editing. Video posts go
        # through render-first states (succeeded / pending_approval / bundle_scheduled)
        # before being publishable — include those for manual "Publish now" too.
        claimable = ["draft", "scheduled", "failed", "published",
                     "succeeded", "pending_approval", "bundle_scheduled"]
        claimed = await db.posts.update_one(
            {"id": post_id, "status": {"$in": claimable}},
            {"$set": {"status": "publishing"}}
        )
        if claimed.modified_count == 0:
            current = await db.posts.find_one({"id": post_id}, {"status": 1, "_id": 0})
            raise HTTPException(409, f"Cannot publish from status {current.get('status')!r}")

    # If this post was previously sent to Bundle, delete the old post first so
    # the re-publish creates a fresh one with the current content and timing.
    old_platform_post_id = post.get("platform_post_id")
    if old_platform_post_id:
        try:
            settings = await get_settings()
            api_key = settings.get("bundle_api_key", "")
            if api_key:
                await bundle_service.delete_post(api_key, old_platform_post_id)
                logger.info(f"Deleted old Bundle post {old_platform_post_id} before re-publish of post {post_id[:8]}")
        except Exception as _e:
            logger.warning(f"Could not delete old Bundle post {old_platform_post_id}: {_e}")

    client = await db.clients.find_one({"id": post["client_id"]}, {"_id": 0}) or {}
    from publisher import publish
    result = await publish(post, client, local_fallback=local_fallback, publish_now=True)

    update = {
        "status": result["status"],
        "published_at": now_iso() if result["status"] == "published" else None,
        "error_message": result.get("error"),
        "platform_post_id": result.get("platform_post_id"),
        "performance": result.get("metrics", {})
    }
    # Persist auto-rendered image URL so it can be reused
    if result.get("rendered_image_url"):
        update["image_url"] = result["rendered_image_url"]

    # Mirror the scheduler's pending-carousel handling so manual republish
    # doesn't get stuck on a stale/bad pending_carousel_container_id.
    unset_fields = {}
    if result.get("pending_carousel_container_id"):
        update["pending_carousel_container_id"] = result["pending_carousel_container_id"]
    elif result.get("clear_pending_carousel_container_id") or post.get("pending_carousel_container_id"):
        unset_fields["pending_carousel_container_id"] = ""

    update_op = {"$set": update}
    if unset_fields:
        update_op["$unset"] = unset_fields
    await db.posts.update_one({"id": post_id}, update_op)
    if result["status"] == "published":
        await db.clients.update_one({"id": post["client_id"]}, {"$inc": {"posts_today": 1, "posts_total": 1}, "$set": {"last_post_at": now_iso()}})
        await add_log("success", f"Published post on {post['platform']} for {post['client_name']}", post["client_id"], post["client_name"], post_id, post["platform"])
    else:
        await add_log("error", f"Failed to publish on {post['platform']}: {result.get('error', 'Unknown error')}", post["client_id"], post["client_name"], post_id, post["platform"])
    return {**post, **update}

@api_router.post("/posts/generate")
async def generate_post(data: GenerateRequest):
    client = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    settings = await get_settings()
    from ai_service import generate_content
    winners = await db.posts.find(
        {"client_id": data.client_id, "is_winner": True},
        {"_id": 0, "text": 1, "content_type": 1, "performance": 1, "engagement_score": 1}
    ).sort("engagement_score", -1).limit(3).to_list(3)
    content = await generate_content(client, data.platform, data.content_type, data.topic, settings, winners=winners, db=db)
    post = {
        "id": str(uuid.uuid4()),
        "client_id": data.client_id,
        "client_name": client["name"],
        "platform": data.platform,
        "content_type": data.content_type,
        "text": content["text"],
        "image_url": content.get("image_url"),
        "hashtags": content.get("hashtags", []),
        "status": "draft",
        "scheduled_at": data.scheduled_at or (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "published_at": None,
        "error_message": None,
        "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
        "ai_generated": True,
        "engagement_score": 0,
        "created_at": now_iso()
    }
    await db.posts.insert_one({**post})
    await add_log("info", f"AI generated post for {client['name']} on {data.platform}", data.client_id, client["name"], post["id"], data.platform)
    return post

@api_router.post("/posts/bulk-generate")
async def bulk_generate(data: BulkGenerateRequest):
    client = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    settings = await get_settings()
    from ai_service import generate_content
    winners = await db.posts.find(
        {"client_id": data.client_id, "is_winner": True},
        {"_id": 0, "text": 1, "content_type": 1, "performance": 1, "engagement_score": 1}
    ).sort("engagement_score", -1).limit(3).to_list(3)
    posts = []
    for platform in data.platforms:
        for i in range(data.count_per_platform):
            content = await generate_content(client, platform, "text_post", None, settings, winners=winners, db=db)
            post = {
                "id": str(uuid.uuid4()),
                "client_id": data.client_id,
                "client_name": client["name"],
                "platform": platform,
                "content_type": "text_post",
                "text": content["text"],
                "image_url": content.get("image_url"),
                "hashtags": content.get("hashtags", []),
                "status": "draft",
                "scheduled_at": (datetime.now(timezone.utc) + timedelta(hours=(i + 1) * 6)).isoformat(),
                "published_at": None,
                "error_message": None,
                "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                "ai_generated": True,
                "engagement_score": 0,
                "created_at": now_iso()
            }
            posts.append(post)
    if posts:
        await db.posts.insert_many([{**p} for p in posts])
    await add_log("success", f"Bulk generated {len(posts)} posts for {client['name']}", data.client_id, client["name"])
    return {"generated": len(posts), "posts": posts}

# ─── Analytics Routes ─────────────────────────────────────────────────────────

@api_router.get("/dashboard/overview")
async def dashboard_overview():
    """Command Center stats. Counts only — no engagement metrics (those live in Bundle now)."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    post_counts_raw, client_counts_raw, platform_raw, recent_logs, settings_doc = await asyncio.gather(
        db.posts.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(None),
        db.clients.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(None),
        db.posts.aggregate([
            {"$match": {"status": "published"}},
            {"$group": {"_id": "$platform", "n": {"$sum": 1}}},
        ]).to_list(None),
        db.logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10),
        db.settings.find_one({"key": "global"}, {"_id": 0, "bundle_api_key": 1}),
    )

    post_counts = {r["_id"]: r["n"] for r in post_counts_raw}
    client_counts = {r["_id"]: r["n"] for r in client_counts_raw}

    published  = post_counts.get("published", 0)
    failed     = post_counts.get("failed", 0)
    scheduled  = post_counts.get("scheduled", 0)
    drafts     = post_counts.get("draft", 0)
    total_posts = sum(post_counts.values())

    total_clients  = sum(client_counts.values())
    active_clients = client_counts.get("active", 0)

    posts_today = await db.posts.count_documents({"published_at": {"$gte": today_start}, "status": "published"})

    platform_counts = {(r["_id"] or "unknown"): r["n"] for r in platform_raw}
    success_rate = round((published / max(published + failed, 1)) * 100, 1)

    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "total_posts": total_posts,
        "published": published,
        "failed": failed,
        "scheduled": scheduled,
        "drafts": drafts,
        "posts_today": posts_today,
        "queue_size": scheduled + drafts,
        "success_rate": success_rate,
        "platform_distribution": platform_counts,
        "recent_activity": recent_logs,
        "bundle_configured": bool(settings_doc and settings_doc.get("bundle_api_key")),
    }


@api_router.get("/dashboard/upcoming")
async def dashboard_upcoming():
    now = datetime.now(timezone.utc).isoformat()
    posts = await db.posts.find(
        {"status": "scheduled", "scheduled_at": {"$gte": now}},
        {"_id": 0, "id": 1, "client_id": 1, "client_name": 1, "platform": 1, "scheduled_at": 1, "content_type": 1},
    ).sort("scheduled_at", 1).to_list(8)
    return posts


@api_router.get("/dashboard/pipelines")
async def dashboard_pipelines():
    pipelines = await db.pipelines.find(
        {},
        {"_id": 0, "id": 1, "name": 1, "client_id": 1, "client_name": 1, "status": 1, "next_run_at": 1, "last_error": 1, "content_type": 1},
    ).sort("client_name", 1).to_list(100)
    return pipelines


@api_router.get("/dashboard/top-performers")
async def dashboard_top_performers():
    clients = await db.clients.find(
        {"bundle.socials": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "name": 1, "avatar": 1, "bundle": 1, "profile_photo_url": 1, "onboarding_data": 1},
    ).to_list(None)
    result = []
    for c in clients:
        socials = (c.get("bundle") or {}).get("socials") or []
        refreshed_at = (c.get("bundle") or {}).get("socials_refreshed_at")
        if not socials:
            continue
        followers = sum(s.get("followers", 0) or 0 for s in socials)
        likes = sum(s.get("likes", 0) or 0 for s in socials)
        comments = sum(s.get("comments", 0) or 0 for s in socials)
        impressions = sum(s.get("impressions", 0) or 0 for s in socials)
        new_followers = sum(s.get("new_followers", 0) or 0 for s in socials)
        engagement_rate = round((likes + comments) / followers * 100, 2) if followers > 0 else 0
        platforms = [s["platform"] for s in socials if s.get("platform")]
        photo = (
            c.get("profile_photo_url")
            or (c.get("onboarding_data") or {}).get("profile_photo_link")
            or ""
        )
        result.append({
            "id": c["id"],
            "name": c.get("name", ""),
            "avatar": c.get("avatar", ""),
            "photo": photo,
            "followers": followers,
            "new_followers": new_followers,
            "impressions": impressions,
            "likes": likes,
            "comments": comments,
            "engagement_rate": engagement_rate,
            "platforms": platforms,
            "refreshed_at": refreshed_at,
        })
    result.sort(key=lambda x: x["engagement_rate"], reverse=True)
    return result[:8]


@api_router.get("/dashboard/errors")
async def dashboard_errors():
    failed_posts, pipeline_errors, error_logs = await asyncio.gather(
        db.posts.find(
            {"status": "failed", "error_message": {"$nin": [None, ""]}},
            {"_id": 0, "id": 1, "client_name": 1, "platform": 1, "error_message": 1, "updated_at": 1, "created_at": 1},
        ).sort("updated_at", -1).to_list(10),
        db.pipelines.find(
            {"status": "error", "last_error": {"$nin": [None, ""]}},
            {"_id": 0, "id": 1, "name": 1, "client_name": 1, "last_error": 1, "next_run_at": 1},
        ).to_list(20),
        db.logs.find(
            {"level": "error"},
            {"_id": 0, "id": 1, "message": 1, "client_name": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(10),
    )
    items = []
    for p in failed_posts:
        items.append({
            "source": "post",
            "label": p.get("client_name") or "Unknown",
            "detail": p.get("error_message", ""),
            "sub": (p.get("platform") or "").upper(),
            "ts": p.get("updated_at") or p.get("created_at") or "",
        })
    for pl in pipeline_errors:
        items.append({
            "source": "pipeline",
            "label": pl.get("client_name") or "Unknown",
            "detail": pl.get("last_error", ""),
            "sub": pl.get("name", "pipeline"),
            "ts": pl.get("next_run_at") or "",
        })
    for log in error_logs:
        items.append({
            "source": "log",
            "label": log.get("client_name") or "System",
            "detail": log.get("message", ""),
            "sub": "log",
            "ts": log.get("created_at") or "",
        })
    items.sort(key=lambda x: x["ts"], reverse=True)
    return items[:20]


@api_router.get("/dashboard/time-series")
async def dashboard_time_series(days: int = 14):
    start = (datetime.now(timezone.utc) - timedelta(days=days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    pipeline = [
        {"$match": {"status": "published", "published_at": {"$gte": start}}},
        {"$group": {"_id": {"$substr": ["$published_at", 0, 10]}, "posts": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    rows = await db.posts.aggregate(pipeline).to_list(None)
    by_date = {r["_id"]: r["posts"] for r in rows}
    result = []
    for i in range(days - 1, -1, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        result.append({"date": day.strftime("%m/%d"), "posts": by_date.get(day.strftime("%Y-%m-%d"), 0)})
    return result


@api_router.get("/dashboard/spend")
async def dashboard_spend(days: int = Query(default=7, ge=1, le=90)):
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()

    pipeline = [
        {"$match": {"created_at": {"$gte": start}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "cost": {"$sum": "$cost_usd"},
            "tokens": {"$sum": "$total_tokens"},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = await db.token_usage.aggregate(pipeline).to_list(None)
    by_date = {r["_id"]: {"cost": r["cost"], "tokens": r["tokens"]} for r in rows}

    result = []
    for i in range(days - 1, -1, -1):
        day = now - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")
        entry = by_date.get(date_str, {"cost": 0.0, "tokens": 0})
        result.append({
            "date": day.strftime("%m/%d"),
            "cost": round(entry["cost"], 6),
            "tokens": int(entry["tokens"]),
        })

    today_str = now.strftime("%Y-%m-%d")
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    today_total = round(by_date.get(today_str, {"cost": 0.0})["cost"], 6)
    yesterday_total = round(by_date.get(yesterday_str, {"cost": 0.0})["cost"], 6)

    return {
        "series": result,
        "today_total": today_total,
        "yesterday_total": yesterday_total,
    }


@api_router.get("/analytics/clients/{client_id}")
async def analytics_client(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    bundle = client.get("bundle") or {"socials": [], "socials_refreshed_at": None}
    socials = bundle.get("socials") or []

    _sum_keys = ("followers", "following", "new_followers", "impressions", "impressions_unique",
                 "views", "views_unique", "likes", "comments", "shares", "saves",
                 "profile_views", "post_count")
    totals = {k: 0 for k in _sum_keys}
    platform_breakdown = {}
    for s in socials:
        plat = s.get("platform") or "unknown"
        followers = s.get("followers", 0) or 0
        likes = s.get("likes", 0) or 0
        comments = s.get("comments", 0) or 0
        engagement_rate = round((likes + comments) / followers * 100, 2) if followers > 0 else 0
        platform_breakdown[plat] = {k: s.get(k, 0) or 0 for k in _sum_keys}
        platform_breakdown[plat]["engagement_rate"] = engagement_rate
        for k in _sum_keys:
            totals[k] += s.get(k, 0) or 0
    totals["engagement_rate"] = round(
        (totals["likes"] + totals["comments"]) / totals["followers"] * 100, 2
    ) if totals["followers"] > 0 else 0

    return {
        "client_id": client["id"],
        "client_name": client.get("name"),
        "bundle_connected": bool(client.get("bundle_team_id")),
        "bundle": {
            "socials": socials,
            "socials_refreshed_at": bundle.get("socials_refreshed_at"),
        },
        "totals": totals,
        "platform_breakdown": platform_breakdown,
    }


@api_router.post("/analytics/clients/{client_id}/refresh")
async def analytics_client_refresh(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    team_id = client.get("bundle_team_id")
    platforms = client.get("bundle_platforms") or []
    if not team_id:
        raise HTTPException(400, "Client isn't connected to Bundle — set up Bundle on the client detail page first")
    if not platforms:
        raise HTTPException(400, "No connected social platforms — connect at least one in Bundle first")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured — go to Settings → Bundle.social")

    refreshed_at = now_iso()
    socials: list[dict] = []
    for platform in platforms:
        try:
            data = await bundle_service.get_social_account_analytics(api_key, team_id, platform)
        except Exception as e:
            logger.warning("Analytics fetch failed for client=%s platform=%s: %s", client_id, platform, e)
            continue

        items = data.get("items") or []
        acct = data.get("socialAccount") or {}
        item = items[0] if items else {}
        socials.append({
            "platform":           platform,
            "username":           acct.get("username"),
            "avatar_url":         acct.get("avatarUrl"),
            "followers":          item.get("followers", 0) or 0,
            "following":          item.get("following", 0) or 0,
            "new_followers":      item.get("newFollowers") or item.get("followerGrowth") or item.get("followersGained") or 0,
            "impressions":        item.get("impressions", 0) or 0,
            "impressions_unique": item.get("impressionsUnique", 0) or 0,
            "views":              item.get("views", 0) or 0,
            "views_unique":       item.get("viewsUnique", 0) or 0,
            "likes":              item.get("likes", 0) or 0,
            "comments":           item.get("comments", 0) or 0,
            "shares":             item.get("shares") or item.get("reposts") or item.get("retweets") or 0,
            "saves":              item.get("saves") or item.get("bookmarks") or item.get("saved") or 0,
            "profile_views":      item.get("profileViews") or item.get("profileVisits") or item.get("profileView") or 0,
            "post_count":         item.get("postCount", 0) or 0,
            "refreshed_at":       refreshed_at,
        })

    if not socials:
        raise HTTPException(502, "All platform fetches failed — previous data preserved")

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "bundle.socials": socials,
            "bundle.socials_refreshed_at": refreshed_at,
        }},
    )
    asyncio.create_task(_trigger_sheet_sync(client_id, ["Performance"]))
    return {"socials": socials, "socials_refreshed_at": refreshed_at}


async def refresh_all_analytics():
    """Daily cron: refresh Bundle analytics for every connected client."""
    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        return
    clients = await db.clients.find(
        {"bundle_team_id": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "bundle_team_id": 1, "bundle_platforms": 1},
    ).to_list(None)
    refreshed_at = now_iso()
    for client in clients:
        team_id = client.get("bundle_team_id")
        platforms = client.get("bundle_platforms") or []
        if not team_id or not platforms:
            continue
        socials = []
        for platform in platforms:
            try:
                data = await bundle_service.get_social_account_analytics(api_key, team_id, platform)
                items = data.get("items") or []
                acct = data.get("socialAccount") or {}
                item = items[0] if items else {}
                socials.append({
                    "platform":           platform,
                    "username":           acct.get("username"),
                    "avatar_url":         acct.get("avatarUrl"),
                    "followers":          item.get("followers", 0) or 0,
                    "following":          item.get("following", 0) or 0,
                    "new_followers":      item.get("newFollowers") or item.get("followerGrowth") or 0,
                    "impressions":        item.get("impressions", 0) or 0,
                    "likes":              item.get("likes", 0) or 0,
                    "comments":           item.get("comments", 0) or 0,
                    "shares":             item.get("shares") or item.get("reposts") or 0,
                    "profile_views":      item.get("profileViews") or item.get("profileVisits") or 0,
                    "post_count":         item.get("postCount", 0) or 0,
                    "refreshed_at":       refreshed_at,
                })
            except Exception as e:
                logger.warning("Daily analytics refresh failed client=%s platform=%s: %s", client["id"], platform, e)
        if socials:
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {"bundle.socials": socials, "bundle.socials_refreshed_at": refreshed_at}},
            )
    logger.info("Daily analytics refresh complete — %d clients", len(clients))


@api_router.get("/analytics/clients/{client_id}/ig-stats")
async def analytics_client_ig_stats(client_id: str):
    """Fetch live Instagram stats (followers, month media engagement) using the stored token.
    Used as a fallback when Bundle.social is not configured."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    token = client.get("instagram_access_token", "")
    ig_user_id = client.get("instagram_user_id", "")
    if not token or not ig_user_id:
        raise HTTPException(400, "Instagram not connected for this client")
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    async with httpx.AsyncClient(timeout=15) as http:
        profile_resp = await http.get(
            f"https://graph.instagram.com/v23.0/{ig_user_id}",
            params={"fields": "followers_count,media_count", "access_token": token},
        )
        if profile_resp.status_code != 200:
            raise HTTPException(502, f"Instagram API error: {profile_resp.text}")
        profile = profile_resp.json()
        media_resp = await http.get(
            f"https://graph.instagram.com/v23.0/{ig_user_id}/media",
            params={
                "fields": "id,timestamp,like_count,comments_count",
                "since": int(month_start.timestamp()),
                "limit": 100,
                "access_token": token,
            },
        )
        media = media_resp.json().get("data", []) if media_resp.status_code == 200 else []
    return {
        "followers_count": profile.get("followers_count", 0),
        "media_count":     profile.get("media_count", 0),
        "month_posts":     len(media),
        "month_likes":     sum(m.get("like_count", 0) for m in media),
        "month_comments":  sum(m.get("comments_count", 0) for m in media),
    }



@api_router.get("/analytics/clients/{client_id}/monthly-report")
async def analytics_monthly_report(client_id: str):
    """Return a single merged payload for the monthly report template.
    Priority: Bundle stored data → Instagram Graph API → DB posts aggregation."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    now = datetime.now(timezone.utc)
    ob = client.get("onboarding_data") or {}
    month_str = now.strftime("%B %Y")

    out = {
        "period": month_str,
        "instagram_handle": ob.get("instagram_handle", ""),
        "platform": ", ".join(client.get("platforms") or ["Instagram"]),
        "followers": 0, "impressions": 0, "views": 0,
        "likes": 0, "comments": 0, "engagement_rate": 0,
        "following": 0, "impressions_unique": 0, "views_unique": 0,
        "posts": 0,
    }

    # Source 1: Bundle stored analytics
    socials = (client.get("bundle") or {}).get("socials") or []
    if not socials:
        # Try a live refresh if Bundle is configured
        team_id = client.get("bundle_team_id")
        if team_id:
            settings = await get_settings()
            api_key = settings.get("bundle_api_key", "")
            platforms = client.get("bundle_platforms") or []
            if api_key and platforms:
                refreshed_at = now_iso()
                new_socials = []
                for platform in platforms:
                    try:
                        data = await bundle_service.get_social_account_analytics(api_key, team_id, platform)
                        items = data.get("items") or []
                        acct = data.get("socialAccount") or {}
                        item = items[0] if items else {}
                        new_socials.append({
                            "platform": platform, "username": acct.get("username"),
                            "followers":          item.get("followers", 0) or 0,
                            "following":          item.get("following", 0) or 0,
                            "new_followers":      item.get("newFollowers") or item.get("followerGrowth") or 0,
                            "impressions":        item.get("impressions", 0) or 0,
                            "impressions_unique": item.get("impressionsUnique", 0) or 0,
                            "views":              item.get("views", 0) or 0,
                            "views_unique":       item.get("viewsUnique", 0) or 0,
                            "likes":              item.get("likes", 0) or 0,
                            "comments":           item.get("comments", 0) or 0,
                            "shares":             item.get("shares") or item.get("reposts") or 0,
                            "saves":              item.get("saves") or item.get("bookmarks") or 0,
                            "profile_views":      item.get("profileViews") or item.get("profileVisits") or 0,
                            "post_count":         item.get("postCount", 0) or 0,
                            "refreshed_at":       refreshed_at,
                        })
                    except Exception:
                        pass
                if new_socials:
                    socials = new_socials
                    await db.clients.update_one(
                        {"id": client_id},
                        {"$set": {"bundle.socials": socials, "bundle.socials_refreshed_at": refreshed_at}},
                    )

    if socials:
        src = next((s for s in socials if s.get("platform") == "instagram"), socials[0])
        if src.get("followers"):
            f  = src.get("followers") or 0
            lk = src.get("likes") or 0
            cm = src.get("comments") or 0
            out["followers"]          = f
            out["impressions"]        = src.get("impressions") or 0
            out["views"]              = src.get("views") or 0
            out["likes"]              = lk
            out["comments"]           = cm
            out["engagement_rate"]    = round((lk + cm) / f * 100, 2) if f else 0
            out["following"]          = src.get("following") or 0
            out["impressions_unique"] = src.get("impressions_unique") or 0
            out["views_unique"]       = src.get("views_unique") or 0
            out["posts"]              = src.get("post_count") or 0

    # Source 2: Instagram Graph API (when Bundle has no data)
    if not out["followers"]:
        token, ig_uid = client.get("instagram_access_token", ""), client.get("instagram_user_id", "")
        if token and ig_uid:
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            try:
                async with httpx.AsyncClient(timeout=15) as http:
                    pr = await http.get(f"https://graph.instagram.com/v23.0/{ig_uid}",
                                        params={"fields": "followers_count,media_count", "access_token": token})
                    if pr.status_code == 200:
                        p = pr.json()
                        out["followers"] = p.get("followers_count") or 0
                    mr = await http.get(f"https://graph.instagram.com/v23.0/{ig_uid}/media",
                                        params={"fields": "id,timestamp,like_count,comments_count",
                                                "since": int(month_start.timestamp()), "limit": 100, "access_token": token})
                    if mr.status_code == 200:
                        media = mr.json().get("data", [])
                        if media:
                            out["posts"]    = out["posts"]    or len(media)
                            out["likes"]    = out["likes"]    or sum(m.get("like_count", 0)     for m in media)
                            out["comments"] = out["comments"] or sum(m.get("comments_count", 0) for m in media)
            except Exception as e:
                logger.warning("IG API fallback for monthly report failed: %s", e)

    # Source 3: DB posts aggregation (current month)
    month_prefix = now.strftime("%Y-%m")
    agg_res = await db.posts.aggregate([
        {"$match": {"client_id": client_id, "status": "published",
                    "published_at": {"$regex": f"^{month_prefix}"}}},
        {"$group": {"_id": None,
                    "count":       {"$sum": 1},
                    "likes":       {"$sum": {"$ifNull": ["$performance.likes", 0]}},
                    "comments":    {"$sum": {"$ifNull": ["$performance.comments", 0]}},
                    "shares":      {"$sum": {"$ifNull": ["$performance.shares", 0]}},
                    "impressions": {"$sum": {"$ifNull": ["$performance.impressions", 0]}}}},
    ]).to_list(1)
    if agg_res:
        a = agg_res[0]
        out["posts"]       = out["posts"]       or a.get("count", 0)
        out["likes"]       = out["likes"]       or a.get("likes", 0)
        out["comments"]    = out["comments"]    or a.get("comments", 0)
        out["impressions"] = out["impressions"] or a.get("impressions", 0)

    return out


# ─── Logs Routes ─────────────────────────────────────────────────────────────

@api_router.get("/logs")
async def get_logs(level: Optional[str] = None, client_name: Optional[str] = None, limit: int = 100):
    query = {}
    if level:
        query["level"] = level
    if client_name:
        query["client_name"] = client_name
    logs = await db.logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

@api_router.delete("/logs")
async def clear_logs():
    await db.logs.delete_many({})
    return {"message": "Logs cleared"}

# ─── Settings Routes ──────────────────────────────────────────────────────────

# ─── Auth Routes ─────────────────────────────────────────────────────────────

@api_router.get("/auth/status")
async def auth_status():
    """Check if admin password has been set up."""
    s = await get_settings()
    return {"setup_required": not bool(s.get("admin_password_hash"))}

@api_router.post("/auth/setup")
async def auth_setup(data: AuthSetupRequest):
    """Set initial admin password (only when none exists)."""
    if len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    s = await get_settings()
    if s.get("admin_password_hash"):
        raise HTTPException(400, "Password already configured. Use change-password instead.")
    hashed = _hash_pw(data.password)
    await db.settings.update_one({"key": "global"}, {"$set": {"admin_password_hash": hashed}})
    return {"token": _make_token()}

@api_router.post("/auth/login")
async def auth_login(data: AuthLoginRequest):
    """Verify password and return JWT."""
    s = await get_settings()
    hashed = s.get("admin_password_hash")
    if not hashed:
        raise HTTPException(400, "No password set. Complete setup first.")
    if not _verify_pw(data.password, hashed):
        raise HTTPException(401, "Incorrect password")
    return {"token": _make_token()}

@api_router.post("/auth/team/login")
async def team_login(data: TeamLoginRequest):
    """Authenticate a team member with email + password."""
    member = await db.team_members.find_one({"email": data.email.lower().strip()})
    if not member or not _verify_pw(data.password, member.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    if not member.get("is_active", False):
        raise HTTPException(401, "Account inactive")
    return {"token": _make_member_token(str(member["_id"]))}

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

@api_router.post("/auth/change-password")
async def auth_change_password(data: ChangePasswordRequest, request: Request):
    """Change the admin password (requires current token)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not _check_token(auth[7:]):
        raise HTTPException(401, "Not authenticated")
    if len(data.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    s = await get_settings()
    if not _verify_pw(data.current_password, s.get("admin_password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    await db.settings.update_one(
        {"key": "global"}, {"$set": {"admin_password_hash": _hash_pw(data.new_password)}}
    )
    return {"token": _make_token()}

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

# ─── Settings Routes ──────────────────────────────────────────────────────────

@api_router.get("/settings")
async def get_settings_route():
    s = await get_settings()
    s.pop("_id", None)
    s.pop("key", None)
    return s

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate):
    # Exclude None (unset) but keep False and empty strings
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.settings.update_one({"key": "global"}, {"$set": update}, upsert=True)
    s = await get_settings()
    s.pop("_id", None)
    s.pop("key", None)
    return s

@api_router.post("/settings/telegram/test")
async def test_telegram(data: TelegramTestRequest = Body(default_factory=TelegramTestRequest)):
    # Use values from request body first; fall back to DB
    bot_token = (data.bot_token or "").strip()
    chat_id = (data.chat_id or "").strip()

    if not bot_token or not chat_id:
        settings = await get_settings()
        bot_token = bot_token or settings.get("telegram_bot_token", "").strip()
        chat_id = chat_id or settings.get("telegram_chat_id", "").strip()

    if not bot_token or not chat_id:
        raise HTTPException(400, "Bot token and chat ID are required. Fill both fields and try again.")

    from telegram_service import send_alert
    ok = await send_alert("Sleeping Creators test message: Telegram connection is working!", bot_token, chat_id)
    if ok:
        return {"status": "sent", "message": "Test message sent successfully"}
    raise HTTPException(500, "Failed to send Telegram message. Check: 1) Bot token is valid 2) You have sent /start to the bot 3) Chat ID is correct")

# ─── Bundle.social Routes ─────────────────────────────────────────────────────

BUNDLE_STATUS_MAP = {
    "SCHEDULED":  "scheduled",
    "PUBLISHED":  "published",
    "FAILED":     "failed",
    "DRAFT":      "draft",
    "PUBLISHING": "publishing",
}

@api_router.get("/settings/bundle")
async def get_bundle_settings():
    s = await get_settings()
    return {
        "bundle_api_key": s.get("bundle_api_key", ""),
        "bundle_webhook_secret": s.get("bundle_webhook_secret", ""),
    }

@api_router.put("/settings/bundle")
async def update_bundle_settings(data: BundleSettingsUpdate):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.settings.update_one({"key": "global"}, {"$set": update}, upsert=True)
    s = await get_settings()
    return {
        "bundle_api_key": s.get("bundle_api_key", ""),
        "bundle_webhook_secret": s.get("bundle_webhook_secret", ""),
    }

@api_router.post("/bundle/setup/{client_id}")
async def bundle_setup(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured — go to Settings → Bundle.social")

    team = await bundle_service.create_team(api_key, client["name"])
    team_id = team.get("id") or team.get("_id") or team.get("teamId", "")
    if not team_id:
        raise HTTPException(500, f"Bundle team creation failed: {team}")

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"bundle_team_id": team_id, "bundle_platforms": [], "bundle_connected_at": None}}
    )

    all_platforms = list(bundle_service.PLATFORM_MAP.keys())
    redirect_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/") + "/bundle-connected"
    portal_url = await bundle_service.create_portal_link(api_key, team_id, all_platforms, redirect_url, expires_in=60)

    return {"team_id": team_id, "portal_url": portal_url}

@api_router.get("/bundle/connect/{client_id}")
async def bundle_connect(client_id: str, platforms: str = "instagram,facebook,twitter,linkedin,tiktok,youtube,threads"):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    team_id = client.get("bundle_team_id")
    if not team_id:
        raise HTTPException(400, "Bundle team not set up — call POST /api/bundle/setup/{client_id} first")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured")

    platform_list = [p.strip() for p in platforms.split(",") if p.strip()]
    redirect_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/") + "/bundle-connected"
    portal_url = await bundle_service.create_portal_link(api_key, team_id, platform_list, redirect_url, expires_in=60)
    return {"portal_url": portal_url}

@api_router.post("/bundle/refresh/{client_id}")
async def bundle_refresh(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    team_id = client.get("bundle_team_id")
    if not team_id:
        raise HTTPException(400, "Bundle team not set up")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured")

    team_data = await bundle_service.get_team(api_key, team_id)
    social_accounts = team_data.get("socialAccounts", [])

    reverse_map = {v: k for k, v in bundle_service.PLATFORM_MAP.items()}
    connected_platforms = []
    for acct in social_accounts:
        acct_type = acct.get("type") or acct.get("socialAccountType", "")
        platform = reverse_map.get(acct_type)
        if platform and platform not in connected_platforms:
            connected_platforms.append(platform)

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"bundle_platforms": connected_platforms, "bundle_connected_at": now_iso()}}
    )
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return clean_doc(updated)

@api_router.get("/bundle/posts/{client_id}")
async def bundle_list_posts(client_id: str, limit: int = 50, offset: int = 0):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    team_id = client.get("bundle_team_id")
    if not team_id:
        raise HTTPException(400, "Bundle team not set up")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured")

    posts = await bundle_service.list_posts(api_key, team_id, limit=limit, offset=offset)
    return {"posts": posts}

@api_router.post("/clients/{client_id}/recount-counters")
async def recount_client_counters(client_id: str):
    """Recompute posts_today / posts_total / last_post_at from db.posts.
    Use to fix counters after the Bundle webhook stopped incrementing them.
    Idempotent — running twice is identical to running once."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    posts_total = await db.posts.count_documents({
        "client_id": client_id, "status": "published",
    })
    posts_today = await db.posts.count_documents({
        "client_id": client_id, "status": "published",
        "published_at": {"$gte": today_start},
    })
    latest = await db.posts.find_one(
        {"client_id": client_id, "status": "published"},
        sort=[("published_at", -1)],
    )
    last_post_at = (latest or {}).get("published_at")
    update = {"posts_today": posts_today, "posts_total": posts_total}
    if last_post_at:
        update["last_post_at"] = last_post_at
    await db.clients.update_one({"id": client_id}, {"$set": update})
    return {"client_id": client_id, **update}


@api_router.get("/bundle/post/{bundle_post_id}/sync")
async def bundle_sync_post(bundle_post_id: str):
    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise HTTPException(400, "Bundle API key not configured")

    bundle_post = await bundle_service.get_post(api_key, bundle_post_id)
    bundle_status = bundle_post.get("status", "")
    automonk_status = BUNDLE_STATUS_MAP.get(bundle_status, "scheduled")

    update = {"status": automonk_status, "updated_at": now_iso()}
    if automonk_status == "published":
        update["published_at"] = bundle_post.get("publishedAt") or now_iso()

    # Capture pre-update status so we know whether to increment client counters.
    # If the post was already 'published' we MUST NOT increment again — sync is
    # idempotent and a re-poll shouldn't double-count.
    prev = await db.posts.find_one(
        {"platform_post_id": bundle_post_id},
        {"status": 1, "client_id": 1, "_id": 0},
    )
    result = await db.posts.update_one(
        {"platform_post_id": bundle_post_id},
        {"$set": update}
    )
    if (
        automonk_status == "published"
        and prev
        and prev.get("status") != "published"
        and prev.get("client_id")
    ):
        await db.clients.update_one(
            {"id": prev["client_id"]},
            {"$inc": {"posts_today": 1, "posts_total": 1},
             "$set": {"last_post_at": now_iso()}},
        )
    post = await db.posts.find_one({"platform_post_id": bundle_post_id}, {"_id": 0})
    return {"synced": result.modified_count > 0, "bundle_status": bundle_status, "post": post}

# ─── Automation Routes ────────────────────────────────────────────────────────

@api_router.get("/automation/status")
async def automation_status():
    settings = await get_settings()
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger)
        })
    return {
        "enabled": settings.get("automation_enabled", True),
        "scheduler_running": scheduler.running,
        "jobs": jobs,
        "auto_publish": settings.get("auto_publish", False),
        "require_approval": settings.get("require_approval", True)
    }

@api_router.post("/automation/trigger")
async def trigger_automation():
    await process_scheduled_posts()
    await add_log("info", "Manual automation cycle triggered")
    return {"message": "Automation cycle executed"}

@api_router.get("/")
async def root():
    return {"status": "Sleeping Creators API running", "version": "1.0.0"}

# ─── Template Models ─────────────────────────────────────────────────────────

DIMENSION_PRESETS = {
    "instagram_4x5":  {"width": 1080, "height": 1350},
    "linkedin_1x1":   {"width": 1080, "height": 1080},
    "twitter_16x9":   {"width": 1200, "height": 675},
    "stories_9x16":   {"width": 1080, "height": 1920},
    "custom":         None,
}

class TemplateCanvas(BaseModel):
    width: int = 1080
    height: int = 1350
    background: dict = {"type": "solid", "value": "#000000"}

class TemplateElement(BaseModel):
    id: str = ""
    type: str  # text | image | shape | icon | author_block | logo
    label: str = ""
    x: float = 0
    y: float = 0
    width: float = 200
    height: float = 50
    grid_col: int = 1
    grid_row: int = 1
    rotation: float = 0
    z_index: int = 1
    locked: bool = False
    visible: bool = True
    props: dict = {}

class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    scope: str = "global"  # global | client
    client_id: Optional[str] = None
    canvas: dict = {"width": 1080, "height": 1350, "background": {"type": "solid", "value": "#000000"}}
    elements: List[dict] = []
    dimension_preset: str = "instagram_4x5"
    zones: Optional[dict] = None

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    client_id: Optional[str] = None
    canvas: Optional[dict] = None
    elements: Optional[List[dict]] = None
    dimension_preset: Optional[str] = None
    zones: Optional[dict] = None

# ─── Template Routes ─────────────────────────────────────────────────────────

@api_router.get("/templates")
async def list_templates(
    scope: Optional[str] = None,
    client_id: Optional[str] = None,
    dimension_preset: Optional[str] = None,
    search: Optional[str] = None,
):
    query = {}
    if scope:
        query["scope"] = scope
    if client_id:
        query["$or"] = [{"scope": "global"}, {"client_id": client_id}]
    if dimension_preset:
        query["dimension_preset"] = dimension_preset
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    templates = await db.templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return templates


@api_router.post("/templates", status_code=201)
async def create_template(data: TemplateCreate):
    # Assign IDs to elements that don't have one
    elements = []
    for elem in data.elements:
        if not elem.get("id"):
            elem["id"] = str(uuid.uuid4())
        elements.append(elem)

    template = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "thumbnail_url": "",
        "scope": data.scope,
        "client_id": data.client_id,
        "cloned_from": None,
        "canvas": data.canvas,
        "elements": elements,
        "dimension_preset": data.dimension_preset,
        "jinja2_html": "",
        "is_starter": False,
        "created_by": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    # Handle zones
    if data.zones:
        from template_converter import canvas_to_jinja2
        zones = {}
        for zone_name in ("first", "middle", "last"):
            zone_data = data.zones.get(zone_name, {})
            zone_canvas = zone_data.get("canvas", data.canvas)
            zone_elements = zone_data.get("elements", [])
            for elem in zone_elements:
                if not elem.get("id"):
                    elem["id"] = str(uuid.uuid4())
            zones[zone_name] = {
                "canvas": zone_canvas,
                "elements": zone_elements,
                "jinja2_html": canvas_to_jinja2(zone_canvas, zone_elements),
            }
        template["zones"] = zones
    await db.templates.insert_one({**template})
    return {k: v for k, v in template.items() if k != "_id"}


@api_router.post("/templates/seed")
async def seed_starter_templates():
    """Seed the 3 built-in starter templates if they don't exist."""
    existing = await db.templates.count_documents({"is_starter": True})
    if existing >= 3:
        return {"message": f"Already have {existing} starter templates", "seeded": 0}

    from template_converter import STARTER_TEMPLATES
    seeded = 0
    for starter in STARTER_TEMPLATES:
        exists = await db.templates.find_one({"name": starter["name"], "is_starter": True})
        if not exists:
            starter["id"] = str(uuid.uuid4())
            starter["created_at"] = now_iso()
            starter["updated_at"] = now_iso()
            await db.templates.insert_one({**starter})
            seeded += 1
    return {"message": f"Seeded {seeded} starter templates", "seeded": seeded}


@api_router.get("/templates/{template_id}")
async def get_template(template_id: str):
    template = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@api_router.put("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateUpdate):
    existing = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Template not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    # Assign IDs to new elements
    if "elements" in update:
        for elem in update["elements"]:
            if not elem.get("id"):
                elem["id"] = str(uuid.uuid4())
    # Handle zones
    if "zones" in update and update["zones"]:
        from template_converter import canvas_to_jinja2
        zones = {}
        fallback_canvas = update.get("canvas") or existing.get("canvas", {"width": 1080, "height": 1350, "background": {"type": "solid", "value": "#000000"}})
        for zone_name in ("first", "middle", "last"):
            zone_data = update["zones"].get(zone_name, {})
            zone_canvas = zone_data.get("canvas", fallback_canvas)
            zone_elements = zone_data.get("elements", [])
            for elem in zone_elements:
                if not elem.get("id"):
                    elem["id"] = str(uuid.uuid4())
            zones[zone_name] = {
                "canvas": zone_canvas,
                "elements": zone_elements,
                "jinja2_html": canvas_to_jinja2(zone_canvas, zone_elements),
            }
        update["zones"] = zones
    await db.templates.update_one({"id": template_id}, {"$set": update})
    return await db.templates.find_one({"id": template_id}, {"_id": 0})


@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    existing = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Template not found")
    if existing.get("is_starter"):
        raise HTTPException(400, "Cannot delete starter templates")
    await db.templates.delete_one({"id": template_id})
    return {"message": "Template deleted"}


@api_router.post("/templates/{template_id}/clone")
async def clone_template(template_id: str, client_id: Optional[str] = None):
    source = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not source:
        raise HTTPException(404, "Template not found")
    clone = {
        **source,
        "id": str(uuid.uuid4()),
        "name": f"{source['name']} (Copy)",
        "cloned_from": template_id,
        "is_starter": False,
        "scope": "client" if client_id else source.get("scope", "global"),
        "client_id": client_id,
        "thumbnail_url": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    # Generate new IDs for cloned elements
    for elem in clone.get("elements", []):
        elem["id"] = str(uuid.uuid4())
    # Clone zone elements with new IDs
    if clone.get("zones"):
        for zone_name in ("first", "middle", "last"):
            zone = clone["zones"].get(zone_name, {})
            for elem in zone.get("elements", []):
                elem["id"] = str(uuid.uuid4())
    await db.templates.insert_one({**clone})
    return {k: v for k, v in clone.items() if k != "_id"}


@api_router.post("/templates/{template_id}/preview")
async def preview_template(template_id: str):
    """Generate a thumbnail PNG for the template."""
    template = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(404, "Template not found")

    from template_converter import canvas_to_jinja2

    # Use first zone if zones exist (most representative of the template's look),
    # fall back to middle, then canvas/elements
    if template.get("zones"):
        zone = (
            template["zones"].get("first")
            or template["zones"].get("middle")
            or next(iter(template["zones"].values()), None)
        )
        if zone:
            jinja2_html = zone.get("jinja2_html") or canvas_to_jinja2(zone["canvas"], zone["elements"])
            canvas = zone["canvas"]
        else:
            jinja2_html = canvas_to_jinja2(template["canvas"], template["elements"])
            canvas = template["canvas"]
    else:
        jinja2_html = canvas_to_jinja2(template["canvas"], template["elements"])
        canvas = template["canvas"]

    # Save jinja2 to template
    await db.templates.update_one(
        {"id": template_id},
        {"$set": {"jinja2_html": jinja2_html, "updated_at": now_iso()}}
    )

    # Render preview using Playwright
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8001")
    from carousel_renderer import render_template_preview
    try:
        url = await render_template_preview(template_id, jinja2_html, canvas, frontend_url)
    except Exception as e:
        logger.error(f"Template preview error: {e}")
        raise HTTPException(500, f"Preview failed: {str(e)[:200]}")

    # Append a version timestamp so browsers always fetch the new image
    # (the static file server ignores query params; the browser doesn't)
    import time as _time
    versioned_url = f"{url}?v={int(_time.time())}"
    await db.templates.update_one(
        {"id": template_id},
        {"$set": {"thumbnail_url": versioned_url}}
    )
    return {"template_id": template_id, "thumbnail_url": versioned_url}


# ─── Carousel Models ──────────────────────────────────────────────────────────

class CarouselGenerateRequest(BaseModel):
    client_id: str
    platform: str = "instagram"
    template: Optional[str] = None          # None = AI decides
    topic: Optional[str] = None
    slide_count: Optional[int] = Field(default=None, ge=1, le=10)  # Instagram cap; None = AI decides
    global_instructions: Optional[str] = None
    slide_format: Optional[str] = None    # None = AI picks best format for topic
    cta_keyword: Optional[str] = None
    cta_offer: Optional[str] = None

class CarouselCreate(BaseModel):
    client_id: str
    platform: str = "instagram"
    template: str = "full_white"
    title: str = ""
    author_name: str = ""
    author_handle: str = ""
    author_title: str = ""
    profile_photo_url: str = ""
    slides: List[dict] = Field(default_factory=list, max_length=10)  # Instagram carousel cap
    design_context: Optional[dict] = None
    slide_previews: Optional[List[dict]] = None  # [{index, url, content_hash}]
    drive_image_index: Optional[int] = None      # pre-assigned at generate time
    post_type: Optional[str] = None              # "carousel" | "single_image"; auto-derived if None

# ── Music library ──────────────────────────────────────────────
class MusicSegment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    start: float
    end: float
    label: str = ""
    mood_tags: List[str] = Field(default_factory=list)

class MusicTrackUpdate(BaseModel):
    name: Optional[str] = None
    mood_tags: Optional[List[str]] = None
    segments: Optional[List[MusicSegment]] = None

class DriveMusicImportRequest(BaseModel):
    folder: str
    drive_file_ids: List[str]
    mood_tags: List[str] = Field(default_factory=list)

class MusicTagCreate(BaseModel):
    tag: str

class CarouselPreviewRequest(BaseModel):
    template: str = "dark_card"
    slides: List[dict] = []
    author_name: str = ""
    author_handle: str = ""
    author_title: str = ""
    profile_photo_url: str = ""
    design_context: Optional[dict] = None   # serialized DesignContext from generate endpoint
    client_id: Optional[str] = None         # used to load Drive images in preview (no counter increment)
    drive_image_index: Optional[int] = None # assigned index from saved carousel; None = use current client index

def _fresh_zones(tpl: dict) -> dict:
    """Regenerate jinja2_html from stored elements at render time so that any
    template_converter.py change takes effect immediately without a re-save."""
    from template_converter import canvas_to_jinja2
    zones = {}
    for zone_name in ("first", "middle", "last"):
        zone = tpl["zones"].get(zone_name, {})
        zones[zone_name] = {
            **zone,
            "jinja2_html": canvas_to_jinja2(zone.get("canvas", tpl.get("canvas", {})), zone.get("elements", [])),
        }
    return zones


def _fresh_jinja2(tpl: dict) -> str:
    """Regenerate jinja2_html from stored elements at render time."""
    from template_converter import canvas_to_jinja2
    return canvas_to_jinja2(tpl.get("canvas", {}), tpl.get("elements", []))


# ─── Carousel Routes ──────────────────────────────────────────────────────────

@api_router.post("/carousel/preview-slides")
async def preview_carousel_slides(data: CarouselPreviewRequest):
    """Render slide previews as PNGs. Skips unchanged slides using content hashes."""
    if not data.slides:
        raise HTTPException(400, "No slides provided")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8001")
    config = {
        "author_name": data.author_name,
        "author_handle": data.author_handle,
        "author_title": data.author_title,
        "profile_photo_url": data.profile_photo_url,
    }

    # Reconstruct DesignContext from serialized dict if provided
    design_ctx = None
    if data.design_context:
        try:
            from carousel_design_engine import DesignContext, ColorPalette, TypographyPairing
            dc = data.design_context
            p  = dc.get("palette", {})
            t  = dc.get("typography", {})
            design_ctx = DesignContext(
                palette=ColorPalette(**p) if p else ColorPalette(),
                typography=TypographyPairing(**t) if t else TypographyPairing(),
                visual_style=dc.get("visual_style", "Minimalism & Swiss Style"),
                depth_treatment=dc.get("depth_treatment", "layered"),
                depth_css=dc.get("depth_css", ""),
                effects_css=dc.get("effects_css", ""),
                accent_shape=dc.get("accent_shape", "dot"),
                slide_layouts=dc.get("slide_layouts", []),
                palette_name=dc.get("palette_name", "General"),
            )
        except Exception as dce:
            logger.warning(f"Could not reconstruct DesignContext: {dce}")
            design_ctx = None

    # Check for custom template — always takes priority over design_ctx
    custom_jinja2 = None
    custom_zones  = None
    template_version = ""
    template_name = data.template
    _built_in = ("dark_card", "full_white", "floating_card", "dark_card_rich", "full_white_rich", "floating_card_rich")
    if template_name not in _built_in:
        tpl = await db.templates.find_one({"id": template_name}, {"_id": 0})
        if tpl:
            template_version = tpl.get("updated_at", "")
            if tpl.get("zones"):
                custom_zones = _fresh_zones(tpl)
            else:
                custom_jinja2 = _fresh_jinja2(tpl)
            design_ctx = None  # custom template overrides design context

    # Resolve Drive image for preview (peek — no counter increment)
    drive_preview_path = None
    drive_image_src = ""
    if data.client_id:
        drive_preview_path = await _peek_drive_image_for_preview(data.client_id, assigned_index=data.drive_image_index)
        if drive_preview_path:
            import base64, mimetypes
            mime = mimetypes.guess_type(drive_preview_path)[0] or "image/jpeg"
            with open(drive_preview_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            drive_image_src = f"data:{mime};base64,{b64}"
            try:
                os.unlink(drive_preview_path)
            except OSError:
                pass

    from carousel_renderer import render_slide_previews
    try:
        results = await render_slide_previews(
            data.slides, template_name, config, frontend_url,
            custom_jinja2=custom_jinja2, custom_zones=custom_zones,
            design_ctx=design_ctx, template_version=template_version,
            drive_image_src=drive_image_src,
        )
    except Exception as e:
        logger.error(f"Slide preview error: {e}")
        raise HTTPException(500, f"Preview failed: {str(e)[:200]}")

    return {"previews": results}

@api_router.post("/carousel/generate")
async def generate_carousel_endpoint(data: CarouselGenerateRequest):
    client = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    settings = await get_settings()
    from ai_service import generate_carousel
    result = await generate_carousel(
        client,
        data.platform,
        data.template,
        data.topic,
        data.slide_count,
        settings,
        cta_keyword=data.cta_keyword,
        cta_offer=data.cta_offer,
        global_instructions=data.global_instructions,
        slide_format=data.slide_format or None,
        db=db,
    )
    # Custom templates don't use design_context — clear it so preview uses the right template
    _built_in = ("dark_card", "full_white", "floating_card", "dark_card_rich", "full_white_rich", "floating_card_rich")
    if data.template not in _built_in:
        result["design_context"] = None

    # Assign drive image index at generate time so preview and export always use the same image
    client_full = await db.clients.find_one({"id": data.client_id})
    if client_full and client_full.get("drive_images_folder_id"):
        result["drive_image_index"] = client_full.get("drive_images_index", 0)
        await db.clients.update_one({"id": data.client_id}, {"$inc": {"drive_images_index": 1}})

    return result

@api_router.get("/carousels")
async def list_carousels(client_id: Optional[str] = None):
    query = {}
    if client_id:
        query["client_id"] = client_id
    carousels = await db.carousels.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return carousels

@api_router.post("/carousels", status_code=201)
async def create_carousel(data: CarouselCreate):
    client = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    # Use drive_image_index pre-assigned at generate time; only assign a new one if missing
    drive_image_index = data.drive_image_index
    if drive_image_index is None:
        client_full = await db.clients.find_one({"id": data.client_id})
        if client_full and client_full.get("drive_images_folder_id"):
            drive_image_index = client_full.get("drive_images_index", 0)
            await db.clients.update_one({"id": data.client_id}, {"$inc": {"drive_images_index": 1}})

    carousel = {
        "id": str(uuid.uuid4()),
        "client_id": data.client_id,
        "client_name": client["name"],
        "platform": data.platform,
        "template": data.template,
        "title": data.title,
        "author_name": data.author_name or client["name"],
        "author_handle": data.author_handle or f"@{client['name'].lower().replace(' ','')}",
        "author_title": data.author_title or client.get("industry", ""),
        "profile_photo_url": data.profile_photo_url or client.get("profile_photo_url", "") or client.get("onboarding_data", {}).get("profile_photo_link", ""),
        "slides": [{"id": str(uuid.uuid4()), **s} for s in data.slides],
        "slide_count": len(data.slides),
        "design_context": data.design_context,
        "slide_previews": data.slide_previews or [],
        "post_type": data.post_type if data.post_type is not None else ("single_image" if len(data.slides) == 1 else "carousel"),
        "status": "draft",
        "created_at": now_iso()
    }
    if drive_image_index is not None:
        carousel["drive_image_index"] = drive_image_index

    await db.carousels.insert_one({**carousel})
    await add_log("success", f"Carousel '{data.title}' created for {client['name']} ({len(data.slides)} slides)", data.client_id, client["name"])
    return carousel

@api_router.get("/carousels/{carousel_id}")
async def get_carousel(carousel_id: str):
    carousel = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not carousel:
        raise HTTPException(404, "Carousel not found")
    return carousel

@api_router.put("/carousels/{carousel_id}")
async def update_carousel(carousel_id: str, data: CarouselCreate):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "slides" in update:
        update["slide_count"] = len(update["slides"])
    if "slides" in update and "post_type" not in update:
        update["post_type"] = "single_image" if len(update["slides"]) == 1 else "carousel"
    await db.carousels.update_one({"id": carousel_id}, {"$set": update})
    return await db.carousels.find_one({"id": carousel_id}, {"_id": 0})

@api_router.delete("/carousels/{carousel_id}")
async def delete_carousel(carousel_id: str):
    result = await db.carousels.delete_one({"id": carousel_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Carousel not found")
    return {"message": "Carousel deleted"}

def _pick_drive_image(images: list[dict], index: int) -> dict:
    """Select image from list by modulo rotation index."""
    if not images:
        raise ValueError("Drive folder has no images")
    return images[index % len(images)]


async def _resolve_drive_image_for_export(client_id: str, folder_id_override: Optional[str] = None) -> Optional[str]:
    """
    Download the next Drive image for this client and return the local temp file path.
    Returns None if no Drive folder is configured on the client or via override.
    Increments drive_images_index on the client only after a successful download.
    folder_id_override: if set, use this folder instead of the client's drive_images_folder_id.
    """
    if not client_id:
        return None
    client = await db.clients.find_one({"id": client_id})
    if not client:
        return None
    folder_id = folder_id_override or client.get("drive_images_folder_id")
    if not folder_id:
        return None

    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google account not connected — cannot load Drive images. Visit /api/auth/google/start first.",
        )

    from google_drive_service import list_images, extract_folder_id, download_clip

    resolved_folder = extract_folder_id(folder_id) or folder_id
    loop = asyncio.get_running_loop()
    images = await loop.run_in_executor(None, list_images, refresh_token, resolved_folder)

    try:
        chosen = _pick_drive_image(images, client.get("drive_images_index", 0))
    except ValueError:
        raise HTTPException(status_code=400, detail="Drive images folder is empty or contains no supported images (jpeg/png/webp/gif)")

    suffix = Path(chosen["name"]).suffix or ".jpg"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
        await loop.run_in_executor(None, download_clip, refresh_token, chosen["drive_file_id"], tmp_path)
    except Exception:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

    new_index = client.get("drive_images_index", 0) + 1
    await db.clients.update_one({"id": client_id}, {"$set": {"drive_images_index": new_index}})
    logger.info(f"Drive image resolved for export: {chosen['name']} (index {new_index - 1} → {new_index})")
    return tmp_path


async def _download_drive_image_at_index(client_id: str, index: int, folder_id_override: Optional[str] = None) -> Optional[str]:
    """Download the Drive image at a specific index WITHOUT touching the counter."""
    if not client_id:
        return None
    client = await db.clients.find_one({"id": client_id})
    if not client:
        return None
    folder_id = folder_id_override or client.get("drive_images_folder_id")
    if not folder_id:
        return None

    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        return None

    from google_drive_service import list_images, extract_folder_id, download_clip

    resolved_folder = extract_folder_id(folder_id) or folder_id
    loop = asyncio.get_running_loop()
    try:
        images = await loop.run_in_executor(None, list_images, refresh_token, resolved_folder)
    except Exception as e:
        from google_drive_service import GoogleTokenExpiredError
        if isinstance(e, GoogleTokenExpiredError):
            logger.error(f"Drive image list failed — Google token expired/revoked. Re-authorize at /api/auth/google/start")
        else:
            logger.warning(f"Drive image list failed: {e}")
        return None

    if not images:
        return None

    chosen = _pick_drive_image(images, index)
    suffix = Path(chosen["name"]).suffix or ".jpg"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
        await loop.run_in_executor(None, download_clip, refresh_token, chosen["drive_file_id"], tmp_path)
        logger.info(f"Drive image downloaded for index {index}: {chosen['name']}")
        return tmp_path
    except Exception as e:
        logger.warning(f"Drive image download failed: {e}")
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return None


async def _peek_drive_image_for_preview(client_id: str, assigned_index: Optional[int] = None) -> Optional[str]:
    """Download Drive image for preview. Uses assigned_index if the carousel has been saved,
    else falls back to current client index (no counter increment either way)."""
    if not client_id:
        return None
    client = await db.clients.find_one({"id": client_id})
    if not client:
        return None
    if not client.get("drive_images_folder_id"):
        return None
    index = assigned_index if assigned_index is not None else client.get("drive_images_index", 0)
    return await _download_drive_image_at_index(client_id, index)


@api_router.post("/carousels/{carousel_id}/export")
async def export_carousel(carousel_id: str):
    """Render all slides to PNGs and return public URLs."""
    carousel = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not carousel:
        raise HTTPException(404, "Carousel not found")
    if not carousel.get("slides"):
        raise HTTPException(400, "Carousel has no slides")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8001")

    # Check if using a custom template — always takes priority over design_ctx
    custom_jinja2 = None
    custom_zones = None
    template_name = carousel.get("template", "dark_card")
    _built_in = ("dark_card", "full_white", "floating_card", "dark_card_rich", "full_white_rich", "floating_card_rich")

    from carousel_renderer import render_carousel_to_pngs
    from carousel_design_engine import DesignContext
    design_ctx = None
    if template_name not in _built_in:
        tpl = await db.templates.find_one({"id": template_name}, {"_id": 0})
        if tpl:
            if tpl.get("zones"):
                custom_zones = _fresh_zones(tpl)
            else:
                custom_jinja2 = _fresh_jinja2(tpl)
            # design_ctx stays None — custom template takes over
    elif carousel.get("design_context"):
        try:
            design_ctx = DesignContext.from_dict(carousel["design_context"])
        except Exception:
            pass
    # Extract per-element folder override from custom template if present
    _folder_override = None
    if template_name not in _built_in:
        tpl_for_folder = await db.templates.find_one({"id": template_name}, {"_id": 0})
        if tpl_for_folder:
            all_zone_elements = []
            if tpl_for_folder.get("zones"):
                for zone in tpl_for_folder["zones"].values():
                    all_zone_elements.extend(zone.get("elements", []))
            for _el in (tpl_for_folder.get("elements") or []) + all_zone_elements:
                if _el.get("type") == "drive_image" and _el.get("props", {}).get("folder_id"):
                    _folder_override = _el["props"]["folder_id"]
                    break

    drive_image_path = None
    try:
        if carousel.get("drive_image_index") is not None:
            # Index was assigned at save time — use it directly, no counter increment
            drive_image_path = await _download_drive_image_at_index(
                carousel.get("client_id", ""), carousel["drive_image_index"],
                folder_id_override=_folder_override,
            )
        else:
            # Legacy carousels saved before this feature — fall back to counter-based approach
            drive_image_path = await _resolve_drive_image_for_export(carousel.get("client_id", ""), folder_id_override=_folder_override)
        urls = await render_carousel_to_pngs(
            carousel, frontend_url,
            custom_jinja2=custom_jinja2, custom_zones=custom_zones, design_ctx=design_ctx,
            drive_image_path=drive_image_path,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Carousel export error: {e}")
        raise HTTPException(500, f"Export failed: {str(e)[:200]}")
    finally:
        if drive_image_path:
            try:
                os.unlink(drive_image_path)
            except OSError:
                pass

    await db.carousels.update_one({"id": carousel_id}, {"$set": {
        "exported_images": urls,
        "exported_at": now_iso(),
        "status": "exported"
    }})
    await add_log("success", f"Carousel '{carousel.get('title')}' exported ({len(urls)} slides)", carousel.get("client_id"), carousel.get("client_name"))
    return {"carousel_id": carousel_id, "images": urls, "count": len(urls)}

@api_router.post("/carousels/{carousel_id}/publish")
async def publish_carousel(carousel_id: str, local_fallback: bool = Query(False)):
    """Export carousel to PNGs, create a post, and publish it immediately."""
    carousel = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not carousel:
        raise HTTPException(404, "Carousel not found")
    if not carousel.get("slides"):
        raise HTTPException(400, "Carousel has no slides")

    client = await db.clients.find_one({"id": carousel["client_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    # ── Phase 2: re-publish existing post via local fallback ──────────────────
    if local_fallback:
        existing_post_id = carousel.get("post_id")
        if not existing_post_id:
            raise HTTPException(400, "No post found on carousel for local fallback retry")
        existing_post = await db.posts.find_one({"id": existing_post_id}, {"_id": 0})
        if not existing_post:
            raise HTTPException(404, "Post not found for local fallback retry")

        # Atomic re-claim — prevents double-publish if two requests arrive simultaneously
        claimed = await db.posts.update_one(
            {"id": existing_post_id, "status": "failed", "error_message": "retrying_local"},
            {"$set": {"status": "publishing"}}
        )
        if claimed.modified_count == 0:
            raise HTTPException(409, "Post is not in retrying_local state")
        from publisher import publish
        result = await publish(existing_post, client, local_fallback=True)

        update = {
            "status": result["status"],
            "published_at": now_iso() if result["status"] == "published" else None,
            "error_message": result.get("error"),
            "platform_post_id": result.get("platform_post_id"),
            "performance": result.get("metrics", {}),
        }
        await db.posts.update_one({"id": existing_post_id}, {"$set": update})
        await db.carousels.update_one({"id": carousel_id}, {"$set": {
            "status": "published" if result["status"] == "published" else "export_failed",
        }})
        if result["status"] == "published":
            await db.clients.update_one({"id": carousel["client_id"]}, {"$inc": {"posts_today": 1, "posts_total": 1}, "$set": {"last_post_at": now_iso()}})
            await add_log("success", f"Published carousel '{carousel.get('title')}' via local fallback on {existing_post['platform']}", carousel["client_id"], carousel.get("client_name", ""), existing_post_id, existing_post["platform"])
        else:
            await add_log("error", f"Local fallback publish failed: {result.get('error', 'Unknown')}", carousel["client_id"], carousel.get("client_name", ""), existing_post_id, existing_post["platform"])
        return {**existing_post, **update}

    # Idempotency — if a publish is already in-flight or succeeded, don't create a second post
    existing_post_id = carousel.get("post_id")
    if existing_post_id:
        existing_post = await db.posts.find_one({"id": existing_post_id}, {"_id": 0})
        if existing_post and existing_post.get("status") in ("published", "publishing"):
            return {
                "status": existing_post["status"],
                "post_id": existing_post_id,
                "error": existing_post.get("error_message"),
            }
        # Guard against duplicate post creation after a retrying_local result —
        # caller should retry with ?local_fallback=true instead
        if existing_post and existing_post.get("error_message") == "retrying_local":
            return {"status": "retrying_local", "post_id": existing_post_id}

    # Export slides to PNGs if not already exported
    exported_images = carousel.get("exported_images", [])
    if not exported_images:
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8001")
        from carousel_renderer import render_carousel_to_pngs
        from carousel_design_engine import DesignContext

        # Resolve custom template — same logic as export_carousel
        pub_custom_jinja2 = None
        pub_custom_zones = None
        pub_design_ctx = None
        template_name = carousel.get("template", "dark_card")
        _built_in = ("dark_card", "full_white", "floating_card", "dark_card_rich", "full_white_rich", "floating_card_rich")

        if template_name not in _built_in:
            tpl = await db.templates.find_one({"id": template_name}, {"_id": 0})
            if tpl:
                if tpl.get("zones"):
                    pub_custom_zones = _fresh_zones(tpl)
                else:
                    pub_custom_jinja2 = _fresh_jinja2(tpl)
                # design_ctx stays None — custom template takes over
        elif carousel.get("design_context"):
            try:
                pub_design_ctx = DesignContext.from_dict(carousel["design_context"])
            except Exception:
                pass

        try:
            exported_images = await render_carousel_to_pngs(carousel, frontend_url, custom_jinja2=pub_custom_jinja2, custom_zones=pub_custom_zones, design_ctx=pub_design_ctx)
        except Exception as e:
            logger.error(f"Carousel export error: {e}")
            raise HTTPException(500, f"Export failed: {str(e)[:200]}")
        await db.carousels.update_one({"id": carousel_id}, {"$set": {
            "exported_images": exported_images,
            "exported_at": now_iso(),
            "status": "exported"
        }})

    # Build post text from carousel (full content, no truncation)
    _all_slides_pub = carousel.get("slides", [])
    slides_text = "\n\n".join([s.get("content", "") for s in _all_slides_pub])
    _cta_sub = carousel.get("cta_sub", "")
    _cta_text = carousel.get("cta_text", "")
    _cta_footer = f"\n\n{_cta_sub}" if _cta_sub else ""
    if _cta_text and _cta_text not in slides_text:
        _cta_footer += f" | {_cta_text}" if _cta_sub else f"\n\n{_cta_text}"
    post_text = carousel.get("caption") or f"{carousel.get('title', 'Untitled')}\n\n{slides_text}{_cta_footer}"
    hashtags = carousel.get("hashtags") or client.get("strategy", {}).get("hashtags", [])
    tag_str = " ".join(f"#{t.lstrip('#')}" for t in hashtags)
    caption = f"{post_text}\n\n{tag_str}".strip()

    # Create post record
    _resolved_post_type = carousel.get("post_type") or ("single_image" if len(exported_images) == 1 else "carousel")
    post = {
        "id": str(uuid.uuid4()),
        "client_id": carousel["client_id"],
        "client_name": carousel.get("client_name", client["name"]),
        "platform": carousel.get("platform", "instagram"),
        # content_type mirrors post_type for legacy consumers; post_type is authoritative
        "content_type": _resolved_post_type,
        "post_type":    _resolved_post_type,
        "text": post_text,
        "image_url": exported_images[0] if exported_images else None,
        "hashtags": hashtags,
        "status": "publishing",
        "scheduled_at": now_iso(),
        "published_at": None,
        "error_message": None,
        "performance": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
        "ai_generated": True,
        "carousel_data": {
            "slides": carousel.get("slides", []),
            "title": carousel.get("title", ""),
            "template": carousel.get("template", "dark_card"),
            "author_name": carousel.get("author_name", ""),
            "author_handle": carousel.get("author_handle", ""),
            "cta_heading": carousel.get("cta_heading", ""),
            "cta_sub": carousel.get("cta_sub", ""),
            "cta_text": carousel.get("cta_text", ""),
            "exported_images": exported_images,
        },
        "created_at": now_iso(),
    }
    await db.posts.insert_one({**post})

    # Publish immediately
    from publisher import publish
    result = await publish(post, client, publish_now=True)

    update = {
        "status": result["status"],
        "published_at": now_iso() if result["status"] == "published" else None,
        "error_message": result.get("error"),
        "platform_post_id": result.get("platform_post_id"),
        "performance": result.get("metrics", {}),
    }
    await db.posts.update_one({"id": post["id"]}, {"$set": update})

    await db.carousels.update_one({"id": carousel_id}, {"$set": {
        "status": "published" if result["status"] == "published" else "export_failed",
        "post_id": post["id"],
    }})

    if result["status"] == "published":
        await db.clients.update_one({"id": post["client_id"]}, {"$inc": {"posts_today": 1, "posts_total": 1}, "$set": {"last_post_at": now_iso()}})
        await add_log("success", f"Published carousel '{carousel.get('title')}' on {post['platform']}", post["client_id"], post["client_name"], post["id"], post["platform"])
    else:
        await add_log("error", f"Failed to publish carousel: {result.get('error', 'Unknown')}", post["client_id"], post["client_name"], post["id"], post["platform"])

    return {"status": result["status"], "post_id": post["id"], "error": result.get("error")}

# ─── Shotstack template admin ─────────────────────────────────────────────────

@api_router.get("/shotstack-templates")
async def list_shotstack_templates(status: Optional[str] = None):
    q = {"status": status} if status else {}
    rows = await db.shotstack_templates.find(q, {"_id": 0}).to_list(500)
    return rows


@api_router.get("/shotstack-templates/{template_id}")
async def get_shotstack_template(template_id: str):
    row = await db.shotstack_templates.find_one({"id": template_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "template not found")
    return row


@api_router.patch("/shotstack-templates/{template_id}")
async def patch_shotstack_template(template_id: str, body: ShotstackTemplatePatch):
    update = {}
    if body.status is not None:
        if body.status not in ("draft", "active", "inactive"):
            raise HTTPException(400, "status must be draft|active|inactive")
        update["status"] = body.status
    if body.merge_fields is not None:
        update["merge_fields"] = [{**f.model_dump(), "inferred": False} for f in body.merge_fields]
    if not update:
        return {"ok": True, "no_changes": True}
    res = await db.shotstack_templates.update_one({"id": template_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "template not found")
    row = await db.shotstack_templates.find_one({"id": template_id}, {"_id": 0})
    return row


@api_router.post("/shotstack-templates/sync")
async def sync_shotstack_templates():
    from shotstack_template_importer import sync_templates
    return await sync_templates(db)


class ImportTemplateJsonRequest(BaseModel):
    name: str = ""          # optional — falls back to JSON's `name` field
    json_text: str          # raw pasted JSON


@api_router.post("/shotstack-templates/import-json", status_code=201)
async def import_template_json(req: ImportTemplateJsonRequest):
    """Import a Shotstack template from pasted JSON. Stores the parsed JSON
    locally; render time uses it directly without a get_template roundtrip
    (Shotstack has no POST /templates so the JSON is never round-tripped
    to their servers). Accepts three shapes:
      • {"response": {...}}              — raw API response wrapper
      • {"id":..., "name":..., "template":{...}} — single-template payload
      • {"timeline":..., "output":..., "merge":[...]} — inner-only (editor export)
    """
    import json as _json
    try:
        parsed = _json.loads(req.json_text)
    except Exception as e:
        raise HTTPException(400, f"Invalid JSON: {e}")
    if not isinstance(parsed, dict):
        raise HTTPException(400, "Invalid template — expected a JSON object")

    # Normalize to the {id?, name?, template:{timeline,output,merge}} shape
    if "response" in parsed and isinstance(parsed.get("response"), dict):
        parsed = parsed["response"]
    if "template" in parsed and isinstance(parsed.get("template"), dict):
        template_data = parsed
    elif "timeline" in parsed and "output" in parsed:
        template_data = {"template": parsed}
    else:
        raise HTTPException(400, "Invalid template — expected timeline + output (or a wrapped response/template object)")

    tpl_inner = template_data.get("template", {}) or {}
    if not tpl_inner.get("timeline"):
        raise HTTPException(400, "Invalid template — missing template.timeline")

    from shotstack_service import extract_merge_fields, extract_audio_url, extract_preview_url
    from shotstack_template_importer import _infer_role, _now_iso

    raw_fields = extract_merge_fields(template_data)
    merge_fields = [{
        "find": mf["find"],
        "replace": mf.get("replace", ""),
        "role": _infer_role(mf["find"]),
        "inferred": True,
    } for mf in raw_fields]

    synthetic_id = f"inline:{uuid.uuid4().hex}"
    name = (req.name or "").strip() or template_data.get("name") or "Imported template"
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "shotstack_template_id": synthetic_id,   # `inline:` prefix marks JSON-imported
        "template_data": template_data,          # stored verbatim, used at render time
        "name": name,
        "status": "draft",                       # require explicit Publish to activate
        "merge_fields": merge_fields,
        "audio_url": extract_audio_url(template_data),
        "thumbnail_url": extract_preview_url(template_data),
        "preview_url": None,
        "source": "json_import",
        "imported_at": now,
        "last_synced_at": now,
    }
    await db.shotstack_templates.insert_one(doc)
    return clean_doc(await db.shotstack_templates.find_one({"id": doc["id"]}))


@api_router.post("/shotstack-templates/{template_id}/reinfer-roles")
async def reinfer_template_roles(template_id: str):
    """Re-run the auto-infer logic for every merge field still marked
    inferred=True. Fields the admin manually set (inferred=False) are left
    alone. Useful after the inference rules get tightened (e.g. MEDIA_*
    now maps to clip role) — without re-importing, existing rows stay on
    the old inference output."""
    from shotstack_template_importer import _infer_role
    tpl = await db.shotstack_templates.find_one({"id": template_id})
    if not tpl:
        raise HTTPException(404, "template not found")
    fields = tpl.get("merge_fields") or []
    changed = []
    for f in fields:
        if not f.get("inferred", True):
            continue  # admin pinned this one — don't touch
        old = f.get("role")
        new = _infer_role(f.get("find", ""))
        if new != old:
            f["role"] = new
            changed.append({"find": f["find"], "old": old, "new": new})
    if changed:
        await db.shotstack_templates.update_one(
            {"id": template_id}, {"$set": {"merge_fields": fields}},
        )
    return {"changed": changed, "count": len(changed)}


@api_router.delete("/shotstack-templates/{template_id}")
async def delete_shotstack_template(template_id: str):
    """Hard-delete from the local registry. The next sync will re-import the
    template from Shotstack if it still exists there — fresh, with no
    preview_url, so the user can re-generate after a template update."""
    res = await db.shotstack_templates.delete_one({"id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "template not found")
    return {"ok": True}


# Placeholder assets used when a merge field has no `replace` default value.
# Every role must yield a non-empty value — Shotstack does NOT auto-fall-back to
# template defaults when a merge key is omitted; the literal {{FIELD}} leaks
# into the rendered output (a "broken URL" error for assets, garbage text for
# text fields). See SHOTSTACK_TEMPLATE_FEATURE.md Step 2.
_PREVIEW_PLACEHOLDERS = {
    "clip":        "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4",
    "audio":       "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/unminus/lit.mp3",
    "logo":        "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/logos/shotstack-logo.png",
    "ai_text":     "Sample text",
    "static_text": "Sample text",
}


def _preview_merge_values(merge_fields: list) -> dict:
    """Build merge values for a preview render.
    Uses each field's stored default (replace), falling back to a safe placeholder
    for any empty clip / audio / logo field so Shotstack can resolve every asset URL.
    """
    values = {}
    for f in merge_fields:
        val = (f.get("replace") or "").strip()
        if not val:
            val = _PREVIEW_PLACEHOLDERS.get(f.get("role", "ai_text"), "Sample text")
        if val:
            values[f["find"]] = val
    return values


class PreviewRenderRequest(BaseModel):
    audio_url: Optional[str] = None  # override the template's default background music


@api_router.post("/shotstack-templates/upload-audio", status_code=201)
async def upload_template_audio_override(file: UploadFile = File(...)):
    """One-shot audio upload for template preview overrides. Returns { audio_url }.
    Does NOT add the track to the music library (use /music/upload for that)."""
    import storage as _storage

    allowed = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3", "audio/ogg"}
    if file.content_type not in allowed:
        raise HTTPException(400, "File must be mp3, wav, or ogg")

    if not _storage.is_enabled():
        raise HTTPException(503, "Storage is not configured")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "Audio file must be under 50 MB")

    ext = os.path.splitext(file.filename or "audio.mp3")[1] or ".mp3"
    key = f"template-audio-overrides/{uuid.uuid4().hex}{ext}"
    url = _storage.upload_bytes(content, key, content_type=file.content_type or "audio/mpeg")
    if not url:
        raise HTTPException(500, "Failed to upload audio")

    return {"audio_url": url}


@api_router.post("/shotstack-templates/{template_id}/generate-preview")
async def generate_template_preview(template_id: str, req: PreviewRenderRequest = None):
    import asyncio
    from shotstack_service import get_template, submit_render, poll_render
    from shotstack_template_importer import _mirror_preview_to_r2

    tpl = await db.shotstack_templates.find_one({"id": template_id})
    if not tpl:
        raise HTTPException(404, "template not found")

    # JSON-imported templates have no Shotstack counterpart — use stored data
    ss_id = tpl.get("shotstack_template_id") or ""
    if ss_id.startswith("inline:") and tpl.get("template_data"):
        template_data = tpl["template_data"]
    else:
        template_data = await get_template(ss_id)
    merge_values = _preview_merge_values(tpl.get("merge_fields") or [])
    audio_override = (req.audio_url or "").strip() if req else ""
    render_id = await submit_render(
        template_data=template_data,
        merge_values=merge_values,
        audio_url=audio_override or None,
    )

    for _ in range(60):  # up to 5 minutes
        await asyncio.sleep(5)
        try:
            resp = await poll_render(render_id)
        except Exception as e:
            logger.warning("generate_template_preview poll error: %s", e)
            continue
        status = resp.get("status")
        if status == "done":
            r2_url = await _mirror_preview_to_r2(resp["url"], template_id)
            url = r2_url or resp["url"]
            await db.shotstack_templates.update_one(
                {"id": template_id},
                {"$set": {"preview_url": url}, "$unset": {"preview_render_id": ""}},
            )
            return {"preview_url": url}
        if status == "failed":
            raise HTTPException(500, detail=f"Render failed: {resp.get('error', 'unknown')}")

    raise HTTPException(504, detail="Render timed out after 5 minutes")


# ── Music library routes ───────────────────────────────────────

@api_router.post("/music/upload", status_code=201)
async def upload_music_track(
    file: UploadFile = File(...),
    name: str = Form(...),
    mood_tags: str = Form("[]"),
):
    import storage as _storage
    if not name.strip():
        raise HTTPException(status_code=400, detail="name must not be blank")
    name = name.strip()

    allowed = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3", "audio/ogg"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="File must be mp3, wav, or ogg")

    if not _storage.is_enabled():
        raise HTTPException(status_code=503, detail="Storage is not configured")

    track_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "track.mp3")[1] or ".mp3"
    r2_key = f"music/{track_id}{ext}"

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file must be under 50 MB")

    r2_url = _storage.upload_bytes(content, r2_key, content_type=file.content_type or "audio/mpeg")
    if not r2_url:
        raise HTTPException(status_code=500, detail="Failed to upload to storage")

    try:
        parsed_tags = _json.loads(mood_tags)
        if not isinstance(parsed_tags, list):
            parsed_tags = []
    except Exception:
        parsed_tags = []

    doc = {
        "id": track_id,
        "name": name,
        "filename": file.filename or f"track{ext}",
        "r2_url": r2_url,
        "r2_key": r2_key,
        "duration": 0.0,
        "mood_tags": parsed_tags,
        "segments": [],
        "uploaded_at": now_iso(),
    }
    await db.music_tracks.insert_one(doc)
    return clean_doc(await db.music_tracks.find_one({"id": track_id}))


@api_router.get("/music")
async def list_music_tracks(mood: Optional[str] = None):
    query = {}
    if mood:
        query["mood_tags"] = {"$in": [mood]}
    tracks = await db.music_tracks.find(query).to_list(1000)
    return [clean_doc(t) for t in tracks]


@api_router.get("/music/pick")
async def pick_music_track(mood: str = ""):
    tracks = await db.music_tracks.find().to_list(1000)
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")
    mood_set = set(m.strip() for m in mood.split(",") if m.strip())

    def score(t):
        track_score = len(set(t.get("mood_tags", [])) & mood_set)
        seg_score = max(
            (len(set(s.get("mood_tags", [])) & mood_set) for s in t.get("segments", [])),
            default=0,
        )
        return track_score + seg_score * 0.5

    best = max(tracks, key=score)
    best_seg = None
    best_seg_score = 0
    for seg in best.get("segments", []):
        s = len(set(seg.get("mood_tags", [])) & mood_set)
        if s > best_seg_score:
            best_seg_score = s
            best_seg = seg

    return {"track": clean_doc(best), "segment": best_seg}


@api_router.put("/music/{track_id}")
async def update_music_track(track_id: str, data: MusicTrackUpdate):
    track = await db.music_tracks.find_one({"id": track_id})
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    update = data.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = now_iso()
    await db.music_tracks.update_one({"id": track_id}, {"$set": update})
    return clean_doc(await db.music_tracks.find_one({"id": track_id}))


@api_router.delete("/music/{track_id}")
async def delete_music_track(track_id: str):
    track = await db.music_tracks.find_one({"id": track_id})
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    await db.music_tracks.delete_one({"id": track_id})
    return {"status": "deleted"}


_TAG_RE = re.compile(r"^[a-z0-9 _-]+$")


async def _read_curated_music_tags() -> list[str]:
    setting = await db.settings.find_one({"key": "music_tags"})
    value = (setting or {}).get("value", [])
    return [t for t in value if isinstance(t, str) and t]


async def _read_all_music_tags() -> list[str]:
    curated = await _read_curated_music_tags()
    inferred = await db.music_tracks.distinct("mood_tags")
    merged = sorted({t for t in (*curated, *inferred) if isinstance(t, str) and t})
    return merged


@api_router.get("/music/tags")
async def list_music_tags():
    return {"tags": await _read_all_music_tags()}


@api_router.post("/music/tags", status_code=201)
async def create_music_tag(data: MusicTagCreate):
    tag = (data.tag or "").strip().lower()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag must not be empty")
    if len(tag) > 32:
        raise HTTPException(status_code=400, detail="Tag must be 32 characters or fewer")
    if not _TAG_RE.match(tag):
        raise HTTPException(
            status_code=400,
            detail="Tag may only contain lowercase letters, digits, spaces, underscores, and hyphens",
        )
    await db.settings.update_one(
        {"key": "music_tags"},
        {"$addToSet": {"value": tag}, "$setOnInsert": {"key": "music_tags"}},
        upsert=True,
    )
    return {"tags": await _read_all_music_tags()}


@api_router.delete("/music/tags/{tag}")
async def delete_music_tag(tag: str):
    """Remove a tag from the curated catalog. Existing tracks keep the tag."""
    tag = tag.strip().lower()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag must not be empty")
    await db.settings.update_one(
        {"key": "music_tags"},
        {"$pull": {"value": tag}},
    )
    return {"tags": await _read_all_music_tags()}


@api_router.get("/music/drive/list")
async def list_drive_music(folder: str):
    """List audio files in a Drive folder, marking which are already imported."""
    from google_drive_service import list_audio, extract_folder_id, GoogleTokenExpiredError

    folder_id = extract_folder_id(folder)
    if not folder_id:
        raise HTTPException(status_code=400, detail=f"Could not parse a folder ID from: {folder!r}")

    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google account not connected. Visit /api/auth/google/start to connect.",
        )

    loop = asyncio.get_event_loop()
    try:
        items = await loop.run_in_executor(None, list_audio, refresh_token, folder_id)
    except GoogleTokenExpiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"[music-drive] list_audio failed for folder {folder_id}: {exc}")
        raise HTTPException(status_code=502, detail=f"Drive API error: {exc}")

    drive_ids = [item["drive_file_id"] for item in items]
    existing_docs = await db.music_tracks.find(
        {"drive_file_id": {"$in": drive_ids}},
        {"drive_file_id": 1},
    ).to_list(None)
    existing_ids = {doc["drive_file_id"] for doc in existing_docs if doc.get("drive_file_id")}

    for item in items:
        item["already_imported"] = item["drive_file_id"] in existing_ids

    return {"folder_id": folder_id, "items": items}


@api_router.post("/music/drive/import", status_code=201)
async def import_drive_music(data: DriveMusicImportRequest):
    """Download selected Drive audio files and add them to the music library."""
    import storage as _storage
    from google_drive_service import (
        list_audio,
        extract_folder_id,
        download_clip,
        GoogleTokenExpiredError,
    )

    if not data.drive_file_ids:
        raise HTTPException(status_code=400, detail="drive_file_ids is empty")

    folder_id = extract_folder_id(data.folder)
    if not folder_id:
        raise HTTPException(status_code=400, detail=f"Could not parse a folder ID from: {data.folder!r}")

    if not _storage.is_enabled():
        raise HTTPException(status_code=503, detail="Storage is not configured")

    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google account not connected. Visit /api/auth/google/start to connect.",
        )

    loop = asyncio.get_event_loop()
    try:
        folder_items = await loop.run_in_executor(None, list_audio, refresh_token, folder_id)
    except GoogleTokenExpiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"[music-drive] list_audio failed for folder {folder_id}: {exc}")
        raise HTTPException(status_code=502, detail=f"Drive API error: {exc}")

    by_id = {item["drive_file_id"]: item for item in folder_items}

    # Pre-fetch which IDs are already imported (single query)
    existing_docs = await db.music_tracks.find(
        {"drive_file_id": {"$in": data.drive_file_ids}},
        {"drive_file_id": 1},
    ).to_list(None)
    existing_ids = {doc["drive_file_id"] for doc in existing_docs if doc.get("drive_file_id")}

    parsed_default_tags = [
        t.strip().lower() for t in data.mood_tags if isinstance(t, str) and t.strip()
    ]

    imported: list[dict] = []
    skipped: list[dict] = []
    failed: list[dict] = []

    for drive_file_id in data.drive_file_ids:
        if drive_file_id in existing_ids:
            skipped.append({"drive_file_id": drive_file_id, "reason": "already_imported"})
            continue

        item = by_id.get(drive_file_id)
        if not item:
            failed.append({"drive_file_id": drive_file_id, "reason": "not_found_in_folder"})
            continue

        track_id = str(uuid.uuid4())
        name = item["name"]
        mime_type = item.get("mime_type") or "audio/mpeg"
        ext = os.path.splitext(name)[1] or ".mp3"

        fd, tmp_path = tempfile.mkstemp(suffix=ext)
        os.close(fd)

        try:
            try:
                await loop.run_in_executor(None, download_clip, refresh_token, drive_file_id, tmp_path)
            except Exception as exc:
                logger.error(f"[music-drive] download failed for {drive_file_id}: {exc}")
                failed.append({"drive_file_id": drive_file_id, "reason": f"download_failed: {exc}"})
                continue

            duration = 0.0
            try:
                from mutagen import File as MutagenFile
                probed = MutagenFile(tmp_path)
                if probed is not None and probed.info is not None:
                    duration = float(probed.info.length or 0.0)
            except Exception as exc:
                logger.warning(f"[music-drive] duration probe failed for {drive_file_id}: {exc}")

            r2_key = f"music/{track_id}{ext}"
            r2_url = _storage.upload_file(tmp_path, r2_key, content_type=mime_type)
            if not r2_url:
                failed.append({"drive_file_id": drive_file_id, "reason": "storage_upload_failed"})
                continue

            display_name = os.path.splitext(name)[0]
            doc = {
                "id": track_id,
                "name": display_name,
                "filename": name,
                "r2_url": r2_url,
                "r2_key": r2_key,
                "duration": duration,
                "mood_tags": list(parsed_default_tags),
                "segments": [],
                "drive_file_id": drive_file_id,
                "source": "drive",
                "uploaded_at": now_iso(),
            }
            await db.music_tracks.insert_one(doc)
            inserted = await db.music_tracks.find_one({"id": track_id})
            imported.append(clean_doc(inserted))
        finally:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass

    return {"imported": imported, "skipped": skipped, "failed": failed}


# ─── Pipeline Routes ──────────────────────────────────────────────────────────

@api_router.get("/clients/{client_id}/pipelines")
async def list_pipelines(client_id: str):
    pipelines = await db.pipelines.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return pipelines

@api_router.post("/clients/{client_id}/pipelines", status_code=201)
async def create_pipeline(client_id: str, data: PipelineCreate):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    now = datetime.now(timezone.utc)
    pipeline = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": client["name"],
        "name": data.name,
        "status": "active",
        "pipeline_type": data.pipeline_type,
        "content_type": data.content_type,
        "carousel_template": data.carousel_template,
        "carousel_slide_count": data.carousel_slide_count,
        "carousel_slide_format": data.carousel_slide_format,
        "carousel_topics": data.carousel_topics,
        "global_instructions": data.global_instructions,
        "cta_keyword": data.cta_keyword,
        "cta_offer": data.cta_offer,
        "max_posts_per_day": data.max_posts_per_day,
        "platforms": data.platforms,
        "schedule_type": data.schedule_type,
        "interval_hours": data.interval_hours,
        "specific_times": data.specific_times,
        "require_approval": data.require_approval,
        "video_template_id": data.video_template_id,
        "video_template_strategy": data.video_template_strategy or "pick",
        "drive_folder_id": data.drive_folder_id,
        "overlay_text": data.overlay_text,
        "video_cta_text": data.video_cta_text,
        "instagram_thumbnail_offset_ms": data.instagram_thumbnail_offset_ms,
        "strategy_pillar_index": 0,
        "format_rotation_index": 0,
        "format_rotation_order": random.sample(
            ["tips", "story", "myth_bust", "case_study", "step_by_step"], 5
        ),
        "total_runs": 0,
        "successful_runs": 0,
        "last_run_at": None,
        "next_run_at": calculate_next_run(data.model_dump(), now),
        "last_error": None,
        "created_at": now_iso()
    }
    await db.pipelines.insert_one({**pipeline})
    await add_log("success", f"Pipeline '{data.name}' created for {client['name']}", client_id, client["name"])
    return pipeline

@api_router.put("/clients/{client_id}/pipelines/{pipeline_id}")
async def update_pipeline(client_id: str, pipeline_id: str, data: PipelineUpdate):
    existing = await db.pipelines.find_one({"id": pipeline_id, "client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Pipeline not found")
    update = data.model_dump(exclude_unset=True)
    now = datetime.now(timezone.utc)
    merged = {**existing, **update}
    update["next_run_at"] = calculate_next_run(merged, now)
    await db.pipelines.update_one({"id": pipeline_id}, {"$set": update})
    return await db.pipelines.find_one({"id": pipeline_id}, {"_id": 0})

@api_router.delete("/clients/{client_id}/pipelines/{pipeline_id}")
async def delete_pipeline(client_id: str, pipeline_id: str):
    result = await db.pipelines.delete_one({"id": pipeline_id, "client_id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Pipeline not found")
    return {"message": "Pipeline deleted"}

@api_router.post("/clients/{client_id}/pipelines/{pipeline_id}/pause")
async def pause_pipeline(client_id: str, pipeline_id: str):
    await db.pipelines.update_one({"id": pipeline_id}, {"$set": {"status": "paused"}})
    return {"status": "paused"}

@api_router.post("/clients/{client_id}/pipelines/{pipeline_id}/resume")
async def resume_pipeline(client_id: str, pipeline_id: str):
    now = datetime.now(timezone.utc)
    pipeline = await db.pipelines.find_one({"id": pipeline_id}, {"_id": 0})
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    next_run = calculate_next_run(pipeline, now)
    await db.pipelines.update_one({"id": pipeline_id}, {"$set": {"status": "active", "next_run_at": next_run}})
    return {"status": "active", "next_run_at": next_run}

@api_router.post("/clients/{client_id}/pipelines/{pipeline_id}/reset")
async def reset_pipeline(client_id: str, pipeline_id: str):
    """Reset all rotation cursors and run counters to zero so the pipeline starts fresh."""
    pipeline = await db.pipelines.find_one({"id": pipeline_id}, {"_id": 0})
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    now = datetime.now(timezone.utc)
    next_run = calculate_next_run(pipeline, now)
    reset_fields = {
        "next_hook_index": 0,
        "next_clip_index": 0,
        "next_audio_index": 0,
        "total_runs": 0,
        "successful_runs": 0,
        "last_run_at": None,
        "last_error": None,
        "next_run_at": next_run,
        "status": "active",
    }
    await db.pipelines.update_one({"id": pipeline_id}, {"$set": reset_fields})
    return {**reset_fields, "id": pipeline_id}

@api_router.post("/clients/{client_id}/pipelines/{pipeline_id}/run")
async def run_pipeline_now(client_id: str, pipeline_id: str, publish: bool = Query(True)):
    """Manually run a pipeline. By default the resulting post(s) auto-publish
    once rendering is done (video pipelines). Set ?publish=false to only render
    and leave the post in 'succeeded' status for manual publish."""
    pipeline = await db.pipelines.find_one({"id": pipeline_id, "client_id": client_id}, {"_id": 0})
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    count = await execute_pipeline(pipeline, datetime.now(timezone.utc), auto_publish=publish)
    return {"message": f"Pipeline executed: {count} posts created", "posts_created": count, "auto_publish": publish}

# ─── Leads & Keyword Config ─────────────────────────────────────────────────

@api_router.get("/clients/{client_id}/keyword-config")
async def get_keyword_config(client_id: str):
    config = await db.keyword_configs.find_one({"client_id": client_id}, {"_id": 0})
    if not config:
        return {"keywords": [], "enabled": False}
    return clean_doc(config) or {"keywords": [], "enabled": False}

@api_router.put("/clients/{client_id}/keyword-config")
async def upsert_keyword_config(client_id: str, body: KeywordConfigCreate):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    existing = await db.keyword_configs.find_one({"client_id": client_id})
    if existing:
        update_data = body.model_dump()
        update_data["updated_at"] = now_iso()
        await db.keyword_configs.update_one({"client_id": client_id}, {"$set": update_data})
    else:
        doc = body.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["client_id"] = client_id
        doc["created_at"] = now_iso()
        doc["updated_at"] = now_iso()
        await db.keyword_configs.insert_one({**doc})
    config = await db.keyword_configs.find_one({"client_id": client_id}, {"_id": 0})
    await add_log("info", f"Keyword config updated for {client.get('name', client_id)}", client_id, client.get("name"))
    return clean_doc(config)

@api_router.delete("/clients/{client_id}/keyword-config")
async def delete_keyword_config(client_id: str):
    result = await db.keyword_configs.delete_one({"client_id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Keyword config not found")
    return {"message": "Keyword config deleted"}

@api_router.post("/clients/{client_id}/keyword-config/upload-file")
async def upload_keyword_config_file(client_id: str, file: UploadFile = File(...)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"File type {file.content_type} not allowed. Allowed: {', '.join(allowed_types)}")
    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(400, "File too large. Maximum size is 25MB (Instagram DM limit)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin"
    key = f"uploads/dm-files/{client_id}/{str(uuid.uuid4())}.{ext}"
    import storage as _storage
    if not _storage.is_enabled():
        raise HTTPException(500, "Storage is not configured")
    url = _storage.upload_bytes(contents, key, content_type=file.content_type)
    if not url:
        raise HTTPException(500, "Failed to upload file to storage")
    return {"file_url": url}

@api_router.get("/clients/{client_id}/leads")
async def list_leads(client_id: str, status: str = None, keyword: str = None, limit: int = 50, skip: int = 0):
    query = {"client_id": client_id}
    if status:
        query["status"] = status
    if keyword:
        query["keyword_matched"] = keyword
    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    leads = []
    async for lead in cursor:
        leads.append(clean_doc(lead) or lead)
    return leads

@api_router.get("/clients/{client_id}/leads/stats")
async def get_leads_stats(client_id: str):
    total = await db.leads.count_documents({"client_id": client_id})
    new = await db.leads.count_documents({"client_id": client_id, "status": "new"})
    replied = await db.leads.count_documents({"client_id": client_id, "status": "replied"})
    dm_sent = await db.leads.count_documents({"client_id": client_id, "status": "dm_sent"})
    converted = await db.leads.count_documents({"client_id": client_id, "status": "converted"})
    ignored = await db.leads.count_documents({"client_id": client_id, "status": "ignored"})
    return {"total": total, "new": new, "replied": replied, "dm_sent": dm_sent, "converted": converted, "ignored": ignored}

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = now_iso()
    await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return clean_doc(updated)

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str):
    result = await db.leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Lead not found")
    return {"message": "Lead deleted"}

@api_router.post("/leads/{lead_id}/send-dm")
async def send_lead_dm(lead_id: str, body: SendDMRequest):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    client = await db.clients.find_one({"id": lead["client_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    if not client.get("instagram_connected"):
        raise HTTPException(400, "Instagram not connected for this client")
    recipient_id = lead.get("user_id", "")
    if not recipient_id:
        raise HTTPException(400, "No user ID available for this lead")
    result = await send_instagram_dm(client, recipient_id, body.message or None, body.file_url or None)
    if result.get("success"):
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {"dm_status": "sent", "status": "dm_sent", "updated_at": now_iso()}}
        )
        await add_log("info", f"DM sent to @{lead.get('username', 'unknown')}", lead["client_id"], client.get("name"))
    else:
        await db.leads.update_one(
            {"id": lead_id},
            {"$set": {"dm_status": "failed", "updated_at": now_iso()}}
        )
    return result

@api_router.post("/leads/{lead_id}/reply-comment")
async def reply_to_lead_comment(lead_id: str, body: dict = Body(...)):
    message = body.get("message", "")
    if not message:
        raise HTTPException(400, "Message is required")
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    client = await db.clients.find_one({"id": lead["client_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    if not client.get("instagram_connected"):
        raise HTTPException(400, "Instagram not connected for this client")
    access_token = client.get("instagram_access_token", "")
    comment_id = lead.get("comment_id", "")
    if not access_token or not comment_id:
        raise HTTPException(400, "Missing Instagram credentials or comment ID")
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"https://graph.instagram.com/v23.0/{comment_id}/replies",
            data={"message": message, "access_token": access_token}
        )
        if resp.status_code != 200:
            error_detail = resp.json().get("error", {}).get("message", resp.text)
            raise HTTPException(502, f"Instagram API error: {error_detail}")
        reply_data = resp.json()
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"comment_reply_id": reply_data.get("id"), "status": "replied", "updated_at": now_iso()}}
    )
    await add_log("info", f"Replied to comment from @{lead.get('username', 'unknown')}", lead["client_id"], client.get("name"))
    return {"success": True, "reply_id": reply_data.get("id")}

# ─── Instagram OAuth ──────────────────────────────────────────────────────────
_ig_states: dict = {}
_ig_used_codes: set = set()       # prevent double code exchange
_ig_lock = asyncio.Lock()         # serialize state validation + code tracking

IG_AUTH_URL   = "https://api.instagram.com/oauth/authorize"
IG_TOKEN_URL  = "https://api.instagram.com/oauth/access_token"
IG_GRAPH_URL  = "https://graph.instagram.com"
IG_SCOPES     = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages"

def _ig_app_id(n: int = 1) -> str:
    if n == 2:
        return os.environ.get("INSTAGRAM_APP_ID_2", "")
    return os.environ.get("INSTAGRAM_APP_ID", "")

def _ig_secret(n: int = 1) -> str:
    if n == 2:
        return os.environ.get("INSTAGRAM_APP_SECRET_2", "")
    return os.environ.get("INSTAGRAM_APP_SECRET", "")

def _frontend_url():
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")

def _redirect_uri():
    base = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    return f"{base}/api/instagram/callback"

def _ig_cleanup_expired():
    """Remove expired entries from _ig_states so it doesn't grow unbounded."""
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _ig_states.items() if now > v["expires_at"]]
    for k in expired:
        _ig_states.pop(k, None)

@api_router.get("/instagram/connect/{client_id}")
async def instagram_connect(client_id: str, app: int = 1):
    """Return OAuth URL for the Connect Instagram popup.

    Pass ?app=2 to use the second Meta app (INSTAGRAM_APP_ID_2).
    """
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    _ig_cleanup_expired()
    state = secrets.token_urlsafe(32)
    _ig_states[state] = {
        "client_id": client_id,
        "app_index": app,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    redirect = _redirect_uri()
    auth_url = (
        f"{IG_AUTH_URL}"
        f"?client_id={_ig_app_id(app)}"
        f"&redirect_uri={redirect}"
        f"&response_type=code"
        f"&scope={IG_SCOPES}"
        f"&state={state}"
    )
    logger.info(f"Instagram connect (app={app}): redirect_uri={redirect}")
    logger.info(f"Instagram authorize URL: {auth_url}")
    return {"auth_url": auth_url}

@api_router.get("/instagram/callback")
async def instagram_callback(request: Request, code: str = None, state: str = None, error: str = None):
    """Handle Instagram OAuth redirect, exchange code → tokens, store per client."""
    frontend = _frontend_url()

    # Log the actual URL Instagram redirected to vs what we send in token exchange
    actual_url = str(request.url)
    configured_redirect = _redirect_uri()
    logger.info(f"Instagram callback hit. Actual URL: {actual_url}")
    logger.info(f"Configured redirect_uri: {configured_redirect}")

    if error:
        return RedirectResponse(f"{frontend}/instagram/callback?error={error}")

    if not code or not state:
        return RedirectResponse(f"{frontend}/instagram/callback?error=missing_params")

    # Serialize state pop + used-code check so concurrent duplicate callbacks
    # cannot both proceed past this gate (prevents double code exchange).
    async with _ig_lock:
        state_data = _ig_states.pop(state, None)
        if not state_data:
            return RedirectResponse(f"{frontend}/instagram/callback?error=invalid_state")
        if datetime.now(timezone.utc) > state_data["expires_at"]:
            return RedirectResponse(f"{frontend}/instagram/callback?error=state_expired")

        clean_code = code.rstrip("#_") if code else code
        if clean_code in _ig_used_codes:
            return RedirectResponse(f"{frontend}/instagram/callback?error=code_already_used")
        _ig_used_codes.add(clean_code)
        # Cap the set so it doesn't grow forever (keep last 200 codes)
        if len(_ig_used_codes) > 200:
            _ig_used_codes.clear()

    client_id = state_data["client_id"]
    app_index = state_data.get("app_index", 1)

    try:
        logger.info(f"Token exchange (app={app_index}): code={clean_code[:20]}... redirect_uri={configured_redirect}")

        async with httpx.AsyncClient(timeout=15) as http:
            # Step 1 – exchange code for short-lived token
            # Send raw form body to avoid httpx percent-encoding the redirect_uri
            form_body = (
                f"client_id={_ig_app_id(app_index)}"
                f"&client_secret={_ig_secret(app_index)}"
                f"&grant_type=authorization_code"
                f"&redirect_uri={configured_redirect}"
                f"&code={clean_code}"
            )
            r1 = await http.post(
                IG_TOKEN_URL,
                content=form_body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if r1.status_code != 200:
                err_body = r1.text
                logger.error(f"Instagram token exchange failed ({r1.status_code}): {err_body}")
                raise ValueError(f"Token exchange failed: {err_body[:200]}")
            short_data = r1.json()
            if "error" in short_data:
                raise ValueError(short_data.get("error_message", "Token exchange failed"))
            short_token = short_data["access_token"]
            ig_user_id  = str(short_data["user_id"])

            # Step 2 – exchange for long-lived token (60 days)
            r2 = await http.get(f"{IG_GRAPH_URL}/access_token", params={
                "grant_type": "ig_exchange_token",
                "client_secret": _ig_secret(app_index),
                "access_token": short_token
            })
            r2.raise_for_status()
            long_data = r2.json()
            if "error" in long_data:
                raise ValueError(long_data.get("error", {}).get("message", "Long-lived token exchange failed"))
            long_token   = long_data["access_token"]
            expires_in   = long_data.get("expires_in", 5183944)  # ~60 days

            # Step 3 – fetch Instagram profile (incl. account_type for publish capability check)
            r3 = await http.get(f"{IG_GRAPH_URL}/me", params={
                "fields": "id,username,name,profile_picture_url,followers_count,account_type",
                "access_token": long_token
            })
            r3.raise_for_status()
            profile = r3.json()

            # Reject Personal accounts at connection time — IG silently fails carousel
            # publishes on Personal accounts, returning {"id": "0"} instead of an error.
            # BUSINESS / CREATOR / MEDIA_CREATOR are the publishable account types.
            account_type = (profile.get("account_type") or "").upper()
            _PUBLISHABLE_TYPES = {"BUSINESS", "CREATOR", "MEDIA_CREATOR"}
            if account_type and account_type not in _PUBLISHABLE_TYPES:
                username = profile.get("username", ig_user_id)
                logger.warning(
                    "Rejecting IG connection for client=%s username=@%s — account_type=%s (must be Business or Creator)",
                    client_id, username, account_type,
                )
                await add_log(
                    "error",
                    f"Instagram connection rejected for @{username}: account is set to {account_type}. Switch to Business or Creator in the Instagram app, then reconnect.",
                    client_id,
                )
                return RedirectResponse(
                    f"{frontend}/instagram/callback?error=personal_account&account_type={account_type}&username={username}"
                )

        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
        await db.clients.update_one({"id": client_id}, {"$set": {
            "instagram_connected": True,
            "instagram_user_id": ig_user_id,
            "instagram_username": profile.get("username", ""),
            "instagram_name": profile.get("name", ""),
            "instagram_account_type": account_type,
            "instagram_access_token": long_token,
            "instagram_token_expires_at": expires_at,
            "instagram_connected_at": now_iso(),
            "instagram_app_index": app_index,
        }})
        await add_log("success", f"Instagram connected: @{profile.get('username', ig_user_id)}", client_id)
        username = profile.get("username", ig_user_id)
        return RedirectResponse(
            f"{frontend}/instagram/callback?success=true&client_id={client_id}&username={username}"
        )

    except Exception as e:
        logger.error(f"Instagram OAuth error: {e}")
        return RedirectResponse(f"{frontend}/instagram/callback?error={str(e)[:80]}")

@api_router.get("/instagram/status/{client_id}")
async def instagram_status(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    return {
        "connected": client.get("instagram_connected", False),
        "username": client.get("instagram_username", ""),
        "name": client.get("instagram_name", ""),
        "user_id": client.get("instagram_user_id", ""),
        "expires_at": client.get("instagram_token_expires_at", ""),
        "connected_at": client.get("instagram_connected_at", ""),
        "account_type": client.get("instagram_account_type", ""),
        "publish_blocked": client.get("instagram_publish_blocked", False),
        "warning": client.get("instagram_account_warning", ""),
    }


@api_router.post("/instagram/audit")
async def instagram_audit_all():
    """One-shot audit of every connected Instagram account.

    Calls IG /me?fields=account_type for each connected client to detect
    accounts that will silently fail carousel publishing (Personal accounts,
    expired tokens, broken Page links). Updates each client's
    instagram_account_type / instagram_publish_blocked / instagram_account_warning
    fields so the dashboard can surface bad accounts before they fail to publish.
    """
    _PUBLISHABLE_TYPES = {"BUSINESS", "CREATOR", "MEDIA_CREATOR"}
    cursor = db.clients.find({"instagram_connected": True}, {"_id": 0})
    summary = {"checked": 0, "ok": 0, "blocked": 0, "errors": 0, "details": []}

    async with httpx.AsyncClient(timeout=15) as http:
        async for client in cursor:
            cid = client.get("id")
            username = client.get("instagram_username", "")
            token = client.get("instagram_access_token", "")
            if not token:
                continue
            summary["checked"] += 1
            try:
                r = await http.get(f"{IG_GRAPH_URL}/me", params={
                    "fields": "id,username,account_type",
                    "access_token": token,
                })
                data = r.json()
                if "error" in data:
                    err_msg = data["error"].get("message", "")[:120]
                    warning = f"Token check failed: {err_msg}"
                    await db.clients.update_one({"id": cid}, {"$set": {
                        "instagram_publish_blocked": True,
                        "instagram_account_warning": warning,
                    }})
                    summary["errors"] += 1
                    summary["details"].append({"client_id": cid, "username": username, "status": "token_error", "detail": err_msg})
                    continue

                account_type = (data.get("account_type") or "").upper()
                if account_type and account_type not in _PUBLISHABLE_TYPES:
                    warning = f"Account type is {account_type} — switch to Business or Creator in Instagram app to enable publishing"
                    await db.clients.update_one({"id": cid}, {"$set": {
                        "instagram_account_type": account_type,
                        "instagram_publish_blocked": True,
                        "instagram_account_warning": warning,
                    }})
                    summary["blocked"] += 1
                    summary["details"].append({"client_id": cid, "username": username, "status": "personal_account", "account_type": account_type})
                    await add_log("warning", f"Audit: @{username} flagged — {account_type} account cannot publish carousels", cid)
                else:
                    await db.clients.update_one({"id": cid}, {
                        "$set": {"instagram_account_type": account_type or "BUSINESS"},
                        "$unset": {"instagram_publish_blocked": "", "instagram_account_warning": ""},
                    })
                    summary["ok"] += 1
            except Exception as e:
                summary["errors"] += 1
                summary["details"].append({"client_id": cid, "username": username, "status": "exception", "detail": str(e)[:120]})

    return summary

@api_router.delete("/instagram/disconnect/{client_id}")
async def instagram_disconnect(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$unset": {
        "instagram_connected": "",
        "instagram_user_id": "",
        "instagram_username": "",
        "instagram_name": "",
        "instagram_access_token": "",
        "instagram_token_expires_at": "",
        "instagram_connected_at": "",
        "instagram_app_index": "",
    }})
    await add_log("info", "Instagram disconnected", client_id)
    return {"disconnected": True}

# ─── Facebook OAuth ───────────────────────────────────────────────────────────
_fb_states: dict = {}

FB_AUTH_URL  = "https://www.facebook.com/v23.0/dialog/oauth"
FB_TOKEN_URL = "https://graph.facebook.com/v23.0/oauth/access_token"
FB_GRAPH_URL = "https://graph.facebook.com/v23.0"
FB_SCOPES    = "pages_manage_posts,pages_read_engagement,pages_show_list"

def _fb_app_id():
    return os.environ.get("FACEBOOK_APP_ID", os.environ.get("INSTAGRAM_APP_ID", ""))

def _fb_secret():
    return os.environ.get("FACEBOOK_APP_SECRET", os.environ.get("INSTAGRAM_APP_SECRET", ""))

def _fb_redirect_uri():
    base = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    return f"{base}/api/facebook/callback"

@api_router.get("/facebook/connect/{client_id}")
async def facebook_connect(client_id: str):
    """Return OAuth URL for the Connect Facebook popup."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    state = secrets.token_urlsafe(32)
    _fb_states[state] = {
        "client_id": client_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    params = urlencode({
        "client_id": _fb_app_id(),
        "redirect_uri": _fb_redirect_uri(),
        "response_type": "code",
        "scope": FB_SCOPES,
        "state": state,
    })
    return {"auth_url": f"{FB_AUTH_URL}?{params}"}

@api_router.get("/facebook/callback")
async def facebook_callback(code: str = None, state: str = None, error: str = None):
    """Handle Facebook OAuth redirect, exchange code → tokens, fetch pages."""
    frontend = _frontend_url()

    if error:
        return RedirectResponse(f"{frontend}/facebook/callback?error={error}")

    if not code or not state:
        return RedirectResponse(f"{frontend}/facebook/callback?error=missing_params")

    state_data = _fb_states.pop(state, None)
    if not state_data:
        return RedirectResponse(f"{frontend}/facebook/callback?error=invalid_state")
    if datetime.now(timezone.utc) > state_data["expires_at"]:
        return RedirectResponse(f"{frontend}/facebook/callback?error=state_expired")

    client_id = state_data["client_id"]

    try:
        async with httpx.AsyncClient(timeout=15) as http:
            # Step 1 – exchange code for user access token
            r1 = await http.get(FB_TOKEN_URL, params={
                "client_id": _fb_app_id(),
                "client_secret": _fb_secret(),
                "redirect_uri": _fb_redirect_uri(),
                "code": code
            })
            r1.raise_for_status()
            token_data = r1.json()
            if "error" in token_data:
                raise ValueError(token_data.get("error", {}).get("message", "Token exchange failed"))
            user_token = token_data["access_token"]

            # Step 2 – exchange for long-lived user token (60 days)
            r2 = await http.get(FB_TOKEN_URL, params={
                "grant_type": "fb_exchange_token",
                "client_id": _fb_app_id(),
                "client_secret": _fb_secret(),
                "fb_exchange_token": user_token
            })
            r2.raise_for_status()
            long_data = r2.json()
            long_user_token = long_data.get("access_token", user_token)
            expires_in = long_data.get("expires_in", 5183944)

            # Step 3 – fetch user's Pages
            r3 = await http.get(f"{FB_GRAPH_URL}/me/accounts", params={
                "fields": "id,name,access_token,category,picture",
                "access_token": long_user_token
            })
            r3.raise_for_status()
            pages_data = r3.json()
            pages = pages_data.get("data", [])

            if not pages:
                return RedirectResponse(f"{frontend}/facebook/callback?error=no_pages_found")

            # Step 4 – fetch user profile
            r4 = await http.get(f"{FB_GRAPH_URL}/me", params={
                "fields": "id,name",
                "access_token": long_user_token
            })
            r4.raise_for_status()
            profile = r4.json()

        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        # Store pages list and user token — page selection happens in a second step
        pages_list = [
            {"id": p["id"], "name": p["name"], "access_token": p["access_token"],
             "category": p.get("category", ""), "picture": p.get("picture", {}).get("data", {}).get("url", "")}
            for p in pages
        ]

        await db.clients.update_one({"id": client_id}, {"$set": {
            "facebook_user_token": long_user_token,
            "facebook_user_id": profile.get("id", ""),
            "facebook_user_name": profile.get("name", ""),
            "facebook_pages": pages_list,
            "facebook_token_expires_at": expires_at,
            "facebook_connected_at": now_iso(),
        }})

        # Auto-select if only one page
        if len(pages_list) == 1:
            page = pages_list[0]
            await db.clients.update_one({"id": client_id}, {"$set": {
                "facebook_connected": True,
                "facebook_page_id": page["id"],
                "facebook_page_name": page["name"],
                "facebook_page_token": page["access_token"],
            }})
            await add_log("success", f"Facebook connected: {page['name']}", client_id)
            from urllib.parse import quote
            return RedirectResponse(
                f"{frontend}/facebook/callback?success=true&client_id={client_id}&page_name={quote(page['name'])}"
            )

        # Multiple pages — frontend will show page selector
        await add_log("info", f"Facebook authenticated, {len(pages_list)} pages found", client_id)
        return RedirectResponse(
            f"{frontend}/facebook/callback?success=true&client_id={client_id}&select_page=true&page_count={len(pages_list)}"
        )

    except Exception as e:
        logger.error(f"Facebook OAuth error: {e}")
        return RedirectResponse(f"{frontend}/facebook/callback?error={str(e)[:80]}")

@api_router.get("/facebook/pages/{client_id}")
async def facebook_pages(client_id: str):
    """Return list of Facebook Pages available for this client."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    pages = client.get("facebook_pages", [])
    # Don't expose page tokens to frontend
    return [{"id": p["id"], "name": p["name"], "category": p.get("category", ""), "picture": p.get("picture", "")} for p in pages]

@api_router.post("/facebook/select-page/{client_id}")
async def facebook_select_page(client_id: str, page_id: str = Body(..., embed=True)):
    """Select which Facebook Page to publish to."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    pages = client.get("facebook_pages", [])
    page = next((p for p in pages if p["id"] == page_id), None)
    if not page:
        raise HTTPException(400, "Page not found in authorized pages")
    await db.clients.update_one({"id": client_id}, {"$set": {
        "facebook_connected": True,
        "facebook_page_id": page["id"],
        "facebook_page_name": page["name"],
        "facebook_page_token": page["access_token"],
    }})
    await add_log("success", f"Facebook page selected: {page['name']}", client_id)
    return {"selected": True, "page_name": page["name"]}

@api_router.get("/facebook/status/{client_id}")
async def facebook_status(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    return {
        "connected": client.get("facebook_connected", False),
        "page_name": client.get("facebook_page_name", ""),
        "page_id": client.get("facebook_page_id", ""),
        "user_name": client.get("facebook_user_name", ""),
        "expires_at": client.get("facebook_token_expires_at", ""),
        "connected_at": client.get("facebook_connected_at", ""),
        "has_pages": bool(client.get("facebook_pages")),
    }

@api_router.delete("/facebook/disconnect/{client_id}")
async def facebook_disconnect(client_id: str):
    await db.clients.update_one({"id": client_id}, {"$unset": {
        "facebook_connected": "",
        "facebook_user_token": "",
        "facebook_user_id": "",
        "facebook_user_name": "",
        "facebook_pages": "",
        "facebook_page_id": "",
        "facebook_page_name": "",
        "facebook_page_token": "",
        "facebook_token_expires_at": "",
        "facebook_connected_at": ""
    }})
    await add_log("info", "Facebook disconnected", client_id)
    return {"disconnected": True}

# ─── Usage / Cost Tracking Routes ────────────────────────────────────────────

@api_router.get("/usage/summary")
async def usage_summary(days: int = 30, client_id: Optional[str] = None):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    match = {"created_at": {"$gte": cutoff}}
    if client_id:
        match["client_id"] = client_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"model": "$model", "type": "$generation_type"},
            "tokens": {"$sum": "$total_tokens"},
            "cost":   {"$sum": "$cost_usd"},
            "count":  {"$sum": 1},
        }}
    ]
    rows = await db.token_usage.aggregate(pipeline).to_list(None)

    total_tokens = 0
    total_cost = 0.0
    by_model: dict = {}
    by_type: dict = {}

    for row in rows:
        model = row["_id"]["model"]
        gen_type = row["_id"]["type"]
        tokens = row["tokens"]
        cost = row["cost"]
        count = row["count"]

        total_tokens += tokens
        total_cost += cost

        if model not in by_model:
            by_model[model] = {"tokens": 0, "cost_usd": 0.0}
        by_model[model]["tokens"] += tokens
        by_model[model]["cost_usd"] += cost

        if gen_type not in by_type:
            by_type[gen_type] = {"count": 0, "tokens": 0, "cost_usd": 0.0}
        by_type[gen_type]["count"] += count
        by_type[gen_type]["tokens"] += tokens
        by_type[gen_type]["cost_usd"] += cost

    # Round costs for display
    for m in by_model.values():
        m["cost_usd"] = round(m["cost_usd"], 6)
    for t in by_type.values():
        t["cost_usd"] = round(t["cost_usd"], 6)

    return {
        "period_days": days,
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 6),
        "by_model": by_model,
        "by_generation_type": by_type,
    }


@api_router.get("/usage/clients")
async def usage_by_client(days: int = 30):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}, "client_id": {"$ne": None}}},
        {"$group": {
            "_id": "$client_id",
            "client_name": {"$first": "$client_name"},
            "total_tokens": {"$sum": "$total_tokens"},
            "total_cost_usd": {"$sum": "$cost_usd"},
        }},
        {"$sort": {"total_cost_usd": -1}},
    ]
    rows = await db.token_usage.aggregate(pipeline).to_list(None)
    return [
        {
            "client_id": r["_id"],
            "client_name": r.get("client_name"),
            "total_tokens": r["total_tokens"],
            "total_cost_usd": round(r["total_cost_usd"], 6),
        }
        for r in rows
    ]


@api_router.get("/usage/daily")
async def usage_daily(days: int = 30, client_id: Optional[str] = None):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    match = {"created_at": {"$gte": cutoff}}
    if client_id:
        match["client_id"] = client_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},  # YYYY-MM-DD
            "tokens": {"$sum": "$total_tokens"},
            "cost_usd": {"$sum": "$cost_usd"},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = await db.token_usage.aggregate(pipeline).to_list(None)
    return [
        {"date": r["_id"], "tokens": r["tokens"], "cost_usd": round(r["cost_usd"], 6)}
        for r in rows
    ]


@api_router.get("/usage/log")
async def usage_log(
    page: int = 1,
    limit: int = 50,
    client_id: Optional[str] = None,
    generation_type: Optional[str] = None,
):
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    if generation_type:
        query["generation_type"] = generation_type

    skip = (page - 1) * limit
    total = await db.token_usage.count_documents(query)
    items = await db.token_usage.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    import math
    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": math.ceil(total / limit) if limit else 1,
    }


# ─── Apify Usage / Cost Tracking Routes ──────────────────────────────────────

@api_router.get("/usage/apify/summary")
async def apify_usage_summary(days: int = 30, client_id: Optional[str] = None):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    match = {"created_at": {"$gte": cutoff}}
    if client_id:
        match["client_id"] = client_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"actor": "$actor", "platform": "$platform"},
            "cost":    {"$sum": "$cost_usd"},
            "results": {"$sum": "$results_count"},
            "runs":    {"$sum": 1},
        }}
    ]
    rows = await db.apify_usage.aggregate(pipeline).to_list(None)

    total_cost = 0.0
    total_runs = 0
    total_results = 0
    by_actor: dict = {}
    by_platform: dict = {}

    for row in rows:
        actor = row["_id"].get("actor") or "unknown"
        platform = row["_id"].get("platform") or "unknown"
        cost = row["cost"] or 0.0
        runs = row["runs"] or 0
        results = row["results"] or 0

        total_cost += cost
        total_runs += runs
        total_results += results

        if actor not in by_actor:
            by_actor[actor] = {"runs": 0, "results": 0, "cost_usd": 0.0}
        by_actor[actor]["runs"] += runs
        by_actor[actor]["results"] += results
        by_actor[actor]["cost_usd"] += cost

        if platform not in by_platform:
            by_platform[platform] = {"runs": 0, "results": 0, "cost_usd": 0.0}
        by_platform[platform]["runs"] += runs
        by_platform[platform]["results"] += results
        by_platform[platform]["cost_usd"] += cost

    for a in by_actor.values():
        a["cost_usd"] = round(a["cost_usd"], 6)
    for p in by_platform.values():
        p["cost_usd"] = round(p["cost_usd"], 6)

    return {
        "period_days":    days,
        "provider":       "apify",
        "total_cost_usd": round(total_cost, 6),
        "total_runs":     total_runs,
        "total_results":  total_results,
        "by_actor":       by_actor,
        "by_platform":    by_platform,
    }


@api_router.get("/usage/apify/clients")
async def apify_usage_by_client(days: int = 30):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}, "client_id": {"$ne": None}}},
        {"$group": {
            "_id": "$client_id",
            "client_name":    {"$first": "$client_name"},
            "total_runs":     {"$sum": 1},
            "total_results":  {"$sum": "$results_count"},
            "total_cost_usd": {"$sum": "$cost_usd"},
        }},
        {"$sort": {"total_cost_usd": -1}},
    ]
    rows = await db.apify_usage.aggregate(pipeline).to_list(None)
    return [
        {
            "client_id":      r["_id"],
            "client_name":    r.get("client_name"),
            "total_runs":     r["total_runs"],
            "total_results":  r["total_results"],
            "total_cost_usd": round(r["total_cost_usd"], 6),
        }
        for r in rows
    ]


@api_router.get("/usage/apify/daily")
async def apify_usage_daily(days: int = 30, client_id: Optional[str] = None):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    match = {"created_at": {"$gte": cutoff}}
    if client_id:
        match["client_id"] = client_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},  # YYYY-MM-DD
            "cost_usd": {"$sum": "$cost_usd"},
            "runs":     {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = await db.apify_usage.aggregate(pipeline).to_list(None)
    return [
        {"date": r["_id"], "runs": r["runs"], "cost_usd": round(r["cost_usd"], 6)}
        for r in rows
    ]


@api_router.get("/usage/apify/log")
async def apify_usage_log(
    page: int = 1,
    limit: int = 50,
    client_id: Optional[str] = None,
    platform: Optional[str] = None,
):
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    if platform:
        query["platform"] = platform

    skip = (page - 1) * limit
    total = await db.apify_usage.count_documents(query)
    items = await db.apify_usage.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    import math
    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": math.ceil(total / limit) if limit else 1,
    }


# ── Google Sheets ─────────────────────────────────────────────────────────────

async def _get_google_refresh_token() -> str:
    """Fetch the stored OAuth2 refresh token from the database."""
    setting = await db.settings.find_one({"key": "google_refresh_token"})
    return setting.get("value", "") if setting else ""


async def _run_full_sync(client_id: str) -> None:
    """Fetch all data for a client and write all 4 sheet tabs. Fire-and-forget safe."""
    try:
        refresh_token = await _get_google_refresh_token()
        client = await db.clients.find_one({"id": client_id})
        if not client:
            return
        gs = client.get("google_sheet", {})
        sheet_id = gs.get("sheet_id")
        if not sheet_id:
            return

        posts = await db.posts.find({"client_id": client_id}).to_list(None)
        competitors = await db.competitors.find({"client_id": client_id}).to_list(None)
        trends = await db.trends.find({"client_id": client_id}).to_list(None)

        await sheets_service.sync_client_info_tab(refresh_token, sheet_id, client)
        await sheets_service.sync_posts_tab(refresh_token, sheet_id, posts)
        await sheets_service.sync_performance_tab(refresh_token, sheet_id, client)
        await sheets_service.sync_competitors_tab(refresh_token, sheet_id, competitors)
        await sheets_service.sync_trends_tab(refresh_token, sheet_id, trends)

        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"google_sheet.last_synced_at": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception as e:
        logging.error(f"[sheets] full sync failed for client {client_id}: {e}")


async def _run_partial_sync(client_id: str, tabs: list) -> None:
    """Sync only the specified tabs for a client. Used by event hooks for targeted updates."""
    try:
        refresh_token = await _get_google_refresh_token()
        if not refresh_token:
            return
        client = await db.clients.find_one({"id": client_id})
        if not client:
            return
        gs = client.get("google_sheet", {})
        sheet_id = gs.get("sheet_id")
        if not sheet_id:
            return

        if "Posts" in tabs:
            posts = await db.posts.find({"client_id": client_id}).to_list(None)
            await sheets_service.sync_posts_tab(refresh_token, sheet_id, posts)
        if "Client Info" in tabs:
            await sheets_service.sync_client_info_tab(refresh_token, sheet_id, client)
        if "Performance" in tabs:
            await sheets_service.sync_performance_tab(refresh_token, sheet_id, client)

        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"google_sheet.last_synced_at": datetime.now(timezone.utc).isoformat()}}
        )
    except Exception as e:
        logging.error(f"[sheets] partial sync ({tabs}) failed for {client_id}: {e}")


async def _trigger_sheet_sync(client_id: str, tabs: list | None = None) -> None:
    """Fire-and-forget: schedule a sheet sync without blocking the caller.
    tabs=None means full sync; tabs=['Posts'] means only Posts tab."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "google_sheet": 1})
    if not client or not (client.get("google_sheet") or {}).get("sheet_id"):
        return
    if tabs is None:
        asyncio.create_task(_run_full_sync(client_id))
    else:
        asyncio.create_task(_run_partial_sync(client_id, tabs))


# ── Google OAuth2 routes (admin one-time setup) ───────────────────────────────

def _google_flow():
    """Build a Flow instance from env credentials."""
    from google_auth_oauthlib.flow import Flow
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(500, "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set in .env")
    redirect_uri = f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/api/auth/google/callback"
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uris": [redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=sheets_service.SCOPES,
    )
    flow.redirect_uri = redirect_uri
    return flow


@api_router.get("/auth/google/start")
async def google_auth_start():
    """Redirect the admin to Google's OAuth consent screen."""
    flow = _google_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    # Store code_verifier keyed by state so the callback can restore it
    if flow.code_verifier:
        await db.settings.update_one(
            {"key": f"google_pkce_{state}"},
            {"$set": {"key": f"google_pkce_{state}", "value": flow.code_verifier}},
            upsert=True,
        )
    return RedirectResponse(auth_url)


@api_router.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str = None):
    """Handle the OAuth2 callback, store the refresh token in the database."""
    flow = _google_flow()

    # Restore code_verifier if PKCE was used
    if state:
        pkce_doc = await db.settings.find_one({"key": f"google_pkce_{state}"})
        if pkce_doc:
            flow.code_verifier = pkce_doc["value"]
            await db.settings.delete_one({"key": f"google_pkce_{state}"})

    flow.fetch_token(code=code)

    refresh_token = flow.credentials.refresh_token
    if not refresh_token:
        raise HTTPException(400, "No refresh token returned. Make sure prompt=consent was set.")

    await db.settings.update_one(
        {"key": "google_refresh_token"},
        {"$set": {"key": "google_refresh_token", "value": refresh_token}},
        upsert=True,
    )
    return HTMLResponse(
        "<h2 style='font-family:sans-serif;padding:2rem'>Google Sheets connected successfully. "
        "You can close this tab.</h2>"
    )


@api_router.get("/auth/google/status")
async def google_auth_status():
    """Check whether Google OAuth is connected."""
    token = await _get_google_refresh_token()
    return {"connected": bool(token)}


# ── Google Sheets client routes ───────────────────────────────────────────────

@api_router.post("/clients/{client_id}/sheet/create")
async def create_client_sheet(client_id: str, body: SheetCreateRequest):
    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        raise HTTPException(400, "Google Sheets not connected. Visit /api/auth/google/start first.")

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    if client.get("google_sheet", {}).get("sheet_id"):
        raise HTTPException(400, "A sheet already exists for this client")

    result = await sheets_service.create_sheet(refresh_token, client["name"], body.share_with_email)

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "google_sheet": {
                "sheet_id": result["sheet_id"],
                "sheet_url": result["sheet_url"],
                "shared_with": body.share_with_email,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_synced_at": None,
            }
        }}
    )

    asyncio.create_task(_run_full_sync(client_id))
    return {"sheet_url": result["sheet_url"]}


@api_router.get("/clients/{client_id}/sheet")
async def get_client_sheet(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    gs = client.get("google_sheet")
    if not gs or not gs.get("sheet_id"):
        return {"connected": False}
    return {
        "connected": True,
        "sheet_url": gs.get("sheet_url"),
        "shared_with": gs.get("shared_with"),
        "last_synced_at": gs.get("last_synced_at"),
    }


@api_router.post("/clients/{client_id}/sheet/sync")
async def sync_client_sheet(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client or not client.get("google_sheet", {}).get("sheet_id"):
        raise HTTPException(404, "No sheet connected for this client")
    asyncio.create_task(_run_full_sync(client_id))
    return {"status": "sync started"}


# ── Drive Clips ───────────────────────────────────────────────────────────────

@api_router.get("/clients/{client_id}/drive-clips")
async def list_drive_clips(client_id: str):
    clips = await db.drive_clips.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("sequence_number", 1).to_list(500)
    return clips


_MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
_MAX_DURATION_SEC = 60.0

@api_router.post("/clients/{client_id}/clips/upload", status_code=201)
async def upload_clip(client_id: str, request: Request, file: UploadFile = File(...)):
    import tempfile, os, storage
    import ffmpeg as _ffmpeg
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Video must be under 100 MB")

    clip_id = str(uuid.uuid4())
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Video must be under 100 MB")

    suffix = "." + (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "mp4")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        loop = asyncio.get_running_loop()
        width = 0
        height = 0
        rotation = 0
        try:
            probe = await loop.run_in_executor(None, _ffmpeg.probe, tmp_path)
            duration = float(probe["format"]["duration"])
            video_stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None)
            if video_stream:
                raw_w = int(video_stream.get("width") or 0)
                raw_h = int(video_stream.get("height") or 0)
                # Phone-shot clips are often stored as landscape pixels + a rotation
                # tag. ffprobe surfaces it as either tags.rotate (string) or
                # side_data_list[].rotation (signed int). Drive's API hides this
                # by returning already-rotated dims, so Drive sync doesn't need it.
                tag_rot = (video_stream.get("tags") or {}).get("rotate")
                if tag_rot is not None:
                    try: rotation = int(tag_rot)
                    except (TypeError, ValueError): pass
                for sd in video_stream.get("side_data_list") or []:
                    r = sd.get("rotation")
                    if r is not None:
                        try: rotation = int(r); break
                        except (TypeError, ValueError): pass
                # Display dims swap when rotation is ±90 / ±270.
                if abs(rotation) % 180 == 90:
                    width, height = raw_h, raw_w
                else:
                    width, height = raw_w, raw_h
        except Exception:
            duration = 0.0
        logger.info(
            f"upload_clip probe: file={file.filename!r} mime={file.content_type!r} "
            f"width={width} height={height} rotation={rotation} duration={duration}"
        )

        if duration > _MAX_DURATION_SEC:
            raise HTTPException(400, f"Video must be 60 seconds or shorter (this clip is {duration:.0f}s)")

        r2_key = f"clips/{client_id}/{clip_id}{suffix}"
        if storage.is_enabled():
            r2_url = storage.upload_file(tmp_path, r2_key, content_type=file.content_type or "video/mp4")
        else:
            raise HTTPException(status_code=503, detail="File storage (R2/S3) is not configured on this server.")
        # Mirror Drive sync schema so video_render_service rotation logic works for uploads.
        clip = {
            "drive_file_id": clip_id,
            "client_id": client_id,
            "name": file.filename or f"clip_{clip_id[:8]}{suffix}",
            "source": "upload",
            "mime_type": file.content_type or "video/mp4",
            "r2_url": r2_url,
            "thumbnail_url": None,
            "duration": duration,
            "width": width,
            "height": height,
            "is_vertical": bool(width and height and height > width),
            "sequence_number": 9999,
            "synced_at": now_iso(),
        }
        await db.drive_clips.insert_one(clip)
        return {k: v for k, v in clip.items() if k != "_id"}
    finally:
        try: os.unlink(tmp_path)
        except: pass


@api_router.get("/clients/{client_id}/clips/presign")
async def presign_clip_upload(client_id: str, filename: str, content_type: str = "video/mp4"):
    """Return a presigned PUT URL so the browser can upload a clip directly to R2."""
    import storage as _storage
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    if not _storage.is_enabled():
        raise HTTPException(503, "File storage (R2/S3) is not configured on this server.")
    suffix = "." + (filename.rsplit(".", 1)[-1] if filename and "." in filename else "mp4")
    clip_id = str(uuid.uuid4())
    key = f"clips/{client_id}/{clip_id}{suffix}"
    try:
        url = _storage.generate_presigned_upload_url(key, content_type)
    except Exception as e:
        raise HTTPException(500, f"Could not generate presigned URL: {e}")
    return {"upload_url": url, "key": key, "clip_id": clip_id}


class ClipRegisterRequest(BaseModel):
    key: str
    clip_id: str
    filename: str
    content_type: str = "video/mp4"
    duration: float = 0.0
    width: int = 0
    height: int = 0
    is_vertical: bool = False

@api_router.post("/clients/{client_id}/clips/register", status_code=201)
async def register_clip(client_id: str, body: ClipRegisterRequest):
    """Save clip metadata after a direct browser → R2 presigned upload."""
    import storage as _storage
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    r2_url = _storage._public_url(body.key)
    clip = {
        "drive_file_id": body.clip_id,
        "client_id": client_id,
        "name": body.filename,
        "source": "upload",
        "mime_type": body.content_type,
        "r2_url": r2_url,
        "thumbnail_url": None,
        "duration": body.duration,
        "width": body.width,
        "height": body.height,
        "is_vertical": body.is_vertical,
        "sequence_number": 9999,
        "synced_at": now_iso(),
    }
    await db.drive_clips.insert_one(clip)
    return {k: v for k, v in clip.items() if k != "_id"}


class ClearClipCacheRequest(BaseModel):
    dry_run: bool = True

@api_router.post("/admin/clips/clear-r2-cache")
async def clear_clip_r2_cache(request: Request, body: ClearClipCacheRequest):
    """One-time migration: clear r2_url from drive-synced clips so they
    get re-staged to R2 on next render. Does NOT touch uploaded clips.
    Use dry_run=true first to preview what will be cleared."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not _check_token(auth[7:]):
        raise HTTPException(401, "Not authenticated")

    drive_clips = await db.drive_clips.find(
        {"source": {"$ne": "upload"}, "r2_url": {"$exists": True}}
    ).to_list(1000)
    cache_clips = await db.clip_cache.find(
        {"r2_url": {"$exists": True}}
    ).to_list(1000)

    preview = {
        "drive_clips_to_clear": [
            {"name": c.get("name"), "r2_url": c.get("r2_url"), "client_id": c.get("client_id")}
            for c in drive_clips
        ],
        "clip_cache_to_clear": len(cache_clips),
        "dry_run": body.dry_run,
    }

    if body.dry_run:
        return preview

    await db.drive_clips.update_many(
        {"source": {"$ne": "upload"}},
        {"$unset": {"r2_url": ""}},
    )
    await db.clip_cache.update_many({}, {"$unset": {"r2_url": ""}})
    return {**preview, "dry_run": False, "status": "cleared"}


class DriveSyncRequest(BaseModel):
    folder_id: Optional[str] = None

@api_router.post("/clients/{client_id}/drive-clips/sync")
async def sync_drive_clips(client_id: str, body: DriveSyncRequest = DriveSyncRequest()):
    from google_drive_service import list_clips, extract_folder_id
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    raw_folder = body.folder_id or client.get("drive_folder_id")
    if not raw_folder:
        raise HTTPException(status_code=400, detail="No Drive folder configured for this client")
    folder_id = extract_folder_id(raw_folder)
    if not folder_id:
        raise HTTPException(status_code=400, detail=f"Could not parse a folder ID from: {raw_folder!r}")

    refresh_token = await _get_google_refresh_token()
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Google account not connected. Visit /api/auth/google/start to connect.")

    loop = asyncio.get_event_loop()
    try:
        clips = await loop.run_in_executor(None, list_clips, refresh_token, folder_id)
    except Exception as exc:
        logging.error(f"[drive-clips] list_clips failed for folder {folder_id}: {exc}")
        raise HTTPException(status_code=502, detail=f"Drive API error: {exc}")

    now = now_iso()
    current_ids = [clip["drive_file_id"] for clip in clips]

    # Remove clips that are no longer in the Drive folder
    await db.drive_clips.delete_many({
        "client_id": client_id,
        "drive_file_id": {"$nin": current_ids},
    })

    for clip in clips:
        await db.drive_clips.update_one(
            {"client_id": client_id, "drive_file_id": clip["drive_file_id"]},
            {"$set": {**clip, "client_id": client_id, "synced_at": now}},
            upsert=True,
        )
    return {"synced": len(clips)}


@api_router.get("/clients/{client_id}/clips/{clip_id}/stream")
async def stream_clip(client_id: str, clip_id: str, request: Request):
    """Stream a Drive clip through the backend (supports Range for seeking)."""
    from fastapi.responses import StreamingResponse
    clip = await db.drive_clips.find_one({"client_id": client_id, "drive_file_id": clip_id})
    if not clip:
        raise HTTPException(404, "Clip not found")

    if clip.get("r2_url"):
        return RedirectResponse(clip["r2_url"])

    setting = await db.settings.find_one({"key": "google_refresh_token"})
    if not setting or not setting.get("value"):
        raise HTTPException(400, "No Google account connected")

    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    creds = Credentials(
        token=None,
        refresh_token=setting["value"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    creds.refresh(GoogleRequest())

    drive_url = f"https://www.googleapis.com/drive/v3/files/{clip_id}?alt=media"
    headers = {"Authorization": f"Bearer {creds.token}"}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    async def _stream():
        async with httpx.AsyncClient(timeout=120) as client_http:
            async with client_http.stream("GET", drive_url, headers=headers) as resp:
                async for chunk in resp.aiter_bytes(65536):
                    yield chunk

    async with httpx.AsyncClient(timeout=10) as probe:
        head = await probe.head(drive_url, headers=headers)

    status = 206 if range_header and head.status_code in (200, 206) else 200
    resp_headers = {
        "Content-Type": clip.get("mime_type", "video/mp4"),
        "Accept-Ranges": "bytes",
    }
    for h in ("Content-Range", "Content-Length"):
        if h in head.headers:
            resp_headers[h] = head.headers[h]

    return StreamingResponse(_stream(), status_code=status, headers=resp_headers)


async def _run_video_recurring(client_id: str):
    """APScheduler fires this. Creates a video post in 'rendering' state and enqueues a render."""
    from video_worker import enqueue_video_job

    client = await db.clients.find_one({"id": client_id})
    if not client:
        return
    schedule = client.get("video_recurring_schedule")
    if not schedule or not schedule.get("enabled"):
        return

    template_id = schedule.get("template_id")
    if not template_id:
        await add_log("warning", "Recurring video schedule has no template_id", client_id=client_id)
        return
    template = await db.shotstack_templates.find_one({"id": template_id, "status": "active"})
    if not template:
        await add_log("warning", f"Recurring video template {template_id} not active", client_id=client_id)
        return

    clips = await db.drive_clips.find({"client_id": client_id}).to_list(500)
    if not clips:
        await add_log("warning", "No Drive clips for recurring video job", client_id=client_id)
        return

    clip_slots = [f for f in template.get("merge_fields", []) if f.get("role") == "clip"]
    seq_mode = client.get("video_sequence_mode", "sequential")
    seq_idx = client.get("video_sequence_index", 0)
    picked = []
    for i in range(len(clip_slots)):
        if seq_mode == "random":
            import random
            picked.append(random.choice(clips)["drive_file_id"])
        else:
            picked.append(clips[(seq_idx + i) % len(clips)]["drive_file_id"])

    lead_min = int(schedule.get("min_render_lead_minutes", 30))
    scheduled_at = (datetime.now(timezone.utc) + timedelta(minutes=lead_min)).isoformat()

    post_doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": client.get("name", ""),
        "kind": "video",
        "platform": (schedule.get("platforms") or client.get("platforms") or ["instagram"])[0],
        "target_platforms": schedule.get("platforms") or client.get("platforms", []),
        "template_id": template["id"],
        "scheduled_at": scheduled_at,
        "status": "rendering",
        "music_url": schedule.get("music_url"),
        "clip_drive_ids": picked,
        "topic": schedule.get("topic"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(post_doc)
    if seq_mode == "sequential":
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"video_sequence_index": (seq_idx + len(picked)) % max(1, len(clips))}},
        )
    task_id = enqueue_video_job(post_doc["id"], priority=schedule.get("priority", "normal"))
    await add_log("info", f"Recurring video render enqueued (task {task_id})", client_id=client_id)


class CTAGenerateRequest(BaseModel):
    client_id: str
    vibe: Optional[str] = None        # e.g. "urgent", "friendly", "luxury"

@api_router.post("/videos/generate-cta-text")
async def generate_cta_text(req: CTAGenerateRequest):
    """Generate CTA text label + button text variants via AI."""
    client = await db.clients.find_one({"id": req.client_id})
    if not client:
        raise HTTPException(404, "Client not found")

    niche = client.get("niche") or client.get("industry") or "brand"
    vibe_hint = f" Tone: {req.vibe}." if req.vibe else ""
    prompt = (
        f"You are writing short CTA copy for a {niche} social media video.{vibe_hint}\n"
        f"Return a JSON object with exactly these keys:\n"
        f"- text_variants: array of 3 short CTA text labels (max 5 words each, e.g. 'Link in bio', 'Shop the look')\n"
        f"- button_variants: array of 3 short button texts (max 4 words, ALL CAPS, e.g. 'SHOP NOW', 'GET 50% OFF')\n"
        f"Return ONLY valid JSON, no explanation."
    )
    import anthropic as _anthropic, json as _json
    from usage_service import record_usage as _record_usage
    _ac = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    msg = _ac.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    await _record_usage(db, msg, generation_type="cta_text",
                        client_id=req.client_id, client_name=client.get("name"))
    raw = msg.content[0].text.strip()
    try:
        data = _json.loads(raw)
    except Exception:
        import re as _re
        m = _re.search(r"\{.*\}", raw, _re.DOTALL)
        data = _json.loads(m.group()) if m else {}
    return {
        "text_variants": data.get("text_variants", ["Link in bio", "Shop the look", "Visit our site"]),
        "button_variants": data.get("button_variants", ["SHOP NOW", "GET STARTED", "LEARN MORE"]),
    }


@api_router.post("/videos/create", status_code=201)
async def create_video_post_route(req: VideoCreateRequest):
    template = await db.shotstack_templates.find_one({"id": req.template_id, "status": "active"})
    if not template:
        raise HTTPException(400, f"Template {req.template_id} not found or not active")

    client = await db.clients.find_one({"id": req.client_id})
    if not client:
        raise HTTPException(404, "Client not found")

    pipeline = None
    if req.pipeline_id:
        pipeline = await db.pipelines.find_one({"id": req.pipeline_id})

    scheduled_at = req.scheduled_at or (
        datetime.now(timezone.utc) + timedelta(minutes=5)
    ).isoformat()

    post_doc = {
        "id": str(uuid.uuid4()),
        "client_id": req.client_id,
        "client_name": client.get("name", ""),
        "pipeline_id": req.pipeline_id,
        "kind": "video",
        "platform": (client.get("platforms") or ["instagram"])[0],
        "target_platforms": client.get("platforms") or ["instagram"],
        "template_id": template["id"],
        "scheduled_at": scheduled_at,
        "status": "rendering",
        "music_url": req.music_url,
        "clip_drive_ids": req.clip_drive_ids or [],
        "ai_text_overrides": req.ai_text_overrides or {},
        "generated_merge_values": req.generated_merge_values or {},
        "caption": req.caption or "",
        "hashtags": req.hashtags or [],
        "prompt": req.prompt,
        "filter_name": req.filter_name,
        "topic": req.prompt or (pipeline or {}).get("topic") if pipeline else req.prompt,
        "instagram_thumbnail_offset_ms": (
            req.instagram_thumbnail_offset_ms
            if req.instagram_thumbnail_offset_ms is not None
            else (pipeline or {}).get("instagram_thumbnail_offset_ms", 4000)
        ),
        "also_post_story": req.also_post_story if req.also_post_story is not None else True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(post_doc)

    async def _run_render(post_id: str):
        import shotstack_service
        from video_render_service import submit_render_for_post, mirror_to_r2, handoff_to_bundle
        try:
            _post = await db.posts.find_one({"id": post_id})
            _pipeline = None
            if _post.get("pipeline_id"):
                _pipeline = await db.pipelines.find_one({"id": _post["pipeline_id"]})
            render_job = await submit_render_for_post(
                db=db, post=_post,
                clip_drive_ids=_post.get("clip_drive_ids") or [],
                music_url=_post.get("music_url"),
                pipeline=_pipeline,
            )
            ss_render_id = render_job.get("shotstack_render_id")
            if not ss_render_id:
                return
            import asyncio as _aio
            for _ in range(72):
                await _aio.sleep(5)
                try:
                    resp = await shotstack_service.poll_render(ss_render_id)
                except Exception:
                    continue
                _status = resp.get("status")
                _now = datetime.now(timezone.utc).isoformat()
                if _status == "done":
                    r2_video, r2_snap = await mirror_to_r2(
                        resp.get("url"), None,
                        render_job["client_id"], ss_render_id,
                    )
                    await db.render_jobs.update_one(
                        {"id": render_job["id"]},
                        {"$set": {"status": "succeeded", "completed_at": _now,
                                  "output_url": resp.get("url"), "r2_video_url": r2_video,
                                  "r2_snapshot_url": r2_snap}},
                    )
                    _client = await db.clients.find_one({"id": render_job["client_id"]}) or {}
                    _post = await db.posts.find_one({"id": post_id})
                    if _client.get("auto_approve"):
                        await handoff_to_bundle(db, _post, r2_video, r2_snap)
                    else:
                        await db.posts.update_one(
                            {"id": post_id},
                            {"$set": {"status": "succeeded",
                                      "r2_video_url": r2_video,
                                      "r2_snapshot_url": r2_snap}},
                        )
                    return
                elif _status == "failed":
                    error = resp.get("error") or "render failed"
                    await db.render_jobs.update_one(
                        {"id": render_job["id"]},
                        {"$set": {"status": "failed", "completed_at": _now, "error": error}},
                    )
                    await db.posts.update_one(
                        {"id": post_id},
                        {"$set": {"status": "failed_render", "error_message": error}},
                    )
                    return
        except Exception as _e:
            # Full traceback to the log so we can see WHERE the crash happened,
            # not just the bare exception message. Especially important for
            # generic AttributeError like "'str' object has no attribute 'get'".
            logging.exception(f"_run_render failed for {post_id}")
            await db.posts.update_one(
                {"id": post_id},
                {"$set": {"status": "failed_render", "error_message": f"{type(_e).__name__}: {_e}"}},
            )

    import asyncio
    asyncio.create_task(_run_render(post_doc["id"]))
    return {"task_id": post_doc["id"], "post_id": post_doc["id"], "status": "rendering"}


@api_router.post("/videos/generate-text")
async def generate_video_text_route(req: VideoGenerateTextRequest):
    template = await db.shotstack_templates.find_one({"id": req.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(404, "Template not found")
    client = await db.clients.find_one({"id": req.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from video_render_service import generate_ai_text
    ai_text_fields = [f for f in template.get("merge_fields", []) if f.get("role") == "ai_text"]
    if not ai_text_fields:
        return {}
    topic = req.topic or client.get("name", "")
    return await generate_ai_text(ai_text_fields, client, topic, db=db)


@api_router.post("/videos/generate-content")
async def generate_video_content_route(req: VideoGenerateContentRequest):
    """Generate merge field values + caption + hashtags from a user prompt."""
    template = await db.shotstack_templates.find_one({"id": req.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(404, "Template not found")
    client = await db.clients.find_one({"id": req.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from video_render_service import generate_video_content
    ai_text_fields = [f for f in template.get("merge_fields", []) if f.get("role") == "ai_text"]
    return await generate_video_content(req.prompt, client, ai_text_fields, db=db)


class GenerateVideoHookRequest(BaseModel):
    keyword: Optional[str] = ""  # optional seed; AI invents on-strategy if empty


@api_router.post("/clients/{client_id}/generate-video-hook")
async def generate_video_hook_route(client_id: str, req: GenerateVideoHookRequest):
    """Use Claude to draft a reusable video hook {title, prompt} for this client.
    Pulls in client.strategy (themes, tone, topics_include/exclude) automatically."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from video_render_service import generate_video_hook
    try:
        return await generate_video_hook(client, req.keyword or "", db=db)
    except Exception as e:
        logger.exception("generate_video_hook failed")
        raise HTTPException(500, f"Generation failed: {e}")


@api_router.get("/videos/job/{task_id}")
async def get_video_job_status(task_id: str):
    """Check Celery task status."""
    try:
        from celery.result import AsyncResult
        from video_worker import celery_app
        result = AsyncResult(task_id, app=celery_app)
        return {
            "task_id": task_id,
            "status": result.state,
            "result": result.result if result.state == "SUCCESS" else None,
            "error": str(result.result) if result.state == "FAILURE" else None,
        }
    except Exception as e:
        return {"task_id": task_id, "status": "UNKNOWN", "error": str(e)}




@api_router.post("/clients/{client_id}/video-schedule")
async def set_video_schedule(client_id: str, data: VideoScheduleCreate):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    schedule_doc = {
        "cron": data.cron,
        "platforms": data.platforms,
        "template_id": data.template_id,
        "priority": data.priority,
        "enabled": True,
    }
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"video_recurring_schedule": schedule_doc}}
    )

    job_id = f"video_recurring_{client_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    from apscheduler.triggers.cron import CronTrigger
    parts = data.cron.split()
    if len(parts) != 5:
        raise HTTPException(status_code=400, detail="cron must have exactly 5 fields (e.g. '0 9 * * *')")
    trigger = CronTrigger(
        minute=parts[0], hour=parts[1],
        day=parts[2], month=parts[3], day_of_week=parts[4]
    )
    scheduler.add_job(
        _run_video_recurring,
        trigger=trigger,
        id=job_id,
        args=[client_id],
        replace_existing=True,
    )
    await add_log("info", f"Video recurring schedule set: {data.cron}", client_id=client_id)
    return {"status": "scheduled", "cron": data.cron}


@api_router.delete("/clients/{client_id}/video-schedule")
async def delete_video_schedule(client_id: str):
    job_id = f"video_recurring_{client_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"video_recurring_schedule": None}}
    )
    return {"status": "removed"}


@api_router.get("/video-schedule/slots")
async def get_schedule_slots():
    """Return job count per hour for stagger suggestions."""
    pipeline = [
        {"$match": {"video_recurring_schedule": {"$ne": None}}},
        {"$project": {"cron_hour": {"$arrayElemAt": [{"$split": ["$video_recurring_schedule.cron", " "]}, 1]}}},
        {"$group": {"_id": "$cron_hour", "count": {"$sum": 1}}},
    ]
    results = await db.clients.aggregate(pipeline).to_list(24)
    return {r["_id"]: r["count"] for r in results}


# ─── Mail ────────────────────────────────────────────────────────────────────

@api_router.post("/clients/{client_id}/complete-onboarding")
async def complete_onboarding(client_id: str, data: OnboardingCompleteRequest, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    now = datetime.now(timezone.utc)
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"onboarding_completed": True, "onboarding_completed_at": now.isoformat()}}
    )
    send_at = (now + timedelta(hours=2)).isoformat()
    doc = {
        "type": "strategy_onboarding", "client_id": client_id,
        "to": data.to, "cc": data.cc or [], "reply_to": data.reply_to,
        "subject": data.subject, "html": data.html,
        "scheduled_at": send_at, "status": "pending",
        "created_by": token_data.get("user_id") or "owner",
        "created_at": now.isoformat(),
        "sent_at": None, "resend_id": None, "delivery_status": None, "error": None,
    }
    await db.scheduled_emails.insert_one(doc)
    return {"ok": True, "scheduled_at": send_at}


@api_router.post("/mail/send")
async def mail_send(data: MailSendRequest, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    try:
        resend_id = mail_service.send_email(
            to=data.to, subject=data.subject, html=data.html,
            cc=data.cc, reply_to=data.reply_to,
        )
    except Exception as e:
        await db.email_logs.insert_one({
            "type": data.type, "client_id": data.client_id, "to": data.to,
            "cc": data.cc or [], "subject": data.subject, "resend_id": None,
            "status": "failed", "delivery_status": None,
            "sent_by": token_data.get("user_id") or "owner",
            "sent_at": datetime.now(timezone.utc).isoformat(), "error": str(e),
        })
        raise HTTPException(502, f"Resend error: {e}")
    await db.email_logs.insert_one({
        "type": data.type, "client_id": data.client_id, "to": data.to,
        "cc": data.cc or [], "subject": data.subject, "resend_id": resend_id,
        "status": "sent", "delivery_status": "queued",
        "sent_by": token_data.get("user_id") or "owner",
        "sent_at": datetime.now(timezone.utc).isoformat(), "error": None,
    })
    return {"ok": True, "resend_id": resend_id}


@api_router.post("/mail/schedule")
async def mail_schedule(data: MailScheduleRequest, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    doc = {
        "type": data.type, "client_id": data.client_id,
        "to": data.to, "cc": data.cc or [], "reply_to": data.reply_to,
        "subject": data.subject, "html": data.html,
        "scheduled_at": data.scheduled_at, "status": "pending",
        "created_by": token_data.get("user_id") or "owner",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": None, "resend_id": None, "delivery_status": None, "error": None,
    }
    result = await db.scheduled_emails.insert_one(doc)
    return {"ok": True, "id": str(result.inserted_id)}


@api_router.get("/mail/scheduled")
async def mail_list_scheduled(request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    docs = await db.scheduled_emails.find({"status": "pending"}).sort("scheduled_at", 1).to_list(200)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


@api_router.delete("/mail/scheduled/{email_id}")
async def mail_cancel_scheduled(email_id: str, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    result = await db.scheduled_emails.delete_one({"_id": ObjectId(email_id), "status": "pending"})
    if result.deleted_count == 0:
        raise HTTPException(404, "Not found or already sent")
    return {"ok": True}


@api_router.get("/mail/next-invoice-number")
async def next_invoice_number(request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    start_str = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    if month == 12:
        end_str = datetime(year + 1, 1, 1, tzinfo=timezone.utc).isoformat()
    else:
        end_str = datetime(year, month + 1, 1, tzinfo=timezone.utc).isoformat()
    count = await db.email_logs.count_documents({
        "type": "invoice",
        "sent_at": {"$gte": start_str, "$lt": end_str}
    })
    ym = f"{year}{str(month).zfill(2)}"
    return {"invoice_number": f"SC-{ym}-{str(count + 1).zfill(3)}"}


@api_router.post("/mail/audit/ai-generate")
async def audit_ai_generate(request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    body = await request.json()
    client_id = body.get("client_id", "")
    existing = body.get("fields", {})

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")

    ob = client.get("onboarding_data") or {}
    strategy = client.get("strategy") or {}

    # ── Collect everything ────────────────────────────────────────────────
    def _f(v): return str(v).strip() if v else ""

    name              = _f(client.get("name"))
    ig_handle         = _f(ob.get("instagram_handle")) or existing.get("instagramHandle", "")
    niche             = _f(ob.get("niche")) or existing.get("niche", "")
    brand_voice       = _f(client.get("brand_voice"))
    brand_vibe        = _f(ob.get("brand_vibe"))
    account_goals     = _f(ob.get("account_goals"))
    problem_solved    = _f(ob.get("problem_solved"))
    business_desc     = _f(ob.get("business_description"))
    personal_story    = _f(ob.get("personal_story"))
    industry_label    = _f(ob.get("industry_label"))
    signature_topic   = _f(ob.get("signature_topic"))
    daily_life        = _f(ob.get("daily_life"))

    # Audience
    target_aud        = _f(ob.get("target_audience_description")) or _f(client.get("target_audience")) or existing.get("targetAudience","")
    aud_age           = _f(ob.get("audience_age_range"))
    aud_emotion       = _f(ob.get("audience_emotional_state"))
    aud_problems      = _f(ob.get("audience_problems"))
    aud_desires       = _f(ob.get("audience_desires"))
    aud_myths         = _f(ob.get("audience_myths"))
    aud_failed        = _f(ob.get("audience_failed_attempts"))
    solutions         = _f(ob.get("solutions_provided"))
    usps              = _f(ob.get("unique_selling_points"))
    freq_questions    = _f(ob.get("frequent_questions"))
    love_topics       = _f(ob.get("love_topics"))
    case1             = _f(ob.get("case_study_1"))
    case2             = _f(ob.get("case_study_2"))

    # Niche
    niche_working     = _f(ob.get("niche_working_topics"))
    niche_oversat     = _f(ob.get("niche_oversaturated_topics"))
    niche_under       = _f(ob.get("niche_underserved_topics"))
    disliked          = _f(ob.get("disliked_content"))
    not_to_do         = _f(ob.get("not_to_do_list"))
    next_step         = _f(ob.get("next_step_after_view"))
    bio_template      = _f(ob.get("bio_template"))

    # Strategy
    pillars           = strategy.get("themes") or []
    hashtags          = strategy.get("hashtags") or []
    video_hooks       = strategy.get("video_hooks") or []

    # Competitor accounts (may be list or comma-string)
    _raw_comps = ob.get("competitor_accounts") or []
    if isinstance(_raw_comps, str):
        _raw_comps = [c.strip() for c in _raw_comps.split(",") if c.strip()]
    comp_accounts     = [str(h) for h in _raw_comps if h]
    scraped_comps     = await db.competitors.find({"client_id": client_id, "is_active": True}, {"_id": 0}).to_list(10)

    # Analytics (from existing fields already auto-filled, or from monthly-report)
    analytics_data = {}
    try:
        r = await analytics_monthly_report(client_id)
        posts = r.get("posts", 0) or 0
        likes = r.get("likes", 0) or 0
        comments = r.get("comments", 0) or 0
        analytics_data = {
            "followers":       r.get("followers", 0),
            "following":       r.get("following", 0),
            "engagement_rate": r.get("engagement_rate", 0),
            "total_posts":     posts,
            "impressions":     r.get("impressions", 0),
            "impressions_unique": r.get("impressions_unique", 0),
            "avg_likes":       round(likes / posts, 1) if posts else 0,
            "avg_comments":    round(comments / posts, 1) if posts else 0,
        }
    except Exception:
        analytics_data = {k: existing.get(k, "") for k in ("avgEngagementRate","totalPosts","avgLikes","avgComments","avgReach")}

    # Build competitor section
    all_comp_handles = list({h.lstrip("@") for h in (comp_accounts + [c.get("handle","").lstrip("@") for c in scraped_comps])})[:3]
    comp_block = "\n".join([f"  Competitor {i+1}: @{h}" for i, h in enumerate(all_comp_handles)]) or "  Not provided"

    def _section(title, val):
        return f"  {title}: {val}\n" if val else ""

    profile_block = (
        f"  Name: {name}\n"
        f"  Instagram: @{ig_handle}\n"
        + _section("Niche", niche)
        + _section("Industry", industry_label)
        + _section("Brand Voice", brand_voice)
        + _section("Brand Vibe", brand_vibe)
        + _section("Account Goals", account_goals)
        + _section("Problem Solved", problem_solved)
        + _section("Business Description", business_desc)
        + _section("Personal Story", personal_story[:300] if personal_story else "")
        + _section("Signature Topic", signature_topic)
        + _section("Daily Life Content", daily_life)
        + _section("Bio Template", bio_template)
    )
    audience_block = (
        _section("Description", target_aud)
        + _section("Age Range", aud_age)
        + _section("Emotional State", aud_emotion)
        + _section("Core Problems", aud_problems)
        + _section("Desires", aud_desires)
        + _section("Myths/Misconceptions", aud_myths)
        + _section("Failed Attempts", aud_failed)
        + _section("Solutions We Provide", solutions)
        + _section("Unique Selling Points", usps)
        + _section("Frequent Questions", freq_questions)
        + _section("Topics They Love", love_topics)
        + _section("Case Study 1", case1[:200] if case1 else "")
        + _section("Case Study 2", case2[:200] if case2 else "")
    )
    niche_block = (
        _section("Working Topics", niche_working)
        + _section("Oversaturated Topics", niche_oversat)
        + _section("Underserved Topics", niche_under)
        + _section("Disliked Content", disliked)
        + _section("Not To Do", not_to_do)
        + _section("Next Step After Viewing", next_step)
    )
    strategy_block = (
        _section("Content Pillars", ", ".join(pillars[:6]) if pillars else "")
        + _section("Hashtag Groups", str(hashtags[:3]) if hashtags else "")
        + _section("Video Hooks", "; ".join(video_hooks[:3]) if video_hooks else "")
    )
    analytics_block = "\n".join([f"  {k}: {v}" for k, v in analytics_data.items() if v])

    prompt = f"""You are an Instagram growth strategist. Generate a short, punchy, carousel-focused audit. No long explanations — bullet points only, max 6 words per point.

=== CLIENT PROFILE ===
{profile_block}
=== TARGET AUDIENCE ===
{audience_block}
=== NICHE INTELLIGENCE ===
{niche_block}
=== CONTENT STRATEGY ===
{strategy_block}
=== COMPETITORS ===
{comp_block}
=== CURRENT ANALYTICS ===
{analytics_block}

Return ONLY a valid JSON object with EXACTLY these keys. Be specific to this client. No filler.

- "targetAudience": 1 short line (who they are + pain point)
- "marketNotes": 3 bullet points \\n separated, each max 8 words, on niche opportunity
- "contentTrends": 3 bullet points \\n separated, what's working on Instagram in this niche right now — carousel-first
- "tam": TAM estimate, e.g. "₹500Cr India coaching market"
- "comp1Handle": @handle competitor 1
- "comp2Handle": @handle competitor 2
- "comp3Handle": @handle competitor 3
- "comp1Followers": e.g. "42,000"
- "comp2Followers": e.g. "18,000"
- "comp3Followers": e.g. "31,000"
- "comp1Working": 1 short line on what works for them
- "comp2Working": 1 short line
- "comp3Working": 1 short line
- "comp1Gap": 1 short line on their weakness
- "comp2Gap": 1 short line
- "comp3Gap": 1 short line
- "pillar1Topic": 3-4 word topic name
- "pillar2Topic": 3-4 word topic name
- "pillar3Topic": 3-4 word topic name
- "pillar4Topic": 3-4 word topic name
- "pillar1Format": prefer Carousel unless Reels clearly fits better
- "pillar2Format": prefer Carousel unless Reels clearly fits better
- "pillar3Format": prefer Carousel unless Reels clearly fits better
- "pillar4Format": prefer Carousel unless Reels clearly fits better
- "month1Items": 3 action items \\n separated, max 7 words each, carousel-focused
- "month2Items": 3 action items \\n separated
- "month3Items": 3 action items \\n separated
- "month4Items": 3 action items \\n separated
- "strengths": 3 bullet points \\n separated, max 6 words each
- "weaknesses": 3 bullet points \\n separated, max 6 words each
- "opportunities": 3 bullet points \\n separated, max 6 words each
- "threats": 3 bullet points \\n separated, max 6 words each
- "profilePhotoRating": 1 short line
- "bioRating": 1 short line
- "highlightsRating": 1 short line
- "contentConsistencyRating": 1 short line
- "avgSaves": number string only, e.g. "8"

Return ONLY valid JSON. No markdown. No explanation."""

    import anthropic as _anthropic, json as _json, re as _re
    from usage_service import record_usage as _record_usage
    try:
        _ac = _anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
        msg = await _ac.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
    except Exception as e:
        raise HTTPException(500, f"Claude API error: {e}")
    await _record_usage(db, msg, generation_type="competitor_profile", client_id=client_id)
    try:
        data = _json.loads(raw)
    except Exception:
        m = _re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", raw, _re.DOTALL)
        if not m:
            m = _re.search(r"\{.*\}", raw, _re.DOTALL)
        try:
            data = _json.loads(m.group()) if m else {}
        except Exception:
            raise HTTPException(500, f"Claude returned non-JSON: {raw[:200]}")
    return data


@api_router.get("/mail/history")
async def mail_history(request: Request, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200)):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    skip = (page - 1) * limit
    docs = await db.email_logs.find().sort("sent_at", -1).skip(skip).limit(limit).to_list(limit)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


@api_router.get("/clients/{client_id}/emails")
async def client_email_log(client_id: str, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    docs = await db.email_logs.find({"client_id": client_id}).sort("sent_at", -1).to_list(100)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


@api_router.post("/mail/bulk-report")
async def mail_bulk_report(data: BulkReportRequest, request: Request):
    token_data = _decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if not token_data:
        raise HTTPException(401, "Unauthorized")
    clients = await db.clients.find({"onboarding_data.email": {"$exists": True, "$ne": ""}}).to_list(500)
    sent, failed, errors = 0, 0, []
    now = datetime.now(timezone.utc).isoformat()
    for client in clients:
        email_addr = client.get("onboarding_data", {}).get("email", "")
        if not email_addr:
            continue
        client_name = client.get("name", "Client")
        post_count = await db.posts.count_documents({"client_id": str(client["_id"]), "status": "published"})
        subject = f"Monthly Report — {data.period} | {client_name}"
        html = (
            f'<html><body style="font-family:sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">'
            f'<h1 style="font-size:22px;margin-bottom:8px">Monthly Report — {data.period}</h1>'
            f'<p style="color:#555;margin-bottom:24px">{client_name}</p>'
            f'<table style="width:100%;border-collapse:collapse">'
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555">Posts published</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600">{post_count}</td></tr>'
            f'</table>'
            f'<p style="margin-top:24px;color:#555;font-size:13px">Automated monthly report from Sleeping Creators.</p>'
            f'</body></html>'
        )
        try:
            resend_id = mail_service.send_email(to=email_addr, subject=subject, html=html)
            await db.email_logs.insert_one({
                "type": "report", "client_id": str(client["_id"]), "to": email_addr,
                "cc": [], "subject": subject, "resend_id": resend_id,
                "status": "sent", "delivery_status": "queued",
                "sent_by": token_data.get("user_id") or "owner",
                "sent_at": now, "error": None,
            })
            sent += 1
        except Exception as e:
            failed += 1
            errors.append({"client": client_name, "error": str(e)})
            await db.email_logs.insert_one({
                "type": "report", "client_id": str(client["_id"]), "to": email_addr,
                "cc": [], "subject": subject, "resend_id": None,
                "status": "failed", "delivery_status": None,
                "sent_by": token_data.get("user_id") or "owner",
                "sent_at": now, "error": str(e),
            })
    return {"ok": True, "sent": sent, "failed": failed, "errors": errors}


@api_router.post("/mail/webhook/resend")
async def mail_webhook(request: Request):
    svix_id = request.headers.get("svix-id", "")
    svix_ts = request.headers.get("svix-timestamp", "")
    svix_sig = request.headers.get("svix-signature", "")
    raw_body = await request.body()
    if not mail_service.verify_webhook_signature(svix_id, svix_ts, svix_sig, raw_body):
        raise HTTPException(401, "Invalid webhook signature")
    import json as _json
    event = _json.loads(raw_body)
    event_type = event.get("type", "")
    resend_id = event.get("data", {}).get("email_id", "")
    delivery_map = {"email.delivered": "delivered", "email.opened": "opened", "email.bounced": "bounced"}
    delivery_status = delivery_map.get(event_type)
    if delivery_status and resend_id:
        await db.email_logs.update_one({"resend_id": resend_id}, {"$set": {"delivery_status": delivery_status}})
        await db.scheduled_emails.update_one({"resend_id": resend_id}, {"$set": {"delivery_status": delivery_status}})
    return {"ok": True}


app.include_router(api_router)

_NEXT_STEP_NORMALIZE = {
    "dm you": "dm", "dms": "dm", "dm": "dm",
    "click a link": "link", "visit link": "link", "link": "link",
    "book a call": "call", "book call": "call", "call": "call",
    "enrol directly": "enrol", "enrol now": "enrol", "enrol": "enrol",
    "other": "other",
}

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
    # Normalize next_step_after_view to the short-key format used by the dashboard
    raw_next_step = (cd.next_step_after_view or "").strip().lower()
    cd.next_step_after_view = _NEXT_STEP_NORMALIZE.get(raw_next_step, cd.next_step_after_view)

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
        pr_links=cd.pr_links,
        profile_photo_link=cd.profile_photo_link,
        logo_link=cd.logo_link,
        google_drive_images=cd.google_drive_images,
        google_drive_videos=cd.google_drive_videos,
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
        platforms=["instagram"],
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

import json as _json

@app.post("/webhooks/bundle", include_in_schema=False)
async def bundle_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-signature", "")
    settings = await db.settings.find_one({"key": "global"}, {"_id": 0}) or {}
    secret = settings.get("bundle_webhook_secret", "")

    if secret and not bundle_service.verify_webhook_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = _json.loads(raw_body)
    except Exception:
        return {"ok": True}

    event_type = event.get("type")
    data = event.get("data", {})
    bundle_post_id = data.get("id")

    if not bundle_post_id:
        return {"ok": True}

    if event_type == "post.published":
        # Atomic: flip ONLY if not already published. modified_count==1 means
        # this is a real first-time publish, so it's safe to increment the
        # client's counters. Guards against duplicate webhook deliveries.
        result = await db.posts.update_one(
            {"platform_post_id": bundle_post_id, "status": {"$ne": "published"}},
            {"$set": {
                "status": "published",
                "published_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }}
        )
        if result.modified_count:
            post = await db.posts.find_one(
                {"platform_post_id": bundle_post_id},
                {"client_id": 1, "_id": 0},
            )
            if post and post.get("client_id"):
                await db.clients.update_one(
                    {"id": post["client_id"]},
                    {"$inc": {"posts_today": 1, "posts_total": 1},
                     "$set": {"last_post_at": now_iso()}},
                )
    elif event_type == "post.failed":
        error_msg = data.get("errorMessage") or data.get("userFacingMessage") or "Bundle publish failed"
        await db.posts.update_one(
            {"platform_post_id": bundle_post_id},
            {"$set": {
                "status": "failed",
                "error_message": error_msg,
                "updated_at": datetime.utcnow().isoformat(),
            }}
        )

    return {"ok": True}

@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        "User-agent: *\nDisallow:\n\nUser-agent: facebookexternalhit\nAllow: /\n"
    )

# Serve exported carousel PNGs as public static files at /api/static/...
_static_root = Path(__file__).parent / "static"
_static_root.mkdir(parents=True, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=str(_static_root)), name="static")

# ── Serve React frontend (production build) ───────────────────────────────────
_frontend_build = Path(__file__).parent / "static" / "frontend"
if _frontend_build.exists():
    from fastapi.responses import FileResponse as _FileResponse

    app.mount(
        "/static",
        StaticFiles(directory=str(_frontend_build / "static")),
        name="frontend-static",
    )

    @app.get("/logo.png", include_in_schema=False)
    async def serve_logo():
        return _FileResponse(str(_frontend_build / "logo.png"), media_type="image/png")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Catch-all: return React's index.html for any non-API route."""
        index = _frontend_build / "index.html"
        return _FileResponse(str(index))

