"""
Converts canvas JSON (elements + background) into a Jinja2 HTML template string.
Also defines the 3 starter template definitions.
"""

STARTER_TEMPLATES = [
    {
        "name": "Dark Card",
        "description": "Twitter/X style dark theme with black background",
        "scope": "global",
        "client_id": None,
        "cloned_from": None,
        "thumbnail_url": "",
        "is_starter": True,
        "created_by": "system",
        "dimension_preset": "instagram_4x5",
        "canvas": {
            "width": 1080,
            "height": 1350,
            "background": {"type": "solid", "value": "#000000"},
        },
        "elements": [
            {
                "id": "starter-dc-bg",
                "type": "shape",
                "label": "Card Background",
                "x": 65, "y": 65, "width": 950, "height": 1220,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 1, "locked": False, "visible": True,
                "props": {"shape": "rect", "fill": "#0f0f0f", "stroke": "none", "strokeWidth": 0, "borderRadius": 36},
            },
            {
                "id": "starter-dc-avatar",
                "type": "author_block",
                "label": "Author",
                "x": 130, "y": 130, "width": 820, "height": 120,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 2, "locked": False, "visible": True,
                "props": {"showAvatar": True, "showName": True, "showHandle": True, "showTitle": True, "layout": "horizontal", "fontSize": 32, "color": "#f0f0f0"},
            },
            {
                "id": "starter-dc-content",
                "type": "text",
                "label": "Slide Content",
                "x": 130, "y": 310, "width": 820, "height": 800,
                "grid_col": 1, "grid_row": 2,
                "rotation": 0, "z_index": 3, "locked": False, "visible": True,
                "props": {"content": "{{ slide_content }}", "fontSize": 44, "fontFamily": "Sora", "fontWeight": "600", "color": "#f0f0f0", "textAlign": "left", "lineHeight": 1.5, "padding": 0},
            },
        ],
        "jinja2_html": "",
    },
    {
        "name": "Quote White",
        "description": "Clean white theme with dark text",
        "scope": "global",
        "client_id": None,
        "cloned_from": None,
        "thumbnail_url": "",
        "is_starter": True,
        "created_by": "system",
        "dimension_preset": "instagram_4x5",
        "canvas": {
            "width": 1080,
            "height": 1350,
            "background": {"type": "solid", "value": "#ffffff"},
        },
        "elements": [
            {
                "id": "starter-fw-bg",
                "type": "shape",
                "label": "Card Background",
                "x": 65, "y": 65, "width": 950, "height": 1220,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 1, "locked": False, "visible": True,
                "props": {"shape": "rect", "fill": "#ffffff", "stroke": "#e5e5e5", "strokeWidth": 1, "borderRadius": 36},
            },
            {
                "id": "starter-fw-avatar",
                "type": "author_block",
                "label": "Author",
                "x": 130, "y": 130, "width": 820, "height": 120,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 2, "locked": False, "visible": True,
                "props": {"showAvatar": True, "showName": True, "showHandle": True, "showTitle": True, "layout": "horizontal", "fontSize": 32, "color": "#0f1419"},
            },
            {
                "id": "starter-fw-content",
                "type": "text",
                "label": "Slide Content",
                "x": 130, "y": 310, "width": 820, "height": 800,
                "grid_col": 1, "grid_row": 2,
                "rotation": 0, "z_index": 3, "locked": False, "visible": True,
                "props": {"content": "{{ slide_content }}", "fontSize": 44, "fontFamily": "Sora", "fontWeight": "600", "color": "#0f1419", "textAlign": "left", "lineHeight": 1.5, "padding": 0},
            },
        ],
        "jinja2_html": "",
    },
    {
        "name": "Floating Card",
        "description": "Cream background with elevated white card and brown accents",
        "scope": "global",
        "client_id": None,
        "cloned_from": None,
        "thumbnail_url": "",
        "is_starter": True,
        "created_by": "system",
        "dimension_preset": "instagram_4x5",
        "canvas": {
            "width": 1080,
            "height": 1350,
            "background": {"type": "solid", "value": "#FDF6EC"},
        },
        "elements": [
            {
                "id": "starter-fc-bg",
                "type": "shape",
                "label": "Card Background",
                "x": 65, "y": 65, "width": 950, "height": 1220,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 1, "locked": False, "visible": True,
                "props": {"shape": "rect", "fill": "#ffffff", "stroke": "none", "strokeWidth": 0, "borderRadius": 36},
            },
            {
                "id": "starter-fc-avatar",
                "type": "author_block",
                "label": "Author",
                "x": 130, "y": 130, "width": 820, "height": 120,
                "grid_col": 1, "grid_row": 1,
                "rotation": 0, "z_index": 2, "locked": False, "visible": True,
                "props": {"showAvatar": True, "showName": True, "showHandle": True, "showTitle": True, "layout": "horizontal", "fontSize": 32, "color": "#8B6914"},
            },
            {
                "id": "starter-fc-content",
                "type": "text",
                "label": "Slide Content",
                "x": 130, "y": 310, "width": 820, "height": 800,
                "grid_col": 1, "grid_row": 2,
                "rotation": 0, "z_index": 3, "locked": False, "visible": True,
                "props": {"content": "{{ slide_content }}", "fontSize": 44, "fontFamily": "Sora", "fontWeight": "600", "color": "#1a1a1a", "textAlign": "left", "lineHeight": 1.5, "padding": 0},
            },
        ],
        "jinja2_html": "",
    },
]


_FONT_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800'
    '&family=Inter:wght@400;500&display=swap" rel="stylesheet">'
)

# Font stack used everywhere — must match frontend's CanvasElement preview so
# that what the user designs is exactly what the backend renders.
_FONT_STACK_FALLBACK = "'Helvetica','Helvetica Neue',Arial,sans-serif"


def _font_stack(ff: str) -> str:
    """Build a CSS font-family stack. Falls back to Helvetica → Helvetica Neue → Arial → sans-serif."""
    if not ff:
        return _FONT_STACK_FALLBACK
    return f"'{ff}',{_FONT_STACK_FALLBACK}"


def _helvetica_font_face_css() -> str:
    """Embed Helvetica as base64 @font-face so it renders even in headless Chromium."""
    import base64
    from pathlib import Path as _Path
    fonts_dir = _Path(__file__).parent / "fonts" / "helvetica"

    def _b64(fn: str) -> str:
        p = fonts_dir / fn
        return base64.b64encode(p.read_bytes()).decode() if p.exists() else ""

    regular = _b64("Helvetica.ttf")
    bold    = _b64("Helvetica-Bold.ttf")
    parts = []
    if regular:
        parts.append(
            f"@font-face{{font-family:'Helvetica';"
            f"src:url('data:font/truetype;base64,{regular}') format('truetype');"
            f"font-weight:400;font-style:normal;}}"
        )
    if bold:
        parts.append(
            f"@font-face{{font-family:'Helvetica';"
            f"src:url('data:font/truetype;base64,{bold}') format('truetype');"
            f"font-weight:700;font-style:normal;}}"
        )
        parts.append(
            f"@font-face{{font-family:'Helvetica';"
            f"src:url('data:font/truetype;base64,{bold}') format('truetype');"
            f"font-weight:800;font-style:normal;}}"
        )
    return "".join(parts)


def _bg_css(background: dict) -> str:
    bg_type = background.get("type", "solid")
    value = background.get("value", "#000000")
    if bg_type == "solid":
        return f"background:{value};"
    elif bg_type == "gradient":
        return f"background:{value};"
    elif bg_type == "image":
        return f"background:url('{value}') center/cover no-repeat;"
    return f"background:{value};"


def _element_to_html(elem: dict) -> str:
    """Convert a single canvas element to positioned HTML."""
    etype = elem.get("type", "text")
    props = elem.get("props", {})
    x = elem.get("x", 0)
    y = elem.get("y", 0)
    w = elem.get("width", 200)
    h = elem.get("height", 50)
    rotation = elem.get("rotation", 0)
    z = elem.get("z_index", 1)
    visible = elem.get("visible", True)

    if not visible:
        return ""

    base_style = (
        f"position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;"
        f"z-index:{z};"
    )
    if rotation:
        base_style += f"transform:rotate({rotation}deg);"

    if etype == "text":
        content = props.get("content", "")
        fs = props.get("fontSize", 44)
        ff = props.get("fontFamily") or "Helvetica"
        fw = props.get("fontWeight", "600")
        color = props.get("color", "#ffffff")
        align = props.get("textAlign", "left")
        lh = props.get("lineHeight", 1.5)
        pad = props.get("padding", 0)
        ls = props.get("letterSpacing", 0)
        ls_css = f"letter-spacing:{ls}px;" if ls else ""
        style = (
            f"{base_style}font-size:{fs}px;font-family:{_font_stack(ff)};"
            f"font-weight:{fw};color:{color};text-align:{align};"
            f"line-height:{lh};padding:{pad}px;overflow:hidden;{ls_css}"
        )
        if "{{" in content:
            return f'<div style="{style}">{content}</div>'
        return f'<div style="{style}">{content}</div>'

    elif etype == "shape":
        shape = props.get("shape", "rect")
        fill = props.get("fill", "#333333")
        stroke = props.get("stroke", "none")
        sw = props.get("strokeWidth", 0)
        br = props.get("borderRadius", 0)
        border_css = f"border:{sw}px solid {stroke};" if stroke and stroke != "none" else ""
        if shape == "circle":
            br_css = "50%"
        else:
            br_css = f"{br}px"
        style = f"{base_style}background:{fill};border-radius:{br_css};{border_css}"
        return f'<div style="{style}"></div>'

    elif etype == "image":
        src = props.get("src", "")
        fit = props.get("fit", "cover")
        br = props.get("borderRadius", 0)
        opacity = props.get("opacity", 1)
        style = f"{base_style}border-radius:{br}px;overflow:hidden;opacity:{opacity};"
        return f'<div style="{style}"><img src="{src}" style="width:100%;height:100%;object-fit:{fit};"/></div>'

    elif etype == "drive_image":
        fit        = props.get("fit", "cover")
        opacity    = props.get("opacity", 1)
        br         = props.get("borderRadius", 0)
        bw         = props.get("borderWidth", 0)
        bc         = props.get("borderColor", "transparent")
        blend      = props.get("blendMode", "normal")
        border_css = f"border:{bw}px solid {bc};" if bw else ""
        style = f"{base_style}overflow:hidden;opacity:{opacity};border-radius:{br}px;{border_css}mix-blend-mode:{blend};"
        placeholder = (
            '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;'
            'background:rgba(99,102,241,0.1);border:2px dashed rgba(99,102,241,0.4);">'
            '<span style="color:#6366f1;font-size:12px;font-family:monospace;">Drive Image</span></div>'
        )
        return (
            f'<div style="{style}">'
            f'{{% if drive_image_src %}}'
            f'<img src="{{{{ drive_image_src }}}}" style="width:100%;height:100%;object-fit:{fit};"/>'
            f'{{% else %}}{placeholder}{{% endif %}}'
            f'</div>'
        )

    elif etype == "icon":
        icon_name = props.get("iconName", "")
        size = props.get("size", 24)
        color = props.get("color", "#ffffff")
        style = f"{base_style}font-size:{size}px;color:{color};display:flex;align-items:center;justify-content:center;"
        return f'<div style="{style}">{icon_name}</div>'

    elif etype == "author_block":
        layout = props.get("layout", "horizontal")
        fs = props.get("fontSize", 32)
        color = props.get("color", "#ffffff")
        show_avatar = props.get("showAvatar", True)
        show_name   = props.get("showName", True)
        show_handle = props.get("showHandle", True)
        show_title  = props.get("showTitle", True)
        flex_dir = "row" if layout == "horizontal" else "column"
        style = f"{base_style}display:flex;flex-direction:{flex_dir};align-items:center;gap:16px;"

        avatar_html = ""
        if show_avatar:
            avatar_html = (
                f'{{% if author_avatar %}}<div style="width:94px;height:94px;border-radius:50%;overflow:hidden;flex-shrink:0;">'
                f'<img src="{{{{ author_avatar }}}}" style="width:100%;height:100%;object-fit:cover;"/></div>{{% endif %}}'
            )

        name_html = ""
        if show_name:
            name_html = (
                f'<span style="font-size:{fs}px;font-weight:700;color:{color};font-family:{_FONT_STACK_FALLBACK};">{{{{ author_name }}}}</span>'
                f'<span style="width:36px;height:36px;background:#3b82f6;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">'
                f'<svg width="22" height="22" viewBox="0 0 11 11" fill="none"><path d="M2 5.5L4.5 8L9 3" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
            )

        sub_parts = []
        if show_handle:
            sub_parts.append(f'{{{{ author_handle }}}}')
        if show_title:
            title_str = (f'{{% if author_title %}} · {{{{ author_title }}}}{{% endif %}}' if show_handle
                         else f'{{{{ author_title }}}}')
            sub_parts.append(title_str)
        sub_html = ""
        if sub_parts:
            sub_html = (
                f'<span style="font-size:{int(fs * 0.65)}px;color:{color};opacity:0.6;font-family:{_FONT_STACK_FALLBACK};">'
                + "".join(sub_parts) + f'</span>'
            )

        return (
            f'<div style="{style}">'
            f'{avatar_html}'
            f'<div style="display:flex;flex-direction:column;gap:4px;">'
            f'<div style="display:flex;align-items:center;gap:10px;">'
            f'{name_html}'
            f'</div>'
            f'{sub_html}'
            f'</div></div>'
        )

    elif etype == "content":
        fs      = props.get("fontSize", 44)
        ff      = props.get("fontFamily") or "Helvetica"
        fw      = props.get("fontWeight", "600")
        color   = props.get("color", "#ffffff")
        align   = props.get("textAlign", "left")
        lh      = props.get("lineHeight", 1.6)
        para_gap = int(props.get("paraGap", 24))
        ls      = props.get("letterSpacing", 0)
        ls_css  = f"letter-spacing:{ls}px;" if ls else ""
        elem_id  = elem.get("id", "content")
        style = (
            f"{base_style}font-size:{fs}px;font-family:{_font_stack(ff)};"
            f"font-weight:{fw};color:{color};text-align:{align};"
            f"line-height:{lh};overflow:hidden;{ls_css}"
        )
        return (
            f'<div id="content-{elem_id}" style="{style}">'
            f'<style>'
            f'#content-{elem_id} p{{margin-bottom:{para_gap}px;margin-top:0;}}'
            f'#content-{elem_id} p:last-child{{margin-bottom:0;}}'
            f'#content-{elem_id} ul,#content-{elem_id} ol{{padding-left:1.4em;margin-bottom:{para_gap}px;}}'
            f'#content-{elem_id} li{{margin-bottom:{max(para_gap//2,8)}px;}}'
            f'#content-{elem_id} strong{{font-weight:800;}}'
            f'</style>'
            f'{{{{ slide_content_html | safe }}}}'
            f'<script>'
            f'window.addEventListener("load",function(){{'
            f'var el=document.getElementById("content-{elem_id}");'
            f'if(!el)return;'
            f'var h=el.offsetHeight,w=el.offsetWidth;'
            f'if(!h||!w)return;'
            f'if(el.scrollHeight<=h&&el.scrollWidth<=w)return;'
            f'var lo=10,hi={fs},mid;'
            f'for(var i=0;i<24;i++){{'
            f'mid=Math.floor((lo+hi)/2);'
            f'el.style.fontSize=mid+"px";'
            f'if(el.scrollHeight<=h&&el.scrollWidth<=w)lo=mid;else hi=mid-1;'
            f'}}'
            f'el.style.fontSize=lo+"px";'
            f'}});'
            f'</script>'
            f'</div>'
        )

    elif etype == "logo":
        src = props.get("src", "")
        fit = props.get("fit", "contain")
        opacity = props.get("opacity", 1)
        style = f"{base_style}opacity:{opacity};"
        return f'<div style="{style}"><img src="{src}" style="width:100%;height:100%;object-fit:{fit};"/></div>'

    return ""


def canvas_to_jinja2(canvas: dict, elements: list) -> str:
    """Convert canvas JSON + elements list into a full Jinja2 HTML template string."""
    width = canvas.get("width", 1080)
    height = canvas.get("height", 1350)
    bg = _bg_css(canvas.get("background", {"type": "solid", "value": "#000000"}))

    # Sort elements by z_index
    sorted_elems = sorted(elements, key=lambda e: e.get("z_index", 1))
    elements_html = "\n    ".join(_element_to_html(e) for e in sorted_elems if e.get("visible", True))

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
{_FONT_LINK}
<style>
  {_helvetica_font_face_css()}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ width:{width}px; height:{height}px; overflow:hidden; {bg} position:relative;
         font-family:{_FONT_STACK_FALLBACK}; }}
</style>
</head>
<body>
    {elements_html}
</body>
</html>"""
