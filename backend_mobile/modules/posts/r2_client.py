"""Cloudflare R2 upload client (S3-compatible via boto3)."""
from __future__ import annotations

import mimetypes
import uuid
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from backend_mobile.config import settings


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


async def upload_bytes(
    data: bytes,
    filename: str,
    content_type: Optional[str] = None,
    folder: str = "slides",
    key: Optional[str] = None,
) -> str:
    """Upload bytes to R2, return public URL.

    Pass `key` to use a fixed path (e.g. avatars) so re-uploads overwrite
    the same object instead of accumulating orphaned files.
    """
    import asyncio

    if not content_type:
        content_type, _ = mimetypes.guess_type(filename)
        content_type = content_type or "application/octet-stream"

    if key is None:
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
        key = f"{folder}/{uuid.uuid4().hex}.{ext}"

    def _do_upload():
        client = _get_client()
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _do_upload)

    return f"{settings.r2_public_url.rstrip('/')}/{key}"
