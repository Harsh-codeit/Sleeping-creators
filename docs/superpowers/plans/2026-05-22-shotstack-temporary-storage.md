# Shotstack Temporary Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt out of Shotstack CDN hosting on all renders by injecting `destinations: [{provider: "shotstack", exclude: true}]` into the output block, so Shotstack returns a 24-hour temporary URL instead of a permanent CDN URL.

**Architecture:** Single mutation in `submit_render()` in `shotstack_service.py` — merge `destinations` into the output block before posting to Shotstack. No other files change. The existing `mirror_to_r2()` call already runs within minutes of render completion, so the 24-hour window is never a constraint.

**Tech Stack:** Python, httpx, Shotstack Edit API v1

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `backend/shotstack_service.py` | `submit_render()` — inject `destinations` into output block |
| Modify | `backend/tests/test_shotstack_service.py` | Add test asserting `destinations` is present in posted body |

---

### Task 1: Write the failing test

**Files:**
- Modify: `backend/tests/test_shotstack_service.py`

- [ ] **Step 1: Add a test that verifies `submit_render()` injects `destinations` into the output block**

Open `backend/tests/test_shotstack_service.py` and append this test. It patches `httpx.AsyncClient` so no real HTTP call is made:

```python
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && python -m pytest tests/test_shotstack_service.py::test_submit_render_injects_exclude_destination -v
```

Expected output: `FAILED` — the `destinations` key will not be in `output` yet.

---

### Task 2: Implement the change

**Files:**
- Modify: `backend/shotstack_service.py:466`

- [ ] **Step 1: Read the current `body` construction in `submit_render()`**

The relevant block (around line 466) currently looks like:

```python
body = {
    "timeline": _normalize_placeholders(tpl.get("timeline", {})),
    "output": tpl.get("output", {}),
    "merge": merge_array,
}
```

- [ ] **Step 2: Replace it with the version that merges in `destinations`**

Change that block to:

```python
body = {
    "timeline": _normalize_placeholders(tpl.get("timeline", {})),
    "output": {
        **tpl.get("output", {}),
        "destinations": [{"provider": "shotstack", "exclude": True}],
    },
    "merge": merge_array,
}
```

The spread (`**`) preserves all existing output fields (format, resolution, fps, etc.) from the template. The `destinations` key overwrites any value already present in the template's output — this is intentional.

- [ ] **Step 3: Run the new test to confirm it passes**

```bash
cd backend && python -m pytest tests/test_shotstack_service.py::test_submit_render_injects_exclude_destination -v
```

Expected output: `PASSED`

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd backend && python -m pytest tests/test_shotstack_service.py -v
```

Expected output: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/shotstack_service.py backend/tests/test_shotstack_service.py
git commit -m "feat(shotstack): opt out of CDN hosting via exclude destination"
```

---

### Task 3: Staging validation (manual)

**Files:** none — this is a live API check

- [ ] **Step 1: Confirm `SHOTSTACK_ENV=stage` is set**

Staging is the default (`_base_url()` returns the stage URL when `SHOTSTACK_ENV` is not `production`). No env change needed for local dev.

- [ ] **Step 2: Trigger one render in staging**

Use the existing UI or API to create a video post and start a render. Note the `shotstack_render_id` from `render_jobs` (check MongoDB or logs).

- [ ] **Step 3: Poll the render and inspect the returned URL**

After the render completes, check `render_jobs.output_url` in MongoDB. It should be a temporary signed URL — **not** a `cdn.shotstack.io` URL.

A temporary URL looks like:
```
https://s3-ap-southeast-2.amazonaws.com/shotstack-stage/...?X-Amz-Signature=...
```

A permanent CDN URL (old behaviour) looks like:
```
https://cdn.shotstack.io/au/stage/...
```

- [ ] **Step 4: Confirm `mirror_to_r2()` succeeded**

Check `render_jobs.r2_video_url` — it should be a non-null `https://*.r2.dev/...` or custom R2 URL. If it's null, `mirror_to_r2()` failed; check the worker logs.

- [ ] **Step 5: Check whether `snapshot_url` is still returned**

Check `render_jobs.r2_snapshot_url`. If it's null but was previously populated, Shotstack may also be excluding snapshots when `exclude: true` is set. Record the finding:

- **Snapshots still work:** no further action needed.
- **Snapshots excluded too:** open a separate issue to handle thumbnail fallback (e.g. generate a snapshot from the R2 video using ffmpeg, or accept no thumbnails). Do not block production deploy on this — thumbnails are cosmetic.

- [ ] **Step 6: Deploy to production when staging looks clean**

No additional code change needed. Deploy the commit from Task 2.
