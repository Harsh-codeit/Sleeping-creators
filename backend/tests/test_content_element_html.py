import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from template_converter import _element_to_html


def _content_elem(**prop_overrides):
    props = {
        "fontSize": 44,
        "fontFamily": "Sora",
        "fontWeight": "600",
        "color": "#ffffff",
        "textAlign": "left",
        "lineHeight": 1.6,
        "paraGap": 24,
    }
    props.update(prop_overrides)
    return {
        "id": "test-content-1",
        "type": "content",
        "x": 130, "y": 310,
        "width": 820, "height": 800,
        "z_index": 3, "visible": True, "rotation": 0,
        "props": props,
    }


def test_content_element_outputs_div():
    html = _element_to_html(_content_elem())
    assert '<div id="content-test-content-1"' in html


def test_content_element_has_slide_content_html_variable():
    html = _element_to_html(_content_elem())
    assert "{{ slide_content_html | safe }}" in html


def test_content_element_has_scoped_css():
    html = _element_to_html(_content_elem())
    assert "#content-test-content-1 p" in html
    assert "#content-test-content-1 ul" in html
    assert "#content-test-content-1 strong" in html


def test_content_element_has_autofit_script():
    html = _element_to_html(_content_elem())
    assert "<script>" in html
    assert "scrollHeight" in html
    assert "fontSize" in html
    assert "window.addEventListener" in html
    assert "load" in html


def test_content_element_para_gap_in_css():
    html = _element_to_html(_content_elem(paraGap=30))
    assert "margin-bottom:30px" in html


def test_content_element_font_size_in_style():
    html = _element_to_html(_content_elem(fontSize=52))
    assert "font-size:52px" in html


def test_content_element_color_in_style():
    html = _element_to_html(_content_elem(color="#ff0000"))
    assert "color:#ff0000" in html


def test_content_element_position():
    html = _element_to_html(_content_elem())
    assert "left:130px" in html
    assert "top:310px" in html
    assert "width:820px" in html
    assert "height:800px" in html


def test_content_element_autofit_uses_font_size_as_upper_bound():
    html = _element_to_html(_content_elem(fontSize=52))
    assert "hi=52" in html


def test_content_element_hidden_returns_empty():
    elem = _content_elem()
    elem["visible"] = False
    assert _element_to_html(elem) == ""
