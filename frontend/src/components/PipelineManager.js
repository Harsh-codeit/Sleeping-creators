import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Plus, RefreshCw, Zap } from "lucide-react";
import { API, TEMPLATE_LABELS } from "./pipeline/constants";
import PipelineCard from "./pipeline/PipelineCard";
import PipelineWizard from "./pipeline/PipelineWizard";

export default function PipelineManager({ clientId, clientPlatforms = [], client, onClientUpdate }) {
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState({});
  const [templateLabels, setTemplateLabels] = useState(TEMPLATE_LABELS);

  const fetchPipelines = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/clients/${clientId}/pipelines`);
      setPipelines(resp.data);
    } catch { toast.error("Failed to load pipelines"); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

  useEffect(() => {
    axios.get(`${API}/templates`).then(r => {
      const custom = {};
      (r.data || []).forEach(t => { custom[t.id] = t.name; });
      setTemplateLabels(prev => ({ ...prev, ...custom }));
    }).catch(() => {});
  }, []);

  const savePipeline = async (formData) => {
    setSaving(true);
    try {
      if (editingPipeline) {
        const resp = await axios.put(`${API}/clients/${clientId}/pipelines/${editingPipeline.id}`, formData);
        setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? resp.data : p));
        toast.success("Pipeline updated");
      } else {
        const resp = await axios.post(`${API}/clients/${clientId}/pipelines`, formData);
        setPipelines(prev => [resp.data, ...prev]);
        toast.success(`Pipeline "${resp.data.name}" created`);
      }
      setWizardOpen(false);
      setEditingPipeline(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save pipeline");
    } finally { setSaving(false); }
  };

  const pausePipeline = async (id) => {
    try {
      await axios.post(`${API}/clients/${clientId}/pipelines/${id}/pause`);
      setPipelines(prev => prev.map(p => p.id === id ? { ...p, status: "paused" } : p));
      toast.warning("Pipeline paused");
    } catch { toast.error("Failed to pause"); }
  };

  const resumePipeline = async (id) => {
    try {
      const resp = await axios.post(`${API}/clients/${clientId}/pipelines/${id}/resume`);
      setPipelines(prev => prev.map(p => p.id === id ? { ...p, status: "active", next_run_at: resp.data.next_run_at } : p));
      toast.success("Pipeline resumed");
    } catch { toast.error("Failed to resume"); }
  };

  const deletePipeline = async (id) => {
    if (!window.confirm("Delete this pipeline?")) return;
    try {
      await axios.delete(`${API}/clients/${clientId}/pipelines/${id}`);
      setPipelines(prev => prev.filter(p => p.id !== id));
      toast.success("Pipeline deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const resetPipeline = async (id) => {
    if (!window.confirm("Reset this pipeline? This clears all rotation cursors and run counters so it starts fresh.")) return;
    try {
      const resp = await axios.post(`${API}/clients/${clientId}/pipelines/${id}/reset`);
      setPipelines(prev => prev.map(p => p.id === id ? { ...p, ...resp.data } : p));
      toast.success("Pipeline reset to zero");
    } catch { toast.error("Failed to reset pipeline"); }
  };

  const runNow = async (pipeline) => {
    setRunning(prev => ({ ...prev, [pipeline.id]: true }));
    const isVideo = pipeline.pipeline_type === "video";
    try {
      const resp = await axios.post(`${API}/clients/${clientId}/pipelines/${pipeline.id}/run`);
      const postsCreated = resp.data.posts_created || 0;
      if (postsCreated === 0) {
        toast.error(resp.data.message || "Pipeline ran but created 0 posts — check logs");
      } else if (isVideo) {
        toast.success("Video render started — will auto-publish when done (~30–90s). Track in Calendar or Posts tab.", { duration: 8000 });
      } else {
        toast.success(resp.data.message);
      }
      await fetchPipelines();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Run failed");
    } finally { setRunning(prev => ({ ...prev, [pipeline.id]: false })); }
  };

  const openEdit = (pipeline) => {
    setEditingPipeline(pipeline);
    setWizardOpen(true);
  };

  const openCreate = () => {
    setEditingPipeline(null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setEditingPipeline(null);
  };

  const activeCount = pipelines.filter(p => p.status === "active").length;

  const defaultTopics = [
    client?.onboarding_data?.niche,
    client?.onboarding_data?.signature_topic,
  ].filter(Boolean).join(", ");

  return (
    <div data-testid="pipeline-manager">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-white">
          Pipelines{" "}
          <span className="text-zinc-500 font-normal text-xs">({activeCount} active)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPipelines}
            className="p-2 border border-zinc-800 text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <button
            data-testid="create-pipeline-btn"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors"
          >
            <Plus size={13} />
            New Pipeline
          </button>
        </div>
      </div>

      {/* Pipeline grid or empty state */}
      {loading ? (
        <div className="py-8 text-center text-zinc-600 font-mono text-sm">Loading pipelines...</div>
      ) : pipelines.length === 0 ? (
        <div className="py-12 text-center">
          <Zap size={32} className="text-zinc-600 mx-auto mb-3" />
          <div className="text-sm font-mono text-white mb-1">No pipelines yet</div>
          <div className="text-[11px] font-mono text-zinc-500 mb-4">
            Create your first automated content pipeline.
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors"
          >
            + New Pipeline
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pipelines.map(p => (
            <PipelineCard
              key={p.id}
              pipeline={p}
              templateLabels={templateLabels}
              onPause={pausePipeline}
              onResume={resumePipeline}
              onDelete={deletePipeline}
              onReset={resetPipeline}
              onRunNow={runNow}
              onEdit={openEdit}
              running={running}
            />
          ))}
        </div>
      )}

      {/* Wizard modal */}
      <PipelineWizard
        open={wizardOpen}
        onClose={closeWizard}
        onSave={savePipeline}
        saving={saving}
        initial={editingPipeline}
        clientId={clientId}
        defaultTopics={editingPipeline ? "" : defaultTopics}
      />
    </div>
  );
}
