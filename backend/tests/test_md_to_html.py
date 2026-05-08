import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from carousel_renderer import _md_to_html


def test_bold():
    assert "<strong>hello</strong>" in _md_to_html("**hello** world")


def test_italic():
    assert "<em>world</em>" in _md_to_html("*world*")


def test_paragraph():
    result = _md_to_html("Some text here")
    assert result == "<p>Some text here</p>"


def test_unordered_list_dash():
    result = _md_to_html("- item one\n- item two")
    assert "<ul>" in result
    assert "<li>item one</li>" in result
    assert "<li>item two</li>" in result


def test_unordered_list_bullet():
    result = _md_to_html("• item one\n• item two")
    assert "<ul>" in result
    assert "<li>item one</li>" in result


def test_unordered_list_asterisk():
    result = _md_to_html("* item one\n* item two")
    assert "<ul>" in result


def test_ordered_list():
    result = _md_to_html("1. first\n2. second\n3. third")
    assert "<ol>" in result
    assert "<li>first</li>" in result
    assert "<li>second</li>" in result


def test_mixed_content():
    text = "**Key insight**\nSupporting paragraph.\n\n- bullet one\n- bullet two"
    result = _md_to_html(text)
    assert "<strong>Key insight</strong>" in result
    assert "<p>Supporting paragraph.</p>" in result
    assert "<ul>" in result
    assert "<li>bullet one</li>" in result


def test_blank_lines_skipped():
    result = _md_to_html("line one\n\n\nline two")
    assert result.count("<p>") == 2


def test_empty_string():
    result = _md_to_html("")
    assert result == "<p>Your content here...</p>"


def test_inline_bold_in_list():
    result = _md_to_html("- **bold item**")
    assert "<strong>bold item</strong>" in result
    assert "<li>" in result


def test_consecutive_lists_grouped():
    result = _md_to_html("- a\n- b\n- c")
    assert result.count("<ul>") == 1


def test_list_not_grouped_across_blank():
    result = _md_to_html("- a\n\n- b")
    assert result.count("<ul>") == 2


def test_inline_bold_in_ordered_list():
    result = _md_to_html("1. **bold item**\n2. regular item")
    assert "<strong>bold item</strong>" in result
    assert "<ol>" in result


def test_italic_line_not_treated_as_bullet():
    result = _md_to_html("*italic text*")
    assert "<p>" in result
    assert "<em>italic text</em>" in result
    assert "<ul>" not in result
