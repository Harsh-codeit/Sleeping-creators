import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const ROLES = ["ai_text", "static_text", "clip", "logo", "audio"];

export function VideoTemplateDetail({ template, onClose, onChanged }) {
  const [fields, setFields] = useState(template.merge_fields || []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/shotstack-templates/${template.id}`, { merge_fields: fields });
      toast.success("Fields saved");
      onChanged?.();
    } catch (e) {
      toast.error(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status) => {
    try {
      await axios.patch(`${API}/shotstack-templates/${template.id}`, { status });
      toast.success(`Status → ${status}`);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const updateRole = (find, role) => {
    setFields(fs => fs.map(f => f.find === find ? { ...f, role, inferred: false } : f));
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex" onClick={onClose}>
      <div
        className="ml-auto w-[680px] bg-zinc-950 border-l border-zinc-800 h-full overflow-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-white">{template.name}</div>
            <div className="text-[10px] font-mono text-zinc-500">
              {template.status?.toUpperCase()} · {fields.length} fields
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(template.status === "draft" || template.status === "inactive") && (
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

        {/* Preview — rendered MP4 preferred, falls back to timeline thumbnail */}
        {(template.preview_url || template.thumbnail_url) && (
          <div className="border-b border-zinc-800 flex-shrink-0">
            {template.preview_url ? (
              <video
                src={template.preview_url}
                autoPlay
                muted
                loop
                playsInline
                className="w-full object-cover max-h-48"
              />
            ) : (
              <img src={template.thumbnail_url} alt={template.name} className="w-full object-cover max-h-48" />
            )}
          </div>
        )}

        {/* Merge fields */}
        <div className="p-5 flex-1 overflow-auto">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Merge Fields</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Field</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Default</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 font-mono text-zinc-600 text-center">No merge fields detected</td>
                </tr>
              )}
              {fields.map((f) => (
                <tr key={f.find} className="border-b border-zinc-800/50">
                  <td className="py-1.5 font-mono text-zinc-300">
                    {f.find}
                    {f.inferred && (
                      <span className="ml-1.5 text-[9px] font-mono text-amber-400 uppercase tracking-widest">auto</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 font-mono text-zinc-500 max-w-[160px] truncate">
                    {f.replace || "—"}
                  </td>
                  <td className="py-1.5 pl-2">
                    <select
                      data-testid={`role-select-${f.find}`}
                      value={f.role || ""}
                      onChange={e => updateRole(f.find, e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-white text-xs px-1.5 py-0.5 focus:ring-1 focus:ring-zinc-500 focus:outline-none transition-colors duration-200"
                    >
                      <option value="">—</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
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
              {saving ? "Saving…" : "Save fields"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoTemplateDetail;
