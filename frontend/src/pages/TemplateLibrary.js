import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Plus, Search, Pencil, Copy, Trash2, ExternalLink } from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const { role, permissions } = useUser();
  const tp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.templates ?? { view: true, create: true, edit: true, delete: true });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [contentTab, setContentTab] = useState("carousel");

  const fetchTemplates = useCallback(async () => {
    try {
      const params = search ? { search } : {};
      const resp = await axios.get(`${API}/templates`, { params });
      setTemplates(resp.data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchTemplates();
    axios.post(`${API}/templates/seed`).catch(() => {});
  }, [fetchTemplates]);

  const handleDeleteCarousel = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await axios.delete(`${API}/templates/${id}`);
      toast.success("Deleted");
      fetchTemplates();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const handleCloneCarousel = async (id) => {
    try {
      const resp = await axios.post(`${API}/templates/${id}/clone`);
      toast.success("Cloned");
      navigate(`/templates/${resp.data.id}/edit`);
    } catch {
      toast.error("Clone failed");
    }
  };

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-hidden">

      {/* Header + Search */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Templates</h1>
        {tp.create && contentTab === "carousel" && (
          <button
            onClick={() => navigate("/templates/new")}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            <Plus size={14} /> Create Template
          </button>
        )}
        {contentTab === "video" && (
          <button
            onClick={() => navigate("/video-templates")}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            <ExternalLink size={14} /> Manage in Video Templates
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800">
        <div className="relative max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full bg-zinc-900 border border-zinc-700 pl-9 pr-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex border border-zinc-800">
          {[["carousel", "Carousel"], ["video", "Video"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setContentTab(val)}
              className={`px-4 py-1.5 text-xs font-mono uppercase border-r border-zinc-800 last:border-0 transition-colors ${
                contentTab === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Carousel tab ── */}
        {contentTab === "carousel" && (
          loading ? (
            <p className="text-zinc-500 text-sm">Loading…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-400 text-sm">No templates found.</p>
              <p className="text-zinc-600 text-xs mt-1">Create or clone a starter template to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors group"
                >
                  <div
                    className="aspect-[4/5] bg-zinc-800 flex items-center justify-center cursor-pointer overflow-hidden"
                    onClick={() => navigate(`/templates/${tpl.id}/edit`)}
                  >
                    {tpl.thumbnail_url ? (
                      <img src={tpl.thumbnail_url} alt={tpl.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-zinc-600 text-xs font-mono">No Preview</span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-white truncate">{tpl.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{tpl.dimension_preset || "—"}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => navigate(`/templates/${tpl.id}/edit`)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                      >
                        <Pencil size={10} /> Edit
                      </button>
                      <button
                        onClick={() => handleCloneCarousel(tpl.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                      >
                        <Copy size={10} /> Clone
                      </button>
                      {tp.delete && !tpl.is_starter && (
                        <button
                          onClick={() => handleDeleteCarousel(tpl.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-zinc-700 text-red-500 hover:border-red-500 transition-colors ml-auto"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Video tab — managed in VideoTemplatesAdmin ── */}
        {contentTab === "video" && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-zinc-400 text-sm">Video templates are managed in the Video Templates registry.</p>
            <button
              onClick={() => navigate("/video-templates")}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors"
            >
              <ExternalLink size={12} /> Go to Video Templates
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
