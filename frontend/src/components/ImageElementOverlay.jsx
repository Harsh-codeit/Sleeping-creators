import React, { useRef, useCallback } from "react";

export default function ImageElementOverlay({ element, containerRef, onUpdate, onDelete }) {
  const startPos = useRef(null);

  const getContainerSize = () => {
    if (!containerRef.current) return { w: 1, h: 1 };
    const rect = containerRef.current.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  };

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const { w, h } = getContainerSize();
    startPos.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      x: element.x * w, y: element.y * h,
    };
    const onMove = (e) => {
      if (!startPos.current) return;
      const { w, h } = getContainerSize();
      const dx = e.clientX - startPos.current.mouseX;
      const dy = e.clientY - startPos.current.mouseY;
      const newX = Math.max(0, Math.min(1 - element.width,  (startPos.current.x + dx) / w));
      const newY = Math.max(0, Math.min(1 - element.height, (startPos.current.y + dy) / h));
      onUpdate(element.id, { x: newX, y: newY });
    };
    const onUp = () => {
      startPos.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [element, onUpdate]);

  const handleResizeStart = useCallback((corner, e) => {
    e.preventDefault();
    e.stopPropagation();
    const { w, h } = getContainerSize();
    startPos.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      x: element.x, y: element.y,
      width: element.width, height: element.height,
      cw: w, ch: h,
    };
    const onMove = (e) => {
      if (!startPos.current) return;
      const { mouseX, mouseY, x, y, width, height, cw, ch } = startPos.current;
      const dx = (e.clientX - mouseX) / cw;
      const dy = (e.clientY - mouseY) / ch;
      let [nx, ny, nw, nh] = [x, y, width, height];
      if (corner === "se") { nw = Math.max(0.05, width + dx); nh = Math.max(0.05, height + dy); }
      if (corner === "sw") { nx = Math.min(x + width - 0.05, x + dx); nw = Math.max(0.05, width - dx); nh = Math.max(0.05, height + dy); }
      if (corner === "ne") { ny = Math.min(y + height - 0.05, y + dy); nw = Math.max(0.05, width + dx); nh = Math.max(0.05, height - dy); }
      if (corner === "nw") { nx = Math.min(x + width - 0.05, x + dx); ny = Math.min(y + height - 0.05, y + dy); nw = Math.max(0.05, width - dx); nh = Math.max(0.05, height - dy); }
      onUpdate(element.id, { x: nx, y: ny, width: nw, height: nh });
    };
    const onUp = () => {
      startPos.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [element, onUpdate]);

  return (
    <div
      onMouseDown={handleDragStart}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left:    `${element.x      * 100}%`,
        top:     `${element.y      * 100}%`,
        width:   `${element.width  * 100}%`,
        height:  `${element.height * 100}%`,
        opacity: element.opacity,
        transform: `rotate(${element.rotation}deg)`,
        cursor: "move",
        border: "2px dashed #6366f1",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {element.url ? (
        <img
          src={element.url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", display: "block" }}
        />
      ) : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%", color: "#6366f1", gap: 4, fontSize: 11, pointerEvents: "none",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.5 20q-2.275 0-3.887-1.575T1 14.575q0-1.975 1.175-3.475T5.25 9.15q.625-2.3 2.5-3.725T12 4q2.925 0 4.963 2.038T19 11q1.725.2 2.863 1.488T23 15.5q0 1.875-1.312 3.188T18.5 20z"/>
          </svg>
          Drive Image
        </div>
      )}

      <button
        title="Remove image element"
        onMouseDown={(e) => { e.stopPropagation(); onDelete(element.id); }}
        style={{
          position: "absolute", top: -10, right: -10,
          background: "#ef4444", color: "white", border: "none",
          borderRadius: "50%", width: 20, height: 20, cursor: "pointer",
          fontSize: 12, lineHeight: 1, padding: 0,
        }}
      >×</button>

      {[
        ["se", { bottom: -4, right: -4, cursor: "se-resize" }],
        ["sw", { bottom: -4, left:  -4, cursor: "sw-resize" }],
        ["ne", { top:    -4, right: -4, cursor: "ne-resize" }],
        ["nw", { top:    -4, left:  -4, cursor: "nw-resize" }],
      ].map(([corner, pos]) => (
        <div
          key={corner}
          onMouseDown={(e) => handleResizeStart(corner, e)}
          style={{ position: "absolute", width: 8, height: 8, background: "#6366f1", ...pos }}
        />
      ))}
    </div>
  );
}
