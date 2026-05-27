import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Film, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

function isVideo(url) {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(url);
}

function TemplateThumb({ template, selected, onClick }) {
  const videoRef = useRef(null);
  // Prefer the rendered preview_url (MP4 from R2); fall back to thumbnail_url if it's a video,
  // otherwise show it as an image.
  const hoverVideoUrl = template.preview_url || (isVideo(template.thumbnail_url) ? template.thumbnail_url : null);

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };
  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <button
      type="button"
      data-testid={`template-card-${template.id}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`text-left bg-zinc-900 border transition-colors duration-200 flex flex-col ${
        selected ? "border-white" : "border-zinc-800 hover:border-zinc-600"
      }`}
    >
      <div className="relative w-full aspect-[9/16] bg-zinc-800 overflow-hidden">
        {hoverVideoUrl ? (
          <video
            ref={videoRef}
            src={hoverVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={20} className="text-zinc-700" />
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center">
              <Check size={14} />
            </div>
          </div>
        )}
        {!template.preview_url && !template.thumbnail_url && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5">
            <span className="text-[9px] font-mono text-zinc-500 bg-black/60 px-1.5 py-0.5">
              No preview — generate one on the Video Templates page
            </span>
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-xs font-semibold text-white truncate leading-tight">{template.name}</div>
        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
          {template.merge_fields?.length ?? 0} fields
          {template.merge_fields?.some(f => f.role === "clip") && (
            <span className="text-zinc-400">
              {" · "}
              {template.merge_fields.filter(f => f.role === "clip").length} clip slot{template.merge_fields.filter(f => f.role === "clip").length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function VideoTemplatePicker({ value, onChange, strategy, onStrategyChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/shotstack-templates?status=active`)
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="font-mono text-xs text-zinc-500 py-4">Loading templates…</div>;
  }

  if (rows.length === 0 && !onStrategyChange) {
    return (
      <div className="font-mono text-xs text-zinc-600 py-6 border border-zinc-800 text-center">
        No active templates. Go to Video Templates and sync from Shotstack.
      </div>
    );
  }

  const isRandom = strategy === "random";

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {onStrategyChange && (
        <button
          type="button"
          onClick={() => { onStrategyChange("random"); onChange(null); }}
          className={`text-left bg-zinc-900 border transition-colors duration-200 flex flex-col ${
            isRandom ? "border-white" : "border-zinc-800 hover:border-zinc-600"
          }`}
        >
          <div className="relative w-full aspect-[9/16] bg-zinc-800 overflow-hidden flex items-center justify-center">
            <span className="text-2xl font-bold text-zinc-500">?</span>
            {isRandom && (
              <div className="absolute inset-0 bg-white/10 flex items-center justify-center pointer-events-none">
                <div className="w-7 h-7 bg-white text-black flex items-center justify-center">
                  <Check size={14} />
                </div>
              </div>
            )}
          </div>
          <div className="px-2 py-1.5">
            <div className="text-xs font-semibold text-white truncate leading-tight">Random</div>
            <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Different each run</div>
          </div>
        </button>
      )}
      {rows.map(t => (
        <TemplateThumb
          key={t.id}
          template={t}
          selected={!isRandom && value === t.id}
          onClick={() => { onStrategyChange?.("pick"); onChange(t.id); }}
        />
      ))}
    </div>
  );
}

export default VideoTemplatePicker;
