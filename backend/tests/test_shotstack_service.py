import shotstack_service


def _timeline(srcs):
    return {
        "tracks": [
            {"clips": [
                {"asset": {"type": "video", "src": s}, "start": 0, "length": 5}
                for s in srcs
            ]}
        ]
    }


def test_apply_clip_rotation_targets_only_matching_placeholder():
    timeline = _timeline(["{{ MEDIA_1 }}", "{{ MEDIA_2 }}", "https://x/baked.mp4"])
    shotstack_service._apply_clip_rotation(timeline, {"MEDIA_2": -90})

    clips = timeline["tracks"][0]["clips"]
    assert "transform" not in clips[0]
    assert clips[1]["transform"] == {"rotate": {"angle": -90}}
    assert "transform" not in clips[2]


def test_apply_clip_rotation_handles_whitespace_variants():
    # Shotstack templates often spell placeholders with surrounding whitespace.
    # The mutator must match `{{ MEDIA_2 }}` and `{{MEDIA_2}}` identically.
    for src in ("{{MEDIA_2}}", "{{ MEDIA_2 }}", "{{   MEDIA_2   }}"):
        timeline = _timeline([src])
        shotstack_service._apply_clip_rotation(timeline, {"MEDIA_2": -90})
        assert timeline["tracks"][0]["clips"][0]["transform"] == {"rotate": {"angle": -90}}


def test_apply_clip_rotation_preserves_existing_transform():
    timeline = _timeline(["{{ MEDIA_1 }}"])
    timeline["tracks"][0]["clips"][0]["transform"] = {"scale": 1.5, "rotate": {"angle": 0}}
    shotstack_service._apply_clip_rotation(timeline, {"MEDIA_1": -90})

    transform = timeline["tracks"][0]["clips"][0]["transform"]
    assert transform["scale"] == 1.5  # untouched sibling
    assert transform["rotate"] == {"angle": -90}  # overwritten


def test_apply_clip_rotation_noop_for_empty_overrides():
    timeline = _timeline(["{{ MEDIA_1 }}"])
    shotstack_service._apply_clip_rotation(timeline, None)
    shotstack_service._apply_clip_rotation(timeline, {})
    assert "transform" not in timeline["tracks"][0]["clips"][0]


def test_apply_clip_rotation_skips_substituted_urls():
    # If asset.src has already been replaced with an R2 URL (no `{{` left),
    # we cannot identify the clip — leave it alone rather than guess.
    timeline = _timeline(["https://r2.x/clip.mp4"])
    shotstack_service._apply_clip_rotation(timeline, {"MEDIA_1": -90})
    assert "transform" not in timeline["tracks"][0]["clips"][0]
