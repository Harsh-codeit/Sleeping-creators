import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Check, X, Pencil, RefreshCw, Inbox, Loader2 } from "lucide-react";
import { API, HOOK_TYPE_LABEL } from "./hookConstants";
import HookEditForm from "./HookEditForm";

function Tag({ children, tone = "text-zinc-400 border-zinc-700" }) {
  if (children == null || children === "") return null;
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 border bg-zinc-950 ${tone}`}>{children}</span>
  );
}

function score(v) {
  return v != null ? Number(v).toFixed(2) : null;
}

function ReviewCard({ hook, onApprove, onReject, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors" data-testid="review-card">
      <div className="p-4 space-y-3">
        <p className="text-sm text-zinc-100 leading-relaxed">{hook.hook_text || <span className="text-zinc-600 italic">— no text —</span>}</p>

        <div className="flex flex-wrap gap-1.5">
          <Tag tone="text-sky-400 border-sky-900">{hook.niche_slug}</Tag>
          <Tag tone="text-violet-400 border-violet-900">{HOOK_TYPE_LABEL[hook.hook_type] || hook.hook_type}</Tag>
          <Tag>{hook.language}</Tag>
          <Tag>{hook.trigger}</Tag>
          {score(hook.virality_score) && <Tag tone="text-emerald-400 border-emerald-900">vir {score(hook.virality_score)}</Tag>}
          {score(hook.confidence) && <Tag tone="text-amber-400 border-amber-900">conf {score(hook.confidence)}</Tag>}
        </div>

        {editing ? (
          <HookEditForm
            hook={hook}
            onSaved={(updated) => {
              setEditing(false);
              onSaved(updated);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => act(() => onApprove(hook.id))}
              disabled={busy}
              data-testid="review-approve"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-emerald-800 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
            </button>
            <button
              onClick={() => act(() => onReject(hook.id))}
              disabled={busy}
              data-testid="review-reject"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-red-900 text-red-400 hover:bg-red-950/40 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <X size={12} /> Reject
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Review queue: GET /viral-hooks?status=review, approve/reject/edit per card. */
export default function HookReviewQueue() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/viral-hooks`, { params: { status: "review", limit: 200 } });
      setHooks(data.hooks || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    try {
      await axios.post(`${API}/viral-hooks/${id}/approve`);
      toast.success("Approved → live");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Approve failed");
    }
  }

  async function reject(id) {
    try {
      await axios.post(`${API}/viral-hooks/${id}/reject`);
      toast.success("Rejected");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Reject failed");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Review Queue — {hooks.length} pending
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {loading && hooks.length === 0 ? (
        <p className="text-[11px] font-mono text-zinc-600 py-8 text-center">Loading…</p>
      ) : hooks.length === 0 ? (
        <div className="border border-dashed border-zinc-800 py-14 flex flex-col items-center gap-3">
          <Inbox size={24} className="text-zinc-700" />
          <p className="text-sm font-mono text-zinc-600">Review queue is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {hooks.map((h) => (
            <ReviewCard
              key={h.id}
              hook={h}
              onApprove={approve}
              onReject={reject}
              onSaved={() => load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
