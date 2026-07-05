import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Copy, Check, RefreshCw, Search } from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HOOK_TYPE_LABELS = {
  shocking_number:    "Shocking Number",
  relatable_scene:    "Relatable Scene",
  emotional_state:    "Emotional State",
  myth_bust:          "Myth Bust",
  direct_confront:    "Direct Confront",
  credibility_borrow: "Credibility Borrow",
  family_relationship:"Family & Relationship",
};

const HOOK_TYPE_COLORS = {
  shocking_number:    { bg: "#0a1a2e", border: "#1a3a5a", text: "#60a5fa" },
  relatable_scene:    { bg: "#0a2016", border: "#14532d", text: "#34d399" },
  emotional_state:    { bg: "#1a0a2e", border: "#3a1a5a", text: "#a78bfa" },
  myth_bust:          { bg: "#1a1200", border: "#3a2a00", text: "#fbbf24" },
  direct_confront:    { bg: "#1a0a0a", border: "#5a1a1a", text: "#f87171" },
  credibility_borrow: { bg: "#0a1a1a", border: "#1a4a4a", text: "#2dd4bf" },
  family_relationship:{ bg: "#1a0a14", border: "#4a1a34", text: "#f472b6" },
};

const NICHES = [
  { value: "",          label: "All niches" },
  { value: "startup",   label: "Startup" },
  { value: "finance",   label: "Finance" },
  { value: "fitness",   label: "Fitness" },
  { value: "technology",label: "Technology" },
  { value: "marketing", label: "Marketing" },
  { value: "mindset",   label: "Mindset" },
  { value: "general",   label: "General" },
];

function HookCard({ hook }) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const colors = HOOK_TYPE_COLORS[hook.hook_type] || { bg: "#161616", border: "#2a2a2a", text: "#888" };
  const label = HOOK_TYPE_LABELS[hook.hook_type] || hook.hook_type;

  const copyHook = async () => {
    try {
      await navigator.clipboard.writeText(hook.hook_text);
      setCopied(true);
      toast.success("Hook copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const useAsPost = () => {
    sessionStorage.setItem("sc_prefill_topic", hook.hook_text);
    navigate("/create");
  };

  return (
    <div style={{
      background: "#161616",
      border: "1.5px solid #2a2a2a",
      borderRadius: 16,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      transition: "border-color 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "#3a3a6a"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}
    >
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
          background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#555" }}>{hook.niche || "general"}</span>
      </div>

      {/* Hook text */}
      <p style={{ fontSize: 14, color: "#e5e5e5", lineHeight: 1.6, margin: 0, flex: 1 }}>
        {hook.hook_text}
      </p>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={copyHook} style={{
          padding: "8px 0", borderRadius: 10, border: "1.5px solid #2a2a2a",
          background: copied ? "#0a2016" : "#1a1a1a",
          color: copied ? "#34d399" : "#888", fontSize: 12, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s",
        }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <button onClick={useAsPost} style={{
          padding: "8px 0", borderRadius: 10, border: "1.5px solid #5B5BD6",
          background: "#0d0d20",
          color: "#8080ff", fontSize: 12, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        }}>
          <Sparkles size={12} /> Use this
        </button>
      </div>
    </div>
  );
}

export default function HookLibrary() {
  const user = useUser();
  const userNiche = user?.niche || "";

  const [hooks, setHooks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [niche, setNiche]         = useState(userNiche);
  const [hookType, setHookType]   = useState("");
  const [search, setSearch]       = useState("");

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (niche) params.niche = niche;
      if (hookType) params.hook_type = hookType;
      const { data } = await axios.get(`${API}/hooks`, { params });
      setHooks(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load hooks");
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, [niche, hookType]);

  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  const filtered = search.trim()
    ? hooks.filter(h => h.hook_text.toLowerCase().includes(search.toLowerCase()))
    : hooks;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0d0d0d" }}>
      {/* Header */}
      <div style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: 18, color: "#fff", margin: 0 }}>Inspiration</h1>
            <p style={{ fontSize: 12, color: "#666", margin: "3px 0 0" }}>
              Proven hooks to spark your next post
            </p>
          </div>
          <button onClick={fetchHooks} disabled={loading}
            style={{ background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "6px 10px", color: "#888", cursor: "pointer" }}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#555" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hooks…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px",
              background: "#1a1a1a", border: "1.5px solid #2a2a2a", borderRadius: 10,
              color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {/* Niche filter */}
          <select
            value={niche}
            onChange={e => setNiche(e.target.value)}
            style={{
              background: "#1a1a1a", border: "1.5px solid #2a2a2a", borderRadius: 8,
              color: niche ? "#5B5BD6" : "#888", fontSize: 12, padding: "5px 10px",
              outline: "none", flexShrink: 0,
            }}
          >
            {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>

          {/* Hook type filter */}
          <select
            value={hookType}
            onChange={e => setHookType(e.target.value)}
            style={{
              background: "#1a1a1a", border: "1.5px solid #2a2a2a", borderRadius: 8,
              color: hookType ? "#5B5BD6" : "#888", fontSize: 12, padding: "5px 10px",
              outline: "none", flexShrink: 0,
            }}
          >
            <option value="">All types</option>
            {Object.entries(HOOK_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 80px" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 140, background: "#161616", borderRadius: 16, border: "1.5px solid #2a2a2a" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Sparkles size={20} style={{ color: "#3a3a6a" }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, color: "#ccc", margin: 0 }}>No hooks found</p>
            <p style={{ fontSize: 13, color: "#555", marginTop: 6 }}>
              {search ? "Try a different search term" : "Try a different filter or niche"}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>
              {filtered.length} hooks · tap "Use this" to create a post with this hook
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {filtered.map(h => (
                <HookCard key={h.id} hook={h} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
