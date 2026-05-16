"""Recompute derived mirrors and stamp schema_version: 2 on every client doc.

Run once at deploy time (from repo root):
    python backend/migrations/002_onboarding_schema_dedup.py

Properties:
- Idempotent: re-running has no effect after the first pass.
- Purely additive: no $unset, no key deletions.
- Safe to run while traffic is live (every live write also calls _recompute_derived).

Pre-flight: take a mongodump of the clients collection before running on prod.
"""
import asyncio
import os
import sys
from pathlib import Path

# Make backend/ importable so we can use the shared pure utility
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(_BACKEND_DIR / ".env")

from client_utils import _recompute_derived
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "sleeping-creators")
    motor_client = AsyncIOMotorClient(mongo_url)
    db = motor_client[db_name]

    total = await db.clients.count_documents({})
    updated = 0
    stamped = 0

    print(f"Starting migration on {total} client documents…")

    async for doc in db.clients.find({}):
        updates = _recompute_derived(doc)

        # schema_version stamp even on quick-add docs without onboarding_data
        if "schema_version" not in doc:
            updates["schema_version"] = 2
            stamped += 1

        if updates:
            await db.clients.update_one({"_id": doc["_id"]}, {"$set": updates})
            updated += 1

    motor_client.close()
    print(f"Done. Docs updated: {updated}/{total}. Fresh schema_version stamps: {stamped}.")
    print("Verify: db.clients.countDocuments({schema_version: 2}) should equal total.")


if __name__ == "__main__":
    asyncio.run(run())
