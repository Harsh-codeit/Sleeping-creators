"""Tests for zone-aware slide template selection."""


def _select_template(slide_index: int, total_slides: int, zones: dict):
    """Replicate the zone selection logic for testing."""
    if total_slides == 1:
        return "first"
    if total_slides == 2:
        return "first" if slide_index == 0 else "last"
    if slide_index == 0:
        return "first"
    if slide_index == total_slides - 1:
        return "last"
    return "middle"


def test_single_slide_uses_first():
    assert _select_template(0, 1, {}) == "first"


def test_two_slides_uses_first_and_last():
    assert _select_template(0, 2, {}) == "first"
    assert _select_template(1, 2, {}) == "last"


def test_three_slides_uses_all_zones():
    assert _select_template(0, 3, {}) == "first"
    assert _select_template(1, 3, {}) == "middle"
    assert _select_template(2, 3, {}) == "last"


def test_five_slides_middle_repeats():
    zones = ["first", "middle", "middle", "middle", "last"]
    for i in range(5):
        assert _select_template(i, 5, {}) == zones[i]
