import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { useVideoBuilderState } from "./useVideoBuilderState";
import ElementPalette from "./ElementPalette";
import VideoCanvas from "./VideoCanvas";
import ElementPropsPanel from "./ElementPropsPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"];

export default function VideoTemplateBuilder({ initial = {}, onSaved, onBack }) {
  const isEdit = !!initial.id;
  const [saving, setSaving] = useState(false);

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
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
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
