"""Unit tests for carousel rich content helpers in carousel_templates/base.py"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from carousel_templates.base import _body_font_size, _clean


def test_body_font_size_short():
    # < 100 chars → 28px
    text = "a" * 50
    assert _body_font_size(text) == 28


def test_body_font_size_medium():
    # 200–349 chars → 23px
    text = "a" * 250
    assert _body_font_size(text) == 23


def test_body_font_size_long():
    # ≥ 500 chars → 19px
    text = "a" * 550
    assert _body_font_size(text) == 19


def test_clean_heading_truncates_at_80():
    long = "a" * 100
    result = _clean(long, max_chars=80)
    assert len(result) <= 80
    assert not result.endswith("…")


def test_clean_body_truncates_at_350():
    # 400 chars of words — no sentence endings, falls back to word boundary
    long = ("word " * 80).strip()
    result = _clean(long, max_chars=350)
    assert len(result) <= 350
    assert not result.endswith("…")


def test_clean_cuts_at_sentence_boundary():
    # Content with sentence endings — should cut after the last complete sentence
    long = ("This is a sentence. " * 30).strip()  # well over 350 chars
    result = _clean(long, max_chars=350)
    assert result.endswith(".")
    assert len(result) <= 350


def test_clean_cuts_at_exclamation_or_question():
    long = ("Great point! Really? Yes indeed. " * 20).strip()
    result = _clean(long, max_chars=350)
    assert result[-1] in ".!?"
    assert len(result) <= 350


def test_clean_strips_markdown():
    result = _clean("**Bold text** and *italic*")
    assert "**" not in result
    assert "*" not in result
    assert "Bold text" in result


def test_body_font_size_boundary_99_chars():
    """99 chars is the upper boundary for 28px."""
    text = "a" * 99
    assert _body_font_size(text) == 28


def test_body_font_size_boundary_100_chars():
    """100 chars crosses into the 26px bucket."""
    text = "a" * 100
    assert _body_font_size(text) == 26


def test_body_font_size_boundary_349_chars():
    """349 chars is the upper boundary for 23px."""
    text = "a" * 349
    assert _body_font_size(text) == 23


def test_body_font_size_boundary_350_chars():
    """350 chars crosses into the 21px bucket."""
    text = "a" * 350
    assert _body_font_size(text) == 21


def test_body_font_size_empty_string():
    """Empty string has 0 chars, falls into the < 100 bucket → 28px."""
    assert _body_font_size("") == 28


def test_render_rich_template_dark_no_callout():
    """Rich template renders correctly without a callout."""
    from carousel_templates.base import TEMPLATE_MAP
    slide = {
        "slide_number": 2,
        "heading": "Focus Beats Effort Every Time",
        "body": "Most brands grind harder instead of smarter.\nThe algorithm rewards depth and specificity.\nOne well-researched post beats ten generic ones.",
    }
    config = {
        "author_name": "Test Brand",
        "author_handle": "@testbrand",
        "author_title": "Marketing",
        "is_last": False,
    }
    html = TEMPLATE_MAP["dark_card_rich"](slide, config)
    assert "Focus Beats Effort Every Time" in html
    assert "Most brands grind harder" in html
    assert 'class="callout"' not in html


def test_render_rich_template_full_white_with_callout():
    """Rich template renders callout block when callout is provided."""
    from carousel_templates.base import TEMPLATE_MAP
    slide = {
        "slide_number": 3,
        "heading": "Consistency Compounds Over Time",
        "body": "Daily actions feel invisible in the short term.\nBut compound interest applies to content too.",
        "callout": {"type": "stat", "text": "Brands posting daily see 4x more reach after 90 days"},
    }
    config = {
        "author_name": "Test Brand",
        "author_handle": "@testbrand",
        "author_title": "Growth",
        "is_last": False,
    }
    html = TEMPLATE_MAP["full_white_rich"](slide, config)
    assert "Consistency Compounds Over Time" in html
    assert "Brands posting daily see 4x more reach" in html
    assert 'class="callout"' in html


def test_render_rich_template_cta_slide_no_callout():
    """CTA slide omits callout even if callout data is present."""
    from carousel_templates.base import TEMPLATE_MAP
    slide = {
        "slide_number": 5,
        "heading": "Ready to Grow Your Brand?",
        "body": "Follow for daily insights.",
        "callout": {"type": "tip", "text": "This should not appear on CTA slide"},
    }
    config = {
        "author_name": "Test Brand",
        "author_handle": "@testbrand",
        "author_title": "Marketing",
        "is_last": True,
        "cta_heading": "Found this helpful?",
        "cta_sub": "Follow for more insights",
        "cta_text": "Follow",
    }
    html = TEMPLATE_MAP["floating_card_rich"](slide, config)
    assert "Found this helpful?" in html
    assert "This should not appear on CTA slide" not in html


def test_render_rich_template_heading_truncated():
    """Heading longer than 80 chars gets truncated without ellipsis."""
    from carousel_templates.base import _clean
    long_heading = "This is a very long heading that goes well past the eighty character limit set in spec"
    result = _clean(long_heading, max_chars=80)
    assert len(result) <= 80
    assert not result.endswith("…")
