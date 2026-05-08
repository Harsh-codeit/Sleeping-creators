import { useState, useCallback } from "react";

export default function CanvasElement({
  element,
  scale,
  selected,
  onSelect,
  onMove,
  onResize,
  gridSize,
}) {
  const [dragging, setDragging] = useState(false);

  const snapToGrid = useCallback((val) => {
    if (!gridSize) return val;
    return Math.round(val / gridSize) * gridSize;
  }, [gridSize]);

  const handleMouseDown = useCallback((e) => {
    if (element.locked) return;
    e.stopPropagation();
    onSelect(element.id, e.shiftKey);
    setDragging(true);

    const handleMouseMove = (me) => {
      const dx = (me.clientX - e.clientX) / scale;
      const dy = (me.clientY - e.clientY) / scale;
      onMove(element.id, snapToGrid(element.x + dx), snapToGrid(element.y + dy));
    };

    const handleMouseUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [element, scale, onSelect, onMove, snapToGrid]);

  const handleResizeMouseDown = useCallback((e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = element.width;
    const startH = element.height;

    const handleMouseMove = (me) => {
      const dw = (me.clientX - startX) / scale;
      const dh = (me.clientY - startY) / scale;
      onResize(element.id, Math.max(20, snapToGrid(startW + dw)), Math.max(20, snapToGrid(startH + dh)));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [element, scale, onResize, snapToGrid]);

  if (!element.visible) return null;

  const style = {
    position: "absolute",
    left: element.x * scale,
    top: element.y * scale,
    width: element.width * scale,
    height: element.height * scale,
    zIndex: element.z_index,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    cursor: element.locked ? "default" : (dragging ? "grabbing" : "grab"),
    opacity: element.locked ? 0.7 : 1,
  };

  return (
    <div
      style={style}
      onMouseDown={handleMouseDown}
      className={`group ${selected ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-zinc-500"}`}
    >
      {renderElementPreview(element, scale)}

      {selected && !element.locked && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize z-10"
          style={{ transform: "translate(50%, 50%)" }}
        />
      )}

      {selected && (
        <div className="absolute -top-5 left-0 text-[9px] font-mono text-blue-400 whitespace-nowrap">
          {element.label}
        </div>
      )}
    </div>
  );
}

function renderElementPreview(element, scale) {
  const { type, props } = element;
  const innerStyle = { width: "100%", height: "100%", overflow: "hidden" };

  switch (type) {
    case "text": {
      const fs = (props.fontSize || 44) * scale;
      return (
        <div style={{
          ...innerStyle,
          fontSize: `${fs}px`,
          fontFamily: `'${props.fontFamily || "Helvetica"}', 'Helvetica Neue', Arial, sans-serif`,
          fontWeight: props.fontWeight || "600",
          color: props.color || "#ffffff",
          textAlign: props.textAlign || "left",
          lineHeight: props.lineHeight || 1.5,
          letterSpacing: props.letterSpacing ? `${props.letterSpacing}px` : undefined,
          padding: `${(props.padding || 0) * scale}px`,
        }}>
          {props.content || "Text"}
        </div>
      );
    }
    case "shape": {
      const br = props.shape === "circle" ? "50%" : `${(props.borderRadius || 0) * scale}px`;
      const border = props.stroke && props.stroke !== "none"
        ? `${(props.strokeWidth || 1) * scale}px solid ${props.stroke}`
        : "none";
      return (
        <div style={{
          ...innerStyle,
          background: props.fill || "#333333",
          borderRadius: br,
          border,
        }} />
      );
    }
    case "image":
      return (
        <div style={{
          ...innerStyle,
          borderRadius: `${(props.borderRadius || 0) * scale}px`,
          opacity: props.opacity ?? 1,
          background: "#27272a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {props.src ? (
            <img src={props.src} alt="" style={{ width: "100%", height: "100%", objectFit: props.fit || "cover" }} />
          ) : (
            <span style={{ fontSize: 11 * scale, color: "#71717a", fontFamily: "monospace" }}>Image</span>
          )}
        </div>
      );
    case "drive_image": {
      const bw = (props.borderWidth || 0) * scale;
      const bc = props.borderColor || "#6366f1";
      const br = `${(props.borderRadius || 0) * scale}px`;
      const bm = props.blendMode || "normal";
      return (
        <div style={{
          ...innerStyle,
          opacity: props.opacity ?? 1,
          borderRadius: br,
          border: bw > 0 ? `${bw}px solid ${bc}` : `${2 * scale}px dashed #6366f1`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4 * scale,
          color: "#6366f1",
          background: "rgba(99,102,241,0.06)",
          mixBlendMode: bm,
          overflow: "hidden",
        }}>
          <svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.5 20q-2.275 0-3.887-1.575T1 14.575q0-1.975 1.175-3.475T5.25 9.15q.625-2.3 2.5-3.725T12 4q2.925 0 4.963 2.038T19 11q1.725.2 2.863 1.488T23 15.5q0 1.875-1.312 3.188T18.5 20z"/>
          </svg>
          <span style={{ fontSize: 11 * scale, fontFamily: "monospace" }}>Drive Image</span>
        </div>
      );
    }
    case "icon":
      return (
        <div style={{
          ...innerStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${(props.size || 24) * scale}px`,
          color: props.color || "#ffffff",
        }}>
          {props.iconName || "★"}
        </div>
      );
    case "author_block":
      return (
        <div style={{
          ...innerStyle,
          display: "flex",
          flexDirection: props.layout === "vertical" ? "column" : "row",
          alignItems: "center",
          gap: `${12 * scale}px`,
          padding: `${8 * scale}px`,
        }}>
          {props.showAvatar && (
            <div style={{
              width: `${70 * scale}px`, height: `${70 * scale}px`,
              borderRadius: "50%", background: "#555", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: `${28 * scale}px`, fontWeight: 700,
            }}>
              AU
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: `${2 * scale}px` }}>
            {props.showName && (
              <span style={{
                fontSize: `${(props.fontSize || 32) * scale}px`,
                fontWeight: 700,
                color: props.color || "#ffffff",
                fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif",
              }}>
                Author Name
              </span>
            )}
            {props.showHandle && (
              <span style={{
                fontSize: `${(props.fontSize || 32) * 0.65 * scale}px`,
                color: props.color || "#ffffff",
                opacity: 0.6,
                fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif",
              }}>
                @handle · Title
              </span>
            )}
          </div>
        </div>
      );
    case "logo":
      return (
        <div style={{
          ...innerStyle,
          opacity: props.opacity ?? 1,
          background: "#27272a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {props.src ? (
            <img src={props.src} alt="" style={{ width: "100%", height: "100%", objectFit: props.fit || "contain" }} />
          ) : (
            <span style={{ fontSize: 11 * scale, color: "#71717a", fontFamily: "monospace" }}>Logo</span>
          )}
        </div>
      );
    case "content": {
      const fs = (props.fontSize || 44) * scale;
      const gap = `${(props.paraGap || 24) * scale}px`;
      return (
        <div style={{
          ...innerStyle,
          fontSize: `${fs}px`,
          fontFamily: `'${props.fontFamily || "Helvetica"}', 'Helvetica Neue', Arial, sans-serif`,
          fontWeight: props.fontWeight || "600",
          color: props.color || "#ffffff",
          textAlign: props.textAlign || "left",
          lineHeight: props.lineHeight || 1.6,
          letterSpacing: props.letterSpacing ? `${props.letterSpacing}px` : undefined,
          overflow: "hidden",
        }}>
          <p style={{ marginTop: 0 }}>Your slide content will appear here as paragraphs.</p>
          <p style={{ marginTop: gap }}>Each line becomes its own paragraph, just like the dark card template.</p>
          <p style={{ marginTop: gap, fontWeight: 800 }}>The last paragraph is always bold.</p>
        </div>
      );
    }
    default:
      return <div style={{ ...innerStyle, background: "#333" }} />;
  }
}
