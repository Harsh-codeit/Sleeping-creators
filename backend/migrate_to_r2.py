#!/usr/bin/env python3
"""
Migrate carousel exported_images from MinIO to Cloudflare R2.

Usage (run on the server):
    cd /app && python migrate_to_r2.py

The script is idempotent: images whose URL already starts with R2_PUBLIC_URL
are skipped. Prints a summary at the end.

Required env vars (same as the backend):
    MONGO_URL, DB_NAME
    MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_PUBLIC_URL
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
"""
import asyncio
import io
import logging
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
MONGO_URL  = os.environ["MONGO_URL"]
DB_NAME    = os.environ["DB_NAME"]

MINIO_ENDPOINT   = os.environ["MINIO_ENDPOINT"]
MINIO_ACCESS_KEY = os.environ["MINIO_ACCESS_KEY"]
MINIO_SECRET_KEY = os.environ["MINIO_SECRET_KEY"]
MINIO_BUCKET     = os.environ.get("MINIO_BUCKET", "automonk")
MINIO_PUBLIC_URL = os.environ["MINIO_PUBLIC_URL"].rstrip("/")

R2_ACCOUNT_ID  = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY  = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_KEY  = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET      = os.environ.get("R2_BUCKET_NAME", "automonk")
R2_PUBLIC_URL  = os.environ["R2_PUBLIC_URL"].rstrip("/")
R2_ENDPOINT    = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


def _minio_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _key_from_minio_url(url: str) -> str:
    """Extract the S3 object key from a MinIO public URL.

    e.g. https://storage.monkmedia.io/automonk/carousels/abc/slide_1.png
      → automonk/carousels/abc/slide_1.png
    """
    path = urlparse(url).path.lstrip("/")
    return path


def migrate_url(url: str, minio: object, r2: object) -> tuple[str, str]:
    """
    Download one image from MinIO and upload to R2.

    Returns (new_url, status) where status is one of:
      "migrated"      — successfully moved to R2
      "skipped"       — already on R2, nothing to do
      "unrecognised"  — URL is neither MinIO nor R2, left unchanged
      "failed"        — download or upload error, left unchanged
    """
    if url.startswith(R2_PUBLIC_URL):
        return url, "skipped"

    if not url.startswith(MINIO_PUBLIC_URL):
        log.warning(f"  Unrecognised URL (not MinIO), skipping: {url}")
        return url, "unrecognised"

    key = _key_from_minio_url(url)
    try:
        buf = io.BytesIO()
        minio.download_fileobj(MINIO_BUCKET, key, buf)
        buf.seek(0)
        r2.upload_fileobj(
            buf,
            R2_BUCKET,
            key,
            ExtraArgs={"ContentType": "image/png"},
        )
        new_url = f"{R2_PUBLIC_URL}/{key}"
        log.info(f"  ✓ {key}")
        return new_url, "migrated"
    except Exception as e:
        log.error(f"  ✗ {key}: {e}")
        return url, "failed"


async def run_migration():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    minio = _minio_client()
    r2    = _r2_client()

    stats = {"posts": 0, "images_checked": 0, "migrated": 0, "skipped": 0, "unrecognised": 0, "failed": 0}

    # Process posts collection
    async for post in db.posts.find(
        {"carousel_data.exported_images": {"$exists": True, "$ne": []}},
        {"_id": 1, "id": 1, "carousel_data.exported_images": 1},
    ):
        stats["posts"] += 1
        post_id   = post.get("id", str(post["_id"]))
        old_urls  = post["carousel_data"]["exported_images"]
        new_urls  = []
        changed   = False

        log.info(f"Post {post_id[:8]}... ({len(old_urls)} images)")

        for url in old_urls:
            stats["images_checked"] += 1
            new_url, status = migrate_url(url, minio, r2)
            new_urls.append(new_url)
            stats[status] += 1
            if status == "migrated":
                changed = True

        if changed:
            await db.posts.update_one(
                {"_id": post["_id"]},
                {"$set": {"carousel_data.exported_images": new_urls}},
            )
            log.info(f"  → DB updated for post {post_id[:8]}")

    client.close()

    print("\n── Migration complete ──────────────────────────────")
    print(f"  Posts processed : {stats['posts']}")
    print(f"  Images checked  : {stats['images_checked']}")
    print(f"  Migrated to R2  : {stats['migrated']}")
    print(f"  Already on R2   : {stats['skipped']}")
    print(f"  Unrecognised    : {stats['unrecognised']}")
    print(f"  Failed          : {stats['failed']}")
    if stats["failed"]:
        print("  ⚠  Some images failed — re-run to retry.")
    elif stats["unrecognised"]:
        print("  ⚠  Some URLs were unrecognised (not MinIO/R2) — check manually.")
    else:
        print("  ✓  All images are now on R2.")


if __name__ == "__main__":
    asyncio.run(run_migration())
