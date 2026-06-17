import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from google_drive_service import list_images


def test_list_images_filters_to_image_mime_types():
    mock_service = MagicMock()
    mock_service.files().list().execute.return_value = {
        "files": [
            {"id": "img1", "name": "photo.jpg",  "mimeType": "image/jpeg"},
            {"id": "vid1", "name": "clip.mp4",   "mimeType": "video/mp4"},
            {"id": "img2", "name": "banner.png", "mimeType": "image/png"},
            {"id": "doc1", "name": "doc.pdf",    "mimeType": "application/pdf"},
            {"id": "img3", "name": "hero.webp",  "mimeType": "image/webp"},
            {"id": "img4", "name": "anim.gif",   "mimeType": "image/gif"},
        ]
    }
    with patch("google_drive_service._build_service", return_value=mock_service):
        result = list_images("fake_token", "folder123")

    ids = [f["drive_file_id"] for f in result]
    assert set(ids) == {"img1", "img2", "img3", "img4"}
    assert all(f["mime_type"] in {"image/jpeg", "image/png", "image/webp", "image/gif"} for f in result)


def test_list_images_returns_empty_for_empty_folder():
    mock_service = MagicMock()
    mock_service.files().list().execute.return_value = {"files": []}
    with patch("google_drive_service._build_service", return_value=mock_service):
        result = list_images("token", "folder")
    assert result == []


def test_client_update_accepts_drive_images_folder_id():
    from server import ClientUpdate
    data = ClientUpdate(drive_images_folder_id="1AbCdEfGhIjKlMnO")
    dumped = data.model_dump(exclude_none=True)
    assert dumped["drive_images_folder_id"] == "1AbCdEfGhIjKlMnO"


def test_client_update_drive_images_folder_id_is_optional():
    from server import ClientUpdate
    data = ClientUpdate(name="TestClient")
    dumped = data.model_dump(exclude_none=True)
    assert "drive_images_folder_id" not in dumped


def test_pick_drive_image_selects_by_index():
    from server import _pick_drive_image
    images = [
        {"drive_file_id": "a", "name": "a.jpg"},
        {"drive_file_id": "b", "name": "b.jpg"},
        {"drive_file_id": "c", "name": "c.jpg"},
    ]
    assert _pick_drive_image(images, 0)["drive_file_id"] == "a"
    assert _pick_drive_image(images, 1)["drive_file_id"] == "b"
    assert _pick_drive_image(images, 2)["drive_file_id"] == "c"


def test_pick_drive_image_wraps_at_end():
    from server import _pick_drive_image
    images = [{"drive_file_id": "a", "name": "a.jpg"}, {"drive_file_id": "b", "name": "b.jpg"}]
    assert _pick_drive_image(images, 2)["drive_file_id"] == "a"
    assert _pick_drive_image(images, 3)["drive_file_id"] == "b"
    assert _pick_drive_image(images, 5)["drive_file_id"] == "b"


def test_pick_drive_image_raises_on_empty():
    from server import _pick_drive_image
    import pytest
    with pytest.raises(ValueError, match="no images"):
        _pick_drive_image([], 0)


def test_inject_elements_adds_positioned_img_tag():
    from carousel_renderer import _inject_elements
    html = "<html><body><div>slide</div></body></html>"
    elements = [{
        "type": "image", "drive_source": True,
        "x": 0.1, "y": 0.2, "width": 0.5, "height": 0.3,
        "rotation": 0.0, "opacity": 1.0,
    }]
    result = _inject_elements(html, elements, "data:image/jpeg;base64,abc123")
    assert "<img" in result
    assert "position:absolute" in result
    assert "108.0px" in result   # 0.1 * 1080
    assert "270.0px" in result   # 0.2 * 1350
    assert "540.0px" in result   # 0.5 * 1080
    assert "405.0px" in result   # 0.3 * 1350


def test_inject_elements_returns_html_unchanged_when_no_src():
    from carousel_renderer import _inject_elements
    html = "<html><body></body></html>"
    elements = [{"type": "image", "drive_source": True, "x": 0, "y": 0, "width": 0.5, "height": 0.5}]
    assert _inject_elements(html, elements, None) == html


def test_inject_elements_skips_non_image_type():
    from carousel_renderer import _inject_elements
    html = "<html><body></body></html>"
    elements = [{"type": "text", "x": 0, "y": 0, "width": 0.5, "height": 0.5}]
    result = _inject_elements(html, elements, "data:image/jpeg;base64,abc")
    assert "<img" not in result


def test_get_file_metadata_returns_name_and_mime():
    mock_service = MagicMock()
    mock_service.files().get().execute.return_value = {
        "id": "img1", "name": "hero.png", "mimeType": "image/png",
    }
    with patch("google_drive_service._build_service", return_value=mock_service):
        from google_drive_service import get_file_metadata
        meta = get_file_metadata("tok", "img1")
    assert meta == {"drive_file_id": "img1", "name": "hero.png", "mime_type": "image/png"}


def test_with_drive_thumbnails_adds_thumbnail_url():
    from server import _with_drive_thumbnails
    out = _with_drive_thumbnails([
        {"drive_file_id": "abc", "name": "a.jpg", "mime_type": "image/jpeg"},
    ])
    assert out[0]["drive_file_id"] == "abc"
    assert out[0]["thumbnail_url"] == "https://drive.google.com/thumbnail?id=abc&sz=w320"


def test_carousel_create_accepts_drive_image_file_id():
    from server import CarouselCreate
    data = CarouselCreate(client_id="c1", drive_image_file_id="FILE123")
    dumped = data.model_dump()
    assert dumped["drive_image_file_id"] == "FILE123"


def test_carousel_preview_request_accepts_drive_image_file_id():
    from server import CarouselPreviewRequest
    data = CarouselPreviewRequest(client_id="c1", drive_image_file_id="FILE123")
    assert data.drive_image_file_id == "FILE123"


@pytest.mark.asyncio
async def test_download_by_file_id_returns_path():
    import server, google_drive_service, os
    with patch.object(server, "_get_google_refresh_token", AsyncMock(return_value="tok")), \
         patch.object(google_drive_service, "get_file_metadata",
                      return_value={"drive_file_id": "F", "name": "x.png", "mime_type": "image/png"}), \
         patch.object(google_drive_service, "download_clip", return_value="ignored") as dl:
        path = await server._download_drive_image_by_file_id("F")
    assert path is not None and path.endswith(".png")
    assert dl.call_args.args[1] == "F"   # download called with the file id
    if path and os.path.exists(path):
        os.unlink(path)


@pytest.mark.asyncio
async def test_download_by_file_id_returns_none_on_failure():
    import server, google_drive_service
    with patch.object(server, "_get_google_refresh_token", AsyncMock(return_value="tok")), \
         patch.object(google_drive_service, "get_file_metadata",
                      return_value={"drive_file_id": "F", "name": "x.png", "mime_type": "image/png"}), \
         patch.object(google_drive_service, "download_clip", side_effect=RuntimeError("boom")):
        path = await server._download_drive_image_by_file_id("F")
    assert path is None


@pytest.mark.asyncio
async def test_download_by_file_id_returns_none_without_token():
    import server
    with patch.object(server, "_get_google_refresh_token", AsyncMock(return_value=None)):
        assert await server._download_drive_image_by_file_id("F") is None
