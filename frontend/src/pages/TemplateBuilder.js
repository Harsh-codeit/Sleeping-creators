import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Save, Image } from "lucide-react";
import useBuilderState from "../components/builder/useBuilderState";
import ElementsPanel from "../components/builder/ElementsPanel";
import Canvas from "../components/builder/Canvas";
import PropertiesPanel from "../components/builder/PropertiesPanel";
import Filmstrip from "../components/builder/Filmstrip";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DIMENSION_PRESETS = {
  instagram_4x5: { width: 1080, height: 1350, label: "Instagram 4:5" },
  linkedin_1x1:  { width: 1080, height: 1080, label: "LinkedIn 1:1" },
  twitter_16x9:  { width: 1200, height: 675,  label: "Twitter 16:9" },
  stories_9x16:  { width: 1080, height: 1920, label: "Stories 9:16" },
  custom:        { width: 1080, height: 1350, label: "Custom" },
};

export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isClone = location.pathname.includes("/clone");
  const isNew = !id;

  const [name, setName] = useState("Untitled Template");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("global");
  const [clientId, setClientId] = useState("");
  const [dimensionPreset, setDimensionPreset] = useState("instagram_4x5");
  const [canvasWidth, setCanvasWidth] = useState(1080);
  const [canvasHeight, setCanvasHeight] = useState(1350);
  const [background, setBackground] = useState({ type: "solid", value: "#000000" });
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [templateId, setTemplateId] = useState(id || null);

  const {
    elements, setElements, selectedIds,
    addElement, updateElement, updateElementProps,
    removeElements, moveElement, resizeElement,
    select, clearSelection, undo, redo,
    bringToFront, sendToBack,
    activeZone, zones, enableZones, switchZone,
    updateZoneCanvas, getZonesForSave, loadZones,
  } = useBuilderState([]);

  useEffect(() => {
    axios.get(`${API}/clients`).then(r => setClients(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const resp = await axios.get(`${API}/templates/${id}`);
        const tpl = resp.data;
        setName(isClone ? `${tpl.name} (Copy)` : tpl.name);
        setDescription(tpl.description || "");
        setScope(tpl.scope || "global");
        setClientId(tpl.client_id || "");
        setDimensionPreset(tpl.dimension_preset || "instagram_4x5");
        setCanvasWidth(tpl.canvas?.width || 1080);
        setCanvasHeight(tpl.canvas?.height || 1350);
        setBackground(tpl.canvas?.background || { type: "solid", value: "#000000" });
        setElements(tpl.elements || []);
        if (tpl.zones) {
          loadZones(tpl.zones, tpl.canvas);
        }
        if (!isClone) setTemplateId(tpl.id);
      } catch {
        toast.error("Failed to load template");
        navigate("/templates");
      }
    };
    load();
  }, [id, isClone, navigate, setElements, loadZones]);

  const handlePresetChange = useCallback((preset) => {
    setDimensionPreset(preset);
    const dim = DIMENSION_PRESETS[preset];
    if (dim && preset !== "custom") {
      setCanvasWidth(dim.width);
      setCanvasHeight(dim.height);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        removeElements(selectedIds);
      }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds, removeElements, undo, redo]);

  const buildPayload = () => {
    const payload = {
      name,
      description,
      scope,
      client_id: scope === "client" ? clientId : null,
      canvas: { width: canvasWidth, height: canvasHeight, background },
      elements,
      dimension_preset: dimensionPreset,
    };
    const zonesForSave = getZonesForSave();
    if (zonesForSave) {
      payload.zones = zonesForSave;
    }
    return payload;
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    setSaving(true);
    try {
      const payload = buildPayload();
      let resp;
      if (isNew || isClone) {
        resp = await axios.post(`${API}/templates`, payload);
        setTemplateId(resp.data.id);
        toast.success("Template created");
        navigate(`/templates/${resp.data.id}/edit`, { replace: true });
      } else {
        resp = await axios.put(`${API}/templates/${templateId}`, payload);
        toast.success("Template saved");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndPreview = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    setSaving(true);
    setPreviewing(true);
    try {
      const payload = buildPayload();
      let tid = templateId;

      if (isNew || isClone || !tid) {
        const resp = await axios.post(`${API}/templates`, payload);
        tid = resp.data.id;
        setTemplateId(tid);
        navigate(`/templates/${tid}/edit`, { replace: true });
      } else {
        await axios.put(`${API}/templates/${tid}`, payload);
      }

      await axios.post(`${API}/templates/${tid}/preview`);
      toast.success("Template saved & preview generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save/preview failed");
    } finally {
      setSaving(false);
      setPreviewing(false);
    }
  };

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-wrap">
        <button
          onClick={() => navigate("/templates")}
          className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
        >
          <ArrowLeft size={16} />
        </button>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-transparent border-b border-zinc-700 text-white text-sm font-semibold px-1 py-0.5 focus:outline-none focus:border-zinc-400 min-w-[200px]"
        />

        <div className="w-px h-5 bg-zinc-800" />

        <select
          value={dimensionPreset}
          onChange={e => handlePresetChange(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-500"
        >
          {Object.entries(DIMENSION_PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {dimensionPreset === "custom" && (
          <>
            <input
              type="number"
              value={canvasWidth}
              onChange={e => setCanvasWidth(parseInt(e.target.value) || 1080)}
              className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white w-16 focus:outline-none focus:border-zinc-500"
              placeholder="W"
            />
            <span className="text-zinc-600 text-xs">×</span>
            <input
              type="number"
              value={canvasHeight}
              onChange={e => setCanvasHeight(parseInt(e.target.value) || 1350)}
              className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white w-16 focus:outline-none focus:border-zinc-500"
              placeholder="H"
            />
          </>
        )}

        <div className="w-px h-5 bg-zinc-800" />

        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-500"
        >
          <option value="global">Global</option>
          <option value="client">Client</option>
        </select>

        {scope === "client" && (
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50"
          >
            <Save size={12} />
            {saving && !previewing ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={handleSaveAndPreview}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
          >
            <Image size={12} />
            {previewing ? "Generating..." : "Save & Preview"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <ElementsPanel onAddElement={addElement} />
          <Canvas
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            background={background}
            elements={elements}
            selectedIds={selectedIds}
            onSelect={select}
            onClearSelection={clearSelection}
            onMove={moveElement}
            onResize={resizeElement}
          />
          <PropertiesPanel
            elements={elements}
            selectedIds={selectedIds}
            background={background}
            onUpdateElement={updateElement}
            onUpdateProps={updateElementProps}
            onRemove={removeElements}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
            onBackgroundChange={(bg) => {
              setBackground(bg);
              if (zones) {
                updateZoneCanvas(activeZone, { background: bg });
              }
            }}
          />
        </div>
        <Filmstrip
          zones={zones}
          activeZone={activeZone}
          onSwitchZone={(zoneName) => {
            switchZone(zoneName);
            if (zones && zones[zoneName]) {
              setBackground(zones[zoneName].canvas?.background || { type: "solid", value: "#000000" });
            }
          }}
          onEnableZones={enableZones}
          canvas={{ width: canvasWidth, height: canvasHeight, background }}
        />
      </div>
    </div>
  );
}
