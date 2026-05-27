"""
Object storage backend — supports Cloudflare R2 and MinIO (S3-compatible).

Select backend via STORAGE_BACKEND env var (default: minio).

Required env vars for R2:
    STORAGE_BACKEND      - set to "r2"
    R2_ACCOUNT_ID        - Cloudflare account ID
    R2_ACCESS_KEY_ID     - R2 API token access key
    R2_SECRET_ACCESS_KEY - R2 API token secret key
    R2_BUCKET_NAME       - bucket name, e.g. sleeping-creators
    R2_PUBLIC_URL        - public CDN base URL, e.g. https://pub-xxx.r2.dev

Required env vars for MinIO (legacy):
    STORAGE_BACKEND  - set to "minio" (or omit)
    MINIO_ENDPOINT   - e.g. http://minio:9000
    MINIO_ACCESS_KEY - S3 access key
    MINIO_SECRET_KEY - S3 secret key
    MINIO_BUCKET     - bucket name, e.g. sleeping-creators-media
    MINIO_PUBLIC_URL - public base URL, e.g. https://storage.yourdomain.com
    MINIO_REGION     - AWS region (default: us-east-1)
"""
import io
import json
import os
import logging
from pathlib import Path

import boto3
from botocore.client import Config
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)

# ── Config: active backend ─────────────────────────────────────────────────────
_BACKEND = os.environ.get("STORAGE_BACKEND", "minio").lower()  # "r2" or "minio"

# MinIO config (legacy / fallback)
_MINIO_ENDPOINT   = os.environ.get("MINIO_ENDPOINT", "")
_MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "")
_MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "")
_MINIO_BUCKET     = os.environ.get("MINIO_BUCKET", "sleeping-creators-media")
_MINIO_PUBLIC_URL = os.environ.get("MINIO_PUBLIC_URL", "").rstrip("/")
_MINIO_REGION     = os.environ.get("MINIO_REGION", "us-east-1")

# Cloudflare R2 config
_R2_ACCOUNT_ID  = os.environ.get("R2_ACCOUNT_ID", "")
_R2_ACCESS_KEY  = os.environ.get("R2_ACCESS_KEY_ID", "")
_R2_SECRET_KEY  = os.environ.get("R2_SECRET_ACCESS_KEY", "")
_R2_BUCKET      = os.environ.get("R2_BUCKET_NAME", "sleeping-creators")
_R2_PUBLIC_URL  = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
_R2_ENDPOINT    = f"https://{_R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if _R2_ACCOUNT_ID else ""

# Derived flags
_minio_enabled = bool(_MINIO_ENDPOINT and _MINIO_ACCESS_KEY and _MINIO_SECRET_KEY)
_r2_enabled    = bool(_R2_ACCOUNT_ID and _R2_ACCESS_KEY and _R2_SECRET_KEY)
_enabled       = (_r2_enabled if _BACKEND == "r2" else _minio_enabled)


def _minio_client():
    """Create a boto3 S3 client pointed at MinIO."""
    return boto3.client(
        "s3",
        endpoint_url=_MINIO_ENDPOINT,
        aws_access_key_id=_MINIO_ACCESS_KEY,
        aws_secret_access_key=_MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name=_MINIO_REGION,
    )


def _r2_client():
    """Create a boto3 S3 client pointed at Cloudflare R2."""
    if not _R2_ENDPOINT:
        raise ValueError("R2_ACCOUNT_ID is not set — cannot create R2 client")
    return boto3.client(
        "s3",
        endpoint_url=_R2_ENDPOINT,
        aws_access_key_id=_R2_ACCESS_KEY,
        aws_secret_access_key=_R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _client():
    """Return the active storage client based on STORAGE_BACKEND."""
    return _r2_client() if _BACKEND == "r2" else _minio_client()


def _active_bucket() -> str:
    return _R2_BUCKET if _BACKEND == "r2" else _MINIO_BUCKET


def _public_url(key: str) -> str:
    base = _R2_PUBLIC_URL if _BACKEND == "r2" else _MINIO_PUBLIC_URL
    return f"{base}/{key}"


def _apply_public_read_policy(s3, bucket: str):
    """Set a bucket policy that allows anyone to GET objects — MinIO only. No-op for R2."""
    if _BACKEND != "minio":
        return
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/*"],
        }],
    })
    try:
        s3.put_bucket_policy(Bucket=bucket, Policy=policy)
        logger.info(f"Set public-read bucket policy on '{bucket}'")
    except Exception as e:
        logger.warning(f"Could not set bucket policy on '{bucket}': {e}")


def _check_or_create_bucket(s3):
    """Create the bucket if it doesn't exist, then ensure public-read policy is set."""
    bucket = _active_bucket()
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3.create_bucket(Bucket=bucket)
            logger.info(f"Created bucket '{bucket}' on {_BACKEND}")
        except Exception as e:
            logger.warning(f"Could not create bucket '{bucket}': {e}")
    _apply_public_read_policy(s3, bucket)


def ensure_bucket():
    """Public entry point: ensure the configured bucket exists. No-op if storage is not configured."""
    if not _enabled:
        return
    try:
        s3 = _client()
        _check_or_create_bucket(s3)
    except Exception as e:
        logger.warning(f"ensure_bucket failed: {e}")


def is_enabled() -> bool:
    """Return True if the active storage backend is configured."""
    return _enabled


def upload_file(local_path: str | Path, key: str, content_type: str = "image/png") -> str:
    """
    Upload a local file to the configured storage backend and return its public URL.
    Falls back to returning an empty string on failure.
    """
    if not _enabled:
        logger.warning(f"Storage ({_BACKEND}) not configured — skipping upload")
        return ""
    try:
        s3 = _client()
        _check_or_create_bucket(s3)
        extra_args: dict = {"ContentType": content_type}
        # ACL public-read only works on MinIO; R2 uses public bucket settings
        if _BACKEND == "minio":
            extra_args["ACL"] = "public-read"
        s3.upload_file(
            str(local_path),
            _active_bucket(),
            key,
            ExtraArgs=extra_args,
        )
        url = _public_url(key)
        logger.info(f"Uploaded to {_BACKEND}: {url}")
        return url
    except Exception as e:
        logger.error(f"{_BACKEND} upload_file failed ({key}): {e}")
        return ""


def upload_bytes(data: bytes, key: str, content_type: str = "image/png") -> str:
    """
    Upload raw bytes to the configured storage backend and return its public URL.
    Falls back to returning an empty string on failure.
    """
    if not _enabled:
        logger.warning(f"Storage ({_BACKEND}) not configured — skipping upload")
        return ""
    try:
        s3 = _client()
        _check_or_create_bucket(s3)
        extra_args: dict = {"ContentType": content_type}
        if _BACKEND == "minio":
            extra_args["ACL"] = "public-read"
        s3.upload_fileobj(
            io.BytesIO(data),
            _active_bucket(),
            key,
            ExtraArgs=extra_args,
        )
        url = _public_url(key)
        logger.info(f"Uploaded bytes to {_BACKEND}: {url}")
        return url
    except Exception as e:
        logger.error(f"{_BACKEND} upload_bytes failed ({key}): {e}")
        return ""


def generate_presigned_upload_url(key: str, content_type: str, expires: int = 3600) -> str:
    """Return a presigned PUT URL the browser can use to upload directly to R2/MinIO."""
    if not _enabled:
        raise RuntimeError(f"Storage ({_BACKEND}) not configured")
    s3 = _client()
    return s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": _active_bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def file_exists(key: str) -> bool:
    """Return True if the object exists in the configured storage backend."""
    if not _enabled:
        return False
    try:
        s3 = _client()
        s3.head_object(Bucket=_active_bucket(), Key=key)
        return True
    except Exception:
        return False


def delete_file(key: str) -> bool:
    """Delete a file from the configured storage backend. Returns True on success."""
    if not _enabled:
        return False
    try:
        s3 = _client()
        s3.delete_object(Bucket=_active_bucket(), Key=key)
        logger.info(f"Deleted from {_BACKEND}: {key}")
        return True
    except Exception as e:
        logger.error(f"{_BACKEND} delete_file failed ({key}): {e}")
        return False
