"""Tests for R2 media purge — key extraction and scheduler job."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


R2_BASE = "https://pub-abc123.r2.dev"


# ── Unit tests: _extract_r2_key ──────────────────────────────────────────────

def test_extract_r2_key_returns_key_for_r2_url():
    from server import _extract_r2_key
    url = f"{R2_BASE}/video-renders/client1/render1.mp4"
    assert _extract_r2_key(url, R2_BASE) == "video-renders/client1/render1.mp4"


def test_extract_r2_key_returns_none_for_non_r2_url():
    from server import _extract_r2_key
    url = "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    assert _extract_r2_key(url, R2_BASE) is None


def test_extract_r2_key_returns_none_for_local_url():
    from server import _extract_r2_key
    url = "/api/static/carousels/abc/slide_1.jpg"
    assert _extract_r2_key(url, R2_BASE) is None


def test_extract_r2_key_returns_none_for_none_input():
    from server import _extract_r2_key
    assert _extract_r2_key(None, R2_BASE) is None


def test_extract_r2_key_returns_none_for_empty_string():
    from server import _extract_r2_key
    assert _extract_r2_key("", R2_BASE) is None


def test_extract_r2_key_handles_trailing_slash_on_base():
    from server import _extract_r2_key
    url = f"{R2_BASE}/carousels/posts/abc/image.png"
    # base with trailing slash should still work
    assert _extract_r2_key(url, R2_BASE + "/") == "carousels/posts/abc/image.png"
