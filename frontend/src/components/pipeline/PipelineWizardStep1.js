import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PIPELINE_TYPES, TYPE_HINTS, PRESETS } from "./constants";

const CAROUSEL_PIPELINE_TYPES = PIPELINE_TYPES.filter(t => t.value === "standard" || t.value === "competitor");

export default function PipelineWizardStep1({ form, onChange }) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const isVideo = form.pipeline_type === "video";

  const selectContentType = (type) => {
    if (type === "video") {
      onChange("content_type", "video");
      onChange("pipeline_type", "video");
    } else {
      onChange("content_type", "carousel");
      if (form.pipeline_type === "video") onChange("pipeline_type", "standard");
    }
  };

  return (
    <div className="space-y-5">
      {/* Content Type */}
      <div>
        <label className="label-xs">Content Type</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "carousel", label: "Carousel", desc: "Multi-slide image post" },
            { value: "video",    label: "Video",    desc: "Pick a clip, apply a template, publish automatically" },
          ].map(({ value, label, desc }) => {
            const selected = isVideo ? value === "video" : value === "carousel";
            return (
              <button
                key={value}
                type="button"
                data-testid={`content-type-${value}`}
                onClick={() => selectContentType(value)}
                className={`flex items-start gap-2.5 p-3 border text-left transition-colors duration-150 ${
                  selected ? "bg-zinc-800 border-white" : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <div>
                  <div className="text-xs font-mono font-bold text-white">{label}</div>
                  <div className="text-[10px] font-mono mt-0.5 text-zinc-500">{desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pipeline Type — only for carousel */}
      {!isVideo && (
      <div>
        <label className="label-xs">Pipeline Type</label>
        <div className="grid grid-cols-2 gap-2">
          {CAROUSEL_PIPELINE_TYPES.map(({ value, label, desc, icon: Icon }) => {
            const selected = form.pipeline_type === value;
            return (
              <button
                key={value}
                type="button"
                data-testid={`pipeline-type-${value}`}
                onClick={() => onChange("pipeline_type", value)}
                className={`flex items-start gap-2.5 p-3 border text-left transition-colors duration-150 ${
                  selected ? "bg-zinc-800 border-white" : "border-zinc-700 hover:border-zinc-500"
                } ${value === "experimental" ? "col-span-2" : ""}`}
              >
                <Icon
                  size={14}
                  className={`flex-shrink-0 mt-0.5 ${selected ? "text-white" : "text-zinc-400"}`}
                />
                <div>
                  <div className="text-xs font-mono font-bold text-white">
                    {label}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5 text-zinc-500">
                    {desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {TYPE_HINTS[form.pipeline_type] && (
          <div className="mt-2 text-[10px] font-mono text-zinc-500 border border-dashed border-zinc-800 px-3 py-2 leading-relaxed">
            {TYPE_HINTS[form.pipeline_type]}
          </div>
        )}
      </div>
      )}

      {/* Pipeline name */}
      <div>
        <label className="label-xs">Pipeline Name</label>
        <input
          data-testid="pipeline-name-input"
          value={form.name}
          onChange={e => onChange("name", e.target.value)}
          placeholder="Morning Thought Leadership · Competitor Watch · Trending Now"
          className="field"
        />
      </div>

      {/* Quick presets collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setPresetsOpen(o => !o)}
          className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
        >
          {presetsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Quick Presets
        </button>
        {presetsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  Object.entries(preset.config).forEach(([k, v]) => onChange(k, v));
                  onChange("name", preset.label);
                }}
                className="flex flex-col items-start p-3 border border-dashed border-zinc-800 hover:border-zinc-600 text-left transition-colors bg-zinc-950"
              >
                <div className="text-xs font-mono text-zinc-300 mb-0.5">{preset.label}</div>
                <div className="text-[10px] font-mono text-zinc-600">{preset.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
