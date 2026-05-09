import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const ASPECT_RATIOS = [
  { key: "9:16", w: 9, h: 16 },
  { key: "1:1",  w: 1, h: 1  },
  { key: "16:9", w: 16, h: 9 },
  { key: "4:5",  w: 4, h: 5  },
];

const SIZE_PX = { S: 14, M: 18, L: 24 };

const FONT_MAP = {
  bold_sans:      { fontFamily: "'Liberation Sans', Arial, sans-serif", fontWeight: 700 },
  elegant_serif:  { fontFamily: "Georgia, 'DejaVu Serif', serif", fontStyle: "italic" },
  handwritten:    { fontFamily: "cursive", fontWeight: 600 },
  modern_display: { fontFamily: "'Liberation Sans', Arial, sans-serif", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" },
};

function easeOut(t) {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
}

function useDrag(xRatio, yRatio, containerW, containerH, enabled, onDrag) {
  const dragging = useRef(false);
  const start = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const onMouseDown = useCallback((e) => {
    if (!enabled) return;
    e.preventDefault();
    dragging.current = true;
    start.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: xRatio * containerW,
      oy: yRatio * containerH,
    };
    const onMove = (ev) => {
      if (!dragging.current) return;
      const nx = start.current.ox + (ev.clientX - start.current.mx);
      const ny = start.current.oy + (ev.clientY - start.current.my);
      onDrag(
        Math.min(Math.max(nx / containerW, 0), 1),
        Math.min(Math.max(ny / containerH, 0), 1)
      );
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [xRatio, yRatio, containerW, containerH, enabled, onDrag]);

  return { onMouseDown };
}

function CTATextOverlay({ template, containerW, containerH, editable, onDrag }) {
  const t = template;
  const drag = useDrag(
    t?.cta_text_x_ratio ?? 0.5,
    t?.cta_text_y_ratio ?? 0.78,
    containerW, containerH, editable,
    (nx, ny) => onDrag?.("cta_text", nx, ny)
  );

  if (!t?.cta_text) return null;

  const fontSize = SIZE_PX[t.cta_text_size] ?? 16;
  const x = (t.cta_text_x_ratio ?? 0.5) * containerW;
  const y = (t.cta_text_y_ratio ?? 0.78) * containerH;

  const style = {
    position: "absolute",
    left: x,
    top: y,
    transform: "translate(-50%, -50%)",
    fontSize,
    color: t.cta_text_color || "#ffffff",
    ...FONT_MAP[template?.font_preset] || FONT_MAP.bold_sans,
    whiteSpace: "nowrap",
    cursor: editable ? "grab" : "default",
    userSelect: "none",
    padding: t.cta_text_bg ? "4px 12px" : 0,
    background: t.cta_text_bg
      ? hexAlpha(t.cta_text_bg_color || "#000000", t.cta_text_bg_opacity ?? 0.5)
      : "transparent",
    borderRadius: t.cta_text_bg ? 999 : 0,
  };

  return <div style={style} {...drag}>{t.cta_text}</div>;
}

function CTAButtonOverlay({ template, containerW, containerH, editable, onDrag, currentTime }) {
  const t = template;
  const drag = useDrag(
    t?.cta_button_x_ratio ?? 0.5,
    t?.cta_button_y_ratio ?? 0.88,
    containerW, containerH, editable,
    (nx, ny) => onDrag?.("cta_button", nx, ny)
  );

  if (!t?.cta_button_text) return null;

  const delay = t.cta_delay ?? 3;
  const anim = t.cta_animation || "slide_up";
  const elapsed = Math.max((currentTime ?? 0) - delay, 0);
  const duration = 0.4;
  const progress = easeOut(elapsed / duration);

  const fontSize = SIZE_PX[t.cta_button_size] ?? 16;
  const x = (t.cta_button_x_ratio ?? 0.5) * containerW;
  const y = (t.cta_button_y_ratio ?? 0.88) * containerH;

  let transform = "translate(-50%, -50%)";
  let opacity = 1;

  if (elapsed < duration || currentTime === undefined) {
    if (anim === "slide_up") {
      const offset = (1 - progress) * 40;
      transform = `translate(-50%, calc(-50% + ${offset}px))`;
      opacity = progress;
    } else if (anim === "fade") {
      opacity = progress;
    } else if (anim === "pop") {
      const scale = 0.5 + progress * 0.5;
      transform = `translate(-50%, -50%) scale(${scale})`;
      opacity = progress;
    } else if (anim === "slide_in") {
      const offset = (1 - progress) * containerW * 0.4;
      transform = `translate(calc(-50% + ${offset}px), -50%)`;
      opacity = progress;
    }
  }

  const style = {
    position: "absolute",
    left: x,
    top: y,
    transform,
    opacity,
    fontSize,
    color: t.cta_button_text_color || "#000000",
    background: t.cta_button_bg_color || "#ffffff",
    ...FONT_MAP[t?.font_preset] || FONT_MAP.bold_sans,
    whiteSpace: "nowrap",
    cursor: editable ? "grab" : "default",
    userSelect: "none",
    padding: "8px 20px",
    borderRadius: `${t.cta_button_border_radius ?? 999}px`,
    boxShadow: t.cta_button_shadow ? "3px 3px 0 rgba(0,0,0,0.4)" : "none",
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  return (
    <div style={style} {...drag}>
      {t.cta_button_text}
      {t.cta_button_arrow && <span style={{ fontSize: fontSize * 0.8 }}>→</span>}
    </div>
  );
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildOverlayStyle(style, color, opacity) {
  if (!style || style === "none") return null;
  const r = parseInt(color.slice(1,3), 16);
  const g = parseInt(color.slice(3,5), 16);
  const b = parseInt(color.slice(5,7), 16);
  const a = opacity;
  if (style === "color_tint")    return { background: `rgba(${r},${g},${b},${a})` };
  if (style === "gradient_wash") return { background: `linear-gradient(to top, rgba(${r},${g},${b},${a}) 0%, transparent 60%)` };
  if (style === "lower_thirds")  return { background: `linear-gradient(to top, rgba(${r},${g},${b},0.8) 35%, transparent 35%)` };
  if (style === "geometric")     return { background: `repeating-linear-gradient(45deg, rgba(0,0,0,0.24) 0, rgba(0,0,0,0.24) 8px, transparent 8px, transparent 16px)` };
  if (style === "blur")          return { backdropFilter: "blur(8px)", filter: "brightness(0.9)", background: "rgba(255,255,255,0.04)" };
  return null;
}

function OverlayLayer({ template, w, h }) {
  const s = buildOverlayStyle(
    template?.overlay_style || "none",
    template?.overlay_color || "#000000",
    template?.overlay_opacity ?? 0.5,
  );
  if (!s) return null;
  return (
    <div
      data-overlay
      style={{ position: "absolute", inset: 0, width: w, height: h, pointerEvents: "none", ...s }}
    />
  );
}

export default function VideoCanvasPreview({
  clip,
  template,
  aspectRatio = "9:16",
  editable = false,
  onPositionChange,
  videoRef: externalVideoRef,
  onPlaybackChange,
  hideBuiltInControls = false,
}) {
  const containerRef = useRef(null);
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef ?? internalVideoRef;
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const ar = ASPECT_RATIOS.find((a) => a.key === aspectRatio) || ASPECT_RATIOS[0];

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (w) => setDims({ w, h: (w * ar.h) / ar.w });
    if (el.clientWidth > 0) measure(el.clientWidth);
    const obs = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, [ar.w, ar.h]);

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [clip]);

  const handleDrag = useCallback((field, nx, ny) => {
    onPositionChange?.({ [`${field}_x_ratio`]: nx, [`${field}_y_ratio`]: ny });
  }, [onPositionChange]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
      onPlaybackChange?.({ currentTime, duration: videoRef.current.duration || 0, playing: false });
    } else {
      videoRef.current.play();
      setPlaying(true);
      onPlaybackChange?.({ currentTime, duration: videoRef.current.duration || 0, playing: true });
    }
  };

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <div
        style={{
          width: dims.w,
          height: dims.h,
          position: "relative",
          background: "#111",
          overflow: "hidden",
        }}
      >
        {clip?.url ? (
          <video
            ref={videoRef}
            src={clip.url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onTimeUpdate={(e) => {
              const t = e.target.currentTime;
              setCurrentTime(t);
              onPlaybackChange?.({ currentTime: t, duration: e.target.duration || 0, playing });
            }}
            onEnded={() => {
              setPlaying(false);
              onPlaybackChange?.({ currentTime, duration: videoRef.current?.duration || 0, playing: false });
            }}
            onLoadedMetadata={(e) => {
              if (videoRef.current) videoRef.current.currentTime = 0.01;
              onPlaybackChange?.({ currentTime: 0, duration: e.target.duration || 0, playing: false });
            }}
            playsInline
            muted
            preload="metadata"
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#555",
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            No clip selected
          </div>
        )}

        <OverlayLayer template={template} w={dims.w} h={dims.h} />

        {dims.w > 0 && (
          <>
            <CTATextOverlay
              template={template}
              containerW={dims.w}
              containerH={dims.h}
              editable={editable}
              onDrag={handleDrag}
            />
            <CTAButtonOverlay
              template={template}
              containerW={dims.w}
              containerH={dims.h}
              editable={editable}
              onDrag={handleDrag}
              currentTime={currentTime}
            />
          </>
        )}

        {clip?.url && !hideBuiltInControls && (
          <button
            onClick={togglePlay}
            style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.55)",
              border: "none",
              borderRadius: 999,
              color: "#fff",
              padding: "6px 16px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
      </div>
    </div>
  );
}
