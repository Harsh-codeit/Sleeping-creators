import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import VideoCanvasPreview from "./VideoCanvasPreview";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"];
const ANIMATIONS = ["slide_up", "fade", "pop", "slide_in"];
const SIZES = ["S", "M", "L"];

const DEFAULTS = {
  name: "",
  aspect_ratio: "9:16",
  cta_text: "",
  cta_text_color: "#ffffff",
  cta_text_size: "M",
  cta_text_bg: false,
  cta_text_bg_color: "#000000",
  cta_text_bg_opacity: 0.5,
  cta_text_x_ratio: 0.5,
  cta_text_y_ratio: 0.78,
  cta_button_text: "",
  cta_button_bg_color: "#ffffff",
  cta_button_text_color: "#000000",
  cta_button_size: "M",
  cta_button_arrow: true,
  cta_button_x_ratio: 0.5,
  cta_button_y_ratio: 0.88,
  cta_animation: "slide_up",
  cta_delay: 3,
};

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function ChipGroup({ options, value, onChange, format }) {
  return (
    <div className="flex border border-zinc-800">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 py-1.5 text-xs font-mono capitalize border-r border-zinc-800 last:border-0 transition-colors ${
            value === o ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
          }`}
        >
          {format ? format(o) : o}
        </button>
      ))}
    </div>
  );
}

export default function VideoTemplateEditor({ clientId, initial, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ ...DEFAULTS, ...(initial || {}), client_id: clientId }));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handlePositionChange = useCallback((changes) => {
    setForm((f) => ({ ...f, ...changes }));
  }, []);

  const generateCTA = async () => {
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/videos/generate-cta-text`, { client_id: clientId });
      const { text_variants = [], button_variants = [] } = r.data;
      if (text_variants[0]) set("cta_text", text_variants[0]);
      if (button_variants[0]) set("cta_button_text", button_variants[0]);
      toast.success("CTA generated");
    } catch {
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Template name required");
    setSaving(true);
    try {
      if (initial?.id) {
        await axios.put(`${API}/video-templates/${initial.id}`, form);
        toast.success("Template updated");
      } else {
        await axios.post(`${API}/video-templates`, form);
        toast.success("Template created");
      }
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: controls */}
      <div className="space-y-5">
        <Field label="Template Name">
          <input
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. CTA Slide Up"
          />
        </Field>

        <Field label="Aspect Ratio">
          <ChipGroup options={ASPECT_RATIOS} value={form.aspect_ratio} onChange={(v) => set("aspect_ratio", v)} />
        </Field>

        {/* CTA Text */}
        <div className="border border-zinc-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">CTA Text</span>
            <button
              type="button"
              onClick={generateCTA}
              disabled={generating}
              className="text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-700 px-2 py-1 transition-colors disabled:opacity-40"
            >
              {generating ? "Generating…" : "AI Generate"}
            </button>
          </div>

          <Field label="Text">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={form.cta_text}
              onChange={(e) => set("cta_text", e.target.value)}
              placeholder="Book your free consultation"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Color">
              <input type="color" value={form.cta_text_color} onChange={(e) => set("cta_text_color", e.target.value)}
                className="w-full h-8 bg-zinc-950 border border-zinc-800 cursor-pointer" />
            </Field>
            <Field label="Size">
              <ChipGroup options={SIZES} value={form.cta_text_size} onChange={(v) => set("cta_text_size", v)} />
            </Field>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.cta_text_bg} onChange={(e) => set("cta_text_bg", e.target.checked)}
              className="w-4 h-4 accent-white" />
            <span className="text-xs text-zinc-400 font-mono">Pill background</span>
          </label>

          {form.cta_text_bg && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bg Color">
                <input type="color" value={form.cta_text_bg_color} onChange={(e) => set("cta_text_bg_color", e.target.value)}
                  className="w-full h-8 bg-zinc-950 border border-zinc-800 cursor-pointer" />
              </Field>
              <Field label={`Opacity ${Math.round(form.cta_text_bg_opacity * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={form.cta_text_bg_opacity}
                  onChange={(e) => set("cta_text_bg_opacity", parseFloat(e.target.value))}
                  className="w-full accent-white" />
              </Field>
            </div>
          )}
        </div>

        {/* CTA Button */}
        <div className="border border-zinc-800 p-4 space-y-4">
          <span className="text-xs font-semibold text-white block">CTA Button</span>

          <Field label="Button Text">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={form.cta_button_text}
              onChange={(e) => set("cta_button_text", e.target.value)}
              placeholder="Get Started"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bg Color">
              <input type="color" value={form.cta_button_bg_color} onChange={(e) => set("cta_button_bg_color", e.target.value)}
                className="w-full h-8 bg-zinc-950 border border-zinc-800 cursor-pointer" />
            </Field>
            <Field label="Text Color">
              <input type="color" value={form.cta_button_text_color} onChange={(e) => set("cta_button_text_color", e.target.value)}
                className="w-full h-8 bg-zinc-950 border border-zinc-800 cursor-pointer" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Size">
              <ChipGroup options={SIZES} value={form.cta_button_size} onChange={(v) => set("cta_button_size", v)} />
            </Field>
            <Field label="Arrow">
              <ChipGroup options={["on", "off"]} value={form.cta_button_arrow ? "on" : "off"}
                onChange={(v) => set("cta_button_arrow", v === "on")} />
            </Field>
          </div>

          <Field label="Animation">
            <ChipGroup options={ANIMATIONS} value={form.cta_animation} onChange={(v) => set("cta_animation", v)}
              format={(s) => s.replace("_", " ")} />
          </Field>

          <Field label={`Delay ${form.cta_delay}s`}>
            <input type="range" min={0} max={10} step={0.5} value={form.cta_delay}
              onChange={(e) => set("cta_delay", parseFloat(e.target.value))}
              className="w-full accent-white" />
          </Field>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving…" : initial?.id ? "Update Template" : "Create Template"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="px-5 py-2 border border-zinc-700 text-zinc-400 text-xs font-mono hover:text-white hover:border-zinc-500 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Right: live preview */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-zinc-500 uppercase">Live Preview — drag overlays to reposition</div>
        <VideoCanvasPreview
          template={form}
          aspectRatio={form.aspect_ratio}
          editable
          onPositionChange={handlePositionChange}
        />
        <p className="text-[10px] font-mono text-zinc-600">
          Button animation previews after its delay when you play a clip. In editor, it shows at full opacity.
        </p>
      </div>
    </div>
  );
}
