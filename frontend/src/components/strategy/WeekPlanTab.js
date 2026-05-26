import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Zap, X, Edit2, ChevronDown, ChevronUp, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function WeekPlanTab({ clientId, initialPlan }) {
  const [plan, setPlan] = useState(initialPlan && initialPlan.length > 0 ? initialPlan : null);
  const [generating, setGenerating] = useState(false);
  const [skipped, setSkipped] = useState({});
  const [editing, setEditing] = useState({});
  const [editedCaptions, setEditedCaptions] = useState({});
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    axios.get(`${API}/clients/${clientId}/pipelines`)
      .then(r => {
        const active = (r.data || []).filter(p => p.status === "active");
        setPipelines(active);
        if (active.length > 0) setSelectedPipeline(active[0].id);
      })
      .catch(() => {});
  }, [clientId]);

  const generate = async () => {
    setGenerating(true);
    setPlan(null);
    setSkipped({});
    setEditing({});
    setEditedCaptions({});
    try {
      const resp = await axios.post(`${API}/clients/${clientId}/content-plan/generate`);
      setPlan(resp.data.plan);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const activeCount = (plan || []).filter((_, i) => !skipped[i]).length;

  const scheduleAll = async () => {
    if (activeCount === 0) return;
    setScheduling(true);
    const posts = (plan || [])
      .map((item, i) => ({ ...item, caption: editedCaptions[i] ?? item.caption }))
      .filter((_, i) => !skipped[i]);
    try {
      const resp = await axios.post(`${API}/clients/${clientId}/content-plan/schedule`, {
        posts,
        pipeline_id: selectedPipeline,
      });
      toast.success(`Scheduled ${resp.data.scheduled} posts — visible in Posts tab`);
      setSkipped({});
      setPlan(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Scheduling failed");
    } finally {
      setScheduling(false);
    }
  };

  if (!plan && !generating) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Calendar size={32} className="text-zinc-600" />
        <div className="text-center">
          <div className="text-sm font-semibold text-white mb-1">Generate this week's content plan</div>
          <div className="text-xs font-mono text-zinc-500 max-w-xs">
            AI will create 7 full post drafts based on your client's niche, themes, topic rules, and trending topics.
          </div>
        </div>
        <button onClick={generate} className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors">
          <Zap size={13} /> Generate Week
        </button>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="space-y-3">
        <div className="text-xs font-mono text-zinc-500 animate-pulse mb-4">Generating 7 post drafts…</div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  const firstItem = plan?.[0];
  const lastItem = plan?.[plan.length - 1];
  const weekLabel = firstItem && lastItem
    ? `${firstItem.day} ${firstItem.date} – ${lastItem.day} ${lastItem.date}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Week of {weekLabel}</div>
          <div className="text-[11px] font-mono text-zinc-500">{activeCount} post{activeCount !== 1 ? "s" : ""} queued</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pipelines.length > 1 && (
            <select
              value={selectedPipeline || ""}
              onChange={e => setSelectedPipeline(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono px-2 py-1.5 focus:outline-none"
            >
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={generate}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={scheduleAll}
            disabled={activeCount === 0 || scheduling}
            className="flex items-center gap-2 px-4 py-1.5 bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors disabled:opacity-40"
          >
            <Calendar size={11} />
            {scheduling ? "Scheduling…" : `Schedule ${activeCount} posts →`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(plan || []).map((item, i) => {
          const isSkipped = skipped[i];
          const isEditing = editing[i];
          const caption = editedCaptions[i] ?? item.caption;
          const isExpanded = expanded[i];

          return (
            <div key={i} className={`bg-zinc-900 border border-zinc-800 p-4 ${isSkipped ? "opacity-40" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">{item.day}</span>
                  <span className="text-[10px] font-mono text-zinc-700 ml-2">{item.date}</span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 border border-zinc-700 text-zinc-400 uppercase">
                  {item.format}
                </span>
              </div>

              <div className="text-sm font-semibold text-white mb-2 leading-tight">{item.topic}</div>

              {isEditing ? (
                <textarea
                  value={caption}
                  onChange={e => setEditedCaptions(ec => ({ ...ec, [i]: e.target.value }))}
                  rows={5}
                  className="w-full bg-zinc-950 border border-zinc-600 px-2 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none resize-y mb-2"
                />
              ) : (
                <div className="mb-2">
                  <div className={`text-[11px] text-zinc-400 leading-relaxed ${!isExpanded ? "line-clamp-3" : ""}`}>
                    {caption}
                  </div>
                  <button
                    onClick={() => setExpanded(ex => ({ ...ex, [i]: !isExpanded }))}
                    className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 mt-0.5"
                  >
                    {isExpanded ? <><ChevronUp size={10} /> collapse</> : <><ChevronDown size={10} /> expand</>}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2 border-t border-zinc-800 pt-2">
                <button
                  onClick={() => setEditing(ed => ({ ...ed, [i]: !isEditing }))}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
                >
                  <Edit2 size={10} /> {isEditing ? "Done" : "Edit"}
                </button>
                {!isSkipped ? (
                  <button onClick={() => setSkipped(s => ({ ...s, [i]: true }))} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-red-400 transition-colors ml-auto">
                    <X size={10} /> Skip
                  </button>
                ) : (
                  <button onClick={() => setSkipped(s => { const n = { ...s }; delete n[i]; return n; })} className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 ml-auto">undo skip</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
