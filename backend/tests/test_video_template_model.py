import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import VideoElement, VideoTemplateCreate, VideoTemplateUpdate, VideoPostCreate

def test_video_element_defaults():
    el = VideoElement(type="text_overlay")
    assert el.x_ratio == 0.5
    assert el.y_ratio == 0.5
    assert el.z_index == 0
    assert el.start_at == 0.0
    assert el.duration is None
    assert el.animation_in == "none"
    assert el.animation_out == "none"
    assert el.overridable is False
    assert el.override_key is None
    assert el.props == {}

def test_video_template_create_with_elements():
    t = VideoTemplateCreate(
        name="Test",
        aspect_ratio="9:16",
        video_overridable=True,
        elements=[
            VideoElement(
                type="cta_button",
                x_ratio=0.5, y_ratio=0.88,
                overridable=True, override_key="cta",
                props={"text": "Shop Now", "bg_color": "#ffffff", "text_color": "#000000",
                       "border_radius": 999, "arrow": True, "gradient": False,
                       "gradient_from": "#ffffff", "gradient_to": "#cccccc"},
            )
        ],
    )
    assert t.name == "Test"
    assert len(t.elements) == 1
    assert t.elements[0].type == "cta_button"
    assert t.elements[0].override_key == "cta"

def test_video_template_update_partial():
    u = VideoTemplateUpdate(name="Renamed")
    assert u.name == "Renamed"
    assert u.elements is None

def test_video_post_create_overrides():
    p = VideoPostCreate(client_id="c1", platforms=["instagram"])
    assert p.overrides == {}
    p2 = VideoPostCreate(client_id="c1", platforms=["instagram"],
                         overrides={"cta": "Buy Now"})
    assert p2.overrides["cta"] == "Buy Now"
