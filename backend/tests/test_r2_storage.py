"""Tests for Cloudflare R2 and MinIO storage backends in storage.py."""
import io
import os
import importlib
import importlib.util
import sys
from unittest.mock import MagicMock, patch

# Base env for both backends
_BASE_ENV = {
    "MINIO_ENDPOINT": "http://minio:9000",
    "MINIO_ACCESS_KEY": "minioadmin",
    "MINIO_SECRET_KEY": "minioadmin",
    "MINIO_BUCKET": "automonk-media",
    "MINIO_PUBLIC_URL": "https://storage.monkmedia.io",
    "R2_ACCOUNT_ID": "test_account",
    "R2_ACCESS_KEY_ID": "test_access",
    "R2_SECRET_ACCESS_KEY": "test_secret",
    "R2_BUCKET_NAME": "test-bucket",
    "R2_PUBLIC_URL": "https://pub-test.r2.dev",
}

_STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "storage.py")


def _load_storage(backend: str):
    """Load storage module fresh with STORAGE_BACKEND set to `backend`."""
    env = {**_BASE_ENV, "STORAGE_BACKEND": backend}
    # Remove cached module so env changes take effect
    for key in list(sys.modules.keys()):
        if key == "storage":
            del sys.modules[key]
    spec = importlib.util.spec_from_file_location("storage", _STORAGE_PATH)
    mod = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, env, clear=False):
        spec.loader.exec_module(mod)
    return mod


# ── R2 backend tests ──────────────────────────────────────────────────────────

def test_r2_is_enabled():
    storage = _load_storage("r2")
    assert storage.is_enabled() is True


def test_r2_public_url_uses_r2_base():
    storage = _load_storage("r2")
    url = storage._public_url("automonk/carousels/abc/slide_1.png")
    assert url == "https://pub-test.r2.dev/automonk/carousels/abc/slide_1.png"


def test_r2_endpoint_constructed_from_account_id():
    storage = _load_storage("r2")
    assert storage._R2_ENDPOINT == "https://test_account.r2.cloudflarestorage.com"


def test_r2_upload_file_no_acl():
    """R2 uploads must NOT include ACL=public-read."""
    storage = _load_storage("r2")
    mock_s3 = MagicMock()
    with patch.object(storage, "_client", return_value=mock_s3), \
         patch.object(storage, "_check_or_create_bucket"):
        url = storage.upload_file("/tmp/slide.png", "automonk/slide.png")
    call_kwargs = mock_s3.upload_file.call_args[1]
    assert "ACL" not in call_kwargs.get("ExtraArgs", {}), "R2 upload must not include ACL"
    assert url == "https://pub-test.r2.dev/automonk/slide.png"


def test_r2_upload_bytes_no_acl():
    """R2 upload_bytes must NOT include ACL=public-read."""
    storage = _load_storage("r2")
    mock_s3 = MagicMock()
    with patch.object(storage, "_client", return_value=mock_s3), \
         patch.object(storage, "_check_or_create_bucket"):
        url = storage.upload_bytes(b"data", "automonk/slide.png")
    call_kwargs = mock_s3.upload_fileobj.call_args[1]
    assert "ACL" not in call_kwargs.get("ExtraArgs", {}), "R2 upload_bytes must not include ACL"
    assert url == "https://pub-test.r2.dev/automonk/slide.png"


def test_r2_apply_public_read_policy_is_noop():
    """_apply_public_read_policy must do nothing when backend is r2."""
    storage = _load_storage("r2")
    mock_s3 = MagicMock()
    storage._apply_public_read_policy(mock_s3, "test-bucket")
    mock_s3.put_bucket_policy.assert_not_called()


def test_r2_delete_file():
    storage = _load_storage("r2")
    mock_s3 = MagicMock()
    with patch.object(storage, "_client", return_value=mock_s3):
        result = storage.delete_file("automonk/slide.png")
    mock_s3.delete_object.assert_called_once_with(Bucket="test-bucket", Key="automonk/slide.png")
    assert result is True


def test_r2_client_raises_if_account_id_missing():
    """_r2_client() must raise ValueError if R2_ACCOUNT_ID is not set."""
    env = {**_BASE_ENV, "STORAGE_BACKEND": "r2", "R2_ACCOUNT_ID": ""}
    for key in list(sys.modules.keys()):
        if key == "storage":
            del sys.modules[key]
    spec = importlib.util.spec_from_file_location("storage", _STORAGE_PATH)
    mod = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, env, clear=False):
        spec.loader.exec_module(mod)
    import pytest
    with pytest.raises(ValueError, match="R2_ACCOUNT_ID"):
        mod._r2_client()


# ── MinIO backend tests ───────────────────────────────────────────────────────

def test_minio_upload_includes_acl():
    """MinIO uploads MUST still include ACL=public-read."""
    storage = _load_storage("minio")
    mock_s3 = MagicMock()
    with patch.object(storage, "_client", return_value=mock_s3), \
         patch.object(storage, "_check_or_create_bucket"):
        storage.upload_file("/tmp/slide.png", "automonk/slide.png")
    call_kwargs = mock_s3.upload_file.call_args[1]
    assert call_kwargs.get("ExtraArgs", {}).get("ACL") == "public-read"


def test_minio_public_url_uses_minio_base():
    storage = _load_storage("minio")
    url = storage._public_url("automonk/carousels/abc/slide_1.png")
    assert url == "https://storage.monkmedia.io/automonk/carousels/abc/slide_1.png"


def test_minio_apply_public_read_policy_calls_put_bucket_policy():
    """_apply_public_read_policy must call put_bucket_policy for MinIO."""
    storage = _load_storage("minio")
    mock_s3 = MagicMock()
    storage._apply_public_read_policy(mock_s3, "automonk-media")
    mock_s3.put_bucket_policy.assert_called_once()


# ── Backend switching tests ───────────────────────────────────────────────────

def test_active_bucket_r2():
    storage = _load_storage("r2")
    assert storage._active_bucket() == "test-bucket"


def test_active_bucket_minio():
    storage = _load_storage("minio")
    assert storage._active_bucket() == "automonk-media"
