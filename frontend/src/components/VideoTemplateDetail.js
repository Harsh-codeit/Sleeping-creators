import { useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const ROLES = ["ai_text", "static_text", "clip", "logo", "brand_style", "audio", "decorative"];

export default function VideoTemplateDetail({ template, onClose, onChanged }) {
  const [schema, setSchema] = useState(template.field_schema || []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/creatomate-templates/${template.id}`, { field_schema: schema });
      toast.success("Saved");
      onChanged?.();
    } finally { setSaving(false); }
  };

  const setStatus = async (status) => {
    await axios.patch(`${API}/creatomate-templates/${template.id}`, { status });
    toast.success(status);
    onChanged?.();
    onClose();
  };

  const updateRole = (key, role) => {
    setSchema(s => s.map(f => f.key === key ? { ...f, role, inferred: false } : f));
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex" onClick={onClose}>
      <div className="ml-auto w-[720px] bg-background h-full overflow-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold">{template.name}</h2>
            <div className="text-xs text-muted-foreground">{template.aspect_ratio} • {template.duration_seconds}s • {template.status}</div>
          </div>
          <div className="flex gap-2">
            {template.status === "draft" && <Button size="sm" onClick={() => setStatus("active")}>Publish</Button>}
            {template.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatus("inactive")}>Unpublish</Button>}
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>

        {template.thumbnail_url && (
          <div className="mb-6 border rounded overflow-hidden">
            <img src={template.thumbnail_url} alt={template.name} className="w-full object-cover max-h-64" />
          </div>
        )}

        <h3 className="text-sm font-semibold mb-2">Field schema</h3>
        <table className="w-full text-xs">
          <thead><tr><th className="text-left">Key</th><th>Role</th><th>Hint</th></tr></thead>
          <tbody>
            {schema.map((f) => (
              <tr key={f.key} className="border-t">
                <td className="py-1">{f.key}{f.inferred && <span className="text-yellow-600 ml-1">●</span>}</td>
                <td>
                  <select value={f.role} onChange={e => updateRole(f.key, e.target.value)} className="border rounded px-1">
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="text-muted-foreground">{f.ai_hint || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Button className="mt-4" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save schema"}</Button>
      </div>
    </div>
  );
}
