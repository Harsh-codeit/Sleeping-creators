import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const Label = ({ children }) => (
  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">{children}</div>
);

const Input = (props) => (
  <input
    {...props}
    className={`w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-600 transition-colors duration-200 ${props.className || ""}`}
  />
);

export function BrandOverridesForm({ client, onSaved }) {
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
      await axios.put(`${API}/clients/${client.id}`, {
        brand_overrides: {
          color: color || null,
          font_family: font || null,
          logo_url: logo || null,
          default_music_url: music || null,
        },
        auto_approve: autoApprove,
      });
      toast.success("Brand overrides saved");
      onSaved?.();
    } catch (e) {
      toast.error(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-sm">
      <div>
        <Label>Brand color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            data-testid="brand-color-picker"
            value={color || "#18181b"}
            onChange={e => setColor(e.target.value)}
            className="h-7 w-10 bg-zinc-900 border border-zinc-800 cursor-pointer"
          />
          <div className="font-mono text-xs text-zinc-300">{color || "(template default)"}</div>
          {color && (
            <button
              data-testid="clear-brand-color-btn"
              type="button"
              onClick={() => setColor("")}
              className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors duration-200"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div>
        <Label>Font family</Label>
        <Input
          data-testid="brand-font-input"
          value={font}
          onChange={e => setFont(e.target.value)}
          placeholder="template default"
        />
      </div>

      <div>
        <Label>Logo URL</Label>
        <Input
          data-testid="brand-logo-input"
          value={logo}
          onChange={e => setLogo(e.target.value)}
          placeholder="template default"
        />
      </div>

      <div>
        <Label>Default music URL</Label>
        <Input
          data-testid="brand-music-input"
          value={music}
          onChange={e => setMusic(e.target.value)}
          placeholder="template default"
        />
      </div>

      <div>
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              data-testid="auto-approve-checkbox"
              checked={autoApprove}
              onChange={e => setAutoApprove(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-4 h-4 border transition-colors duration-200 flex items-center justify-center ${
              autoApprove ? "bg-white border-white" : "bg-zinc-900 border-zinc-700 group-hover:border-zinc-500"
            }`}>
              {autoApprove && <div className="w-2 h-2 bg-black" />}
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-300">Auto-approve renders (skip pending_approval)</span>
        </label>
      </div>

      <button
        data-testid="save-brand-overrides-btn"
        onClick={save}
        disabled={saving}
        className="px-4 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save overrides"}
      </button>
    </div>
  );
}

export default BrandOverridesForm;
