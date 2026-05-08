import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, Search, MoreVertical, Pencil, Copy, CopyPlus, Trash2, X, Eye, RefreshCw,
} from "lucide-react";
import VideoTemplateEditor from "../components/VideoTemplateEditor";
import VideoTemplateCard from "../components/VideoTemplateCard";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DIMENSION_LABELS = {
  instagram_4x5: "1080×1350 — Instagram 4:5",
  linkedin_1x1: "1080×1080 — LinkedIn 1:1",
  twitter_16x9: "1200×675 — Twitter 16:9",
  stories_9x16: "1080×1920 — Stories 9:16",
  custom: "Custom",
};

const SCOPE_BADGE = {
  global: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  client: "bg-green-500/10 text-green-400 border border-green-500/20",
};

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("");
  const [dimFilter, setDimFilter] = useState("");
  const [menuOpen, setMenuOpen] = useState(null);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [cloneClientPicker, setCloneClientPicker] = useState(null);
  const [regenerating, setRegenerating] = useState({});
  const previewsRefreshedRef = useRef(false);
  const [contentTab, setContentTab] = useState("carousel"); // "carousel" | "video"
  const [videoTemplates, setVideoTemplates] = useState([]);
  const [editingVideoTemplate, setEditingVideoTemplate] = useState(null);
  const [showVideoEditor, setShowVideoEditor] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const params = {};
      if (scopeFilter !== "all") params.scope = scopeFilter;
      if (clientFilter) params.client_id = clientFilter;
      if (dimFilter) params.dimension_preset = dimFilter;
      if (search) params.search = search;
      const resp = await axios.get(`${API}/templates`, { params });
      setTemplates(resp.data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, clientFilter, dimFilter, search]);

  useEffect(() => {
    fetchTemplates();
    axios.get(`${API}/clients`).then(r => setClients(r.data)).catch(() => {});
  }, [fetchTemplates]);

  useEffect(() => {
    axios.post(`${API}/templates/seed`).catch(() => {});
  }, []);

  const loadVideoTemplates = useCallback(() => {
    axios.get(`${API}/video-templates`).then(r => setVideoTemplates(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    // Seed first (idempotent), then load
    axios.post(`${API}/video-templates/seed`)
      .catch(() => {})
      .finally(loadVideoTemplates);
  }, [loadVideoTemplates]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await axios.delete(`${API}/templates/${id}`);
      toast.success("Template deleted");
      fetchTemplates();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const handleClone = async (id, clientId = null) => {
    try {
      const params = clientId ? `?client_id=${clientId}` : "";
      const resp = await axios.post(`${API}/templates/${id}/clone${params}`);
      toast.success("Template cloned");
      navigate(`/templates/${resp.data.id}/edit`);
    } catch {
      toast.error("Clone failed");
    }
  };

  const handleRegeneratePreview = async (id) => {
    setRegenerating(prev => ({ ...prev, [id]: true }));
    try {
      const resp = await axios.post(`${API}/templates/${id}/preview`);
      setTemplates(prev => prev.map(t =>
        t.id === id ? { ...t, thumbnail_url: resp.data.thumbnail_url } : t
      ));
    } catch {
      toast.error("Preview regeneration failed");
    } finally {
      setRegenerating(prev => ({ ...prev, [id]: false }));
    }
  };

  // One-time migration: regenerate all previews after the renderer fix.
  // Uses localStorage so it runs once per browser, never again on reload.
  const PREVIEW_VERSION = "v3"; // bumped: thumbnail now uses first zone, not middle
  useEffect(() => {
    if (templates.length === 0 || previewsRefreshedRef.current) return;
    if (localStorage.getItem("tpl_previews_refreshed") === PREVIEW_VERSION) return;
    previewsRefreshedRef.current = true;
    localStorage.setItem("tpl_previews_refreshed", PREVIEW_VERSION);
    const ids = templates.map(t => t.id);
    setRegenerating(ids.reduce((acc, id) => ({ ...acc, [id]: true }), {}));
    ids.forEach(id => {
      axios.post(`${API}/templates/${id}/preview`)
        .then(resp => {
          setTemplates(prev => prev.map(t =>
            t.id === id ? { ...t, thumbnail_url: resp.data.thumbnail_url } : t
          ));
        })
        .catch(() => {})
        .finally(() => {
          setRegenerating(prev => ({ ...prev, [id]: false }));
        });
    });
  }, [templates]);

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Templates</h1>
        <button
          onClick={() => navigate("/templates/new")}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150"
        >
          <Plus size={14} />
          Create Template
        </button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full bg-zinc-900 border border-zinc-700 pl-9 pr-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <select
          value={scopeFilter}
          onChange={e => setScopeFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
        >
          <option value="all">All Scopes</option>
          <option value="global">Global</option>
          <option value="client">Client</option>
        </select>
        {scopeFilter === "client" && (
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select
          value={dimFilter}
          onChange={e => setDimFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
        >
          <option value="">All Dimensions</option>
          {Object.entries(DIMENSION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        <div className="flex items-center border border-zinc-800 w-fit mb-6">
          {[["carousel", "Carousel Templates"], ["video", "Video Templates"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setContentTab(val)}
              className={`px-4 py-2 text-xs font-mono uppercase border-r border-zinc-800 last:border-0 ${contentTab === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {contentTab === "carousel" && (
          <>
            {loading ? (
              <div className="text-zinc-500 text-sm">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-zinc-400 text-sm">No templates found.</p>
                <p className="text-zinc-500 text-xs mt-1">Create your first custom template or clone a starter to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors duration-150 group relative"
                  >
                    <div
                      className="aspect-[4/5] bg-zinc-800 flex items-center justify-center cursor-pointer overflow-hidden"
                      onClick={() => navigate(`/templates/${tpl.id}/edit`)}
                    >
                      {regenerating[tpl.id] ? (
                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                          <RefreshCw size={18} className="animate-spin" />
                          <span className="text-[10px] font-mono">Rendering...</span>
                        </div>
                      ) : tpl.thumbnail_url ? (
                        <img src={tpl.thumbnail_url} alt={tpl.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-zinc-600 text-xs font-mono">No Preview</div>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{tpl.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {DIMENSION_LABELS[tpl.dimension_preset] || tpl.dimension_preset}
                          </div>
                        </div>
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === tpl.id ? null : tpl.id); }}
                            className="p-1 text-zinc-500 hover:text-white transition-colors duration-150"
                          >
                            <MoreVertical size={14} />
                          </button>
                          {menuOpen === tpl.id && (
                            <div className="absolute right-0 top-8 z-20 bg-zinc-900 border border-zinc-700 py-1 min-w-[160px] shadow-lg">
                              <button
                                onClick={() => { setMenuOpen(null); navigate(`/templates/${tpl.id}/edit`); }}
                                className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                              <button
                                onClick={() => { setMenuOpen(null); handleRegeneratePreview(tpl.id); }}
                                className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                              >
                                <RefreshCw size={12} className={regenerating[tpl.id] ? "animate-spin" : ""} />
                                {regenerating[tpl.id] ? "Refreshing..." : "Refresh Preview"}
                              </button>
                              <button
                                onClick={() => { setMenuOpen(null); handleClone(tpl.id); }}
                                className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                              >
                                <Copy size={12} /> Clone
                              </button>
                              <button
                                onClick={() => { setMenuOpen(null); setCloneClientPicker(tpl.id); }}
                                className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                              >
                                <CopyPlus size={12} /> Clone for Client
                              </button>
                              {!tpl.is_starter && (
                                <button
                                  onClick={() => { setMenuOpen(null); handleDelete(tpl.id); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 font-mono ${SCOPE_BADGE[tpl.scope] || SCOPE_BADGE.global}`}>
                          {tpl.scope === "client" ? (clients.find(c => c.id === tpl.client_id)?.name || "Client") : "Global"}
                        </span>
                        {tpl.is_starter && (
                          <span className="text-[10px] px-1.5 py-0.5 font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Starter
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {contentTab === "video" && (
          <div>
            {showVideoEditor ? (
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">
                  {editingVideoTemplate ? "Edit Video Template" : "New Video Template"}
                </h2>
                <VideoTemplateEditor
                  initial={editingVideoTemplate || {}}
                  onSaved={(t) => {
                    setVideoTemplates(prev =>
                      editingVideoTemplate
                        ? prev.map(x => x.id === t.id ? t : x)
                        : [...prev, t]
                    );
                    setShowVideoEditor(false);
                    setEditingVideoTemplate(null);
                  }}
                  onCancel={() => { setShowVideoEditor(false); setEditingVideoTemplate(null); }}
                />
              </div>
            ) : (() => {
              const filtered = videoTemplates.filter(t => {
                if (search && !t.name?.toLowerCase().includes(search.toLowerCase())) return false;
                if (scopeFilter === "global" && t.client_id) return false;
                if (scopeFilter === "client") {
                  if (!t.client_id) return false;
                  if (clientFilter && t.client_id !== clientFilter) return false;
                }
                return true;
              });
              const starters = filtered.filter(t => t.is_starter);
              const custom   = filtered.filter(t => !t.is_starter);

              return (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
                      {filtered.length} {filtered.length === 1 ? "template" : "templates"}
                    </p>
                    <button
                      onClick={() => { setEditingVideoTemplate(null); setShowVideoEditor(true); }}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
                    >
                      <Plus size={14} />
                      New Video Template
                    </button>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-zinc-400 text-sm">No video templates match your filters.</p>
                      <p className="text-zinc-500 text-xs mt-1">Try clearing filters or creating a new template.</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {starters.length > 0 && (
                        <section>
                          <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
                            Starter Presets
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {starters.map(t => (
                              <VideoTemplateCard
                                key={t.id}
                                template={t}
                                clients={clients}
                                onDeleted={id => setVideoTemplates(prev => prev.filter(x => x.id !== id))}
                                onEdit={tmpl => { setEditingVideoTemplate(tmpl); setShowVideoEditor(true); }}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {custom.length > 0 && (
                        <section>
                          <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
                            Your Templates
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {custom.map(t => (
                              <VideoTemplateCard
                                key={t.id}
                                template={t}
                                clients={clients}
                                onDeleted={id => setVideoTemplates(prev => prev.filter(x => x.id !== id))}
                                onEdit={tmpl => { setEditingVideoTemplate(tmpl); setShowVideoEditor(true); }}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {previewTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewTpl(null)}>
          <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-bold text-white">{previewTpl.name}</div>
              <button onClick={() => setPreviewTpl(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5">
              {previewTpl.thumbnail_url ? (
                <img src={previewTpl.thumbnail_url} alt={previewTpl.name} className="w-full" />
              ) : (
                <div className="aspect-[4/5] bg-zinc-800 flex items-center justify-center text-zinc-600 text-sm">No Preview</div>
              )}
              <p className="text-zinc-400 text-sm mt-3">{previewTpl.description || "No description"}</p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setPreviewTpl(null); navigate(`/templates/${previewTpl.id}/edit`); }}
                  className="flex-1 py-2 text-sm bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150 flex items-center justify-center gap-2"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => { setPreviewTpl(null); handleClone(previewTpl.id); }}
                  className="flex-1 py-2 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 flex items-center justify-center gap-2"
                >
                  <Copy size={13} /> Clone
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cloneClientPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setCloneClientPicker(null)}>
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-sm p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-bold text-white">Clone for Client</div>
              <button onClick={() => setCloneClientPicker(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Select Client</label>
              <select
                onChange={e => {
                  if (e.target.value) {
                    handleClone(cloneClientPicker, e.target.value);
                    setCloneClientPicker(null);
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                defaultValue=""
              >
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
