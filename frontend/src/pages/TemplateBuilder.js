import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useUser } from "../context/UserContext";
import SlidePreview from "../components/SlidePreview";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Data ────────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { key: "tips",         label: "Tips List",    desc: "Numbered tips & tricks",  icon: "📋" },
  { key: "story",        label: "Story",        desc: "Narrative journey",        icon: "📖" },
  { key: "tutorial",     label: "Tutorial",     desc: "Step-by-step guide",       icon: "🎯" },
  { key: "announcement", label: "Announcement", desc: "Launch or news reveal",    icon: "📣" },
  { key: "quote",        label: "Quote Card",   desc: "Single impactful message", icon: "💬" },
];

const SLIDE_COUNTS = ["3", "5", "7", "10"];

const COLOR_SCHEMES = [
  {
    key: "purple", label: "Purple",
    swatch: ["#5B5BD6", "#1e1e3a"],
    accent: "#5B5BD6",
    canvas: {
      first:  { bgType: "gradient", gradFrom: "#5B5BD6", gradTo: "#1e1e3a", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid",    bg: "#1e1e3a",                          elements: ["heading", "body"] },
      last:   { bgType: "gradient", gradFrom: "#5B5BD6", gradTo: "#1e1e3a", elements: ["heading", "author_block"] },
    },
  },
  {
    key: "dark", label: "Dark",
    swatch: ["#111827", "#374151"],
    accent: "#5B5BD6",
    canvas: {
      first:  { bgType: "solid", bg: "#111827", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid", bg: "#111827", elements: ["heading", "body"] },
      last:   { bgType: "solid", bg: "#111827", elements: ["heading", "author_block"] },
    },
  },
  {
    key: "blue", label: "Blue",
    swatch: ["#2563EB", "#1e3a5f"],
    accent: "#60a5fa",
    canvas: {
      first:  { bgType: "gradient", gradFrom: "#2563EB", gradTo: "#1e3a5f", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid",    bg: "#1a2f4a",                          elements: ["heading", "body"] },
      last:   { bgType: "gradient", gradFrom: "#2563EB", gradTo: "#1e3a5f", elements: ["heading", "author_block"] },
    },
  },
  {
    key: "green", label: "Finance",
    swatch: ["#059669", "#0a2a1a"],
    accent: "#34d399",
    canvas: {
      first:  { bgType: "gradient", gradFrom: "#059669", gradTo: "#0a2a1a", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid",    bg: "#0a2a1a",                          elements: ["heading", "body"] },
      last:   { bgType: "gradient", gradFrom: "#059669", gradTo: "#0a2a1a", elements: ["heading", "author_block"] },
    },
  },
  {
    key: "gold", label: "Gold",
    swatch: ["#F59E0B", "#1a1400"],
    accent: "#fbbf24",
    canvas: {
      first:  { bgType: "gradient", gradFrom: "#1a1400", gradTo: "#0d0a00", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid",    bg: "#0d0a00",                          elements: ["heading", "body"] },
      last:   { bgType: "gradient", gradFrom: "#1a1400", gradTo: "#0d0a00", elements: ["heading", "author_block"] },
    },
  },
  {
    key: "pink", label: "Pink",
    swatch: ["#DB2777", "#4a0a2a"],
    accent: "#f472b6",
    canvas: {
      first:  { bgType: "gradient", gradFrom: "#DB2777", gradTo: "#4a0a2a", elements: ["heading", "body", "author_block"] },
      middle: { bgType: "solid",    bg: "#2a0a1a",                          elements: ["heading", "body"] },
      last:   { bgType: "gradient", gradFrom: "#DB2777", gradTo: "#4a0a2a", elements: ["heading", "author_block"] },
    },
  },
];

const FONT_STYLES = [
  { key: "bold",    label: "Bold & Modern",   family: "system-ui, sans-serif", weight: 800 },
  { key: "clean",   label: "Clean & Minimal", family: "system-ui, sans-serif", weight: 400 },
  { key: "elegant", label: "Elegant",         family: "Georgia, serif",        weight: 300 },
  { key: "playful", label: "Playful",         family: "system-ui, sans-serif", weight: 700 },
];

const NICHES = [
  "startup", "finance", "fitness", "technology",
  "marketing", "education", "mindset", "lifestyle",
];

// Map old seeded-template values to new simplified keys
const FONT_MAP_IN  = { sans: "clean", bold: "bold", serif: "elegant", mono: "clean" };
const COLOR_MAP_IN = {
  dark: "dark", purple: "purple", "blue-dark": "blue",
  "green-dark": "green", "gold-dark": "gold",
  "purple-pink": "pink", "orange-dark": "pink",
};

const TYPE_DESCS = {
  tips:         "Numbered tips & tricks",
  story:        "Narrative journey",
  tutorial:     "Step-by-step guide",
  announcement: "News reveal",
  quote:        "Single impactful message",
  carousel:     "Multi-slide post",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateBuilder() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isClone  = location.pathname.includes("/clone");
  const isNew    = !id;

  const [name,        setName]        = useState("Untitled Template");
  const [type,        setType]        = useState("tips");
  const [slideCount,  setSlideCount]  = useState("5");
  const [colorScheme, setColorScheme] = useState("purple");
  const [fontStyle,   setFontStyle]   = useState("bold");
  const [niche,       setNiche]       = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    axios.get(`${API}/templates/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => {
      const t = r.data;
      setName(isClone ? `${t.name} (Copy)` : t.name);
      setType(t.template_type || "tips");
      setSlideCount(String(t.slide_count || 5));
      setColorScheme(COLOR_MAP_IN[t.color_scheme] || t.color_scheme || "dark");
      setFontStyle(FONT_MAP_IN[t.font_style] || t.font_style || "bold");
      setNiche(t.niche || "");
    }).catch(() => { toast.error("Failed to load template"); navigate("/templates"); });
  }, [id, isClone, navigate]);

  const scheme = COLOR_SCHEMES.find(c => c.key === colorScheme) || COLOR_SCHEMES[0];

  const buildPayload = () => ({
    name:          name.trim(),
    kind:          "carousel",
    template_type: type,
    slide_count:   parseInt(slideCount, 10),
    color_scheme:  colorScheme,
    font_style:    fontStyle,
    niche:         niche || null,
    format:        "4:5",
    scope:         "personal",
    status:        "published",
    description:   TYPE_DESCS[type] || "",
    canvas:        { format: "4:5", zones: scheme.canvas },
  });

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    setSaving(true);
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      if (isNew || isClone) {
        await axios.post(`${API}/templates`, buildPayload(), { headers });
      } else {
        await axios.put(`${API}/templates/${id}`, buildPayload(), { headers });
      }
      toast.success("Template saved!");
      navigate("/templates");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Live preview object for SlidePreview
  const previewTemplate = {
    name,
    description: TYPE_DESCS[type] || "",
    font_style:   fontStyle,
    color_scheme: colorScheme,
    layout_style: "left-aligned",
    niche:        niche || null,
    canvas:       { format: "4:5", zones: scheme.canvas },
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#0d0d0d", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        background: "#141414", borderBottom: "1px solid #2a2a2a",
        padding: "0 16px", height: 54, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 10,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => navigate("/templates")}
          style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #2a2a2a", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", flexShrink: 0 }}>
          <ArrowLeft size={15} />
        </button>
        <input
          value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#fff", background: "transparent", border: "none", outline: "none", minWidth: 0 }}
          placeholder="Template name…"
        />
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "8px 20px", fontSize: 13, fontWeight: 700, borderRadius: 10, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer", flexShrink: 0, opacity: saving ? 0.7 : 1, boxShadow: "0 2px 8px rgba(91,91,214,0.3)", whiteSpace: "nowrap" }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 100px" }}>

          {/* Live Preview */}
          <div style={{ width: 180, aspectRatio: "4/5", borderRadius: 18, overflow: "hidden", margin: "0 auto 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <SlidePreview template={previewTemplate} compact={false} />
          </div>

          {/* ── Content Structure ── */}
          <Section title="Content Structure" hint="Tells the AI how to structure your slides">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TEMPLATE_TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)}
                  style={{
                    padding: "12px 14px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                    border: `1.5px solid ${type === t.key ? "#5B5BD6" : "#222"}`,
                    background: type === t.key ? "#1a1a3a" : "#161616",
                    transition: "all 0.15s",
                  }}>
                  <div style={{ fontSize: 20, marginBottom: 6, lineHeight: 1 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: type === t.key ? "#fff" : "#bbb", marginBottom: 2 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* ── Slide Count ── */}
          <Section title="Number of Slides" hint="How many slides the AI will generate">
            <div style={{ display: "flex", gap: 8 }}>
              {SLIDE_COUNTS.map(n => (
                <button key={n} onClick={() => setSlideCount(n)}
                  style={{
                    flex: 1, padding: "13px 0", fontSize: 16, fontWeight: 700, borderRadius: 12,
                    border: `1.5px solid ${slideCount === n ? "#5B5BD6" : "#222"}`,
                    background: slideCount === n ? "#1a1a3a" : "#161616",
                    color: slideCount === n ? "#fff" : "#555",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Color Scheme ── */}
          <Section title="Color Scheme" hint="Sets the visual style of every slide">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {COLOR_SCHEMES.map(c => (
                <button key={c.key} onClick={() => setColorScheme(c.key)}
                  style={{
                    padding: "10px", borderRadius: 14, cursor: "pointer",
                    border: `1.5px solid ${colorScheme === c.key ? c.accent : "#222"}`,
                    background: colorScheme === c.key ? "#1a1a3a" : "#161616",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                    transition: "all 0.15s",
                    boxShadow: colorScheme === c.key ? `0 0 0 3px ${c.accent}22` : "none",
                  }}>
                  <div style={{ display: "flex", width: "100%", height: 32, borderRadius: 8, overflow: "hidden", border: "1px solid #333" }}>
                    <div style={{ flex: 1, background: c.swatch[0] }} />
                    <div style={{ flex: 1, background: c.swatch[1] }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: colorScheme === c.key ? "#fff" : "#666" }}>{c.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* ── Font Style ── */}
          <Section title="Font Style" hint="Typography for your slide headings">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FONT_STYLES.map(f => (
                <button key={f.key} onClick={() => setFontStyle(f.key)}
                  style={{
                    padding: "14px", borderRadius: 14, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${fontStyle === f.key ? "#5B5BD6" : "#222"}`,
                    background: fontStyle === f.key ? "#1a1a3a" : "#161616",
                    display: "flex", flexDirection: "column", gap: 5,
                    transition: "all 0.15s",
                  }}>
                  <span style={{ fontSize: 26, fontFamily: f.family, fontWeight: f.weight, color: fontStyle === f.key ? "#fff" : "#888", lineHeight: 1 }}>Aa</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: fontStyle === f.key ? "#8080ff" : "#555" }}>{f.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* ── Niche ── */}
          <Section title="Content Niche" hint="Optional — helps AI stay on topic">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NICHES.map(n => (
                <button key={n} onClick={() => setNiche(niche === n ? "" : n)}
                  style={{
                    padding: "7px 16px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${niche === n ? "#5B5BD6" : "#222"}`,
                    background: niche === n ? "#1a1a3a" : "#161616",
                    color: niche === n ? "#8080ff" : "#555",
                    textTransform: "capitalize", transition: "all 0.15s",
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>{title}</p>
        {hint && <p style={{ fontSize: 11, color: "#444", margin: "3px 0 0" }}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}
