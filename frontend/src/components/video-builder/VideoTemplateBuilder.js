import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, X } from "lucide-react";
import { useVideoBuilderState } from "./useVideoBuilderState";
import ElementPalette from "./ElementPalette";
import VideoCanvas from "./VideoCanvas";
import ElementPropsPanel from "./ElementPropsPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"];

function GeneratePopover({ elements, updateElement, updateElementProps, onClose }) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/video-ai/suggest-overlays`, { topic: topic.trim(), niche: "brand" });
      const hookEl = elements.find(e => ["text_overlay", "lower_third", "cta_text"].includes(e.type));
      const ctaEl = elements.find(e => e.type === "cta_button");
      if (hookEl) {
        updateElementProps(hookEl.id, { text: data.hook, highlight_color: data.highlight_color });
      }
      if (ctaEl) {
        updateElementProps(ctaEl.id, { text: data.cta });
      }
      if (!hookEl && !ctaEl) {
        toast.info("Add a text overlay or CTA button element first, then generate.");
      } else {
        toast.success("Text generated!");
        onClose();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={ref} className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-80 bg-zinc-900 border border-zinc-700 shadow-2xl p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">Generate overlay text with AI</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={13} /></button>
      </div>
      <input
        autoFocus
        value={topic}
        onChange={e => setTopic(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleGenerate(); }}
        placeholder="e.g. stop losing clients to competitors"
        className="bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-zinc-500 w-full"
      />
      <p className="text-[10px] text-zinc-600 -mt-1">Fills your first text overlay + CTA button with AI copy and highlight color</p>
      <button
        onClick={handleGenerate}
        disabled={loading || !topic.trim()}
        className="flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors disabled:opacity-40"
      >
        <Sparkles size={12} />
        {loading ? "Generating…" : "Generate"}
      </button>
    </div>
  );
}

export default function VideoTemplateBuilder({ initial = {}, onSaved, onBack }) {
  const isEdit = !!initial.id;
  const [saving, setSaving] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const state = useVideoBuilderState(initial);
  const {
    name, setName,
    aspectRatio, setAspectRatio,
    videoOverridable, setVideoOverridable,
    elements,
    selectedElementId, setSelectedElementId,
    selectedElement,
    picsumSeed,
    dirty,
    addElement,
    updateElement,
    updateElementProps,
    deleteElement,
    duplicateElement,
    moveElementZ,
    shuffleBackground,
    toPayload,
    markSaved,
  } = state;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const payload = toPayload();
      if (isEdit) {
        await axios.put(`${API}/video-templates/${initial.id}`, payload);
        toast.success("Template saved");
      } else {
        await axios.post(`${API}/video-templates`, payload);
        toast.success("Template created");
      }
      markSaved();
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="relative flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        {showGenerate && (
          <GeneratePopover
            elements={elements}
            updateElement={updateElement}
            updateElementProps={updateElementProps}
            onClose={() => setShowGenerate(false)}
          />
        )}
        {onBack && (
          <button onClick={onBack} className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
        )}

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Template name…"
          className="bg-transparent border-b border-zinc-700 focus:border-zinc-400 text-white text-sm font-semibold outline-none px-1 py-0.5 w-48 transition-colors"
        />

        <div className="flex items-center gap-1 ml-2">
          {ASPECT_RATIOS.map(r => (
            <button
              key={r}
              onClick={() => setAspectRatio(r)}
              className={`px-2 py-0.5 text-xs transition-colors ${
                aspectRatio === r
                  ? "bg-white text-black font-bold"
                  : "text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 ml-2 cursor-pointer">
          <input type="checkbox" checked={videoOverridable} onChange={e => setVideoOverridable(e.target.checked)}
            className="w-3.5 h-3.5" />
          <span className="text-xs text-zinc-500 font-mono">Clip overridable</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[10px] text-zinc-500 font-mono">unsaved</span>}
          <button
            onClick={() => setShowGenerate(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs transition-colors ${showGenerate ? "border-zinc-500 bg-zinc-800 text-white" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white"}`}
          >
            <Sparkles size={12} /> Generate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors disabled:opacity-40"
          >
            <Save size={13} />
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ElementPalette onAdd={addElement} />
        <VideoCanvas
          elements={elements}
          selectedElementId={selectedElementId}
          aspectRatio={aspectRatio}
          picsumSeed={picsumSeed}
          onSelectElement={setSelectedElementId}
          onUpdateElement={updateElement}
          onUpdateElementProps={updateElementProps}
          onDuplicateElement={duplicateElement}
          onDeleteElement={deleteElement}
          onMoveElementZ={moveElementZ}
          onShuffle={shuffleBackground}
        />
        <ElementPropsPanel
          element={selectedElement}
          onUpdateElement={updateElement}
          onUpdateElementProps={updateElementProps}
        />
      </div>
    </div>
  );
}
