import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function VideoTemplateCard({ template, onDeleted, onEdit, clients = [] }) {
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
    ? (clients.find((c) => c.id === template.client_id)?.name || "Client")
    : null;

  const textX = (template.cta_text_x_ratio ?? 0.5) * 100;
  const textY = (template.cta_text_y_ratio ?? 0.78) * 100;
  const btnX = (template.cta_button_x_ratio ?? 0.5) * 100;
  const btnY = (template.cta_button_y_ratio ?? 0.88) * 100;

  return (
    <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors duration-150 flex flex-col">
      {/* Preview — 9:16 mini canvas */}
      <div
        className="relative bg-gradient-to-br from-zinc-800 to-zinc-950 overflow-hidden cursor-pointer"
        style={{ aspectRatio: "9 / 16" }}
        onClick={() => onEdit(template)}
      >
        {template.cta_text && (
          <div
            className="absolute select-none font-bold leading-snug text-center"
            style={{
              left: `${textX}%`,
              top: `${textY}%`,
              transform: "translate(-50%, -50%)",
              fontSize: 10,
              color: template.cta_text_color || "#ffffff",
              background: template.cta_text_bg
                ? hexAlpha(template.cta_text_bg_color || "#000000", template.cta_text_bg_opacity ?? 0.5)
                : "transparent",
              borderRadius: template.cta_text_bg ? 999 : 0,
              padding: template.cta_text_bg ? "2px 8px" : 0,
              whiteSpace: "nowrap",
            }}
          >
            {template.cta_text}
          </div>
        )}

        {template.cta_button_text && (
          <div
            className="absolute select-none font-bold"
            style={{
              left: `${btnX}%`,
              top: `${btnY}%`,
              transform: "translate(-50%, -50%)",
              fontSize: 9,
              color: template.cta_button_text_color || "#000000",
              background: template.cta_button_bg_color || "#ffffff",
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {template.cta_button_text}
            {template.cta_button_arrow && " →"}
          </div>
        )}

        {!template.cta_text && !template.cta_button_text && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-[10px] font-mono">
            No CTA set
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{template.name}</p>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {template.cta_animation || "slide_up"} · {template.cta_delay ?? 3}s delay
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 font-mono ${
            clientName
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}>
            {clientName || "Global"}
          </span>
          {template.aspect_ratio && (
            <span className="text-[10px] px-1.5 py-0.5 font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
              {template.aspect_ratio}
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={() => onEdit(template)}
            className="flex-1 px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <Pencil size={11} /> Edit
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs font-mono border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-colors flex items-center justify-center"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
