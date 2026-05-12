import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Film, Loader2, Trash2 } from "lucide-react";
import VideoTemplateDetail from "../components/VideoTemplateDetail";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const STATUS_BADGE = {
  active:   "text-emerald-400 bg-emerald-400/10 border border-emerald-400/30",
  draft:    "text-amber-400  bg-amber-400/10  border border-amber-400/30",
  inactive: "text-zinc-500   bg-zinc-800      border border-zinc-700",
};

function isVideo(url) {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(url);
}

function TemplateCard({ template, onClick, onDeleted }) {
  const videoRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // thumbnail_url = instant free preview from timeline asset (always set on sync)
  // previewUrl    = rendered MP4 stored in R2 (only after Generate Preview)
  const [thumbnailUrl] = useState(template.thumbnail_url);
  const [previewUrl, setPreviewUrl] = useState(template.preview_url);

  // The video that plays on hover: rendered preview if available, else timeline asset if it's a video
  const hoverVideoUrl = previewUrl || (isVideo(thumbnailUrl) ? thumbnailUrl : null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleGeneratePreview = async (e) => {
    e.stopPropagation();
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/shotstack-templates/${template.id}/generate-preview`);
      setPreviewUrl(r.data.preview_url);
      toast.success(previewUrl ? "Preview updated" : "Preview ready");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Preview generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Remove template "${template.name}" from the local registry?\n\nIt will re-appear on the next Sync (with no preview).`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/shotstack-templates/${template.id}`);
      toast.success("Template removed");
      onDeleted?.(template.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove");
      setDeleting(false);
    }
  };

  return (
    <div
      data-testid={`template-card-${template.id}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group cursor-pointer bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all duration-200 flex flex-col"
    >
      {/* Preview area */}
      <div className="relative w-full aspect-[9/16] bg-zinc-800 overflow-hidden">
        {/* Hover-play video (rendered preview or timeline video asset) */}
        {hoverVideoUrl && (
          <video
            ref={videoRef}
            src={hoverVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Static thumbnail shown when not playing (image or video poster) */}
        {!hoverVideoUrl && thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={template.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Bottom-right action button — Generate Preview if none, Re-render if preview exists */}
        <div className="absolute inset-0 flex flex-col items-end justify-end p-3 pointer-events-none">
          <div className="pointer-events-auto">
            {generating ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/70 text-zinc-300">
                <Loader2 size={11} className="animate-spin" />
                <span className="text-[10px] font-mono">Rendering…</span>
              </div>
            ) : !previewUrl ? (
              <button
                onClick={handleGeneratePreview}
                className="px-2.5 py-1.5 bg-white text-black text-[10px] font-semibold uppercase tracking-widest hover:bg-zinc-200 transition-colors"
              >
                Generate Preview
              </button>
            ) : (
              <button
                onClick={handleGeneratePreview}
                title="Re-render preview (template was updated in Shotstack)"
                className={`flex items-center gap-1.5 px-2 py-1.5 bg-black/70 text-zinc-300 text-[10px] font-mono uppercase tracking-widest hover:bg-black hover:text-white transition-all duration-200 ${hovered ? "opacity-100" : "opacity-0"}`}
              >
                <RefreshCw size={10} />
                Re-render
              </button>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className={`absolute inset-0 bg-black/40 flex items-end p-3 transition-opacity duration-200 pointer-events-none ${hovered && hoverVideoUrl ? "opacity-100" : "opacity-0"}`}>
          <span className="text-[10px] font-mono text-white uppercase tracking-widest">▶ Playing</span>
        </div>

        {/* Top-right: status badge + delete button (delete only on hover) */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Remove from local registry (re-appears on next Sync)"
            className={`flex items-center justify-center w-6 h-6 bg-black/70 text-zinc-400 hover:text-red-400 hover:bg-black transition-all duration-200 ${hovered ? "opacity-100" : "opacity-0"} disabled:opacity-40`}
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
          <span className={`font-mono text-[9px] px-1.5 py-0.5 uppercase tracking-widest ${STATUS_BADGE[template.status] || STATUS_BADGE.inactive}`}>
            {template.status}
          </span>
        </div>
      </div>

      {/* Card footer */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate leading-tight">{template.name}</div>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
            {template.merge_fields?.length ?? 0} fields
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 flex-shrink-0">
          {template.last_synced_at?.slice(5, 10) ?? "—"}
        </div>
      </div>
    </div>
  );
}

export default function VideoTemplatesAdmin() {
  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/shotstack-templates`);
      setRows(r.data);
    } catch {
      toast.error("Failed to load templates");
    }
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/shotstack-templates/sync`);
      toast.success(`+${r.data.added.length} added · ${r.data.updated.length} updated · ${r.data.deactivated.length} deactivated`);
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-950">
        <div>
          <div className="text-sm font-bold tracking-tight text-white">Video Templates</div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">SHOTSTACK TEMPLATE REGISTRY</div>
        </div>
        <button
          data-testid="sync-templates-btn"
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync from Shotstack"}
        </button>
      </div>

      {/* Grid */}
      <div className="p-6">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Film size={36} className="text-zinc-700" />
            <p className="font-mono text-zinc-600 text-sm">No templates yet.</p>
            <p className="font-mono text-zinc-700 text-xs">Click "Sync from Shotstack" to import.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {rows.map(r => (
              <TemplateCard
                key={r.id}
                template={r}
                onClick={() => setSelected(r)}
                onDeleted={(id) => setRows(prev => prev.filter(t => t.id !== id))}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <VideoTemplateDetail
          template={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { load(); setSelected(null); }}
        />
      )}
    </div>
  );
}
