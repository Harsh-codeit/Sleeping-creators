from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from backend_mobile.config import settings

_client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


async def init_db() -> None:
    global _client, db
    _client = AsyncIOMotorClient(settings.mongo_url)
    db = _client[settings.db_name]

    # TTL index: OTPs expire automatically after expires_at
    await db.otps.create_index("expires_at", expireAfterSeconds=0)

    # Unique index on template id field (not _id)
    await db.templates.create_index("id", unique=True)

    # Index for fast user lookups
    await db.users.create_index([("email", ASCENDING)], sparse=True)
    await db.users.create_index([("phone", ASCENDING)], sparse=True)

    # Index for OTP lookups
    await db.otps.create_index([("identifier", ASCENDING), ("purpose", ASCENDING)])


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    return db
