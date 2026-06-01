import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from unittest.mock import MagicMock, AsyncMock, patch

# server.py imports many heavy deps; stub anthropic at minimum.
if "anthropic" not in sys.modules:
    sys.modules["anthropic"] = MagicMock()


def _run(coro):
    return asyncio.run(coro)


def test_pop_from_queue_returns_head_and_advances():
    import topic_queue
    pipeline = {"topic_queue": ["a", "b", "c"], "topic_history": []}
    topic, updates = topic_queue.pop_topic(pipeline)
    assert topic == "a"
    assert updates["topic_queue"] == ["b", "c"]
    assert "a" in updates["topic_history"]


def test_pop_falls_back_to_round_robin_when_empty():
    import topic_queue
    pipeline = {"topic_queue": [], "topic_history": [], "carousel_topics": ["x", "y"], "total_runs": 3}
    topic, updates = topic_queue.pop_topic(pipeline)
    assert topic == "y"  # 3 % 2 == 1 -> "y"


def test_pop_returns_none_when_nothing_available():
    import topic_queue
    topic, updates = topic_queue.pop_topic({"topic_queue": [], "carousel_topics": [], "total_runs": 0})
    assert topic is None


def test_refill_topics_parses_and_excludes_history():
    import topic_queue
    raw = '```json\n["new topic one", "new topic two", "history dup"]\n```'
    out = topic_queue.parse_topic_list(raw, exclude=["history dup"])
    assert out == ["new topic one", "new topic two"]


def test_parse_topic_list_handles_garbage():
    import topic_queue
    assert topic_queue.parse_topic_list("not json", exclude=[]) == []
