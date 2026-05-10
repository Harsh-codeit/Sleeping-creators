import os
import json
import httpx
import pytest
from unittest.mock import patch, AsyncMock

import creatomate_service


@pytest.mark.asyncio
async def test_submit_render_posts_template_id_and_modifications(monkeypatch):
    monkeypatch.setenv("CREATOMATE_API_KEY", "test-key-123")

    captured = {}
    async def fake_post(self, url, headers=None, json=None, **kw):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return httpx.Response(
            200,
            json={"id": "render-abc", "status": "planned"},
            request=httpx.Request("POST", url),
        )

    with patch.object(httpx.AsyncClient, "post", new=fake_post):
        result = await creatomate_service.submit_render(
            template_id="tmpl-xyz",
            modifications={"headline_text": "Hello"},
        )

    assert captured["url"] == "https://api.creatomate.com/v2/renders"
    assert captured["headers"]["Authorization"] == "Bearer test-key-123"
    assert captured["json"]["template_id"] == "tmpl-xyz"
    assert captured["json"]["modifications"] == {"headline_text": "Hello"}
    assert result["id"] == "render-abc"


@pytest.mark.asyncio
async def test_get_render_fetches_by_id(monkeypatch):
    monkeypatch.setenv("CREATOMATE_API_KEY", "k")
    async def fake_get(self, url, headers=None, **kw):
        assert url.endswith("/renders/render-abc")
        return httpx.Response(200, json={"id": "render-abc", "status": "succeeded", "url": "https://x/out.mp4"},
                              request=httpx.Request("GET", url))
    with patch.object(httpx.AsyncClient, "get", new=fake_get):
        r = await creatomate_service.get_render("render-abc")
    assert r["status"] == "succeeded"


@pytest.mark.asyncio
async def test_list_templates_returns_array(monkeypatch):
    monkeypatch.setenv("CREATOMATE_API_KEY", "k")
    async def fake_get(self, url, headers=None, **kw):
        return httpx.Response(200, json=[{"id": "t1", "name": "A"}, {"id": "t2", "name": "B"}],
                              request=httpx.Request("GET", url))
    with patch.object(httpx.AsyncClient, "get", new=fake_get):
        r = await creatomate_service.list_templates()
    assert len(r) == 2
    assert r[0]["id"] == "t1"


@pytest.mark.asyncio
async def test_get_template_source_returns_full_definition(monkeypatch):
    monkeypatch.setenv("CREATOMATE_API_KEY", "k")
    async def fake_get(self, url, headers=None, **kw):
        assert url.endswith("/templates/t1")
        return httpx.Response(200, json={"id": "t1", "source": {"elements": []}},
                              request=httpx.Request("GET", url))
    with patch.object(httpx.AsyncClient, "get", new=fake_get):
        r = await creatomate_service.get_template_source("t1")
    assert "source" in r
