import { useState, useEffect } from "react";
import axios from "axios";
import { API, BUILT_IN_TEMPLATES, TYPE_SETTINGS, SLIDE_FORMATS, buildCtaButtonText } from "./constants";

export default function PipelineWizardStep2({ form, onChange, clientId }) {
  const [customTemplates, setCustomTemplates] = useState([]);

  useEffect(() => {
    axios.get(`${API}/templates`).then(r => {
      const builtInIds = new Set(BUILT_IN_TEMPLATES.map(t => t.value));
      setCustomTemplates(
        (r.data || [])
          .filter(t => !builtInIds.has(t.id))
          .map(t => ({ value: t.id, label: t.name }))
      );
    }).catch(() => {});
  }, []);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];
  const settings = TYPE_SETTINGS[form.pipeline_type] || TYPE_SETTINGS.standard;
  const ctaPreview = buildCtaButtonText(form.cta_keyword, form.cta_offer);

  return (
    <div className="space-y-5">
      {/* Template — carousel only */}
      {settings.showTemplate && (
        <div>
          <label className="label-xs">Template</label>
          <div className="flex gap-2 flex-wrap">
            {allTemplates.map(t => (
              <button
                key={t.value}
                type="button"
                data-testid={`template-${t.value}`}
                onClick={() => onChange("carousel_template", t.value)}
                className={`py-2 px-3 text-[10px] font-mono border transition-colors duration-150 ${
                  form.carousel_template === t.value
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slide count + Format — side by side when both visible */}
      {(settings.showSlideCount || settings.showFormat) && (
        <div className={`grid gap-3 ${settings.showSlideCount && settings.showFormat ? "grid-cols-2" : "grid-cols-1"}`}>
          {settings.showSlideCount && (
            <div>
              <label className="label-xs">Slides per Carousel</label>
              <input
                data-testid="slide-count-input"
                type="number" min={3} max={10}
                value={form.carousel_slide_count}
                onChange={e => onChange("carousel_slide_count", parseInt(e.target.value) || 5)}
                className="field font-mono"
              />
            </div>
          )}
          {settings.showFormat && (
            <div>
              <label className="label-xs">Content Format</label>
              <div className="flex gap-1.5 flex-wrap">
                {SLIDE_FORMATS.map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onChange("carousel_slide_format", val)}
                    className={`py-1.5 px-2 text-[10px] font-mono border transition-colors duration-150 ${
                      form.carousel_slide_format === val
                        ? "bg-white text-black border-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Topics — standard only */}
      {settings.showTopics && (
        <div>
          <label className="label-xs">Topics for AI (comma-separated, leave blank = auto-pick)</label>
          <input
            data-testid="topics-input"
            value={form.carousel_topics}
            onChange={e => onChange("carousel_topics", e.target.value)}
            placeholder="productivity, SaaS growth, leadership tips"
            className="field"
          />
        </div>
      )}

      {/* CTA — always */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-xs">CTA Keyword</label>
          <input
            data-testid="pipeline-cta-keyword-input"
            value={form.cta_keyword}
            onChange={e => onChange("cta_keyword", e.target.value)}
            placeholder="growth"
            className="field"
          />
        </div>
        <div>
          <label className="label-xs">CTA Offer / Benefit</label>
          <input
            data-testid="pipeline-cta-offer-input"
            value={form.cta_offer}
            onChange={e => onChange("cta_offer", e.target.value)}
            placeholder="my exact roadmap"
            className="field"
          />
        </div>
      </div>
      {ctaPreview && (
        <div className="text-[10px] font-mono text-zinc-500 border border-dashed border-zinc-800 px-3 py-2">
          Last slide CTA: <span className="text-zinc-300">{ctaPreview}</span>
        </div>
      )}

      {/* Global instructions — always */}
      <div>
        <label className="label-xs">Global Instructions (optional)</label>
        <textarea
          value={form.global_instructions}
          onChange={e => onChange("global_instructions", e.target.value)}
          placeholder="Always mention our 14-day free trial. Avoid competitor names."
          rows={3}
          className="field resize-none"
        />
      </div>
    </div>
  );
}
