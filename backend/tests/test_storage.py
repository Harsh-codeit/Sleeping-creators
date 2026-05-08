"""Tests for the MinIO storage module."""
import io
from unittest.mock import patch, MagicMock, ANY
import pytest


@pytest.fixture
def minio_env(monkeypatch):
    """Set MinIO env vars for testing."""
    monkeypatch.setenv("MINIO_ENDPOINT", "http://localhost:9000")
    monkeypatch.setenv("MINIO_ACCESS_KEY", "testkey")
    monkeypatch.setenv("MINIO_SECRET_KEY", "testsecret")
    monkeypatch.setenv("MINIO_BUCKET", "test-bucket")
    monkeypatch.setenv("MINIO_PUBLIC_URL", "http://localhost:9000/test-bucket")
    monkeypatch.setenv("MINIO_REGION", "us-east-1")


@pytest.fixture
def no_minio_env(monkeypatch):
    """Clear all MinIO env vars."""
    for var in ("MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY",
                "MINIO_BUCKET", "MINIO_PUBLIC_URL", "MINIO_REGION"):
        monkeypatch.delenv(var, raising=False)


def _reload_storage():
    """Reload storage module so it re-reads env vars."""
    import importlib
    import storage
    importlib.reload(storage)
    return storage


def test_is_enabled_when_configured(minio_env):
    storage = _reload_storage()
    assert storage.is_enabled() is True


def test_is_disabled_when_not_configured(no_minio_env):
    storage = _reload_storage()
    assert storage.is_enabled() is False


def test_upload_file_returns_empty_when_disabled(no_minio_env, tmp_path):
    storage = _reload_storage()
    f = tmp_path / "test.png"
    f.write_bytes(b"fake-png")
    result = storage.upload_file(str(f), "test/key.png")
    assert result == ""


def test_upload_bytes_returns_empty_when_disabled(no_minio_env):
    storage = _reload_storage()
    result = storage.upload_bytes(b"fake-png", "test/key.png")
    assert result == ""


def test_delete_file_returns_false_when_disabled(no_minio_env):
    storage = _reload_storage()
    result = storage.delete_file("test/key.png")
    assert result is False


@patch("boto3.client")
def test_upload_file_calls_s3(mock_boto_client, minio_env, tmp_path):
    storage = _reload_storage()
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3

    f = tmp_path / "test.png"
    f.write_bytes(b"fake-png")

    url = storage.upload_file(str(f), "images/test.png")

    mock_boto_client.assert_called_once_with(
        "s3",
        endpoint_url="http://localhost:9000",
        aws_access_key_id="testkey",
        aws_secret_access_key="testsecret",
        config=ANY,
        region_name="us-east-1",
    )
    mock_s3.upload_file.assert_called_once()
    assert url == "http://localhost:9000/test-bucket/images/test.png"


@patch("boto3.client")
def test_ensure_bucket_creates_bucket_if_missing(mock_boto_client, minio_env):
    storage = _reload_storage()
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3
    mock_s3.head_bucket.side_effect = Exception("Not found")

    storage.ensure_bucket()

    mock_s3.create_bucket.assert_called_once_with(Bucket="test-bucket")


@patch("boto3.client")
def test_ensure_bucket_skips_when_exists(mock_boto_client, minio_env):
    storage = _reload_storage()
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3

    storage.ensure_bucket()

    mock_s3.create_bucket.assert_not_called()


def test_ensure_bucket_noop_when_disabled(no_minio_env):
    storage = _reload_storage()
    # Should not raise
    storage.ensure_bucket()
