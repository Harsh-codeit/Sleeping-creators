import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Settings, X, Film } from "lucide-react";
import VideoTemplateDetail from "../components/VideoTemplateDetail";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const STATUS_BADGE = {
  active:   "text-emerald-400 border-emerald-400/30",
  draft:    "text-amber-400 border-amber-400/30",
  inactive: "text-zinc-500 border-zinc-700",
};

const STATUS_RENDER = {
  rendering:        "text-amber-400",
  submitted:        "text-blue-400",
  succeeded:        "text-emerald-400",
  pending_approval: "text-yellow-400",
  bundle_scheduled: "text-green-400",
  published:        "text-emerald-400",
  failed_render:    "text-red-400",
  failed:           "text-red-400",
  cancelled:        "text-zinc-500",
};

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateForm({ template, clients, onClose, onCreated }) {
  const aiFields = (template.field_schema || []).filter(f => f.role === "ai_text");
  const hasAudio = (template.field_schema || []).some(f => f.role === "audio");

  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [texts, setTexts] = useState(() =>
    Object.fromEntries(aiFields.map(f => [f.key, ""]))
  );
  const [musicUrl, setMusicUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!clientId) { toast.error("Select a client"); return; }
    setSubmitting(true);
    try {
      const aiTextOverrides = Object.fromEntries(
        Object.entries(texts).filter(([, v]) => v.trim())
      );
      const body = {
        client_id: clientId,
        template_id: template.id,
        ai_text_overrides: Object.keys(aiTextOverrides).length ? aiTextOverrides : undefined,
        music_url: musicUrl.trim() || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      };
      const r = await axios.post(`${API}/videos/create`, body);
      toast.success(`Render queued — ${r.data.post_id.slice(0, 8)}`);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
        <div>
          <div className="text-sm font-semibold text-white">{template.name}</div>
          <div className="text-[10px] font-mono text-zinc-500">
            {template.aspect_ratio} · {template.duration_seconds != null ? `${template.duration_seconds}s` : "?"} · CREATE VIDEO
          </div>
        </div>
        <button
          data-testid="close-create-form-btn"
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors duration-200"
        >
          <X size={15} />
        </button>
      </div>

      {/* Thumbnail */}
      {template.thumbnail_url && (
        <div className="flex-shrink-0 border-b border-zinc-800">
          <img src={template.thumbnail_url} alt="" className="w-full object-cover max-h-36" />
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Client */}
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Client</div>
          <select
            data-testid="client-select"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Content fields */}
        {aiFields.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Content <span className="text-zinc-600">(leave blank to auto-generate)</span>
            </div>
            {aiFields.map(f => (
              <div key={f.key}>
                <div className="text-[10px] font-mono text-zinc-600 mb-1">{f.key}</div>
                <textarea
                  data-testid={`content-field-${f.key}`}
                  value={texts[f.key]}
                  onChange={e => setTexts(t => ({ ...t, [f.key]: e.target.value }))}
                  placeholder={f.ai_hint || "leave blank to auto-generate"}
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200 resize-none"
                />
              </div>
            ))}
          </div>
        )}

        {/* Music */}
        {hasAudio && (
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Music URL</div>
            <input
              data-testid="music-url-input"
              value={musicUrl}
              onChange={e => setMusicUrl(e.target.value)}
              placeholder="leave blank to use template default"
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
            />
          </div>
        )}

        {/* Schedule */}
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Schedule</div>
          <input
            type="datetime-local"
            data-testid="schedule-at-input"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
          />
          <div className="text-[10px] font-mono text-zinc-600 mt-1">leave blank → posts in 5 min</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-3 flex justify-end gap-2">
        <button
          data-testid="cancel-btn"
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          data-testid="queue-render-btn"
          onClick={submit}
          disabled={submitting || !clientId}
          className="px-4 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
        >
          {submitting ? "Queuing…" : "Queue render"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoTemplatesAdmin() {
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(null);   // template object
  const [editSchema, setEditSchema] = useState(null); // template object
  const [recentPosts, setRecentPosts] = useState([]);

  const load = async () => {
    const [tmplRes, clientRes] = await Promise.all([
      axios.get(`${API}/creatomate-templates`).catch(() => ({ data: [] })),
      axios.get(`${API}/clients`).catch(() => ({ data: [] })),
    ]);
    setTemplates(tmplRes.data);
    const raw = clientRes.data;
    setClients(Array.isArray(raw) ? raw : raw.clients || []);
  };

  const loadPosts = async () => {
    const r = await axios.get(`${API}/posts?kind=video&limit=20`).catch(() => ({ data: [] }));
    const data = r.data;
    setRecentPosts(Array.isArray(data) ? data : data.posts || []);
  };

  useEffect(() => { load(); loadPosts(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/creatomate-templates/sync`);
      toast.success(`+${r.data.added.length} added · ${r.data.updated.length} updated · ${r.data.deactivated.length} deactivated`);
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const activeTemplates = templates.filter(t => t.status === "active");
  const otherTemplates  = templates.filter(t => t.status !== "active");

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">

      {/* Left: template list + recent posts */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Film size={15} className="text-zinc-400" />
            <div>
              <div className="text-sm font-bold tracking-tight text-white">Video Studio</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">CREATOMATE · {templates.length} TEMPLATES</div>
            </div>
          </div>
          <button
            data-testid="sync-templates-btn"
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync templates"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Active templates */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
              Active templates — click to create video
            </div>
            {activeTemplates.length === 0 ? (
              <div className="font-mono text-xs text-zinc-600 py-6 border border-zinc-800 text-center">
                No active templates. Sync from Creatomate and publish a template.
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {activeTemplates.map(t => (
                  <div
                    key={t.id}
                    className={`border transition-colors duration-200 group ${
                      creating?.id === t.id
                        ? "border-white"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {/* Thumbnail */}
                    <button
                      data-testid={`create-from-template-${t.id}`}
                      type="button"
                      onClick={() => { setCreating(t); setEditSchema(null); }}
                      className="w-full text-left"
                    >
                      {t.thumbnail_url
                        ? <img src={t.thumbnail_url} alt="" className="w-full h-28 object-cover" />
                        : <div className="w-full h-28 bg-zinc-800 flex items-center justify-center"><Film size={20} className="text-zinc-600" /></div>
                      }
                      <div className="px-2.5 py-2">
                        <div className="text-xs font-semibold text-white truncate">{t.name}</div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          {t.aspect_ratio || "—"} · {t.duration_seconds != null ? `${t.duration_seconds}s` : "?"} · {t.field_schema?.length ?? 0} fields
                        </div>
                      </div>
                    </button>
                    {/* Schema edit */}
                    <div className="px-2.5 pb-2">
                      <button
                        data-testid={`edit-schema-${t.id}`}
                        type="button"
                        onClick={() => { setEditSchema(t); setCreating(null); }}
                        className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
                      >
                        <Settings size={10} /> Edit schema
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Draft / inactive templates (compact list) */}
          {otherTemplates.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Draft / inactive</div>
              <table className="w-full text-xs">
                <tbody>
                  {otherTemplates.map(t => (
                    <tr
                      key={t.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-900 transition-colors duration-200 cursor-pointer"
                      onClick={() => { setEditSchema(t); setCreating(null); }}
                    >
                      <td className="py-1.5 font-medium text-zinc-400">{t.name}</td>
                      <td className="py-1.5 font-mono text-zinc-600">{t.aspect_ratio || "—"}</td>
                      <td className="py-1.5">
                        <span className={`font-mono text-[10px] border px-1 uppercase ${STATUS_BADGE[t.status] || STATUS_BADGE.inactive}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent renders */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Recent renders</div>
            {recentPosts.length === 0 ? (
              <div className="font-mono text-xs text-zinc-700 py-4">No renders yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left pb-1.5 font-mono text-zinc-500 text-[10px] uppercase tracking-widest">ID</th>
                    <th className="text-left pb-1.5 font-mono text-zinc-500 text-[10px] uppercase tracking-widest">Client</th>
                    <th className="text-left pb-1.5 font-mono text-zinc-500 text-[10px] uppercase tracking-widest">Status</th>
                    <th className="text-left pb-1.5 font-mono text-zinc-500 text-[10px] uppercase tracking-widest">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPosts.map(p => (
                    <tr key={p.id} className="border-b border-zinc-800/40">
                      <td className="py-1.5 font-mono text-zinc-400">{p.id?.slice(0, 8)}</td>
                      <td className="py-1.5 font-mono text-zinc-400">{p.client_name || "—"}</td>
                      <td className={`py-1.5 font-mono ${STATUS_RENDER[p.status] || "text-zinc-400"}`}>{p.status}</td>
                      <td className="py-1.5 font-mono text-zinc-500">{p.scheduled_at?.slice(0, 16)?.replace("T", " ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: create form or schema editor */}
      {(creating || editSchema) && (
        <div className="w-[380px] flex-shrink-0 border-l border-zinc-800 flex flex-col h-full overflow-hidden">
          {creating && (
            <CreateForm
              template={creating}
              clients={clients}
              onClose={() => setCreating(null)}
              onCreated={loadPosts}
            />
          )}
          {editSchema && (
            <VideoTemplateDetail
              template={editSchema}
              onClose={() => setEditSchema(null)}
              onChanged={() => { load(); setEditSchema(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}
