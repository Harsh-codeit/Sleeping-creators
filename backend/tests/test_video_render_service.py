import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import video_render_service


def _template(field_schema, defaults=None):
    return {
        "id": "tpl-uuid",
        "creatomate_template_id": "tpl-cm-id",
        "field_schema": field_schema,
        "defaults": defaults or {},
        "status": "active",
    }


@pytest.mark.asyncio
async def test_build_modifications_brand_override_wins_over_default():
    template = _template(
        field_schema=[{"key": "BrandColor", "role": "brand_style", "kind": "color", "inferred": True}],
        defaults={"BrandColor": "#000000"},
    )
    client = {"id": "c1", "brand_overrides": {"color": "#FF0066"}}

    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert mods["BrandColor"] == "#FF0066"


@pytest.mark.asyncio
async def test_build_modifications_uses_template_default_when_no_override():
    template = _template(
        field_schema=[{"key": "BrandColor", "role": "brand_style", "kind": "color", "inferred": True}],
        defaults={"BrandColor": "#000000"},
    )
    client = {"id": "c1", "brand_overrides": {}}

    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    # template default → omitted from modifications (Creatomate uses baked-in value)
    assert "BrandColor" not in mods


@pytest.mark.asyncio
async def test_build_modifications_static_role_is_omitted():
    template = _template(
        field_schema=[{"key": "Tagline", "role": "static_text", "kind": "text", "inferred": True}],
        defaults={"Tagline": "Frozen brand line"},
    )
    client = {"id": "c1", "brand_overrides": {}}
    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert "Tagline" not in mods
