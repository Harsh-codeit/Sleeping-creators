import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  Layers, CalendarRange, LayoutTemplate, BarChart3,
  Clock, CheckCircle2, Instagram, Plus,
  ArrowRight, Sparkles, TrendingUp
} from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORM_ICON = {
  instagram: Instagram,
};

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", style: { color: "#5B5BD6", background: "#EEF0FF", border: "1px solid #c7d2fe" } },
  published:  { label: "Published", style: { color: "#059669", background: "#ecfdf5", border: "1px solid #6ee7b7" } },
  draft:      { label: "Draft",     style: { color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb" } },
  failed:     { label: "Failed",    style: { color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5" } },
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
      style={{ background: "#fff", borderColor: "#ebe9f6" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#c7d2fe"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(91,91,214,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#ebe9f6"; e.currentTarget.style.boxShadow = ""; }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: "#111827" }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{desc}</div>
      </div>
      <ArrowRight size={14} style={{ color: "#d1d5db", flexShrink: 0 }} />
    </Link>
  );
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ background: "#fff", borderColor: "#ebe9f6" }}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>{label}</span>
        <div className="p-1.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>
          <Icon size={13} />
        </div>
      </div>
      <div className="text-3xl font-bold" style={{ color: "#111827" }}>{value}</div>
      {sub && <div className="text-xs mt-1.5" style={{ color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const navigate       = useNavigate();
  const user           = useUser();
  const clientId       = user?.client_id;

  const [posts, setPosts]         = useState([]);
  const [igConnected, setIgConn] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [postsResp, tmplResp] = await Promise.allSettled([
          clientId ? axios.get(`${API}/posts?client_id=${clientId}&limit=8`) : Promise.resolve({ data: [] }),
          axios.get(`${API}/templates`),
        ]);
        if (postsResp.status === "fulfilled") {
          const data = postsResp.value?.data;
          setPosts(Array.isArray(data) ? data.slice(0, 8) : []);
        }
        if (tmplResp.status === "fulfilled") {
          const data = tmplResp.value?.data;
          const list = data?.templates || data || [];
          setTemplates(list.slice(0, 3));
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
  const draftCount     = posts.filter(p => p.status === "draft").length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>
              {greeting(user?.name)} 👋
            </h1>
            <p className="text-sm mt-1" style={{ color: "#9ca3af" }}>
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
          <StatCard icon={Layers}       label="Drafts"     value={draftCount}     sub="in progress"
            iconBg="#f3f4f6" iconColor="#6b7280" />
          {/* Analytics card */}
          <Link to="/analytics"
            className="rounded-2xl p-5 border transition-all"
            style={{ background: "#fff", borderColor: "#ebe9f6", textDecoration: "none" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#c7d2fe"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(91,91,214,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#ebe9f6"; e.currentTarget.style.boxShadow = ""; }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>Analytics</span>
              <div className="p-1.5 rounded-lg" style={{ background: "#fffbeb", color: "#d97706" }}>
                <TrendingUp size={13} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: igConnected ? "#fdf2f8" : "#f3f4f6", color: igConnected ? "#db2777" : "#d1d5db" }}>
                <Instagram size={14} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs" style={{ color: "#9ca3af" }}>
                {igConnected ? "Instagram connected" : "Connect Instagram"}
              </div>
              <ArrowRight size={12} style={{ color: "#d1d5db" }} />
            </div>
          </Link>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
          {/* Recent posts */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "#111827" }}>Recent Content</h2>
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
              <div className="rounded-2xl p-8 text-center border" style={{ background: "#fff", borderColor: "#ebe9f6" }}>
                <Sparkles size={24} className="mx-auto mb-3" style={{ color: "#c7d2fe" }} />
                <p className="text-sm font-semibold" style={{ color: "#374151" }}>No posts yet</p>
                <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>Create your first piece of content below</p>
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
                      style={{ background: "#fff", borderColor: "#ebe9f6" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#c7d2fe"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#ebe9f6"}
                    >
                      {PIcon && (
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "#f3f4f6", color: "#9ca3af" }}>
                          <PIcon size={13} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>
                          {post.caption?.slice(0, 60) || post.title || "Untitled post"}
                          {post.caption?.length > 60 ? "…" : ""}
                        </p>
                        {post.scheduled_for && (
                          <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                            {new Date(post.scheduled_for).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        )}
                      </div>
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
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#111827" }}>Quick Actions</h2>
            <div className="space-y-2.5">
              <QuickAction icon={Layers}        label="New Post"          desc="Design & write with AI"          to="/carousel"   iconBg="#EEF0FF" iconColor="#5B5BD6" />
              <QuickAction icon={LayoutTemplate} label="Browse Templates"  desc="Find the perfect format"         to="/templates"  iconBg="#eff6ff" iconColor="#2563eb" />
              <QuickAction icon={CalendarRange}  label="Schedule Posts"    desc="Plan your content calendar"      to="/calendar"   iconBg="#ecfdf5" iconColor="#059669" />
              <QuickAction icon={BarChart3}      label="View Analytics"    desc="See how posts are performing"    to="/analytics"  iconBg="#fffbeb" iconColor="#d97706" />
            </div>

            {/* Featured templates */}
            {templates.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Templates</h3>
                  <Link to="/templates" className="text-xs hover:underline" style={{ color: "#5B5BD6" }}>See all</Link>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {templates.map(t => (
                    <Link key={t._id || t.id} to="/templates"
                      className="aspect-square rounded-xl overflow-hidden border transition-all"
                      style={{ background: "#f5f4fb", borderColor: "#ebe9f6" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#c7d2fe"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#ebe9f6"}
                    >
                      {t.thumbnail_url
                        ? <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><LayoutTemplate size={16} style={{ color: "#c7d2fe" }} /></div>
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
