"""Cancel in-flight video posts and drop legacy collections/fields.

Run once at deploy time:  python -m migrations.001_creatomate_migration
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "sleeping-creators")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # 1. Cancel in-flight video posts
    cancel_filter = {
        "kind": "video",
        "status": {"$in": ["scheduled", "publishing", "rendering"]},
    }
    cancelled_ids = []
    async for p in db.posts.find(cancel_filter, {"id": 1, "client_name": 1, "_id": 0}):
        cancelled_ids.append(p)
    if cancelled_ids:
        await db.posts.update_many(
            cancel_filter,
            {"$set": {"status": "cancelled", "error_message": "cancelled by Creatomate migration"}},
        )
        print(f"Cancelled {len(cancelled_ids)} in-flight video posts:")
        for p in cancelled_ids:
            print(f"  - {p['id'][:8]} ({p.get('client_name', '?')})")

    # 2. Drop legacy video_templates collection
    await db.video_templates.drop()
    print("Dropped collection: video_templates")

    # 3. Strip legacy fields from pipelines
    pipeline_unset = {
        "video_template_id": "",
        "video_style": "",
        "cta_preset": "",
        "font_preset": "",
        "overlay_preset": "",
        "cta_animation": "",
    }
    res = await db.pipelines.update_many({}, {"$unset": pipeline_unset})
    print(f"Stripped legacy fields from {res.modified_count} pipelines")

    client.close()


if __name__ == "__main__":
    asyncio.run(run())
