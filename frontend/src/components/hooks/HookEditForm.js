import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";
import NicheSelect from "../NicheSelect";
import { API, HookTypeSelect } from "./hookConstants";

const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";
const LABEL_CLS = "block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1";

// Editable text fields → backend PUT keys (HookUpdate model).
const TEXT_FIELDS = [
  { key: "category", label: "Category", placeholder: "hook-educational" },
  { key: "platform", label: "Platform", placeholder: "instagram" },
  { key: "language", label: "Language", placeholder: "en" },
  { key: "trigger", label: "Trigger", placeholder: "curiosity_gap" },
  { key: "source", label: "Source", placeholder: "@handle / url" },
  { key: "engagement_signal", label: "Engagement Signal", placeholder: "220k likes" },
  { key: "virality_score", label: "Virality (0–1)", placeholder: "0.8" },
];

function Field({ label, children }) {
  return (
    <div>
      <span className={LABEL_CLS}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Inline editor for a single hook. PUTs only changed-from-blank fields to
 * /viral-hooks/{id}; calls onSaved(updatedRow) on success.
 */
export default function HookEditForm({ hook, onSaved, onCancel }) {
  const [form, setForm] = useState({
    hook_text: hook.hook_text ?? "",
    niche_slug: hook.niche_slug ?? "",
    hook_type: hook.hook_type ?? "",
    category: hook.category ?? "",
    platform: hook.platform ?? "",
    language: hook.language ?? "",
    trigger: hook.trigger ?? "",
    source: hook.source ?? "",
    engagement_signal: hook.engagement_signal ?? "",
    virality_score: hook.virality_score != null ? String(hook.virality_score) : "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    // Send all editable fields; coerce virality_score to a number when present.
    const payload = { ...form };
    if (payload.virality_score === "") {
      delete payload.virality_score;
    } else {
      const n = Number(payload.virality_score);
      if (Number.isNaN(n)) {
        toast.error("Virality must be a number 0–1");
        setSaving(false);
        return;
      }
      payload.virality_score = n;
    }
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") delete payload[k];
    });
    try {
      const { data } = await axios.put(`${API}/viral-hooks/${hook.id}`, payload);
      toast.success("Saved");
      onSaved?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 bg-zinc-900 border border-zinc-700 p-4" data-testid="hook-edit-form">
      <Field label="Hook Text">
        <textarea
          rows={3}
          className={INPUT_CLS}
          value={form.hook_text}
          onChange={(e) => set("hook_text", e.target.value)}
          placeholder="The hook text…"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Niche">
          <NicheSelect value={form.niche_slug} onChange={(v) => set("niche_slug", v)} testid="hook-edit-niche" />
        </Field>
        <Field label="Hook Type">
          <HookTypeSelect value={form.hook_type} onChange={(v) => set("hook_type", v)} testid="hook-edit-type" />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              className={INPUT_CLS}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          </Field>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="hook-edit-save"
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 text-sm rounded-none hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}
