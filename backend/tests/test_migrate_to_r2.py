"""Tests for migrate_to_r2.py migration helpers."""
import io
import os
import sys
import importlib.util
from unittest.mock import MagicMock, patch

_SCRIPT = os.path.join(os.path.dirname(__file__), "..", "migrate_to_r2.py")

_ENV = {
    "MONGO_URL":              "mongodb://localhost:27017",
    "DB_NAME":                "sleeping-creators",
    "MINIO_ENDPOINT":         "http://minio:9000",
    "MINIO_ACCESS_KEY":       "minioadmin",
    "MINIO_SECRET_KEY":       "minioadmin",
    "MINIO_BUCKET":           "sleeping-creators",
    "MINIO_PUBLIC_URL":       "https://storage.monkmedia.io",
    "R2_ACCOUNT_ID":          "testaccount",
    "R2_ACCESS_KEY_ID":       "testaccesskey",
    "R2_SECRET_ACCESS_KEY":   "testsecret",
    "R2_BUCKET_NAME":         "sleeping-creators",
    "R2_PUBLIC_URL":          "https://pub-test.r2.dev",
}


def _load():
    for k in list(sys.modules):
        if "migrate_to_r2" in k:
            del sys.modules[k]
    spec = importlib.util.spec_from_file_location("migrate_to_r2", _SCRIPT)
    mod  = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, _ENV, clear=False):
        spec.loader.exec_module(mod)
    return mod


def test_key_from_minio_url():
    mod = _load()
    key = mod._key_from_minio_url(
        "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    )
    assert key == "sleeping-creators/carousels/abc/slide_1.png"


def test_migrate_url_skips_already_on_r2():
    mod   = _load()
    minio = MagicMock()
    r2    = MagicMock()
    url   = "https://pub-test.r2.dev/sleeping-creators/carousels/abc/slide_1.png"
    result_url, status = mod.migrate_url(url, minio, r2)
    assert result_url == url
    assert status == "skipped"
    minio.download_fileobj.assert_not_called()
    r2.upload_fileobj.assert_not_called()


def test_migrate_url_marks_unrecognised_domain():
    mod   = _load()
    minio = MagicMock()
    r2    = MagicMock()
    url   = "https://unknown.example.com/slide_1.png"
    result_url, status = mod.migrate_url(url, minio, r2)
    assert result_url == url
    assert status == "unrecognised"
    minio.download_fileobj.assert_not_called()
    r2.upload_fileobj.assert_not_called()


def test_migrate_url_downloads_and_uploads():
    mod   = _load()
    minio = MagicMock()
    r2    = MagicMock()

    def fake_download(bucket, key, buf):
        buf.write(b"PNG_DATA")
    minio.download_fileobj.side_effect = fake_download

    url = "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    result_url, status = mod.migrate_url(url, minio, r2)

    assert status == "migrated"
    assert result_url == "https://pub-test.r2.dev/sleeping-creators/carousels/abc/slide_1.png"
    minio.download_fileobj.assert_called_once()
    call_args = minio.download_fileobj.call_args[0]
    assert call_args[0] == "sleeping-creators"                             # bucket
    assert call_args[1] == "sleeping-creators/carousels/abc/slide_1.png"  # key
    r2.upload_fileobj.assert_called_once()
    r2_args = r2.upload_fileobj.call_args[0]
    assert r2_args[1] == "sleeping-creators"                               # r2 bucket
    assert r2_args[2] == "sleeping-creators/carousels/abc/slide_1.png"    # r2 key


def test_migrate_url_returns_failed_on_download_error():
    mod   = _load()
    minio = MagicMock()
    r2    = MagicMock()
    minio.download_fileobj.side_effect = Exception("connection refused")

    url = "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    result_url, status = mod.migrate_url(url, minio, r2)

    assert result_url == url
    assert status == "failed"
    r2.upload_fileobj.assert_not_called()


def test_migrate_url_returns_failed_on_upload_error():
    mod   = _load()
    minio = MagicMock()
    r2    = MagicMock()

    def fake_download(bucket, key, buf):
        buf.write(b"PNG_DATA")
    minio.download_fileobj.side_effect = fake_download
    r2.upload_fileobj.side_effect = Exception("R2 503")

    url = "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    result_url, status = mod.migrate_url(url, minio, r2)

    assert result_url == url
    assert status == "failed"
    r2.upload_fileobj.assert_called_once()
