import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PIPELINE_TYPES, CONTENT_TYPES, TYPE_HINTS, PRESETS, isVideoPipeline } from "./constants";

export default function PipelineWizardStep1({ form, onChange }) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const isVideo = isVideoPipeline(form);

  const selectContentType = (value) => {
    onChange("content_type", value);
    // Migrate any legacy pipeline_type="video" pipelines to a sensible default
    // when switching to non-video, and away from "video" if user picks video here.
    if (value === "video" && form.pipeline_type === "video") {
      // legacy doc — leave it; backend handles either
    } else if (value !== "video" && form.pipeline_type === "video") {
      onChange("pipeline_type", "standard");
    }
  };

  return (
    <div className="space-y-5">
      {/* Content type — now includes Video alongside Carousel + Text Post */}
      <div>
        <label className="label-xs">Content Type</label>
        <div className="grid grid-cols-3 gap-2">
          {CONTENT_TYPES.map(({ value, label, desc, icon: Icon }) => {
            const selected = form.content_type === value || (value === "video" && isVideo);
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
                {Icon && (
                  <Icon
                    size={14}
                    className={`flex-shrink-0 mt-0.5 ${selected ? "text-white" : "text-zinc-400"}`}
                  />
                )}
                <div>
                  <div className="text-xs font-mono font-bold text-white">{label}</div>
                  <div className="text-[10px] font-mono mt-0.5 text-zinc-500">{desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pipeline Type — hidden for Video (video flow uses saved hooks instead of topic strategies) */}
      {!isVideo && (
        <div>
          <label className="label-xs">Pipeline Type</label>
          <div className="grid grid-cols-2 gap-2">
            {PIPELINE_TYPES.map(({ value, label, desc, icon: Icon }) => {
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
                    <div className="text-xs font-mono font-bold text-white">{label}</div>
                    <div className="text-[10px] font-mono mt-0.5 text-zinc-500">{desc}</div>
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

      {isVideo && (
        <div className="text-[10px] font-mono text-zinc-500 border border-dashed border-zinc-800 px-3 py-2 leading-relaxed">
          Video pipelines rotate through saved hooks from the client's Strategy tab — no topic strategy needed.
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
