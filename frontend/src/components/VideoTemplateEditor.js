import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import VideoCanvasPreview from "./VideoCanvasPreview";
import { VideoField } from "./video/VideoField";
import { ChipGroup } from "./video/ChipGroup";
import { OverlayPicker } from "./video/OverlayPicker";
import { FontPicker } from "./video/FontPicker";
import { MoodTagPicker } from "./video/MoodTagPicker";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"];
const ANIMATIONS = ["slide_up", "fade", "pop", "slide_in"];
const SIZES = ["S", "M", "L"];

const DEFAULTS = {
  name: "",
  aspect_ratio: "9:16",
  overlay_style: "gradient_wash",
  overlay_color: "#000000",
  overlay_opacity: 0.5,
  font_preset: "bold_sans",
  mood_tags: [],
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
  cta_button_border_radius: 4,
  cta_button_shadow: false,
  cta_button_x_ratio: 0.5,
  cta_button_y_ratio: 0.88,
  cta_animation: "slide_up",
  cta_delay: 3,
};

function Section({ title, headerRight, children }) {
  return (
    <div className="border border-zinc-800 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{title}</span>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <VideoField label={label}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 bg-zinc-950 border border-zinc-800 cursor-pointer"
      />
    </VideoField>
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
      {/* ── Left: controls ── */}
      <div className="space-y-5">

        <VideoField label="Template Name">
          <input
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. CTA Slide Up"
          />
        </VideoField>

        <VideoField label="Aspect Ratio">
          <ChipGroup options={ASPECT_RATIOS} value={form.aspect_ratio} onChange={(v) => set("aspect_ratio", v)} />
        </VideoField>

        {/* Visual Style */}
        <Section title="Overlay Style">
          <OverlayPicker value={form.overlay_style} onChange={(v) => set("overlay_style", v)} />
          {form.overlay_style !== "none" && form.overlay_style !== "blur" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <ColorRow label="Overlay Color" value={form.overlay_color} onChange={(v) => set("overlay_color", v)} />
              <VideoField label={`Opacity ${Math.round(form.overlay_opacity * 100)}%`}>
                <Slider
                  min={0} max={1} step={0.05}
                  value={[form.overlay_opacity]}
                  onValueChange={([v]) => set("overlay_opacity", v)}
                  className="mt-3"
                />
              </VideoField>
            </div>
          )}
        </Section>

        <Section title="Font Preset">
          <FontPicker value={form.font_preset} onChange={(v) => set("font_preset", v)} />
        </Section>

        <Section title="Mood Tags">
          <p className="text-[10px] font-mono text-zinc-600 -mt-2">
            Auto-picks background music with matching mood
          </p>
          <MoodTagPicker value={form.mood_tags} onChange={(v) => set("mood_tags", v)} />
        </Section>

        {/* CTA Text */}
        <Section
          title="CTA Text"
          headerRight={
            <button
              type="button"
              onClick={generateCTA}
              disabled={generating || !clientId}
              className="text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-700 px-2 py-1 transition-colors disabled:opacity-40"
            >
              {generating ? "Generating…" : "AI Generate"}
            </button>
          }
        >

          <VideoField label="Text">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={form.cta_text}
              onChange={(e) => set("cta_text", e.target.value)}
              placeholder="Book your free consultation"
            />
          </VideoField>

          <div className="grid grid-cols-2 gap-3">
            <ColorRow label="Color" value={form.cta_text_color} onChange={(v) => set("cta_text_color", v)} />
            <VideoField label="Size">
              <ChipGroup options={SIZES} value={form.cta_text_size} onChange={(v) => set("cta_text_size", v)} />
            </VideoField>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.cta_text_bg} onCheckedChange={(v) => set("cta_text_bg", v)} />
            <span className="text-xs font-mono text-zinc-400">Pill background</span>
          </div>

          {form.cta_text_bg && (
            <div className="grid grid-cols-2 gap-3">
              <ColorRow label="Bg Color" value={form.cta_text_bg_color} onChange={(v) => set("cta_text_bg_color", v)} />
              <VideoField label={`Opacity ${Math.round(form.cta_text_bg_opacity * 100)}%`}>
                <Slider
                  min={0} max={1} step={0.05}
                  value={[form.cta_text_bg_opacity]}
                  onValueChange={([v]) => set("cta_text_bg_opacity", v)}
                  className="mt-3"
                />
              </VideoField>
            </div>
          )}
        </Section>

        {/* CTA Button */}
        <Section title="CTA Button">
          <VideoField label="Button Text">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={form.cta_button_text}
              onChange={(e) => set("cta_button_text", e.target.value)}
              placeholder="Get Started"
            />
          </VideoField>

          <div className="grid grid-cols-2 gap-3">
            <ColorRow label="Bg Color" value={form.cta_button_bg_color} onChange={(v) => set("cta_button_bg_color", v)} />
            <ColorRow label="Text Color" value={form.cta_button_text_color} onChange={(v) => set("cta_button_text_color", v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VideoField label="Size">
              <ChipGroup options={SIZES} value={form.cta_button_size} onChange={(v) => set("cta_button_size", v)} />
            </VideoField>
            <VideoField label="Arrow">
              <ChipGroup
                options={["on", "off"]}
                value={form.cta_button_arrow ? "on" : "off"}
                onChange={(v) => set("cta_button_arrow", v === "on")}
              />
            </VideoField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VideoField label={`Border Radius ${form.cta_button_border_radius}px`}>
              <Slider
                min={0} max={24} step={2}
                value={[form.cta_button_border_radius]}
                onValueChange={([v]) => set("cta_button_border_radius", v)}
                className="mt-3"
              />
            </VideoField>
            <div className="flex items-end pb-1 gap-3">
              <Switch checked={form.cta_button_shadow} onCheckedChange={(v) => set("cta_button_shadow", v)} />
              <span className="text-xs font-mono text-zinc-400">Button Shadow</span>
            </div>
          </div>

          <VideoField label="Animation">
            <ChipGroup
              options={ANIMATIONS}
              value={form.cta_animation}
              onChange={(v) => set("cta_animation", v)}
              format={(s) => s.replace("_", " ")}
            />
          </VideoField>

          <VideoField label={`Delay ${form.cta_delay}s`}>
            <Slider
              min={0} max={10} step={0.5}
              value={[form.cta_delay]}
              onValueChange={([v]) => set("cta_delay", v)}
              className="mt-3"
            />
          </VideoField>
        </Section>

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
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 border border-zinc-700 text-zinc-400 text-xs font-mono hover:text-white hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Right: live preview ── */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-zinc-500 uppercase">
          Live Preview — drag overlays to reposition
        </div>
        <VideoCanvasPreview
          template={form}
          aspectRatio={form.aspect_ratio}
          editable
          onPositionChange={handlePositionChange}
        />
        <p className="text-[10px] font-mono text-zinc-600">
          Button animation previews after its delay when you play a clip.
        </p>
      </div>
    </div>
  );
}
