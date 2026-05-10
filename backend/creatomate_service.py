import os
import logging
import httpx

logger = logging.getLogger(__name__)

CREATOMATE_BASE = "https://api.creatomate.com/v2"


class CreatomateRateLimited(Exception):
    def __init__(self, retry_after: int):
        super().__init__(f"Rate limited; retry after {retry_after}s")
        self.retry_after = retry_after


def _headers() -> dict:
    api_key = os.environ.get("CREATOMATE_API_KEY", "")
    if not api_key:
        raise RuntimeError("CREATOMATE_API_KEY not set")
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


async def submit_render(template_id: str, modifications: dict, webhook_url: str | None = None) -> dict:
    body = {"template_id": template_id, "modifications": modifications}
    if webhook_url:
        body["webhook_url"] = webhook_url

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{CREATOMATE_BASE}/renders",
            headers=_headers(),
            json=body,
        )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "1"))
            raise CreatomateRateLimited(retry_after)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and data:
            return data[0]
        return data


async def get_render(render_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{CREATOMATE_BASE}/renders/{render_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_templates() -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{CREATOMATE_BASE}/templates",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_template_source(template_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{CREATOMATE_BASE}/templates/{template_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()
