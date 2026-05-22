import shotstack_service


def _timeline(clips):
    return {"tracks": [{"clips": clips}]}


def _video_clip(src):
    return {"asset": {"type": "video", "src": src}, "start": 0, "length": 5}


def _audio_clip(src):
    return {"asset": {"type": "audio", "src": src}, "start": 0, "length": 5}


def _text_clip(text):
    return {"asset": {"type": "rich-text", "text": text}, "start": 0, "length": 5}



import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_submit_render_injects_exclude_destination():
    """submit_render must add destinations: [{provider: shotstack, exclude: true}]
    to the output block regardless of what the template's output contains."""
    template_data = {
        "template": {
            "timeline": {"tracks": []},
            "output": {"format": "mp4", "resolution": "hd"},
        }
    }

    captured = {}

    async def fake_post(url, headers, json):
        captured["body"] = json
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"response": {"id": "fake-render-id"}}
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=fake_post)

    with patch("shotstack_service.httpx.AsyncClient", return_value=mock_client):
        with patch.dict("os.environ", {"SHOTSTACK_KEY": "test-key"}):
            render_id = await shotstack_service.submit_render(
                template_data=template_data,
                merge_values={},
            )

    assert render_id == "fake-render-id"
    output = captured["body"]["output"]
    assert output["destinations"] == [{"provider": "shotstack", "exclude": True}]
    # Original output fields must be preserved
    assert output["format"] == "mp4"
    assert output["resolution"] == "hd"
