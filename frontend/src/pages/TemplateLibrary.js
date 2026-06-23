import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Copy, Trash2, LayoutTemplate, Film,
  Check,
} from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_COLORS = {
  Education:        { bg: "#EEF0FF", text: "#5B5BD6" },
  Technology:       { bg: "#e0f2fe", text: "#0284c7" },
  Business:         { bg: "#fef9c3", text: "#854d0e" },
  Marketing:        { bg: "#fce7f3", text: "#be185d" },
  Finance:          { bg: "#d1fae5", text: "#065f46" },
  "Product Showcase": { bg: "#f3e8ff", text: "#7e22ce" },
  Motivation:       { bg: "#ffedd5", text: "#c2410c" },
  Custom:           { bg: "#f5f4fb", text: "#6b7280" },
};

function categoryStyle(cat) {
  return CATEGORY_COLORS[cat] || { bg: "#f5f4fb", text: "#6b7280" };
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const contentTab = searchParams.get("tab") || "carousel";
  const setContentTab = (t) => setSearchParams({ tab: t });
  const { role, permissions } = useUser();
  const tp = role === "owner"
    ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.templates ?? { view: true, create: true, edit: true, delete: true });

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const resp = await axios.get(`${API}/templates`, { params });
      setTemplates(resp.data?.templates ?? resp.data ?? []);
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

  const carouselTemplates = templates.filter(t => t.kind !== "video");
  const videoTemplates    = templates.filter(t => t.kind === "video");

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await axios.delete(`${API}/templates/${id}`);
      toast.success("Deleted");
      fetchTemplates();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const handleClone = async (id, isVideo) => {
    try {
      const resp = await axios.post(`${API}/templates/${id}/clone`);
      toast.success("Duplicated");
      if (isVideo) {
        fetchTemplates();
      } else {
        navigate(`/templates/${resp.data.id}/edit`);
      }
    } catch {
      toast.error("Duplicate failed");
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f5f4fb" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #ebe9f6" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Template Library</h1>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Choose a format and create AI-powered content in seconds</p>
          </div>
          {tp.create && contentTab === "carousel" && (
            <button onClick={() => navigate("/templates/new")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#4848C0"}
              onMouseLeave={e => e.currentTarget.style.background = "#5B5BD6"}>
              <Plus size={14} /> New Template
            </button>
          )}
          {tp.create && contentTab === "video" && (
            <button onClick={() => navigate("/templates/video/new")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#4848C0"}
              onMouseLeave={e => e.currentTarget.style.background = "#5B5BD6"}>
              <Plus size={14} /> New Video Template
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 0 }}>
          {[
            { key: "carousel", label: "Carousels", icon: LayoutTemplate },
            { key: "video",    label: "Videos",    icon: Film },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setContentTab(key)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "12px 20px", fontSize: 13, fontWeight: 500,
              borderBottom: `2px solid ${contentTab === key ? "#5B5BD6" : "transparent"}`,
              color: contentTab === key ? "#5B5BD6" : "#6b7280",
              background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid",
              borderBottomColor: contentTab === key ? "#5B5BD6" : "transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel tab */}
      {contentTab === "carousel" && (
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "24px" }}>
          {/* Search only */}
          <div style={{ maxWidth: 320, marginBottom: 24, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, fontSize: 13, borderRadius: 12, background: "#fff", border: "1.5px solid #e5e4f0", color: "#111827", outline: "none" }}
              onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
              onBlur={e => e.currentTarget.style.borderColor = "#e5e4f0"}
            />
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: "#fff", border: "1.5px solid #ebe9f6", opacity: 0.7 }}>
                  <div style={{ aspectRatio: "4/5", background: "#f0edf8" }} />
                  <div style={{ padding: 12 }}>
                    <div style={{ height: 12, borderRadius: 6, background: "#f0edf8", width: "70%", marginBottom: 6 }} />
                    <div style={{ height: 10, borderRadius: 6, background: "#f0edf8", width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : carouselTemplates.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80, paddingBottom: 80 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "#EEF0FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <LayoutTemplate size={24} style={{ color: "#5B5BD6" }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>No templates found</p>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 16px" }}>
                {search ? `No results for "${search}"` : "Create your first template to get started"}
              </p>
              {tp.create && (
                <button onClick={() => navigate("/templates/new")} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer" }}>
                  Create Template
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
              {carouselTemplates.map(tpl => (
                <CarouselCard
                  key={tpl.id}
                  tpl={tpl}
                  tp={tp}
                  onEdit={() => navigate(`/templates/${tpl.id}/edit`)}
                  onClone={() => handleClone(tpl.id, false)}
                  onDelete={() => handleDelete(tpl.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video tab */}
      {contentTab === "video" && (
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "24px" }}>
          {/* Search */}
          <div style={{ maxWidth: 320, marginBottom: 24, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search video templates…"
              style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, fontSize: 13, borderRadius: 12, background: "#fff", border: "1.5px solid #e5e4f0", color: "#111827", outline: "none" }}
              onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
              onBlur={e => e.currentTarget.style.borderColor = "#e5e4f0"}
            />
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #ebe9f6", padding: 16, height: 80, opacity: 0.6 }} />
              ))}
            </div>
          ) : videoTemplates.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80, paddingBottom: 80 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "#EEF0FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Film size={24} style={{ color: "#5B5BD6" }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>No video templates yet</p>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 16px" }}>
                {search ? `No results for "${search}"` : "Create reusable video structures to speed up your content creation"}
              </p>
              {tp.create && (
                <button onClick={() => navigate("/templates/video/new")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer" }}>
                  <Plus size={13} /> Create Video Template
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {videoTemplates.map(tpl => (
                <VideoCard
                  key={tpl.id}
                  tpl={tpl}
                  tp={tp}
                  onEdit={() => navigate(`/templates/video/${tpl.id}/edit`)}
                  onClone={() => handleClone(tpl.id, true)}
                  onDelete={() => handleDelete(tpl.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Carousel template card ────────────────────────────────────────────────────

function CarouselCard({ tpl, tp, onEdit, onClone, onDelete }) {
  return (
    <div
      style={{ borderRadius: 16, overflow: "hidden", background: "#fff", border: "1.5px solid #ebe9f6", transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#c7d2fe"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(91,91,214,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#ebe9f6"; e.currentTarget.style.boxShadow = ""; }}
    >
      {/* Preview */}
      <div
        onClick={onEdit}
        style={{ aspectRatio: "4/5", background: "#f5f4fb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
      >
        {tpl.thumbnail_url ? (
          <img src={tpl.thumbnail_url} alt={tpl.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <LayoutTemplate size={28} style={{ color: "#c7d2fe" }} />
            <span style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>No Preview</span>
          </>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{tpl.name}</p>
        {tpl.dimension_preset && (
          <p style={{ fontSize: 10, color: "#9ca3af", margin: "2px 0 0" }}>{tpl.dimension_preset}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "none", background: "#EEF0FF", color: "#5B5BD6", cursor: "pointer", flex: 1, justifyContent: "center" }}
            onMouseEnter={e => e.currentTarget.style.background = "#e0e0f8"}
            onMouseLeave={e => e.currentTarget.style.background = "#EEF0FF"}>
            <Pencil size={10} /> Edit
          </button>
          <button onClick={onClone} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "1px solid #ebe9f6", background: "#f5f4fb", color: "#6b7280", cursor: "pointer", flex: 1, justifyContent: "center" }}
            onMouseEnter={e => e.currentTarget.style.background = "#ebe9f6"}
            onMouseLeave={e => e.currentTarget.style.background = "#f5f4fb"}>
            <Copy size={10} /> Clone
          </button>
          {tp.delete && (
            <button onClick={onDelete} style={{ padding: "6px 7px", borderRadius: 8, border: "none", background: "#f5f4fb", color: "#d1d5db", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#dc2626"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f5f4fb"; e.currentTarget.style.color = "#d1d5db"; }}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Video template card ───────────────────────────────────────────────────────

function VideoCard({ tpl, tp, onEdit, onClone, onDelete }) {
  const cs = categoryStyle(tpl.category);
  const contentItems = tpl.content_config
    ? Object.entries(tpl.content_config).filter(([, v]) => v).map(([k]) =>
        k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      )
    : [];

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #ebe9f6", padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16, transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#c7d2fe"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(91,91,214,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#ebe9f6"; e.currentTarget.style.boxShadow = ""; }}>

      {/* Icon */}
      <div style={{ width: 48, height: 48, borderRadius: 12, background: cs.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Film size={20} style={{ color: cs.text }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{tpl.name}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
              {tpl.category && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: cs.bg, color: cs.text }}>{tpl.category}</span>
              )}
              {tpl.number_of_scenes && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#f5f4fb", color: "#6b7280", border: "1px solid #ebe9f6" }}>{tpl.number_of_scenes} Scenes</span>
              )}
              {tpl.visual_style && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#f5f4fb", color: "#6b7280", border: "1px solid #ebe9f6" }}>{tpl.visual_style}</span>
              )}
              {tpl.theme && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#f5f4fb", color: "#6b7280", border: "1px solid #ebe9f6" }}>{tpl.theme} Theme</span>
              )}
            </div>
            {tpl.video_flow && (
              <p style={{ fontSize: 11, color: "#5B5BD6", margin: "0 0 4px", fontWeight: 500 }}>{tpl.video_flow}</p>
            )}
            {contentItems.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {contentItems.map(item => (
                  <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#6b7280" }}>
                    <Check size={8} style={{ color: "#10b981" }} /> {item}
                  </span>
                ))}
              </div>
            )}
            {tpl.description && (
              <p style={{ fontSize: 11, color: "#9ca3af", margin: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{tpl.description}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12, fontWeight: 600, borderRadius: 9, border: "none", background: "#EEF0FF", color: "#5B5BD6", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#e0e0f8"}
              onMouseLeave={e => e.currentTarget.style.background = "#EEF0FF"}>
              <Pencil size={11} /> Edit
            </button>
            <button onClick={onClone} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12, fontWeight: 600, borderRadius: 9, border: "1px solid #ebe9f6", background: "#f5f4fb", color: "#6b7280", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#ebe9f6"}
              onMouseLeave={e => e.currentTarget.style.background = "#f5f4fb"}>
              <Copy size={11} /> Duplicate
            </button>
            {tp.delete && (
              <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12, fontWeight: 600, borderRadius: 9, border: "none", background: "#f5f4fb", color: "#d1d5db", cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#dc2626"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f5f4fb"; e.currentTarget.style.color = "#d1d5db"; }}>
                <Trash2 size={11} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Footer meta */}
        {tpl.created_at && (
          <p style={{ fontSize: 10, color: "#d1d5db", margin: "8px 0 0" }}>Created {fmtDate(tpl.created_at)}</p>
        )}
      </div>
    </div>
  );
}
