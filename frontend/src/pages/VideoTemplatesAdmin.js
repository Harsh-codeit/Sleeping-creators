import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Film, RefreshCw, X, Wand2, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const STATUS_COLOR = {
  rendering: "text-amber-400",
  submitted: "text-blue-400",
  succeeded: "text-emerald-400",
  pending_approval: "text-yellow-400",
  bundle_scheduled: "text-emerald-400",
  published: "text-emerald-400",
  failed_render: "text-red-400",
  failed: "text-red-400",
  cancelled: "text-zinc-500",
};

// ─── CreateForm (named export) ─────────────────────────────────────────────

export function CreateForm({ template, clients, onClose, onCreated }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [texts, setTexts] = useState(() => {
    const init = {};
    (template.field_schema || [])
      .filter((f) => f.role === "ai_text")
      .forEach((f) => { init[f.key] = ""; });
    return init;
  });
  const [musicUrl, setMusicUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const aiFields = (template.field_schema || []).filter((f) => f.role === "ai_text");
  const hasAudio = (template.field_schema || []).some((f) => f.role === "audio");

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/videos/generate-text`, {
        template_id: template.id,
        client_id: clientId,
      });
      setTexts((prev) => ({ ...prev, ...r.data }));
    } catch (e) {
      toast.error(`AI generation failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        client_id: clientId,
        template_id: template.id,
        music_url: musicUrl.trim() || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      };
      const filled = Object.fromEntries(
        Object.entries(texts).filter(([, v]) => v.trim())
      );
      if (Object.keys(filled).length) body.ai_text_overrides = filled;

      const r = await axios.post(`${API}/videos/create`, body);
      toast.success(`Render queued — ${r.data.post_id.slice(0, 8)}`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(`Failed to queue render: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{template.name}</div>
          <div className="text-[10px] font-mono text-zinc-500">
            {template.aspect_ratio} · {template.duration_seconds != null ? `${template.duration_seconds}s` : "—"} · CREATE VIDEO
          </div>
        </div>
        <button
          data-testid="close-create-form-btn"
          onClick={onClose}
          className="ml-3 flex-shrink-0 text-zinc-400 hover:text-white transition-colors duration-200"
        >
          <X size={15} />
        </button>
      </div>

      {/* Thumbnail */}
      {template.thumbnail_url && (
        <div className="border-b border-zinc-800 flex-shrink-0">
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full object-cover max-h-36"
          />
        </div>
      )}

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Client select */}
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
            Client
          </div>
          <select
            data-testid="client-select"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content fields */}
        {aiFields.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Content
              </div>
              <button
                data-testid="generate-ai-btn"
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1 px-2.5 py-1 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 disabled:opacity-40"
              >
                {generating ? (
                  <RefreshCw size={11} className="animate-spin" />
                ) : (
                  <Wand2 size={11} />
                )}
                Generate with AI
              </button>
            </div>
            {aiFields.map((f) => (
              <div key={f.key} className="mb-3">
                <div className="text-[10px] font-mono text-zinc-600 mb-1">{f.key}</div>
                <textarea
                  data-testid={`text-field-${f.key}`}
                  rows={2}
                  value={texts[f.key] || ""}
                  onChange={(e) =>
                    setTexts((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.ai_hint || "leave blank to auto-generate"}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200 resize-none"
                />
              </div>
            ))}
          </div>
        )}

        {/* Music URL */}
        {hasAudio && (
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
              Music URL
            </div>
            <input
              data-testid="music-url-input"
              value={musicUrl}
              onChange={(e) => setMusicUrl(e.target.value)}
              placeholder="leave blank to use template default"
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
            />
          </div>
        )}

        {/* Schedule */}
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
            Schedule
          </div>
          <input
            type="datetime-local"
            data-testid="schedule-at-input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors duration-200"
          />
          <div className="text-[10px] font-mono text-zinc-600 mt-1">
            leave blank → posts in 5 min
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-3 flex justify-end gap-2">
        <button
          data-testid="cancel-btn"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-white transition-colors duration-200 px-2.5 py-1.5"
        >
          Cancel
        </button>
        <button
          data-testid="queue-render-btn"
          onClick={handleSubmit}
          disabled={submitting || !clientId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
        >
          {submitting ? <RefreshCw size={11} className="animate-spin" /> : null}
          Queue render
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function VideoTemplatesAdmin() {
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
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

  const loadPosts = () => {
    axios
      .get(`${API}/posts?kind=video&limit=20`)
      .then((r) => {
        const d = r.data;
        setRecentPosts(Array.isArray(d) ? d : d.posts || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    loadPosts();
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/creatomate-templates/sync`);
      toast.success(
        `+${r.data.added.length} added · ${r.data.updated.length} updated · ${r.data.deactivated.length} deactivated`
      );
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const activeTemplates = templates.filter((t) => t.status === "active");

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Film size={15} className="text-zinc-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-white">Video Studio</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                CREATOMATE · {templates.length} TEMPLATES
              </div>
            </div>
          </div>
          <button
            data-testid="sync-templates-btn"
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Templates section */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
              Active Templates — click to create video
            </div>
            {activeTemplates.length === 0 ? (
              <div className="text-[10px] font-mono text-zinc-600">
                No active templates. Sync from Creatomate to import.
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {activeTemplates.map((t) => (
                  <div
                    key={t.id}
                    data-testid={`template-card-${t.id}`}
                    onClick={() =>
                      setSelectedTemplate(
                        selectedTemplate?.id === t.id ? null : t
                      )
                    }
                    className={`border cursor-pointer transition-colors duration-200 ${
                      selectedTemplate?.id === t.id
                        ? "border-white"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {t.thumbnail_url ? (
                      <img
                        src={t.thumbnail_url}
                        alt={t.name}
                        className="w-full h-28 object-cover"
                      />
                    ) : (
                      <div className="w-full h-28 bg-zinc-800 flex items-center justify-center">
                        <Film size={20} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="px-2.5 py-2">
                      <div className="text-xs font-semibold text-white truncate">
                        {t.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        {t.aspect_ratio} · {t.duration_seconds != null ? `${t.duration_seconds}s` : "—"} · {t.field_schema?.length ?? 0} fields
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent renders table */}
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
              Recent renders
            </div>
            {recentPosts.length === 0 ? (
              <div className="text-[10px] font-mono text-zinc-600">No renders yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left pb-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      ID
                    </th>
                    <th className="text-left pb-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      Client
                    </th>
                    <th className="text-left pb-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="text-left pb-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      Scheduled
                    </th>
                    <th className="pb-2 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {recentPosts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-zinc-800/60 hover:bg-zinc-900 transition-colors duration-200"
                    >
                      <td className="py-2 font-mono text-zinc-400">
                        {p.id?.slice(0, 8) || "—"}
                      </td>
                      <td className="py-2 text-white">{p.client_name || p.client_id?.slice(0, 8) || "—"}</td>
                      <td className={`py-2 font-mono ${STATUS_COLOR[p.status] || "text-zinc-400"}`}>
                        {p.status || "—"}
                      </td>
                      <td className="py-2 font-mono text-zinc-500">
                        {p.scheduled_at
                          ? p.scheduled_at.slice(0, 16).replace("T", " ")
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {p.r2_video_url && (
                          <a
                            href={p.r2_video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-400 hover:text-white transition-colors duration-200"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right panel */}
      {selectedTemplate && (
        <div className="w-[400px] flex-shrink-0 border-l border-zinc-800">
          <CreateForm
            template={selectedTemplate}
            clients={clients}
            onClose={() => setSelectedTemplate(null)}
            onCreated={() => {
              loadPosts();
            }}
          />
        </div>
      )}
    </div>
  );
}
