import pytest
from creatomate_template_importer import classify_by_type_only


def test_classify_by_type_only_text_to_ai_text():
    elements = [{"name": "Title", "type": "text", "text": "Hello"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["key"] == "Title"
    assert schema[0]["role"] == "ai_text"
    assert schema[0]["kind"] == "text"


def test_classify_by_type_only_video_to_clip():
    elements = [{"name": "v1", "type": "video", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "clip"
    assert schema[0]["kind"] == "video"


def test_classify_by_type_only_image_to_logo():
    elements = [{"name": "logo", "type": "image", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "logo"


def test_classify_by_type_only_audio_to_audio():
    elements = [{"name": "music", "type": "audio", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "audio"


def test_classify_by_type_only_shape_to_decorative():
    elements = [{"name": "Rect 1", "type": "shape"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "decorative"
