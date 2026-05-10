import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const ROLES = ["ai_text", "static_text", "clip", "logo", "brand_style", "audio", "decorative"];

export function VideoTemplateDetail({ template, onClose, onChanged }) {
  const [schema, setSchema] = useState(template.field_schema || []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/creatomate-templates/${template.id}`, { field_schema: schema });
      toast.success("Schema saved");
      onChanged?.();
    } catch (e) {
      toast.error(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status) => {
    try {
      await axios.patch(`${API}/creatomate-templates/${template.id}`, { status });
      toast.success(`Status → ${status}`);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const updateRole = (key, role) => {
    setSchema(s => s.map(f => f.key === key ? { ...f, role, inferred: false } : f));
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-white">{template.name}</div>
            <div className="text-[10px] font-mono text-zinc-500">
              {template.aspect_ratio} · {template.duration_seconds != null ? `${template.duration_seconds}s` : "?s"} · {template.status?.toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {template.status === "draft" && (
              <button
                data-testid="publish-template-btn"
                onClick={() => setStatus("active")}
                className="px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200"
              >
                Publish
              </button>
            )}
            {template.status === "active" && (
              <button
                data-testid="unpublish-template-btn"
                onClick={() => setStatus("inactive")}
                className="px-3 py-1.5 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200"
              >
                Unpublish
              </button>
            )}
            <button
              data-testid="close-template-detail-btn"
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Thumbnail */}
        {template.thumbnail_url && (
          <div className="border-b border-zinc-800 flex-shrink-0">
            <img src={template.thumbnail_url} alt={template.name} className="w-full object-cover max-h-48" />
          </div>
        )}

        {/* Field schema */}
        <div className="p-5 flex-1 overflow-auto">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Field Schema</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Key</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Role</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Hint</th>
              </tr>
            </thead>
            <tbody>
              {schema.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 font-mono text-zinc-600 text-center">No fields detected</td>
                </tr>
              )}
              {schema.map((f) => (
                <tr key={f.key} className="border-b border-zinc-800/50">
                  <td className="py-1.5 font-mono text-zinc-300">
                    {f.key}
                    {f.inferred && (
                      <span className="ml-1.5 text-[9px] font-mono text-amber-400 uppercase tracking-widest">AI</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2">
                    <select
                      data-testid={`role-select-${f.key}`}
                      value={f.role || ""}
                      onChange={e => updateRole(f.key, e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-white text-xs px-1.5 py-0.5 focus:ring-1 focus:ring-zinc-500 focus:outline-none transition-colors duration-200"
                    >
                      <option value="">—</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pl-2 font-mono text-zinc-500">{f.ai_hint || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 flex gap-2">
            <button
              data-testid="save-schema-btn"
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save schema"}
            </button>
          </div>
        </div>
    </div>
  );
}

export default VideoTemplateDetail;
