import React from "react";
import {
  FONT_PRESETS,
  OVERLAY_PRESETS,
  CTA_BUTTON_PRESETS,
  CTA_ANIMATION_PRESETS,
} from "../constants/videoStyles";

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function VideoStylePicker({ template, onChange }) {
  // template: object with font_preset, overlay_style, overlay_color, overlay_opacity,
  //           cta_button_bg_color, cta_button_text_color, cta_button_border_radius,
  //           cta_button_shadow, cta_animation, cta_delay, cta_button_text
  // onChange: function(patch) — called with partial update object

  const font = FONT_PRESETS.find(f => f.id === template.font_preset) || FONT_PRESETS[0];
  const overlay = OVERLAY_PRESETS.find(o => o.id === template.overlay_style) || OVERLAY_PRESETS[0];

  function overlayCSS() {
    if (overlay.needsColor) {
      return { background: hexToRgba(template.overlay_color || "#000000", template.overlay_opacity ?? 0.5) };
    }
    return overlay.cssStyle;
  }

  function applyPreset(preset) {
    const { id, label, border, ...fields } = preset;
    onChange(fields);
  }

  return (
    <div className="space-y-6 p-4">

      {/* Live Preview */}
      <div>
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest">Preview</p>
        <div className="relative w-full aspect-[9/16] max-w-[160px] mx-auto rounded-lg overflow-hidden bg-zinc-800">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
          <div className="absolute inset-0" style={overlayCSS()} />
          <div
            className="absolute bottom-12 left-0 right-0 text-center px-2"
            style={{
              fontFamily: font.fontFamily,
              fontWeight: font.fontWeight,
              letterSpacing: font.letterSpacing,
              color: "#fff",
              fontSize: "10px",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {font.sample}
          </div>
          {template.cta_button_text && (
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[7px] px-2 py-0.5 whitespace-nowrap"
              style={{
                backgroundColor: template.cta_button_bg_color || "#fff",
                color: template.cta_button_text_color || "#000",
                borderRadius: `${template.cta_button_border_radius ?? 4}px`,
                boxShadow: template.cta_button_shadow ? "0 2px 8px rgba(0,0,0,0.4)" : "none",
              }}
            >
              {template.cta_button_text}
            </div>
          )}
        </div>
      </div>

      {/* Font Preset */}
      <div>
        <p className="text-xs text-zinc-400 mb-2 font-medium">Font Style</p>
        <div className="grid grid-cols-2 gap-2">
          {FONT_PRESETS.map(f => (
            <button
              key={f.id}
              onClick={() => onChange({ font_preset: f.id })}
              className={`px-3 py-2 rounded border text-left text-sm transition-colors ${
                template.font_preset === f.id
                  ? "border-indigo-500 bg-indigo-500/10 text-white"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              <span style={{ fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontSize: "13px" }}>
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay Style */}
      <div>
        <p className="text-xs text-zinc-400 mb-2 font-medium">Overlay</p>
        <div className="grid grid-cols-2 gap-2">
          {OVERLAY_PRESETS.map(o => (
            <button
              key={o.id}
              onClick={() => onChange({ overlay_style: o.id })}
              className={`px-3 py-2 rounded border text-xs text-left transition-colors ${
                template.overlay_style === o.id
                  ? "border-indigo-500 bg-indigo-500/10 text-white"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {overlay.needsColor && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-400">Color</label>
            <input
              type="color"
              value={template.overlay_color || "#000000"}
              onChange={e => onChange({ overlay_color: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border-0"
            />
            <label className="text-xs text-zinc-400">Opacity</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={template.overlay_opacity ?? 0.5}
              onChange={e => onChange({ overlay_opacity: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-zinc-500 w-8 text-right">
              {Math.round((template.overlay_opacity ?? 0.5) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* CTA Button Preset */}
      <div>
        <p className="text-xs text-zinc-400 mb-2 font-medium">CTA Button Style</p>
        <div className="grid grid-cols-2 gap-2">
          {CTA_BUTTON_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="px-3 py-2 rounded border border-zinc-700 bg-zinc-800 text-xs text-zinc-300 hover:border-zinc-500 text-left transition-colors"
            >
              <span
                className="inline-block px-2 py-0.5 text-[10px]"
                style={{
                  backgroundColor: p.cta_button_bg_color === "transparent" ? "transparent" : p.cta_button_bg_color,
                  color: p.cta_button_text_color,
                  borderRadius: `${p.cta_button_border_radius}px`,
                  border: p.border || "none",
                  boxShadow: p.cta_button_shadow ? "0 2px 6px rgba(0,0,0,0.4)" : "none",
                }}
              >
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CTA Animation */}
      <div>
        <p className="text-xs text-zinc-400 mb-2 font-medium">CTA Animation</p>
        <div className="grid grid-cols-2 gap-2">
          {CTA_ANIMATION_PRESETS.map(a => (
            <button
              key={a.id}
              onClick={() => onChange({ cta_animation: a.id })}
              className={`px-3 py-2 rounded border text-xs transition-colors ${
                template.cta_animation === a.id
                  ? "border-indigo-500 bg-indigo-500/10 text-white"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-xs text-zinc-400">Delay</label>
          <input
            type="range" min="0" max="10" step="0.5"
            value={template.cta_delay ?? 3}
            onChange={e => onChange({ cta_delay: parseFloat(e.target.value) })}
            className="flex-1"
          />
          <span className="text-xs text-zinc-500 w-10 text-right">{template.cta_delay ?? 3}s</span>
        </div>
      </div>

    </div>
  );
}
