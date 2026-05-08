import { useRef, useState, useCallback, useEffect } from "react";
import CanvasElement from "./CanvasElement";
import { Grid3x3, ZoomIn, ZoomOut, Maximize } from "lucide-react";

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5];
const GRID_SIZE = 30;

export default function Canvas({
  canvasWidth,
  canvasHeight,
  background,
  elements,
  selectedIds,
  onSelect,
  onClearSelection,
  onMove,
  onResize,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(null);
  const [showGrid, setShowGrid] = useState(true);

  const getAutoScale = useCallback(() => {
    if (!containerRef.current) return 0.4;
    const rect = containerRef.current.getBoundingClientRect();
    const padX = 80;
    const padY = 80;
    const scaleX = (rect.width - padX) / canvasWidth;
    const scaleY = (rect.height - padY) / canvasHeight;
    return Math.min(scaleX, scaleY, 1);
  }, [canvasWidth, canvasHeight]);

  const scale = zoom ?? getAutoScale();

  useEffect(() => {
    if (zoom !== null) return;
    const observer = new ResizeObserver(() => {
      setZoom(null);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [zoom]);

  const bgStyle = (() => {
    const bg = background || { type: "solid", value: "#000000" };
    if (bg.type === "solid") return { background: bg.value };
    if (bg.type === "gradient") return { background: bg.value };
    if (bg.type === "image") return { background: `url('${bg.value}') center/cover no-repeat` };
    return { background: bg.value };
  })();

  return (
    <div ref={containerRef} className="flex-1 bg-zinc-800 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700 bg-zinc-850">
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`p-1.5 transition-colors duration-150 ${showGrid ? "text-blue-400 bg-zinc-700" : "text-zinc-500 hover:text-white"}`}
          title="Toggle grid"
        >
          <Grid3x3 size={14} />
        </button>
        <div className="w-px h-4 bg-zinc-700" />
        <button
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex(z => z >= (zoom ?? getAutoScale()));
            if (idx > 0) setZoom(ZOOM_LEVELS[idx - 1]);
          }}
          className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-[10px] font-mono text-zinc-400 w-10 text-center">
          {Math.round((zoom ?? getAutoScale()) * 100)}%
        </span>
        <button
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex(z => z > (zoom ?? getAutoScale()));
            if (idx !== -1) setZoom(ZOOM_LEVELS[idx]);
          }}
          className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom(null)}
          className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
          title="Fit to screen"
        >
          <Maximize size={14} />
        </button>
      </div>

      <div
        className="flex-1 overflow-auto flex items-center justify-center p-10"
        onClick={onClearSelection}
      >
        <div
          style={{
            width: canvasWidth * scale,
            height: canvasHeight * scale,
            position: "relative",
            flexShrink: 0,
            ...bgStyle,
          }}
          onClick={e => e.stopPropagation()}
        >
          {showGrid && (
            <svg
              width={canvasWidth * scale}
              height={canvasHeight * scale}
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 0 }}
            >
              {Array.from({ length: Math.ceil(canvasWidth / GRID_SIZE) + 1 }, (_, i) => (
                <line
                  key={`v${i}`}
                  x1={i * GRID_SIZE * scale}
                  y1={0}
                  x2={i * GRID_SIZE * scale}
                  y2={canvasHeight * scale}
                  stroke="#3f3f46"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              ))}
              {Array.from({ length: Math.ceil(canvasHeight / GRID_SIZE) + 1 }, (_, i) => (
                <line
                  key={`h${i}`}
                  x1={0}
                  y1={i * GRID_SIZE * scale}
                  x2={canvasWidth * scale}
                  y2={i * GRID_SIZE * scale}
                  stroke="#3f3f46"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              ))}
            </svg>
          )}

          {elements.map(elem => (
            <CanvasElement
              key={elem.id}
              element={elem}
              scale={scale}
              selected={selectedIds.includes(elem.id)}
              onSelect={onSelect}
              onMove={onMove}
              onResize={onResize}
              gridSize={showGrid ? GRID_SIZE : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
