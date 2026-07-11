from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # App
    app_name: str = "Sleeping Creators Mobile API"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    app_base_url: str = "http://localhost:3000"  # Frontend base URL for OAuth callbacks

    # MongoDB (primary database)
    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "sc_mobile"

    # PostgreSQL — pgvector hooks library ONLY
    viral_library_pg_url: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_days: int = 30

    # Anthropic
    anthropic_api_key: str = ""

    # OpenRouter (fallback)
    openrouter_api_key: str = ""

    # Storage (Cloudflare R2)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_url: str = ""

    # Publishing
    bundle_api_key: str = ""

    # Notifications
    resend_api_key: str = ""
    resend_from_email: str = "Sleeping Creators <team@sleepingcreators.com>"
    fcm_server_key: str = ""

    # Scraping
    apify_api_key: str = ""
    rapidapi_instagram_key: str = ""

    # Transcription
    assemblyai_api_key: str = ""

    # Fast inference
    groq_api_key: str = ""

    # Video
    shotstack_key: str = ""

    # Model routing
    default_carousel_model: str = "claude-haiku-4-5-20251001"
    default_generation_model: str = "claude-sonnet-4-6"
    default_strategy_model: str = "claude-sonnet-4-6"

    # Admin dashboard
    admin_secret: str = "change-me-admin"

    # Anti-repetition
    hook_cosine_max: float = 0.85
    jaccard_fallback_max: float = 0.5
    recent_window_days: int = 30

    # Embedding dimension (text-embedding-3-small)
    embedding_dim: int = 1536


settings = Settings()
