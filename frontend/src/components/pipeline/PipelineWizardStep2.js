import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Play, Pause } from "lucide-react";
import {
  API, BUILT_IN_TEMPLATES, TYPE_SETTINGS, SLIDE_FORMATS, buildCtaButtonText,
  VIDEO_FILTERS, VIDEO_HOOK_STRATEGIES,
} from "./constants";

export default function PipelineWizardStep2({ form, onChange, clientId }) {
  const [customTemplates, setCustomTemplates] = useState([]);
  const [musicTracks, setMusicTracks] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

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

  useEffect(() => {
    axios.get(`${API}/music`)
      .then(r => setMusicTracks(r.data || []))
      .catch(() => setMusicTracks([]));
  }, []);

  const togglePlay = (track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) { audio.pause(); setPlayingId(null); }
    else { audio.src = track.r2_url; audio.play().catch(() => {}); setPlayingId(track.id); }
  };

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];
  const settings = TYPE_SETTINGS[form.pipeline_type] || TYPE_SETTINGS.standard;
  const ctaPreview = buildCtaButtonText(form.cta_keyword, form.cta_offer);

  // ── Video pipeline section ───────────────────────────────────────────────
  if (settings.showVideoConfig) {
    const hookStrat = form.video_hook_strategy || "rotate";

    // Music mode derived from form state
    const audioIds = form.video_audio_ids || [];
    const audioTags = form.video_audio_tags || [];
    const audioMode = audioTags.length > 0 ? "tags" : audioIds.length > 0 ? "tracks" : "none";
    const audioStrategy = form.video_audio_strategy || "rotate";

    const allTags = Array.from(new Set(musicTracks.flatMap(t => t.mood_tags || []))).sort();
    const tagSet = new Set(audioTags);
    const matchCount = musicTracks.filter(t => (t.mood_tags || []).some(tag => tagSet.has(tag))).length;

    const setAudioMode = (mode) => {
      if (mode === "tags")   { onChange("video_audio_ids", []); }
      if (mode === "tracks") { onChange("video_audio_tags", []); }
      if (mode === "none")   { onChange("video_audio_ids", []); onChange("video_audio_tags", []); }
    };

    const toggleTrack = (id) => {
      onChange(
        "video_audio_ids",
        audioIds.includes(id) ? audioIds.filter(x => x !== id) : [...audioIds, id]
      );
    };

    const toggleTag = (tag) => {
      onChange("video_audio_tags", tagSet.has(tag) ? audioTags.filter(t => t !== tag) : [...audioTags, tag]);
    };

    return (
      <div className="space-y-6">
        {/* Hook strategy */}
        <div>
          <label className="label-xs">Caption Hook</label>
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
          {hookStrat === "none" && (
            <textarea
              value={form.global_instructions || ""}
              onChange={e => onChange("global_instructions", e.target.value)}
              placeholder="e.g. 'A 30-sec tip about growth tactics for SaaS founders'"
              rows={2}
              className="field resize-none mt-2"
            />
          )}
        </div>

        {/* Filter */}
        <div>
          <label className="label-xs">Filter</label>
          <div className="flex flex-wrap gap-1.5">
            {["", ...VIDEO_FILTERS].map(f => (
              <button
                key={f || "none"}
                type="button"
                onClick={() => onChange("video_filter_name", f)}
                className={`py-1.5 px-2.5 text-[11px] font-mono uppercase tracking-widest border transition-colors duration-150 ${
                  form.video_filter_name === f
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f || "none"}
              </button>
            ))}
          </div>
        </div>

        {/* Music */}
        <div>
          <label className="label-xs">Music</label>

          {/* Mode selector */}
          <div className="flex gap-1.5 mb-3">
            {[
              { value: "tags",   label: "By Tag" },
              { value: "tracks", label: "Pick Tracks" },
              { value: "none",   label: "None" },
            ].map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => setAudioMode(m.value)}
                className={`py-1.5 px-3 text-[11px] font-mono border transition-colors duration-150 ${
                  audioMode === m.value
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* By Tag */}
          {audioMode === "tags" && (
            allTags.length === 0 ? (
              <div className="text-[11px] font-mono text-zinc-500 border border-dashed border-zinc-700 px-3 py-2">
                No mood tags found. Add tags to tracks on the Music page first.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`py-1 px-2.5 text-[11px] font-mono border transition-colors duration-150 ${
                        tagSet.has(tag)
                          ? "border-white text-white bg-zinc-900"
                          : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {audioTags.length > 0 && (
                  <p className="text-[10px] font-mono text-zinc-500 mt-1.5">
                    {matchCount === 0
                      ? <span className="text-amber-400">No tracks match — falls back to template default</span>
                      : `${matchCount} track${matchCount === 1 ? "" : "s"} match — one picked at random per run`}
                  </p>
                )}
              </>
            )
          )}

          {/* Pick Tracks */}
          {audioMode === "tracks" && (
            <div className="space-y-3">
              {musicTracks.length === 0 ? (
                <div className="text-[11px] font-mono text-zinc-500 border border-dashed border-zinc-700 px-3 py-2">
                  No tracks in library yet. Add them from the Music page.
                </div>
              ) : (
                <div className="space-y-1">
                  {musicTracks.map(track => {
                    const selected = audioIds.includes(track.id);
                    const isPlaying = playingId === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-2 px-3 py-2 border cursor-pointer transition-colors duration-150 ${
                          selected ? "border-white bg-zinc-900" : "border-zinc-800 hover:border-zinc-600"
                        }`}
                        onClick={() => toggleTrack(track.id)}
                      >
                        {/* Play preview */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); togglePlay(track); }}
                          className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-zinc-400 hover:text-white transition-colors"
                        >
                          {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                        </button>

                        <span className="font-mono text-[11px] text-zinc-300 flex-1 truncate">{track.name}</span>

                        {track.duration && (
                          <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">
                            {Math.round(track.duration)}s
                          </span>
                        )}

                        {/* Checkbox indicator */}
                        <span className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-colors ${
                          selected ? "border-white bg-white" : "border-zinc-600"
                        }`}>
                          {selected && <span className="text-black text-[9px] font-bold">✓</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strategy */}
              {audioIds.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 mb-1.5">
                    {audioIds.length} track{audioIds.length === 1 ? "" : "s"} selected — play order:
                  </p>
                  <div className="flex gap-1.5">
                    {[
                      { value: "rotate", label: "Rotate", desc: "Cycle through in order" },
                      { value: "random", label: "Random", desc: "Pick one at random each run" },
                    ].map(s => (
                      <button
                        key={s.value}
                        type="button"
                        title={s.desc}
                        onClick={() => onChange("video_audio_strategy", s.value)}
                        className={`py-1.5 px-3 text-[11px] font-mono border transition-colors duration-150 ${
                          audioStrategy === s.value
                            ? "bg-white text-black border-white"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {audioMode === "none" && (
            <p className="text-[10px] font-mono text-zinc-600">Uses the template's default soundtrack.</p>
          )}
        </div>

        {/* AI captions toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.video_use_ai_content !== false}
            onChange={e => onChange("video_use_ai_content", e.target.checked)}
            className="accent-white"
          />
          <span>
            <span className="text-xs text-white font-semibold">AI captions + hashtags</span>
            <span className="text-[10px] font-mono text-zinc-500 ml-1.5">uses client strategy + hook as brief</span>
          </span>
        </label>

        <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
      </div>
    );
  }

  // ── Carousel pipeline section ────────────────────────────────────────────
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

      {/* Slide count + Format */}
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

      {/* Topics */}
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

      {/* CTA */}
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

      {/* Global instructions */}
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
