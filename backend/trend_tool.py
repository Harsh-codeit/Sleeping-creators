"""`search_trends` tool: lets the model pull trends scoped to the angle it's writing.
Wraps trend_service. Fails open to an empty trend list."""
import logging
from trend_service import get_cached_trends

logger = logging.getLogger(__name__)

SEARCH_TRENDS_TOOL = {
    "name": "search_trends",
    "description": (
        "Search current trends (hashtags + topics) relevant to a query. "
        "Call this with the specific angle/keywords you are about to write about, "
        "to ground the post in what is trending right now. Returns up to 8 matches."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The angle/keyword to find trends for."},
            "source": {"type": "string", "enum": ["instagram", "google", "all"], "default": "all"},
        },
        "required": ["query"],
    },
}


async def run_search_trends(tool_input: dict, client: dict, db) -> dict:
    """Execute the tool. Returns {"trends": [{"tag_or_topic", "volume"}]}. Never raises."""
    query = str((tool_input or {}).get("query") or "").strip().lower()
    try:
        cached = await get_cached_trends(client.get("id"), db, limit=50)
    except Exception as e:
        logger.warning(f"search_trends failed ({e}); returning empty")
        return {"trends": []}
    results = []
    for t in cached or []:
        tag = t.get("hashtag") or ""
        topic = t.get("topic") or ""
        haystack = f"{tag} {topic}".lower()
        if not query or query in haystack or any(w in haystack for w in query.split()):
            results.append({"tag_or_topic": tag or topic, "volume": t.get("volume", 0)})
    results.sort(key=lambda r: r.get("volume", 0), reverse=True)
    return {"trends": results[:8]}
