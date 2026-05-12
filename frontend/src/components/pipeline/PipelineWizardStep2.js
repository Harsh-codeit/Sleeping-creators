import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  API, BUILT_IN_TEMPLATES, TYPE_SETTINGS, SLIDE_FORMATS, buildCtaButtonText,
  VIDEO_FILTERS, VIDEO_HOOK_STRATEGIES,
} from "./constants";
import VideoTemplatePicker from "../VideoTemplatePicker";

export default function PipelineWizardStep2({ form, onChange, clientId }) {
  const [customTemplates, setCustomTemplates] = useState([]);
  const [clientHooks, setClientHooks] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Load the client's saved video hooks so the user can see what'll rotate
  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/clients/${clientId}`)
      .then(r => setClientHooks(r.data?.strategy?.video_hooks || []))
      .catch(() => setClientHooks([]));
  }, [clientId]);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];
  const settings = TYPE_SETTINGS[form.pipeline_type] || TYPE_SETTINGS.standard;
  const ctaPreview = buildCtaButtonText(form.cta_keyword, form.cta_offer);

  if (settings.showVideoConfig) {
    const hookStrat = form.video_hook_strategy || "rotate";
    const hooksEmpty = clientHooks.length === 0;

    return (
      <div className="space-y-5">
        {/* Template */}
        <div>
          <label className="label-xs">Video Template</label>
          <VideoTemplatePicker
            value={form.video_template_id}
            onChange={(id) => onChange("video_template_id", id)}
          />
        </div>

        {/* Content source — hook strategy */}
        <div>
          <label className="label-xs">Content Source</label>
          <div className="flex gap-1.5 flex-wrap">
            {VIDEO_HOOK_STRATEGIES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange("video_hook_strategy", s.value)}
                title={s.desc}
                className={`py-1.5 px-3 text-[11px] font-mono border transition-colors duration-150 ${
                  hookStrat === s.value
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Saved hooks preview (read-only chips) */}
          {hookStrat !== "none" && (
            hooksEmpty ? (
              <div className="mt-2 border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] font-mono text-amber-200">
                No saved hooks yet.{" "}
                {clientId && (
                  <Link to={`/clients/${clientId}`} className="text-amber-100 underline hover:text-white">
                    Add hooks on the Strategy tab →
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-mono text-zinc-500">
                  {clientHooks.length} saved hook{clientHooks.length === 1 ? "" : "s"} — edit on Strategy tab
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clientHooks.map(h => (
                    <span
                      key={h.id}
                      title={h.prompt}
                      className="font-mono text-[10px] px-2 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-400 truncate max-w-[220px]"
                    >
                      {h.title || h.prompt?.slice(0, 40) + "…"}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Fallback prompt — shown when no hooks or strategy "none" */}
        {(hookStrat === "none" || hooksEmpty) && (
          <div>
            <label className="label-xs">Fallback Prompt</label>
            <textarea
              value={form.global_instructions || ""}
              onChange={(e) => onChange("global_instructions", e.target.value)}
              placeholder="What kind of video should the AI write? e.g. 'A 30-sec tip about growth tactics for SaaS founders'"
              rows={2}
              className="field resize-none"
            />
            <div className="text-[10px] font-mono text-zinc-600 mt-1">
              Used when no hook is picked. Client strategy (themes/tone/topics) is always applied.
            </div>
          </div>
        )}

        {/* Style — filter */}
        <div>
          <label className="label-xs">Filter</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange("video_filter_name", "")}
              className={`py-1.5 px-2.5 text-[11px] font-mono uppercase tracking-widest border transition-colors duration-150 ${
                !form.video_filter_name
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              none
            </button>
            {VIDEO_FILTERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => onChange("video_filter_name", f === form.video_filter_name ? "" : f)}
                className={`py-1.5 px-2.5 text-[11px] font-mono uppercase tracking-widest border transition-colors duration-150 ${
                  form.video_filter_name === f
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Background music override */}
        <div>
          <label className="label-xs">Background Music URL (optional)</label>
          <input
            type="text"
            value={form.video_audio_url || ""}
            onChange={(e) => onChange("video_audio_url", e.target.value)}
            placeholder="Leave blank to use template default — paste an audio URL to override"
            className="field font-mono text-xs"
          />
          <div className="text-[10px] font-mono text-zinc-600 mt-1">
            Tip: upload music via the Studio's music picker, then copy the URL here.
          </div>
        </div>

        {/* AI content toggle */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.video_use_ai_content !== false}
            onChange={(e) => onChange("video_use_ai_content", e.target.checked)}
            className="mt-0.5 accent-white"
          />
          <span>
            <span className="text-xs text-white font-semibold">Auto-generate caption + hashtags + text fields</span>
            <span className="block text-[10px] font-mono text-zinc-500 mt-0.5">
              Uses Claude with the client's strategy & the picked hook as the brief. Turn off to use template defaults only.
            </span>
          </span>
        </label>

        {/* Advanced disclosure */}
        <div className="border-t border-zinc-800 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(s => !s)}
            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest"
          >
            {showAdvanced ? "▾" : "▸"} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <label className="label-xs">Render lead time (minutes)</label>
              <input
                type="number" min={5} max={1440}
                value={form.min_render_lead_minutes ?? 30}
                onChange={(e) => onChange("min_render_lead_minutes", parseInt(e.target.value || "30", 10))}
                className="field font-mono w-32"
              />
              <div className="text-[10px] font-mono text-zinc-600 mt-1">
                How early to start rendering before the publish time. Default 30 min is safe.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
