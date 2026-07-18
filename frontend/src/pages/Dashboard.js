import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Layers, CalendarRange, LayoutTemplate, BarChart3,
  Clock, CheckCircle2, Instagram, Plus,
  ArrowRight, Sparkles, TrendingUp, Star,
} from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORM_ICON = { instagram: Instagram };

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", style: { color: "#8080ff", background: "#0d0d25", border: "1px solid #2a2a5a" } },
  published:  { label: "Published", style: { color: "#34d399", background: "#0a2016", border: "1px solid #14532d" } },
  draft:      { label: "Draft",     style: { color: "#888",    background: "#1e1e1e", border: "1px solid #2a2a2a" } },
  failed:     { label: "Failed",    style: { color: "#f87171", background: "#2a0a0a", border: "1px solid #7f1d1d" } },
};

const TONE_COLORS = {
  Educational:   { color: "#8080ff", bg: "#0d0d25" },
  Entertaining:  { color: "#34d399", bg: "#0a2016" },
  Inspirational: { color: "#f59e0b", bg: "#1a1200" },
  Professional:  { color: "#64748b", bg: "#0f1723" },
  Casual:        { color: "#ec4899", bg: "#1a0a14" },
};

function greeting(name) {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${prefix}, ${name.split(" ")[0]}` : prefix;
}

// Derive a preview background + readable text colour for a template that has no thumbnail
function templateBg(t) {
  const z = t?.canvas?.zones?.first || {};
  return z.bg || z.gradFrom || (t?.color_scheme === "light" ? "#f4f4f6" : "#161616");
}
function templateFg(t) {
  const z = t?.canvas?.zones?.first || {};
  if (z.textColor) return z.textColor;
  const hex = (templateBg(t) || "").replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0a0a0a" : "#ffffff";
  }
  return "#ffffff";
}

const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
};
function shortAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function QuickAction({ icon: Icon, label, desc, to, iconBg, iconColor }) {
  return (
    <Link to={to}
      className="flex items-center gap-4 p-4 rounded-2xl border transition-all group"
      style={{ background: "#161616", borderColor: "#2a2a2a" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a6a"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(91,91,214,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.boxShadow = ""; }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: "#ffffff" }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "#666666" }}>{desc}</div>
      </div>
      <ArrowRight size={14} style={{ color: "#444444", flexShrink: 0 }} />
    </Link>
  );
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, to }) {
  const navigate = useNavigate();
  const clickable = !!to;
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#161616", borderColor: "#2a2a2a", cursor: clickable ? "pointer" : "default", transition: "border-color 0.15s" }}
      onClick={clickable ? () => navigate(to) : undefined}
      onMouseEnter={clickable ? e => e.currentTarget.style.borderColor = "#3a3a6a" : undefined}
      onMouseLeave={clickable ? e => e.currentTarget.style.borderColor = "#2a2a2a" : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium" style={{ color: "#666666" }}>{label}</span>
        <div className="p-1.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>
          <Icon size={13} />
        </div>
      </div>
      <div className="text-3xl font-bold" style={{ color: "#ffffff" }}>{value}</div>
      {sub && <div className="text-xs mt-1.5" style={{ color: "#666666" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const navigate  = useNavigate();
  const user      = useUser();
  const clientId  = user?.client_id;

  const [posts, setPosts]         = useState([]);
  const [drafts, setDrafts]       = useState([]);
  const [igConnected, setIgConn]  = useState(false);
  const [templates, setTemplates] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading]     = useState(true);

  function authHeaders() {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const load = useCallback(async () => {
    try {
      const [postsResp, tmplResp, carouselResp] = await Promise.allSettled([
        clientId ? axios.get(`${API}/posts?client_id=${clientId}&limit=3`, { headers: authHeaders() }) : Promise.resolve({ data: [] }),
        axios.get(`${API}/templates`, { headers: authHeaders() }),
        axios.get(`${API}/carousels?limit=6`, { headers: authHeaders() }),
      ]);
      if (postsResp.status === "fulfilled") {
        const data = postsResp.value?.data;
        const list = data?.posts || (Array.isArray(data) ? data : []);
        setPosts(list.slice(0, 3));
      }
      if (tmplResp.status === "fulfilled") {
        const data = tmplResp.value?.data;
        const list = data?.templates || data || [];
        setTemplates(list.slice(0, 4));
      }
      if (carouselResp.status === "fulfilled") {
        const data = carouselResp.value?.data;
        setDrafts((data?.carousels || []).filter(c => c.status === "draft").slice(0, 4));
      }
    } catch {}
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("sc:refresh", load);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("sc:refresh", load);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const s = await axios.get(`${API}/instagram/status/${clientId}`).then(r => r.data).catch(() => ({}));
      if (cancelled) return;
      const connected = s?.connected ?? false;
      setIgConn(connected);
      if (!connected) return;
      // Pull cached analytics; if empty, do one live refresh to populate it.
      let a = await axios.get(`${API}/analytics/clients/${clientId}`).then(r => r.data).catch(() => null);
      const hasData = a?.totals && Object.keys(a.totals).length > 0;
      if (!hasData && a?.bundle_connected) {
        a = await axios.post(`${API}/analytics/clients/${clientId}/refresh`).then(r => r.data).catch(() => a);
      }
      if (!cancelled) setAnalytics(a);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const scheduledCount = posts.filter(p => p.status === "scheduled").length;
  const publishedCount = posts.filter(p => p.status === "published").length;
  const draftCount     = posts.filter(p => p.status === "draft").length + drafts.length;

  const starPost = async (postId) => {
    try {
      const resp = await axios.post(`${API}/posts/${postId}/star`, {}, { headers: authHeaders() });
      setPosts(prev => prev.map(p =>
        (p.id || p._id) === postId ? { ...p, starred: resp.data.starred } : p
      ));
      toast.success(resp.data.starred ? "Starred — AI will reference this style" : "Unstarred");
    } catch {
      toast.error("Could not update star");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#ffffff" }}>
              {greeting(user?.name)} 👋
            </h1>
            <p className="text-sm mt-1" style={{ color: "#666666" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            onClick={() => navigate("/create")}
            className="flex items-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-xl text-white transition-colors touch-target"
            style={{ background: "#5B5BD6", boxShadow: "0 4px 14px rgba(91,91,214,0.25)" }}
            onMouseEnter={e => e.currentTarget.style.background = "#4848C0"}
            onMouseLeave={e => e.currentTarget.style.background = "#5B5BD6"}
          >
            <Plus size={15} /> Create Post
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard icon={Clock}        label="Scheduled" value={scheduledCount} sub="posts queued"
            iconBg="#1e1e3a" iconColor="#8080ff" />
          <StatCard icon={CheckCircle2} label="Published"  value={publishedCount} sub="posts live"
            iconBg="#0a2016" iconColor="#34d399" />
          <StatCard icon={Layers}       label="Drafts"     value={draftCount}     sub="tap to view"
            iconBg="#1e1e1e" iconColor="#888888" to="/drafts" />
          <Link to="/analytics"
            className="rounded-2xl p-5 border transition-all"
            style={{ background: "#161616", borderColor: "#2a2a2a", textDecoration: "none" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a6a"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(91,91,214,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.boxShadow = ""; }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-medium" style={{ color: "#666666" }}>Analytics</span>
              <div className="p-1.5 rounded-lg" style={{ background: "#1a1200", color: "#f59e0b" }}>
                <TrendingUp size={13} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: igConnected ? "#2a0a1e" : "#1e1e1e", color: igConnected ? "#db2777" : "#444444" }}>
                <Instagram size={14} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs" style={{ color: "#666666" }}>
                {igConnected ? "Instagram connected" : "Connect Instagram"}
              </div>
              <ArrowRight size={12} style={{ color: "#444444" }} />
            </div>
          </Link>
        </div>

        {/* Instagram Analytics box — live account details from Bundle */}
        {igConnected && analytics?.totals && Object.keys(analytics.totals).length > 0 && (() => {
          const ig = (analytics.bundle?.socials || []).find(s => s.platform === "instagram") || {};
          const t = analytics.totals || {};
          const kpis = [
            { label: "Followers",   value: fmtNum(t.followers) },
            { label: "Impressions", value: fmtNum(t.impressions) },
            { label: "Reach",       value: fmtNum(t.impressions_unique) },
            { label: "Views",       value: fmtNum(t.views) },
            { label: "Likes",       value: fmtNum(t.likes) },
            { label: "Comments",    value: fmtNum(t.comments) },
            { label: "Posts",       value: fmtNum(t.post_count) },
            { label: "Eng. Rate",   value: `${(Number(t.engagement_rate) || 0).toFixed(2)}%` },
          ];
          return (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>Instagram Analytics</h2>
                <Link to="/analytics" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#5B5BD6" }}>
                  Full analytics <ArrowRight size={11} />
                </Link>
              </div>
              <div className="rounded-2xl border p-5" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
                <div className="flex items-center gap-3 mb-4">
                  {ig.avatar_url ? (
                    <img src={ig.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" style={{ border: "1.5px solid #2a2a2a" }} />
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" }}>
                      <Instagram size={18} style={{ color: "#fff" }} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "#fff" }}>@{ig.username || "instagram"}</div>
                    <div className="text-xs" style={{ color: "#666" }}>Updated {shortAgo(ig.refreshed_at || analytics.bundle?.socials_refreshed_at)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {kpis.map(k => (
                    <div key={k.label}>
                      <div className="text-lg font-bold" style={{ color: "#fff" }}>{k.value}</div>
                      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#666" }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Generated Drafts — preview strip */}
        {drafts.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>Generated Drafts</h2>
              <Link to="/drafts" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#5B5BD6" }}>
                View all <ArrowRight size={11} />
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {drafts.map(c => (
                <Link key={c.id} to="/drafts"
                  style={{ minWidth: 0, textDecoration: "none", display: "block" }}>
                  <div style={{ aspectRatio: "4/5", borderRadius: 14, overflow: "hidden", border: "1.5px solid #2a2a2a", background: "#161616", position: "relative", marginBottom: 6 }}>
                    {c.slide_image_urls?.[0]
                      ? <img src={c.slide_image_urls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (
                        <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#1e1e3a,#0d0d0d)", display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
                          <p style={{ fontSize: 9, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.4, margin: 0 }}>
                            {c.slides?.[0]?.heading || c.topic}
                          </p>
                        </div>
                      )
                    }
                    <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 6px", fontSize: 9, color: "#aaa" }}>
                      {c.slides?.length || 0} slides
                    </div>
                  </div>
                  <p style={{ fontSize: 10, color: "#888", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.topic}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
          {/* Recent Content — top 3, with tone badge, clickable to /drafts */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>Recent Content</h2>
              <Link to="/drafts" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#5B5BD6" }}>
                View all <ArrowRight size={11} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#161616" }} />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-2xl p-8 text-center border" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
                <Sparkles size={24} className="mx-auto mb-3" style={{ color: "#3a3a6a" }} />
                <p className="text-sm font-semibold" style={{ color: "#cccccc" }}>No posts yet</p>
                <p className="text-xs mt-1" style={{ color: "#666666" }}>Create your first piece of content below</p>
                <button onClick={() => navigate("/create")}
                  className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl text-white"
                  style={{ background: "#5B5BD6" }}>
                  Create Post
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map(post => {
                  const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                  const PIcon = PLATFORM_ICON[post.platform];
                  const toneStyle = TONE_COLORS[post.tone] || null;
                  return (
                    <div
                      key={post._id || post.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate("/drafts")}
                      className="flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all w-full text-left"
                      style={{ background: "#161616", borderColor: post.starred ? "#3a2a00" : "#2a2a2a", cursor: "pointer", minWidth: 0, overflow: "hidden" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = post.starred ? "#5a4a00" : "#3a3a6a"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = post.starred ? "#3a2a00" : "#2a2a2a"}
                    >
                      {PIcon && (
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "#1e1e1e", color: "#666666" }}>
                          <PIcon size={13} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#ffffff" }}>
                          {post.caption?.slice(0, 60) || post.title || "Untitled post"}
                          {(post.caption?.length || 0) > 60 ? "…" : ""}
                        </p>
                        {post.scheduled_at && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "#666666" }}>
                            {new Date(post.scheduled_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {toneStyle && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", color: toneStyle.color, background: toneStyle.bg, border: `1px solid ${toneStyle.color}33` }}>
                            {post.tone}
                          </span>
                        )}
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); starPost(post.id || post._id); }}
                          title={post.starred ? "Unstar" : "Star — teach AI to write like this"}
                          style={{ cursor: "pointer", padding: "4px", lineHeight: 0, display: "inline-flex" }}
                        >
                          <Star size={14} fill={post.starred ? "#fbbf24" : "none"} stroke={post.starred ? "#fbbf24" : "#555"} strokeWidth={1.8} />
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ ...cfg.style, whiteSpace: "nowrap" }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions + Templates strip */}
          <div>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#ffffff" }}>Quick Actions</h2>
            <div className="space-y-2.5">
              <QuickAction icon={Layers}        label="New Post"         desc="Design & write with AI"        to="/carousel"  iconBg="#EEF0FF" iconColor="#5B5BD6" />
              <QuickAction icon={LayoutTemplate} label="Browse Templates" desc="Find the perfect format"       to="/templates" iconBg="#0a1a2e" iconColor="#2563eb" />
              <QuickAction icon={CalendarRange}  label="Schedule Posts"   desc="Plan your content calendar"   to="/calendar"  iconBg="#0a2016" iconColor="#34d399" />
              <QuickAction icon={BarChart3}      label="View Analytics"   desc="See how posts are performing" to="/analytics" iconBg="#1a1200" iconColor="#d97706" />
            </div>

            {/* Templates horizontal scroll strip */}
            {templates.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#666666" }}>Templates</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {templates.map(t => (
                    <Link key={t._id || t.id} to="/templates"
                      style={{ minWidth: 0, borderRadius: 12, overflow: "hidden", border: "1.5px solid #2a2a2a", background: "#0d0d0d", textDecoration: "none", display: "block" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#3a3a6a"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}
                    >
                      <div style={{ aspectRatio: "4/5", background: templateBg(t), position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                        {t.thumbnail_url
                          ? <img src={t.thumbnail_url} alt={t.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 10, fontWeight: 700, color: templateFg(t), textAlign: "center", lineHeight: 1.35, wordBreak: "break-word" }}>{t.name}</span>
                        }
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <p style={{ fontSize: 10, color: "#aaa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/templates")}
                  style={{ marginTop: 10, width: "100%", padding: "10px 0", borderRadius: 12, border: "1.5px solid #2a2a2a", background: "transparent", color: "#5B5BD6", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <LayoutTemplate size={13} /> View All Templates
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
