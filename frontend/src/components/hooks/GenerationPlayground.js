import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Wand2, Loader2, Copy, ChevronDown, ChevronRight, Images, Video, ScrollText,
  BookOpenCheck,
} from "lucide-react";
import NicheSelect from "../NicheSelect";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CONTENT_TYPES = [
  { value: "carousel", label: "Carousel", icon: Images },
  { value: "reel", label: "Reel", icon: Video },
  { value: "script", label: "Script", icon: ScrollText },
];

const HOOK_TYPES = [
  "credibility_borrow", "myth_bust", "emotional_state", "relatable_scene",
  "shocking_number", "direct_confront", "family_relationship",
];

const TRIGGERS = [
  "curiosity_gap", "controversy", "fomo", "social_proof", "fear",
  "aspiration", "relatability", "shock_value", "authority", "emotional_pain",
];

const SPICE_LEVELS = ["safe", "balanced", "bold", "unhinged"];

const LENGTH_META = {
  carousel: { label: "Slides", options: [5, 6, 7, 8, 9, 10], def: 7 },
  reel: { label: "Duration (s)", options: [30, 60, 90], def: 30 },
  script: { label: "~Words", options: [300, 600, 1000], def: 600 },
};

const SELECT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono cursor-pointer";
const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";

function Label({ children }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-1">
      {children}
    </div>
  );
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

function Block({ label, text }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-1.5">
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{label}</span>
        <button onClick={() => copy(text)} aria-label={`Copy ${label}`}
          className="text-zinc-600 hover:text-white transition-colors cursor-pointer">
          <Copy size={11} />
        </button>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-300 leading-relaxed px-3 py-2.5 break-words">
        {text}
      </pre>
    </div>
  );
}

function variationBlocks(contentType, v) {
  if (contentType === "carousel") {
    return [
      ["HOOK SLIDE", v.hook_slide],
      ...(v.slides || []).map((s, i) => [`SLIDE ${i + 1}`, s]),
      ["CTA SLIDE", v.cta_slide],
      ["CAPTION", v.caption],
    ];
  }
  if (contentType === "reel") {
    return [["HOOK", v.hook], ["SCRIPT", v.script], ["CTA", v.cta], ["CAPTION", v.caption]];
  }
  return [["TITLE", v.title], ["SCRIPT", v.script]];
}

function VariationCard({ contentType, variation, index }) {
  const blocks = variationBlocks(contentType, variation).filter(([, t]) => t);
  const all = blocks.map(([l, t]) => `${l}\n${t}`).join("\n\n");
  return (
    <div className="border border-zinc-700">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-zinc-900/40">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white">
          Variation {String(index + 1).padStart(2, "0")}
        </span>
        <button onClick={() => copy(all)}
          className="flex items-center gap-1.5 border border-zinc-700 px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
          <Copy size={10} /> Copy all
        </button>
      </div>
      <div className="p-4 space-y-3">
        {blocks.map(([label, text], i) => (
          <Block key={i} label={label} text={text} />
        ))}
      </div>
    </div>
  );
}

function KnowledgeUsed({ knowledge }) {
  const [open, setOpen] = useState(true);
  const hooks = knowledge?.hooks || [];
  const scripts = knowledge?.scripts || [];
  const empty = hooks.length === 0 && scripts.length === 0;
  return (
    <div className="border border-zinc-800">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[9px] font-mono uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <BookOpenCheck size={11} />
        Knowledge used — {hooks.length} hooks · {scripts.length} scripts
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {empty && (
            <div className="text-[11px] font-mono text-zinc-600">
              No library examples matched — generated from the brief alone.
            </div>
          )}
          {hooks.map((h, i) => (
            <div key={`h${i}`} className="text-[11px] font-mono text-zinc-400 leading-snug">
              <span className="text-zinc-200">"{h.hook_text}"</span>
              {" · "}
              <span className="text-sky-400">{h.hook_type}</span>
              {" / "}
              <span className="text-violet-400">{h.trigger}</span>
              {h.virality_score != null && (
                <span className="text-emerald-400"> · {Math.round(h.virality_score * 100)}%</span>
              )}
            </div>
          ))}
          {scripts.map((s, i) => (
            <div key={`s${i}`} className="text-[11px] font-mono text-zinc-500 leading-snug">
              <span className="text-zinc-300">{s.title}</span>
              {" "}({s.source_type}) — {s.snippet}…
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GenerationPlayground() {
  const [contentType, setContentType] = useState("reel");
  const [topic, setTopic] = useState("");
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [hookType, setHookType] = useState("");
  const [trigger, setTrigger] = useState("");
  const [audience, setAudience] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [spice, setSpice] = useState("balanced");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState(null);
  const [variations, setVariations] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const lengthMeta = LENGTH_META[contentType];

  async function handleGenerate() {
    setGenerating(true);
    try {
      const body = {
        content_type: contentType,
        topic,
        platform,
        spice_level: spice,
        length: length || lengthMeta.def,
        variations,
      };
      if (niche) body.niche = niche;
      if (hookType) body.hook_type = hookType;
      if (trigger) body.trigger = trigger;
      if (audience.trim()) body.audience = audience.trim();
      if (painPoint.trim()) body.pain_point = painPoint.trim();
      if (tone.trim()) body.tone = tone.trim();
      const { data } = await axios.post(`${API}/hook-library/generate`, body);
      setResult({ contentType, ...data });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      {/* ── Form ── */}
      <div className="space-y-4">
        <div>
          <Label>Content type</Label>
          <div className="grid grid-cols-3 gap-1">
            {CONTENT_TYPES.map((ct) => {
              const Icon = ct.icon;
              const active = contentType === ct.value;
              return (
                <button key={ct.value}
                  onClick={() => { setContentType(ct.value); setLength(null); }}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors cursor-pointer ${
                    active
                      ? "border-white text-white bg-zinc-900"
                      : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                  }`}>
                  <Icon size={12} />
                  {ct.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Topic *</Label>
          <textarea rows={3} className={INPUT_CLS} value={topic}
            placeholder="e.g. why cardio alone won't burn belly fat"
            onChange={(e) => setTopic(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Niche</Label>
            <NicheSelect value={niche} onChange={(v) => setNiche(v)} includeAll placeholder="Any niche" />
          </div>
          <div>
            <Label>Platform</Label>
            <select className={SELECT_CLS} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="instagram">instagram</option>
              <option value="tiktok">tiktok</option>
              <option value="youtube">youtube</option>
            </select>
          </div>
        </div>

        {/* Advanced */}
        <div className="border border-zinc-800">
          <button onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            {advancedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Advanced
          </button>
          {advancedOpen && (
            <div className="border-t border-zinc-800 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hook type</Label>
                  <select className={SELECT_CLS} value={hookType} onChange={(e) => setHookType(e.target.value)}>
                    <option value="">Any</option>
                    {HOOK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Trigger</Label>
                  <select className={SELECT_CLS} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                    <option value="">Any</option>
                    {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>Target audience</Label>
                <input className={INPUT_CLS} value={audience} placeholder="e.g. busy moms 30-45"
                  onChange={(e) => setAudience(e.target.value)} />
              </div>
              <div>
                <Label>Pain point</Label>
                <input className={INPUT_CLS} value={painPoint} placeholder="e.g. no time to work out"
                  onChange={(e) => setPainPoint(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Spice level</Label>
                  <select className={SELECT_CLS} value={spice} onChange={(e) => setSpice(e.target.value)}>
                    {SPICE_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Tone</Label>
                  <input className={INPUT_CLS} value={tone} placeholder="e.g. tough love"
                    onChange={(e) => setTone(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{lengthMeta.label}</Label>
                  <select className={SELECT_CLS} value={length || lengthMeta.def}
                    onChange={(e) => setLength(Number(e.target.value))}>
                    {lengthMeta.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Variations</Label>
                  <select className={SELECT_CLS} value={variations}
                    onChange={(e) => setVariations(Number(e.target.value))}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleGenerate} disabled={!topic.trim() || generating}
          className="w-full flex items-center justify-center gap-2 border border-white bg-white text-zinc-950 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest font-bold hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
          {generating
            ? (<><Loader2 size={13} className="animate-spin" /> Generating…</>)
            : (<><Wand2 size={13} /> Generate</>)}
        </button>
      </div>

      {/* ── Results ── */}
      <div className="space-y-4 min-w-0">
        {generating ? (
          <div className="flex flex-col items-center gap-3 py-20 text-zinc-500 font-mono text-xs uppercase tracking-widest">
            <Loader2 size={18} className="animate-spin" />
            Generating — using knowledge base…
          </div>
        ) : !result ? (
          <div className="text-center py-20 text-zinc-600 font-mono text-sm border border-dashed border-zinc-800">
            Set a topic and generate — output appears here.
          </div>
        ) : (
          <>
            {result.variations.map((v, i) => (
              <VariationCard key={i} contentType={result.contentType} variation={v} index={i} />
            ))}
            <KnowledgeUsed knowledge={result.knowledge_used} />
          </>
        )}
      </div>
    </div>
  );
}
