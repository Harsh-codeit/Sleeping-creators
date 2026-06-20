#!/usr/bin/env python3
"""
One-time cleanup: delete AI-generated posts stuck in `draft` status.

These accumulate when a pipeline has require_approval=true — the post is created
as a draft and never auto-publishes (process_scheduled_posts only handles
status="scheduled"). The approval flow has since been removed, so these orphaned
drafts will never advance and should be purged.

Scope is intentionally narrow: only {status: "draft", ai_generated: true}. A
manually-composed draft (created via POST /posts without a scheduled_at) is NOT
ai_generated and is left untouched.

Usage (run on the server, in the backend container):
    cd /app && python purge_ai_drafts.py          # dry run — counts only
    cd /app && python purge_ai_drafts.py --yes     # actually delete

Required env vars (same as the backend): MONGO_URL, DB_NAME
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

FILTER = {"status": "draft", "ai_generated": True}


async def main(commit: bool) -> int:
    mongo_url = os.environ["MONGO_URL"]
    db = AsyncIOMotorClient(mongo_url)[os.environ["DB_NAME"]]

    total = await db.posts.count_documents(FILTER)
    print(f"AI-generated drafts matched: {total}")

    if total == 0:
        print("Nothing to delete.")
        return 0

    # Show a small sample so you can eyeball what's about to go.
    sample = await db.posts.find(
        FILTER, {"_id": 0, "client_name": 1, "platform": 1, "scheduled_at": 1, "text": 1}
    ).limit(5).to_list(5)
    print("Sample:")
    for p in sample:
        snippet = (p.get("text") or "")[:48].replace("\n", " ")
        print(f"  - {p.get('client_name')} · {p.get('platform')} · {p.get('scheduled_at')} · {snippet!r}")

    if not commit:
        print("\nDRY RUN — no documents deleted. Re-run with --yes to delete.")
        return 0

    res = await db.posts.delete_many(FILTER)
    print(f"\nDeleted {res.deleted_count} draft(s).")
    return res.deleted_count


if __name__ == "__main__":
    commit = "--yes" in sys.argv[1:]
    asyncio.run(main(commit))
