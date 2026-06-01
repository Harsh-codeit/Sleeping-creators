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


import ai_service
import json


def _block(type_, **kw):
    b = MagicMock()
    b.type = type_
    for k, v in kw.items():
        setattr(b, k, v)
    return b


def test_tool_loop_no_tool_returns_first_message():
    """stop_reason != tool_use → returns immediately, no handler call."""
    final = MagicMock(stop_reason="end_turn", content=[_block("text", text='{"ok": 1}')],
                      model="claude-sonnet-4-5", usage=MagicMock(input_tokens=1, output_tokens=1))
    ai = MagicMock()
    ai.messages.create.return_value = final
    handler = AsyncMock()
    msg = ai_service._run_generation_with_tools(
        ai, model="claude-sonnet-4-5", system="s", user="u", max_tokens=100,
        tools=[{"name": "search_trends"}], handlers={"search_trends": handler}, max_tool_calls=2,
    )
    out = asyncio.run(msg)
    handler.assert_not_awaited()
    assert out.content[0].text == '{"ok": 1}'


def test_tool_loop_executes_tool_then_finalizes():
    tool_call = MagicMock(stop_reason="tool_use", model="claude-sonnet-4-5",
                          usage=MagicMock(input_tokens=1, output_tokens=1),
                          content=[_block("tool_use", id="t1", name="search_trends", input={"query": "x"})])
    final = MagicMock(stop_reason="end_turn", model="claude-sonnet-4-5",
                      usage=MagicMock(input_tokens=1, output_tokens=1),
                      content=[_block("text", text='{"done": true}')])
    ai = MagicMock()
    ai.messages.create.side_effect = [tool_call, final]
    handler = AsyncMock(return_value={"trends": []})
    out = asyncio.run(ai_service._run_generation_with_tools(
        ai, model="claude-sonnet-4-5", system="s", user="u", max_tokens=100,
        tools=[{"name": "search_trends"}], handlers={"search_trends": handler}, max_tool_calls=2,
    ))
    handler.assert_awaited_once()
    assert out.content[0].text == '{"done": true}'


def test_tool_loop_respects_max_calls():
    """Always tool_use → stops after max_tool_calls and returns last message."""
    def make_tool_msg():
        return MagicMock(stop_reason="tool_use", model="claude-sonnet-4-5",
                         usage=MagicMock(input_tokens=1, output_tokens=1),
                         content=[_block("tool_use", id="t", name="search_trends", input={"query": "x"})])
    ai = MagicMock()
    ai.messages.create.side_effect = [make_tool_msg() for _ in range(5)]
    handler = AsyncMock(return_value={"trends": []})
    asyncio.run(ai_service._run_generation_with_tools(
        ai, model="claude-sonnet-4-5", system="s", user="u", max_tokens=100,
        tools=[{"name": "search_trends"}], handlers={"search_trends": handler}, max_tool_calls=2,
    ))
    # 1 initial + 2 tool rounds = 3 create calls max
    assert ai.messages.create.call_count <= 3
