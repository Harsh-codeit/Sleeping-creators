import { useRef, useCallback, useEffect } from "react";
import { Shuffle, Trash2, Copy, ChevronUp, ChevronDown } from "lucide-react";

const ASPECT_DIMS = { "9:16": [9, 16], "1:1": [1, 1], "16:9": [16, 9], "4:5": [4, 5] };
const FONT_CSS = {
  bold_sans:      "700 normal 'Liberation Sans', Arial, sans-serif",
  elegant_serif:  "italic normal Georgia, 'DejaVu Serif', serif",
  handwritten:    "600 normal cursive",
  modern_display: "900 normal 'Liberation Sans', Arial, sans-serif",
  helvetica:      "400 normal Helvetica, 'Helvetica Neue', Arial, sans-serif",
};

function ElementOverlay({ el, selected, containerW, containerH, onSelect, onDrag, getContainerRect }) {
  const cleanupListeners = useRef(null);

  useEffect(() => {
    return () => { if (cleanupListeners.current) cleanupListeners.current(); };
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.stopPropagation();
    onSelect(el.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = el.x_ratio;
    const initY = el.y_ratio;
    const onMove = (ev) => {
      const rect = getContainerRect?.();
      const w = rect?.width || containerW;
      const h = rect?.height || containerH;
      const dx = (ev.clientX - startX) / w;
      const dy = (ev.clientY - startY) / h;
      onDrag(el.id, {
        x_ratio: Math.max(-0.2, Math.min(1.2, initX + dx)),
        y_ratio: Math.max(-0.2, Math.min(1.2, initY + dy)),
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanupListeners.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cleanupListeners.current = onUp;
  }, [el, containerW, containerH, onSelect, onDrag, getContainerRect]);

  const px = el.x_ratio * containerW;
  const py = el.y_ratio * containerH;
  const p = el.props || {};
  const fontSize = p.size_px || 15;
  const fontFamily = FONT_CSS[p.font] || FONT_CSS.bold_sans;

  const style = {
    position: "absolute",
    left: px,
    top: py,
    width: "max-content",
    transform: "translate(-50%, -50%)",
    cursor: "grab",
    outline: selected ? "2px solid #ffffff" : "1px dashed transparent",
    borderRadius: 0,
    userSelect: "none",
    zIndex: el.z_index + 1,
  };

  const textBaseStyle = {
    lineHeight: p.line_height || 1.4,
    letterSpacing: p.letter_spacing ? `${p.letter_spacing}px` : "normal",
    font: fontFamily,
    fontSize,
  };

  let content = null;

  if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
    const hasBg = p.bg_shape && p.bg_shape !== "none";
    const bg = hasBg
      ? {
          background: `${p.bg_color || "#000"}${Math.round((p.bg_opacity ?? 0.5) * 255).toString(16).padStart(2, "0")}`,
          borderRadius: p.bg_shape === "pill" ? 999 : 4,
          padding: "3px 8px",
        }
      : {};
    content = (
      <span style={{ color: p.color || "#fff", ...textBaseStyle, ...bg }}>
        {p.text || el.type}
      </span>
    );
  } else if (el.type === "cta_button") {
    content = (
      <span style={{
        background: p.bg_color || "#fff",
        color: p.text_color || "#000",
        borderRadius: p.border_radius ?? 999,
        padding: "4px 14px",
        display: "inline-block",
        font: fontFamily,
        fontSize,
      }}>
        {p.text || "Button"}{p.arrow ? " →" : ""}
      </span>
    );
  } else if (el.type === "link_in_bio") {
    content = (
      <span style={{
        background: p.bg_color || "#000",
        color: p.text_color || "#fff",
        borderRadius: 6,
        padding: "3px 10px",
        fontWeight: "bold",
        fontSize: 12,
      }}>
        {p.text || "Link in bio"} ↗ {p.handle || ""}
      </span>
    );
  } else if (el.type === "countdown") {
    const val = p.end_at || 10;
    const m = String(Math.floor(val / 60)).padStart(2, "0");
    const s = String(Math.floor(val % 60)).padStart(2, "0");
    content = (
      <span style={{ color: p.color || "#fff", fontSize: p.size_px || 32, fontWeight: "bold", font: fontFamily }}>
        {m}:{s}
      </span>
    );
  } else if (["logo", "watermark"].includes(el.type)) {
    const w = (p.width_ratio || 0.15) * containerW;
    const h = (p.height_ratio || 0.08) * containerH;
    content = p.r2_url
      ? <img src={p.r2_url} style={{ width: w, height: h, objectFit: "contain", opacity: p.opacity ?? 1 }} alt="" />
      : (
        <div style={{ width: w, height: h, border: "1px dashed #666", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#666", fontSize: 10 }}>{el.type}</span>
        </div>
      );
  } else if (el.type === "rectangle") {
    const w = (p.width_ratio || 0.8) * containerW;
    const h = (p.height_ratio || 0.1) * containerH;
    content = (
      <div style={{
        width: w,
        height: h,
        background: `${p.fill_color || "#000"}${Math.round((p.fill_opacity ?? 0.5) * 255).toString(16).padStart(2, "0")}`,
        border: p.border_width ? `${p.border_width}px solid ${p.border_color || "#fff"}` : "none",
      }} />
    );
  } else if (el.type === "circle") {
    const w = (p.width_ratio || 0.1) * containerW;
    const h = (p.height_ratio || 0.1) * containerH;
    content = (
      <div style={{
        width: w,
        height: h,
        borderRadius: "50%",
        background: `${p.fill_color || "#fff"}${Math.round((p.fill_opacity ?? 0.8) * 255).toString(16).padStart(2, "0")}`,
        border: p.border_width ? `${p.border_width}px solid ${p.border_color || "#fff"}` : "none",
      }} />
    );
  } else if (el.type === "line") {
    const w = (p.width_ratio || 0.8) * containerW;
    content = (
      <div style={{ width: w, height: Math.max(p.thickness || 2, 1), background: p.color || "#fff" }} />
    );
  }

  return (
    <div style={style} onMouseDown={handleMouseDown} onClick={e => e.stopPropagation()}>
      {content}
    </div>
  );
}

export default function VideoCanvas({
  elements, selectedElementId, aspectRatio, picsumSeed,
  onSelectElement, onUpdateElement, onDuplicateElement, onDeleteElement,
  onMoveElementZ, onShuffle,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [aw, ah] = ASPECT_DIMS[aspectRatio] || [9, 16];
  const CANVAS_H = 520;
  const CANVAS_W = Math.round((CANVAS_H * aw) / ah);

  const handleDrag = useCallback((id, patch) => {
    onUpdateElement(id, patch);
  }, [onUpdateElement]);

  const selectedEl = elements.find(e => e.id === selectedElementId);

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-zinc-900 overflow-auto p-4 gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onShuffle}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white text-xs transition-colors"
        >
          <Shuffle size={12} /> Shuffle
        </button>
        {selectedEl && (
          <>
            <button onClick={() => onDuplicateElement(selectedEl.id)}
              className="flex items-center gap-1 px-2 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white text-xs transition-colors" title="Duplicate">
              <Copy size={12} />
            </button>
            <button onClick={() => onMoveElementZ(selectedEl.id, 1)}
              className="flex items-center gap-1 px-2 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white text-xs transition-colors" title="Bring forward">
              <ChevronUp size={12} />
            </button>
            <button onClick={() => onMoveElementZ(selectedEl.id, -1)}
              className="flex items-center gap-1 px-2 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white text-xs transition-colors" title="Send back">
              <ChevronDown size={12} />
            </button>
            <button onClick={() => onDeleteElement(selectedEl.id)}
              className="flex items-center gap-1 px-2 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-red-950 hover:border-red-800 text-zinc-400 hover:text-red-400 text-xs transition-colors" title="Delete">
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      <div
        ref={canvasRef}
        className="relative overflow-hidden shrink-0 border border-zinc-700"
        style={{ width: CANVAS_W, height: CANVAS_H }}
        onClick={() => onSelectElement(null)}
      >
        <img
          src={`https://picsum.photos/seed/${picsumSeed}/${CANVAS_W * 2}/${CANVAS_H * 2}`}
          className="absolute inset-0 w-full h-full object-cover"
          alt="preview background"
          draggable={false}
        />
        {[...elements]
          .sort((a, b) => a.z_index - b.z_index)
          .map(el => (
            <ElementOverlay
              key={el.id}
              el={el}
              selected={el.id === selectedElementId}
              containerW={CANVAS_W}
              containerH={CANVAS_H}
              onSelect={onSelectElement}
              onDrag={handleDrag}
              getContainerRect={() => canvasRef.current?.getBoundingClientRect()}
            />
          ))}
      </div>

      <p className="text-[10px] text-zinc-600">Click element to select · Drag to reposition</p>
    </div>
  );
}
