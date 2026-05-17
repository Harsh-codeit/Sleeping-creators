import shotstack_service


def _timeline(clips):
    return {"tracks": [{"clips": clips}]}


def _video_clip(src):
    return {"asset": {"type": "video", "src": src}, "start": 0, "length": 5}


def _audio_clip(src):
    return {"asset": {"type": "audio", "src": src}, "start": 0, "length": 5}


def _text_clip(text):
    return {"asset": {"type": "rich-text", "text": text}, "start": 0, "length": 5}


def test_apply_video_transcode_sets_flag_on_video_clips():
    timeline = _timeline([_video_clip("{{ MEDIA_1 }}"), _video_clip("https://x/baked.mp4")])
    shotstack_service._apply_video_transcode(timeline)
    clips = timeline["tracks"][0]["clips"]
    assert clips[0]["asset"]["transcode"] is True
    assert clips[1]["asset"]["transcode"] is True


def test_apply_video_transcode_skips_non_video_clips():
    timeline = _timeline([_audio_clip("https://x/music.mp3"), _text_clip("Hello")])
    shotstack_service._apply_video_transcode(timeline)
    clips = timeline["tracks"][0]["clips"]
    assert "transcode" not in clips[0]["asset"]
    assert "transcode" not in clips[1]["asset"]


def test_apply_video_transcode_is_idempotent():
    timeline = _timeline([_video_clip("{{ MEDIA_1 }}")])
    shotstack_service._apply_video_transcode(timeline)
    shotstack_service._apply_video_transcode(timeline)
    assert timeline["tracks"][0]["clips"][0]["asset"]["transcode"] is True


def test_apply_video_transcode_noop_on_empty_timeline():
    shotstack_service._apply_video_transcode({})
    shotstack_service._apply_video_transcode({"tracks": []})
