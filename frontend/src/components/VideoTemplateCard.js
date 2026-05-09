import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";
const ASPECT_DIMS = { "9:16": [9, 16], "1:1": [1, 1], "16:9": [16, 9], "4:5": [4, 5] };

function MiniElement({ el }) {
  const p = el.props || {};
  const style = {
    position: "absolute",
    left: `${el.x_ratio * 100}%`,
    top: `${el.y_ratio * 100}%`,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  };

  if (el.type === "cta_button") {
    return (
      <div style={{
        ...style,
        background: p.bg_color || "#fff",
        color: p.text_color || "#000",
        borderRadius: p.border_radius ?? 999,
        padding: "1px 6px",
        fontSize: 6,
        fontWeight: "bold",
        whiteSpace: "nowrap",
        maxWidth: "75%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {p.text || "CTA"}{p.arrow ? " →" : ""}
      </div>
    );
  }

  if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
    const hasBg = p.bg_shape && p.bg_shape !== "none";
    return (
      <div style={{
        ...style,
        color: p.color || "#fff",
        fontSize: 6,
        fontWeight: "700",
        textAlign: "center",
        whiteSpace: "nowrap",
        maxWidth: "80%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        background: hasBg ? `${p.bg_color || "#000"}99` : "transparent",
        borderRadius: hasBg ? (p.bg_shape === "pill" ? 999 : 1) : 0,
        padding: hasBg ? "1px 4px" : 0,
      }}>
        {p.text || el.type}
      </div>
    );
  }

  if (el.type === "link_in_bio") {
    return (
      <div style={{
        ...style,
        background: p.bg_color || "#000",
        color: p.text_color || "#fff",
        borderRadius: 2,
        padding: "1px 5px",
        fontSize: 5.5,
        fontWeight: "bold",
        whiteSpace: "nowrap",
      }}>
        {p.text || "link in bio"} ↗
      </div>
    );
  }

  if (el.type === "countdown") {
    return (
      <div style={{ ...style, color: p.color || "#fff", fontSize: 10, fontWeight: "bold" }}>
        00:10
      </div>
    );
  }

  if (el.type === "rectangle") {
    return (
      <div style={{
        ...style,
        width: `${(p.width_ratio || 0.8) * 100}%`,
        height: `${(p.height_ratio || 0.1) * 100}%`,
        background: `${p.fill_color || "#000"}80`,
        border: p.border_width ? `1px solid ${p.border_color || "#fff"}40` : "none",
      }} />
    );
  }

  if (el.type === "circle") {
    const pct = `${(p.width_ratio || 0.1) * 100}%`;
    return (
      <div style={{
        ...style,
        width: pct,
        paddingBottom: pct,
        borderRadius: "50%",
        background: `${p.fill_color || "#fff"}60`,
      }} />
    );
  }

  if (el.type === "line") {
    return (
      <div style={{
        ...style,
        width: `${(p.width_ratio || 0.8) * 100}%`,
        height: 1,
        background: p.color || "rgba(255,255,255,0.5)",
      }} />
    );
  }

  if (["logo", "watermark"].includes(el.type)) {
    return (
      <div style={{
        ...style,
        width: `${(p.width_ratio || 0.15) * 100}%`,
        height: `${(p.height_ratio || 0.08) * 100}%`,
        border: "1px dashed rgba(255,255,255,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 5, color: "rgba(255,255,255,0.25)" }}>
          {el.type === "logo" ? "LOGO" : "WM"}
        </span>
      </div>
    );
  }

  return null;
}

export function VideoTemplateCard({ template, onDeleted, onEdit, clients = [] }) {
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/video-templates/${template.id}`);
      toast.success("Template deleted");
      onDeleted(template.id);
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const clientName = template.client_id
    ? (clients.find(c => c.id === template.client_id)?.name || "Client")
    : null;

  const elements = template.elements || [];
  const aspectRatio = template.aspect_ratio || "9:16";
  const [aw, ah] = ASPECT_DIMS[aspectRatio] || [9, 16];
  const overridableCount = elements.filter(e => e.overridable).length;

  const typeGroups = elements.reduce((acc, el) => {
    acc[el.type] = (acc[el.type] || 0) + 1;
    return acc;
  }, {});
  const typeSummary = Object.entries(typeGroups)
    .map(([t, n]) => n > 1 ? `${n}×${t.replace("_", " ")}` : t.replace("_", " "))
    .join(", ");

  return (
    <div
      data-testid="video-template-card"
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors duration-150 flex flex-col group"
    >
      {/* Preview */}
      <div
        className="relative overflow-hidden cursor-pointer border-b border-zinc-800"
        style={{
          aspectRatio: `${aw} / ${ah}`,
          background: "#09090B",
          backgroundImage:
            "linear-gradient(rgba(39,39,42,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.6) 1px, transparent 1px)",
          backgroundSize: "25% 25%",
        }}
        onClick={() => onEdit(template)}
      >
        {elements.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-zinc-700 text-[9px] font-mono">empty</span>
          </div>
        ) : (
          <div className="absolute inset-0">
            {[...elements]
              .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
              .map(el => <MiniElement key={el.id} el={el} />)}
          </div>
        )}

        {/* Hover state */}
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-150" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span className="text-[9px] font-mono text-white bg-black/70 border border-zinc-700 px-2 py-0.5">
            EDIT
          </span>
        </div>

        {/* Aspect ratio badge — top-right */}
        <div className="absolute top-1.5 right-1.5 text-[8px] font-mono text-zinc-600 bg-black/60 px-1 py-0.5 border border-zinc-800">
          {aspectRatio}
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate leading-tight">{template.name}</p>
          <p className="text-[9px] font-mono text-zinc-600 mt-0.5 truncate" title={typeSummary}>
            {elements.length === 0
              ? "no elements"
              : `${elements.length} element${elements.length !== 1 ? "s" : ""}${overridableCount > 0 ? ` · ${overridableCount} overridable` : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-500">
            {clientName || "Global"}
          </span>
          {template.video_overridable && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-800 text-zinc-700">
              clip↑
            </span>
          )}
        </div>

        <div className="flex gap-1.5 mt-auto">
          <button
            onClick={() => onEdit(template)}
            data-testid="video-template-edit"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors duration-150"
          >
            <Pencil size={9} /> Edit
          </button>
          <button
            onClick={handleDelete}
            data-testid="video-template-delete"
            className="px-2.5 py-1.5 border border-zinc-800 text-zinc-600 hover:border-red-900/60 hover:text-red-500 transition-colors duration-150"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoTemplateCard;
