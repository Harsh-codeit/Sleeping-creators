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
import { ButtonStylePicker } from "./video/ButtonStylePicker";
import { CTA_BUTTON_PRESETS } from "../constants/videoStyles";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"];
const ANIMATIONS = ["slide_up", "fade", "pop", "slide_in"];
const SIZES = ["S", "M", "L"];
const BG_SHAPES = ["none", "pill", "box", "blur", "underline", "highlight"];
const TEXT_TRANSFORMS = ["none", "uppercase", "capitalize", "lowercase"];
const FONT_WEIGHTS = ["400", "600", "700", "900"];
const ICONS = ["none", "arrow", "play", "plus", "star", "chevron"];
const GLOW_OPTIONS = ["none", "soft", "hard", "neon"];
const GRADIENT_DIRS = ["90deg", "135deg", "180deg", "45deg"];
const BORDER_STYLES = ["solid", "dashed", "dotted"];
const ALIGN_OPTIONS = ["left", "center", "right"];

const DEFAULTS = {
  name: "",
  aspect_ratio: "9:16",
  overlay_style: "gradient_wash",
  overlay_color: "#000000",
  overlay_opacity: 0.5,
  font_preset: "bold_sans",
  mood_tags: [],

  // CTA Text
  cta_text: "",
  cta_text_color: "#ffffff",
  cta_text_size: "M",
  cta_text_bg: false,
  cta_text_bg_color: "#000000",
  cta_text_bg_opacity: 0.5,
  cta_text_bg_shape: "none",
  cta_text_x_ratio: 0.5,
  cta_text_y_ratio: 0.78,
  cta_text_multiline: false,
  // Advanced text
  cta_text_transform: "none",
  cta_text_letter_spacing: 0,
  cta_text_font_weight: "inherit",
  cta_text_align: "center",
  cta_text_max_width: 80,
  cta_text_shadow_enabled: false,
  cta_text_shadow_color: "#000000",
  cta_text_shadow_x: 2,
  cta_text_shadow_y: 2,
  cta_text_shadow_blur: 4,
  cta_text_stroke_enabled: false,
  cta_text_stroke_width: 1,
  cta_text_stroke_color: "#000000",

  // CTA Button
  cta_button_text: "",
  cta_button_bg_color: "#ffffff",
  cta_button_text_color: "#000000",
  cta_button_size: "M",
  cta_button_arrow: true,
  cta_button_icon: "arrow",
  cta_button_border_radius: 4,
  cta_button_shadow: false,
  cta_button_x_ratio: 0.5,
  cta_button_y_ratio: 0.88,
  cta_animation: "slide_up",
  cta_delay: 3,
  cta_button_style_preset: "solid_white",
  // Advanced button
  cta_button_gradient: false,
  cta_button_gradient_from: "#a855f7",
  cta_button_gradient_to: "#ec4899",
  cta_button_gradient_dir: "90deg",
  cta_button_border_enabled: false,
  cta_button_border_width: 2,
  cta_button_border_color: "#ffffff",
  cta_button_border_style: "solid",
  cta_button_text_transform: "none",
  cta_button_letter_spacing: 0,
  cta_button_glow: "none",
  cta_button_glow_color: "#ffffff",
  cta_button_padding_x: 20,
  cta_button_padding_y: 8,
  cta_button_glass: false,
  cta_button_bg_opacity: 1.0,
};

// Preset field maps: what each preset auto-fills when selected
const BUTTON_PRESET_FIELDS = {
  solid_white:   { cta_button_bg_color: "#ffffff", cta_button_text_color: "#000000", cta_button_border_radius: 4, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: false, cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
  pill_outline:  { cta_button_bg_color: "#000000", cta_button_text_color: "#ffffff", cta_button_border_radius: 999, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: true, cta_button_border_width: 2, cta_button_border_color: "#ffffff", cta_button_border_style: "solid", cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 0 },
  dark_solid:    { cta_button_bg_color: "#111111", cta_button_text_color: "#ffffff", cta_button_border_radius: 6, cta_button_shadow: true, cta_button_gradient: false, cta_button_border_enabled: false, cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
  brand_purple:  { cta_button_bg_color: "#6366f1", cta_button_text_color: "#ffffff", cta_button_border_radius: 8, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: false, cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
  pill_gradient: { cta_button_bg_color: "#a855f7", cta_button_text_color: "#ffffff", cta_button_border_radius: 999, cta_button_shadow: false, cta_button_gradient: true, cta_button_gradient_from: "#a855f7", cta_button_gradient_to: "#ec4899", cta_button_gradient_dir: "90deg", cta_button_border_enabled: false, cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
  neon_glow:     { cta_button_bg_color: "#0f0f0f", cta_button_text_color: "#39ff14", cta_button_border_radius: 4, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: false, cta_button_glow: "neon", cta_button_glow_color: "#39ff14", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
  frosted:       { cta_button_bg_color: "#ffffff", cta_button_text_color: "#ffffff", cta_button_border_radius: 8, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: true, cta_button_border_width: 1, cta_button_border_color: "#ffffff", cta_button_border_style: "solid", cta_button_glow: "none", cta_button_glass: true, cta_button_bg_opacity: 0.15 },
  brand_orange:  { cta_button_bg_color: "#f97316", cta_button_text_color: "#ffffff", cta_button_border_radius: 6, cta_button_shadow: false, cta_button_gradient: false, cta_button_border_enabled: false, cta_button_glow: "none", cta_button_glass: false, cta_button_bg_opacity: 1.0 },
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

function AdvancedToggle({ open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
    >
      <span className="text-[8px]">{open ? "▼" : "▶"}</span>
      Advanced Styling
    </button>
  );
}

export default function VideoTemplateEditor({ clientId, initial, onSaved, onCancel }) {
  const [form, setForm] = useState(() => {
    const base = { ...DEFAULTS, ...(initial || {}), client_id: clientId };
    // Migrate legacy cta_text_bg boolean → cta_text_bg_shape
    if (!base.cta_text_bg_shape || base.cta_text_bg_shape === "none") {
      if (base.cta_text_bg) base.cta_text_bg_shape = "pill";
    }
    // Migrate legacy cta_button_arrow boolean → cta_button_icon
    if (!base.cta_button_icon) {
      base.cta_button_icon = base.cta_button_arrow ? "arrow" : "none";
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [btnAdv, setBtnAdv] = useState(false);
  const [txtAdv, setTxtAdv] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const applyButtonPreset = (presetId) => {
    const fields = BUTTON_PRESET_FIELDS[presetId];
    if (fields) setForm((f) => ({ ...f, ...fields, cta_button_style_preset: presetId }));
  };

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
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ── Left: scrollable controls ── */}
      <div className="flex-1 min-w-0 space-y-5">

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

        {/* Overlay Style */}
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

        {/* ── CTA Text ── */}
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
          {/* Multiline toggle + input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Text</span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.cta_text_multiline}
                  onCheckedChange={(v) => set("cta_text_multiline", v)}
                />
                <span className="text-[10px] font-mono text-zinc-500">Multiline</span>
              </div>
            </div>
            {form.cta_text_multiline ? (
              <textarea
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
                value={form.cta_text}
                onChange={(e) => set("cta_text", e.target.value)}
                placeholder="Line 1&#10;Line 2"
              />
            ) : (
              <input
                className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                value={form.cta_text}
                onChange={(e) => set("cta_text", e.target.value)}
                placeholder="Book your free consultation"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColorRow label="Color" value={form.cta_text_color} onChange={(v) => set("cta_text_color", v)} />
            <VideoField label="Size">
              <ChipGroup options={SIZES} value={form.cta_text_size} onChange={(v) => set("cta_text_size", v)} />
            </VideoField>
          </div>

          {/* Background shape */}
          <VideoField label="Background">
            <ChipGroup
              options={BG_SHAPES}
              value={form.cta_text_bg_shape}
              onChange={(v) => set("cta_text_bg_shape", v)}
              format={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
            />
          </VideoField>

          {form.cta_text_bg_shape && form.cta_text_bg_shape !== "none" && form.cta_text_bg_shape !== "underline" && (
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

          {/* Advanced text accordion */}
          <AdvancedToggle open={txtAdv} onToggle={() => setTxtAdv((v) => !v)} />

          {txtAdv && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <VideoField label="Transform">
                <ChipGroup
                  options={TEXT_TRANSFORMS}
                  value={form.cta_text_transform}
                  onChange={(v) => set("cta_text_transform", v)}
                  format={(v) => ({ none: "None", uppercase: "UPPER", capitalize: "Title", lowercase: "lower" }[v] ?? v)}
                />
              </VideoField>

              <div className="grid grid-cols-2 gap-3">
                <VideoField label={`Letter Spacing ${form.cta_text_letter_spacing}px`}>
                  <Slider
                    min={-2} max={8} step={0.5}
                    value={[form.cta_text_letter_spacing]}
                    onValueChange={([v]) => set("cta_text_letter_spacing", v)}
                    className="mt-3"
                  />
                </VideoField>
                <VideoField label="Weight">
                  <ChipGroup
                    options={FONT_WEIGHTS}
                    value={form.cta_text_font_weight === "inherit" ? "700" : form.cta_text_font_weight}
                    onChange={(v) => set("cta_text_font_weight", v)}
                    format={(v) => ({ "400": "Light", "600": "Med", "700": "Bold", "900": "Black" }[v] ?? v)}
                  />
                </VideoField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <VideoField label="Align">
                  <ChipGroup
                    options={ALIGN_OPTIONS}
                    value={form.cta_text_align}
                    onChange={(v) => set("cta_text_align", v)}
                    format={(v) => ({ left: "←", center: "↔", right: "→" }[v] ?? v)}
                  />
                </VideoField>
                <VideoField label={`Max Width ${form.cta_text_max_width}%`}>
                  <Slider
                    min={20} max={100} step={5}
                    value={[form.cta_text_max_width]}
                    onValueChange={([v]) => set("cta_text_max_width", v)}
                    className="mt-3"
                  />
                </VideoField>
              </div>

              {/* Text shadow */}
              <div className="flex items-center gap-3">
                <Switch checked={form.cta_text_shadow_enabled} onCheckedChange={(v) => set("cta_text_shadow_enabled", v)} />
                <span className="text-xs font-mono text-zinc-400">Text Shadow</span>
              </div>
              {form.cta_text_shadow_enabled && (
                <div className="space-y-3 pl-2 border-l border-zinc-800">
                  <ColorRow label="Shadow Color" value={form.cta_text_shadow_color} onChange={(v) => set("cta_text_shadow_color", v)} />
                  <div className="grid grid-cols-3 gap-2">
                    <VideoField label={`X ${form.cta_text_shadow_x}px`}>
                      <Slider min={-10} max={10} step={1} value={[form.cta_text_shadow_x]} onValueChange={([v]) => set("cta_text_shadow_x", v)} className="mt-3" />
                    </VideoField>
                    <VideoField label={`Y ${form.cta_text_shadow_y}px`}>
                      <Slider min={-10} max={10} step={1} value={[form.cta_text_shadow_y]} onValueChange={([v]) => set("cta_text_shadow_y", v)} className="mt-3" />
                    </VideoField>
                    <VideoField label={`Blur ${form.cta_text_shadow_blur}px`}>
                      <Slider min={0} max={20} step={1} value={[form.cta_text_shadow_blur]} onValueChange={([v]) => set("cta_text_shadow_blur", v)} className="mt-3" />
                    </VideoField>
                  </div>
                </div>
              )}

              {/* Text stroke */}
              <div className="flex items-center gap-3">
                <Switch checked={form.cta_text_stroke_enabled} onCheckedChange={(v) => set("cta_text_stroke_enabled", v)} />
                <span className="text-xs font-mono text-zinc-400">Text Outline (Stroke)</span>
              </div>
              {form.cta_text_stroke_enabled && (
                <div className="grid grid-cols-2 gap-3 pl-2 border-l border-zinc-800">
                  <VideoField label={`Width ${form.cta_text_stroke_width}px`}>
                    <Slider min={1} max={4} step={1} value={[form.cta_text_stroke_width]} onValueChange={([v]) => set("cta_text_stroke_width", v)} className="mt-3" />
                  </VideoField>
                  <ColorRow label="Stroke Color" value={form.cta_text_stroke_color} onChange={(v) => set("cta_text_stroke_color", v)} />
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── CTA Button ── */}
        <Section title="CTA Button">
          <VideoField label="Button Text">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={form.cta_button_text}
              onChange={(e) => set("cta_button_text", e.target.value)}
              placeholder="Get Started"
            />
          </VideoField>

          {/* Style preset picker */}
          <VideoField label="Style Preset">
            <ButtonStylePicker value={form.cta_button_style_preset} onChange={applyButtonPreset} />
          </VideoField>

          {/* Base colors (overrideable after preset) */}
          <div className="grid grid-cols-2 gap-3">
            <ColorRow label="Bg Color" value={form.cta_button_bg_color} onChange={(v) => set("cta_button_bg_color", v)} />
            <ColorRow label="Text Color" value={form.cta_button_text_color} onChange={(v) => set("cta_button_text_color", v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VideoField label="Size">
              <ChipGroup options={SIZES} value={form.cta_button_size} onChange={(v) => set("cta_button_size", v)} />
            </VideoField>
            <VideoField label="Icon">
              <ChipGroup
                options={ICONS}
                value={form.cta_button_icon}
                onChange={(v) => set("cta_button_icon", v)}
                format={(v) => ({ none: "—", arrow: "→", play: "▶", plus: "+", star: "★", chevron: "›" }[v] ?? v)}
              />
            </VideoField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VideoField label={`Radius ${form.cta_button_border_radius}px`}>
              <Slider
                min={0} max={999} step={2}
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

          {/* Advanced button accordion */}
          <AdvancedToggle open={btnAdv} onToggle={() => setBtnAdv((v) => !v)} />

          {btnAdv && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">

              {/* Gradient */}
              <div className="flex items-center gap-3">
                <Switch checked={form.cta_button_gradient} onCheckedChange={(v) => set("cta_button_gradient", v)} />
                <span className="text-xs font-mono text-zinc-400">Gradient Background</span>
              </div>
              {form.cta_button_gradient && (
                <div className="space-y-3 pl-2 border-l border-zinc-800">
                  <div className="grid grid-cols-2 gap-3">
                    <ColorRow label="From" value={form.cta_button_gradient_from} onChange={(v) => set("cta_button_gradient_from", v)} />
                    <ColorRow label="To" value={form.cta_button_gradient_to} onChange={(v) => set("cta_button_gradient_to", v)} />
                  </div>
                  <VideoField label="Direction">
                    <ChipGroup
                      options={GRADIENT_DIRS}
                      value={form.cta_button_gradient_dir}
                      onChange={(v) => set("cta_button_gradient_dir", v)}
                      format={(v) => ({ "90deg": "→", "135deg": "↘", "180deg": "↓", "45deg": "↗" }[v] ?? v)}
                    />
                  </VideoField>
                </div>
              )}

              {/* Glass/Frosted */}
              <div className="flex items-center gap-3">
                <Switch checked={form.cta_button_glass} onCheckedChange={(v) => set("cta_button_glass", v)} />
                <span className="text-xs font-mono text-zinc-400">Frosted Glass</span>
              </div>
              {form.cta_button_glass && (
                <div className="pl-2 border-l border-zinc-800">
                  <VideoField label={`Bg Opacity ${Math.round(form.cta_button_bg_opacity * 100)}%`}>
                    <Slider
                      min={0} max={1} step={0.05}
                      value={[form.cta_button_bg_opacity]}
                      onValueChange={([v]) => set("cta_button_bg_opacity", v)}
                      className="mt-3"
                    />
                  </VideoField>
                </div>
              )}

              {/* Border */}
              <div className="flex items-center gap-3">
                <Switch checked={form.cta_button_border_enabled} onCheckedChange={(v) => set("cta_button_border_enabled", v)} />
                <span className="text-xs font-mono text-zinc-400">Border</span>
              </div>
              {form.cta_button_border_enabled && (
                <div className="space-y-3 pl-2 border-l border-zinc-800">
                  <div className="grid grid-cols-2 gap-3">
                    <VideoField label={`Width ${form.cta_button_border_width}px`}>
                      <Slider min={1} max={4} step={1} value={[form.cta_button_border_width]} onValueChange={([v]) => set("cta_button_border_width", v)} className="mt-3" />
                    </VideoField>
                    <ColorRow label="Border Color" value={form.cta_button_border_color} onChange={(v) => set("cta_button_border_color", v)} />
                  </div>
                  <VideoField label="Style">
                    <ChipGroup
                      options={BORDER_STYLES}
                      value={form.cta_button_border_style}
                      onChange={(v) => set("cta_button_border_style", v)}
                      format={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                    />
                  </VideoField>
                </div>
              )}

              {/* Text transform + letter spacing */}
              <VideoField label="Transform">
                <ChipGroup
                  options={TEXT_TRANSFORMS}
                  value={form.cta_button_text_transform}
                  onChange={(v) => set("cta_button_text_transform", v)}
                  format={(v) => ({ none: "None", uppercase: "UPPER", capitalize: "Title", lowercase: "lower" }[v] ?? v)}
                />
              </VideoField>

              <VideoField label={`Letter Spacing ${form.cta_button_letter_spacing}px`}>
                <Slider
                  min={-2} max={8} step={0.5}
                  value={[form.cta_button_letter_spacing]}
                  onValueChange={([v]) => set("cta_button_letter_spacing", v)}
                  className="mt-3"
                />
              </VideoField>

              {/* Glow */}
              <VideoField label="Glow">
                <ChipGroup
                  options={GLOW_OPTIONS}
                  value={form.cta_button_glow}
                  onChange={(v) => set("cta_button_glow", v)}
                  format={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                />
              </VideoField>
              {form.cta_button_glow !== "none" && (
                <div className="pl-2 border-l border-zinc-800">
                  <ColorRow label="Glow Color" value={form.cta_button_glow_color} onChange={(v) => set("cta_button_glow_color", v)} />
                </div>
              )}

              {/* Padding */}
              <div className="grid grid-cols-2 gap-3">
                <VideoField label={`Padding H ${form.cta_button_padding_x}px`}>
                  <Slider min={8} max={48} step={2} value={[form.cta_button_padding_x]} onValueChange={([v]) => set("cta_button_padding_x", v)} className="mt-3" />
                </VideoField>
                <VideoField label={`Padding V ${form.cta_button_padding_y}px`}>
                  <Slider min={4} max={24} step={2} value={[form.cta_button_padding_y]} onValueChange={([v]) => set("cta_button_padding_y", v)} className="mt-3" />
                </VideoField>
              </div>
            </div>
          )}
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

      {/* ── Right: sticky live preview ── */}
      <div className="w-full lg:w-[360px] lg:shrink-0 lg:sticky lg:top-4 space-y-2">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
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
