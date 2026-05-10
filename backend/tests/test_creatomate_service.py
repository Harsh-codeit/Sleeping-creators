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
