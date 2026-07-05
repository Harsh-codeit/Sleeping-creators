import { useState, useEffect } from "react";
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

const PLATFORM_ICON = {
  instagram: Instagram,
};

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", style: { color: "#8080ff", background: "#0d0d25", border: "1px solid #2a2a5a" } },
  published:  { label: "Published", style: { color: "#34d399", background: "#0a2016", border: "1px solid #14532d" } },
  draft:      { label: "Draft",     style: { color: "#888", background: "#1e1e1e", border: "1px solid #2a2a2a" } },
  failed:     { label: "Failed",    style: { color: "#f87171", background: "#2a0a0a", border: "1px solid #7f1d1d" } },
};

function greeting(name) {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${prefix}, ${name.split(" ")[0]}` : prefix;
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
  const navigate       = useNavigate();
  const user           = useUser();
  const clientId       = user?.client_id;

  const [posts, setPosts]         = useState([]);
  const [drafts, setDrafts]       = useState([]);
  const [igConnected, setIgConn] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);

  function authHeaders() {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [postsResp, tmplResp, carouselResp] = await Promise.allSettled([
          clientId ? axios.get(`${API}/posts?client_id=${clientId}&limit=8`, { headers: authHeaders() }) : Promise.resolve({ data: [] }),
          axios.get(`${API}/templates`, { headers: authHeaders() }),
          axios.get(`${API}/carousels?limit=6`, { headers: authHeaders() }),
        ]);
        if (postsResp.status === "fulfilled") {
          const data = postsResp.value?.data;
          const list = data?.posts || (Array.isArray(data) ? data : []);
          setPosts(list.slice(0, 8));
        }
        if (tmplResp.status === "fulfilled") {
          const data = tmplResp.value?.data;
          const list = data?.templates || data || [];
          setTemplates(list.slice(0, 3));
        }
        if (carouselResp.status === "fulfilled") {
          const data = carouselResp.value?.data;
          setDrafts((data?.carousels || []).filter(c => c.status === "draft").slice(0, 4));
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/instagram/status/${clientId}`)
      .then(r => setIgConn(r.data?.connected ?? false)).catch(() => {});
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
            iconBg="#EEF0FF" iconColor="#5B5BD6" />
          <StatCard icon={CheckCircle2} label="Published"  value={publishedCount} sub="posts live"
            iconBg="#ecfdf5" iconColor="#059669" />
          <StatCard icon={Layers}       label="Drafts"     value={draftCount}     sub="tap to view"
            iconBg="#1e1e1e" iconColor="#888888" to="/drafts" />
          {/* Analytics card */}
          <Link to="/analytics"
            className="rounded-2xl p-5 border transition-all"
            style={{ background: "#161616", borderColor: "#2a2a2a", textDecoration: "none" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a6a"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(91,91,214,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.boxShadow = ""; }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-medium" style={{ color: "#666666" }}>Analytics</span>
              <div className="p-1.5 rounded-lg" style={{ background: "#fffbeb", color: "#d97706" }}>
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

        {/* Generated Drafts — preview strip */}
        {drafts.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>Generated Drafts</h2>
              <Link to="/drafts" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#5B5BD6" }}>
                View all <ArrowRight size={11} />
              </Link>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {drafts.map(c => (
                <Link key={c.id} to="/drafts"
                  style={{ flexShrink: 0, width: 110, textDecoration: "none", display: "block" }}>
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
          {/* Recent posts */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>Recent Content</h2>
              <Link to="/calendar" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#5B5BD6" }}>
                View calendar <ArrowRight size={11} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#f0edf8" }} />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-2xl p-8 text-center border" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
                <Sparkles size={24} className="mx-auto mb-3" style={{ color: "#3a3a6a" }} />
                <p className="text-sm font-semibold" style={{ color: "#cccccc" }}>No posts yet</p>
                <p className="text-xs mt-1" style={{ color: "#666666" }}>Create your first piece of content below</p>
                <button onClick={() => navigate("/create")}
                  className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl text-white transition-colors"
                  style={{ background: "#5B5BD6" }}>
                  Create Post
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map(post => {
                  const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                  const PIcon = PLATFORM_ICON[post.platform];
                  return (
                    <div key={post._id || post.id}
                      className="flex items-center gap-3 p-3.5 rounded-2xl border transition-all"
                      style={{ background: "#161616", borderColor: post.starred ? "#3a2a00" : "#2a2a2a" }}
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
                          {post.caption?.length > 60 ? "…" : ""}
                        </p>
                        {post.scheduled_at && (
                          <p className="text-xs mt-0.5" style={{ color: "#666666" }}>
                            {new Date(post.scheduled_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => starPost(post.id || post._id)}
                        title={post.starred ? "Unstar (remove from AI training)" : "Star — teach AI to write like this"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", flexShrink: 0, lineHeight: 0 }}
                      >
                        <Star size={14}
                          fill={post.starred ? "#fbbf24" : "none"}
                          stroke={post.starred ? "#fbbf24" : "#555"}
                          strokeWidth={1.8}
                        />
                      </button>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={cfg.style}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#ffffff" }}>Quick Actions</h2>
            <div className="space-y-2.5">
              <QuickAction icon={Layers}        label="New Post"          desc="Design & write with AI"          to="/carousel"   iconBg="#EEF0FF" iconColor="#5B5BD6" />
              <QuickAction icon={LayoutTemplate} label="Browse Templates"  desc="Find the perfect format"         to="/templates"  iconBg="#0a1a2e" iconColor="#2563eb" />
              <QuickAction icon={CalendarRange}  label="Schedule Posts"    desc="Plan your content calendar"      to="/calendar"   iconBg="#0a2016" iconColor="#34d399" />
              <QuickAction icon={BarChart3}      label="View Analytics"    desc="See how posts are performing"    to="/analytics"  iconBg="#1a1200" iconColor="#d97706" />
            </div>

            {/* Featured templates */}
            {templates.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#666666" }}>Templates</h3>
                  <Link to="/templates" className="text-xs hover:underline" style={{ color: "#5B5BD6" }}>See all</Link>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {templates.map(t => (
                    <Link key={t._id || t.id} to="/templates"
                      className="aspect-square rounded-xl overflow-hidden border transition-all"
                      style={{ background: "#0d0d0d", borderColor: "#2a2a2a" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#3a3a6a"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}
                    >
                      {t.thumbnail_url
                        ? <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><LayoutTemplate size={16} style={{ color: "#3a3a6a" }} /></div>
                      }
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
