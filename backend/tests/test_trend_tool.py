import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock, AsyncMock, patch
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()
import trend_tool


def _run(coro):
    return asyncio.run(coro)


def test_tool_schema_shape():
    t = trend_tool.SEARCH_TRENDS_TOOL
    assert t["name"] == "search_trends"
    assert "query" in t["input_schema"]["properties"]


def test_run_search_trends_filters_by_query(monkeypatch):
    cached = [
        {"hashtag": "#sipinvesting", "topic": "SIP investing", "volume": 900},
        {"hashtag": "#crypto", "topic": "crypto", "volume": 800},
    ]
    monkeypatch.setattr(trend_tool, "get_cached_trends", AsyncMock(return_value=cached))
    out = _run(trend_tool.run_search_trends({"query": "sip"}, {"id": "c1"}, MagicMock()))
    tags = [r.get("tag_or_topic", "") for r in out["trends"]]
    assert any("sip" in t.lower() for t in tags)
    assert all("crypto" not in t.lower() for t in tags)


def test_run_search_trends_fails_open(monkeypatch):
    monkeypatch.setattr(trend_tool, "get_cached_trends", AsyncMock(side_effect=RuntimeError("boom")))
    out = _run(trend_tool.run_search_trends({"query": "anything"}, {"id": "c1"}, MagicMock()))
    assert out == {"trends": []}
