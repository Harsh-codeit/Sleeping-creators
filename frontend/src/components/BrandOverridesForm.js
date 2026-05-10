import { useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function BrandOverridesForm({ client, onSaved }) {
  const initial = client.brand_overrides || {};
  const [color, setColor] = useState(initial.color || "");
  const [font, setFont] = useState(initial.font_family || "");
  const [logo, setLogo] = useState(initial.logo_url || "");
  const [music, setMusic] = useState(initial.default_music_url || "");
  const [autoApprove, setAutoApprove] = useState(!!client.auto_approve);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        brand_overrides: {
          color: color || null,
          font_family: font || null,
          logo_url: logo || null,
          default_music_url: music || null,
        },
        auto_approve: autoApprove,
      };
      await axios.put(`${API}/clients/${client.id}`, body);
      toast.success("Saved");
      onSaved?.();
    } catch (e) {
      toast.error(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 max-w-md">
      <div>
        <label className="text-sm">Brand color</label>
        <input type="color" value={color || "#000000"} onChange={e => setColor(e.target.value)} className="ml-2" />
        <button type="button" onClick={() => setColor("")} className="ml-2 text-xs underline">clear</button>
      </div>
      <div>
        <label className="text-sm">Font family</label>
        <input value={font} onChange={e => setFont(e.target.value)} placeholder="(empty = template default)" className="ml-2 border rounded px-2 py-1" />
      </div>
      <div>
        <label className="text-sm">Logo URL</label>
        <input value={logo} onChange={e => setLogo(e.target.value)} placeholder="(empty = template default)" className="ml-2 border rounded px-2 py-1 w-72" />
      </div>
      <div>
        <label className="text-sm">Default music URL</label>
        <input value={music} onChange={e => setMusic(e.target.value)} placeholder="(empty = template default)" className="ml-2 border rounded px-2 py-1 w-72" />
      </div>
      <div>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} />
          Auto-approve renders (skip pending_approval)
        </label>
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
    </div>
  );
}
