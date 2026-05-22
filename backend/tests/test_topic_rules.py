import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ai_service


def _client(topics_include=None, not_to_do=None):
    return {
        "strategy": {"topics_include": topics_include or []},
        "onboarding_data": {"not_to_do_list": not_to_do or []},
    }


def test_both_lists_returns_block():
    client = _client(
        topics_include=[{"text": "salary negotiation", "type": "topic"}],
        not_to_do=["parroting loans"]
    )
    result = ai_service._build_topic_rules_block(client)
    assert "ABSOLUTE TOPIC RULES" in result
    assert "salary negotiation" in result
    assert "parroting loans" in result
    assert "ALWAYS DRAW FROM THESE TOPICS" in result
    assert "NEVER COVER" in result


def test_only_never_cover():
    client = _client(not_to_do=["career switch"])
    result = ai_service._build_topic_rules_block(client)
    assert "NEVER COVER" in result
    assert "career switch" in result
    assert "ALWAYS" not in result


def test_only_always_include():
    client = _client(topics_include=[{"text": "finance tips", "type": "topic"}])
    result = ai_service._build_topic_rules_block(client)
    assert "ALWAYS DRAW FROM THESE TOPICS" in result
    assert "finance tips" in result
    assert "NEVER COVER" not in result


def test_both_empty_returns_empty_string():
    client = _client()
    result = ai_service._build_topic_rules_block(client)
    assert result == ""


def test_mention_type_goes_to_correct_section():
    client = _client(topics_include=[{"text": "mention the free audit offer", "type": "mention"}])
    result = ai_service._build_topic_rules_block(client)
    assert "ALWAYS INCLUDE THESE ELEMENTS" in result
    assert "mention the free audit offer" in result
    assert "ALWAYS DRAW FROM THESE TOPICS" not in result


def test_plain_string_treated_as_topic():
    # Backward compat: existing data stored as plain strings, not dicts
    client = _client(topics_include=["plain string topic"])
    result = ai_service._build_topic_rules_block(client)
    assert "ALWAYS DRAW FROM THESE TOPICS" in result
    assert "plain string topic" in result


def test_blank_entries_are_filtered():
    client = _client(
        topics_include=[{"text": "", "type": "topic"}, {"text": "real topic", "type": "topic"}],
        not_to_do=["", "real rule"]
    )
    result = ai_service._build_topic_rules_block(client)
    assert result.count("\n- ") == 2  # one topic, one never-cover — blanks excluded
