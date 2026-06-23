import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Check } from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TEMPLATE_TYPES = [
  { key: "carousel",     label: "Carousel",     desc: "Multi-slide swipeable post" },
  { key: "quote",        label: "Quote Card",   desc: "Single impactful quote" },
  { key: "tips",         label: "Tips List",    desc: "Numbered tips & tricks" },
  { key: "tutorial",     label: "Tutorial",     desc: "Step-by-step guide" },
  { key: "announcement", label: "Announcement", desc: "Launch or news reveal" },
];

const SLIDE_COUNTS = ["1", "3", "5", "7", "10"];

const COLOR_SCHEMES = [
  { key: "purple_white", label: "Purple & White", bg: "#5B5BD6", text: "#fff",    accent: "#EEF0FF" },
  { key: "black_gold",   label: "Black & Gold",   bg: "#111827", text: "#F59E0B", accent: "#fef3c7" },
  { key: "blue_white",   label: "Blue & White",   bg: "#2563EB", text: "#fff",    accent: "#eff6ff" },
  { key: "green_white",  label: "Green & White",  bg: "#059669", text: "#fff",    accent: "#ecfdf5" },
  { key: "pink_white",   label: "Pink & Rose",    bg: "#DB2777", text: "#fff",    accent: "#fdf2f8" },
  { key: "dark_mode",    label: "Dark Mode",      bg: "#18181B", text: "#e4e4e7", accent: "#27272a" },
];

const FONT_STYLES = [
  { key: "bold",    label: "Bold & Modern",   weight: 800, letterSpacing: "-0.5px" },
  { key: "clean",   label: "Clean & Minimal", weight: 400, letterSpacing: "0px"    },
  { key: "elegant", label: "Elegant",         weight: 300, letterSpacing: "2px"    },
  { key: "playful", label: "Playful",         weight: 700, letterSpacing: "0.5px"  },
];

const LAYOUT_STYLES = [
  { key: "centered",   label: "Centered",   icon: "▣" },
  { key: "split_left", label: "Split Left", icon: "◧" },
  { key: "magazine",   label: "Magazine",   icon: "▤" },
  { key: "card_stack", label: "Card Stack", icon: "▨" },
];

const CONTENT_NICHES = [
  "Business & Entrepreneurship", "Health & Wellness", "Finance & Investing",
  "Travel & Lifestyle", "Food & Recipes", "Fitness & Sports",
  "Technology", "Fashion & Beauty", "Education", "Motivation",
];

export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();
  const isClone = location.pathname.includes("/clone");
  const isNew = !id;

  const [name, setName]               = useState("My Custom Template");
  const [type, setType]               = useState("carousel");
  const [slideCount, setSlideCount]   = useState("5");
  const [colorScheme, setColorScheme] = useState("purple_white");
  const [fontStyle, setFontStyle]     = useState("bold");
  const [layout, setLayout]           = useState("centered");
  const [niche, setNiche]             = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving]           = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!id) return;
    axios.get(`${API}/templates/${id}`).then(r => {
      const t = r.data;
      setName(isClone ? `${t.name} (Copy)` : t.name);
      setType(t.template_type || "carousel");
      setSlideCount(String(t.slide_count || 5));
      setColorScheme(t.color_scheme || "purple_white");
      setFontStyle(t.font_style || "bold");
      setLayout(t.layout_style || "centered");
      setNiche(t.niche || "");
      setDescription(t.description || "");
    }).catch(() => { toast.error("Failed to load template"); navigate("/templates"); });
  }, [id, isClone, navigate]);

  const selectedColor = COLOR_SCHEMES.find(c => c.key === colorScheme) || COLOR_SCHEMES[0];
  const selectedFont  = FONT_STYLES.find(f => f.key === fontStyle)     || FONT_STYLES[0];
  const slidesNeeded  = type === "carousel" || type === "tips" || type === "tutorial";

  const buildPayload = () => ({
    name: name.trim(),
    description,
    template_type: type,
    slide_count: parseInt(slideCount, 10),
    color_scheme: colorScheme,
    font_style: fontStyle,
    layout_style: layout,
    niche,
    scope: "user",
    client_id: user?.client_id || null,
    canvas: { width: 1080, height: 1350, background: { type: "solid", value: selectedColor.bg } },
    elements: [],
  });

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    setSaving(true);
    try {
      if (isNew || isClone) {
        await axios.post(`${API}/templates`, buildPayload());
        toast.success("Template saved to your library!");
      } else {
        await axios.put(`${API}/templates/${id}`, buildPayload());
        toast.success("Template updated");
      }
      navigate("/templates", { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f5f4fb", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #ebe9f6",
        padding: "0 16px", height: 56,
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0, position: "sticky", top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate("/templates")}
          style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #ebe9f6", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#6b7280" }}
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827", background: "transparent", border: "none", outline: "none", minWidth: 0 }}
          placeholder="Template name"
        />
        <button
          onClick={() => setShowPreview(true)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", fontSize: 12, fontWeight: 600, borderRadius: 10, border: "1.5px solid #ebe9f6", background: "#fff", color: "#5B5BD6", cursor: "pointer", flexShrink: 0 }}
        >
          <Eye size={13} /> Preview
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, borderRadius: 10, border: "none", background: "#5B5BD6", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, flexShrink: 0, boxShadow: "0 2px 8px rgba(91,91,214,0.25)" }}
        >
          <Save size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </header>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 48px" }}>

          {/* Live mini-preview */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <PreviewCard color={selectedColor} font={selectedFont} name={name} type={type} slides={slideCount} layout={layout} />
          </div>

          {/* Template Type */}
          <FormSection title="Template Type">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TEMPLATE_TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)} style={{
                  padding: "10px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1.5px solid ${type === t.key ? "#5B5BD6" : "#ebe9f6"}`,
                  background: type === t.key ? "#EEF0FF" : "#fff",
                  boxShadow: type === t.key ? "0 0 0 3px rgba(91,91,214,0.1)" : "none",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: type === t.key ? "#5B5BD6" : "#111827" }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </FormSection>

          {/* Slide count */}
          {slidesNeeded && (
            <FormSection title="Number of Slides">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SLIDE_COUNTS.map(n => (
                  <button key={n} onClick={() => setSlideCount(n)} style={{
                    width: 48, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: `1.5px solid ${slideCount === n ? "#5B5BD6" : "#ebe9f6"}`,
                    background: slideCount === n ? "#5B5BD6" : "#fff",
                    color: slideCount === n ? "#fff" : "#374151",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    {n}
                  </button>
                ))}
              </div>
            </FormSection>
          )}

          {/* Color Scheme */}
          <FormSection title="Color Scheme">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {COLOR_SCHEMES.map(c => (
                <button key={c.key} onClick={() => setColorScheme(c.key)} style={{
                  padding: "10px 10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${colorScheme === c.key ? "#5B5BD6" : "#ebe9f6"}`,
                  background: colorScheme === c.key ? "#EEF0FF" : "#fff",
                  boxShadow: colorScheme === c.key ? "0 0 0 3px rgba(91,91,214,0.1)" : "none",
                  transition: "all 0.15s", position: "relative",
                }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 5 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: c.bg }} />
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: c.text === "#fff" ? "#f0f0f0" : c.text, border: "1px solid #ebe9f6" }} />
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: c.accent, border: "1px solid #ebe9f6" }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: colorScheme === c.key ? "#5B5BD6" : "#6b7280" }}>{c.label}</div>
                  {colorScheme === c.key && (
                    <div style={{ position: "absolute", top: 5, right: 5, width: 14, height: 14, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={8} style={{ color: "#fff" }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </FormSection>

          {/* Font Style */}
          <FormSection title="Font Style">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FONT_STYLES.map(f => (
                <button key={f.key} onClick={() => setFontStyle(f.key)} style={{
                  padding: "10px 14px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1.5px solid ${fontStyle === f.key ? "#5B5BD6" : "#ebe9f6"}`,
                  background: fontStyle === f.key ? "#EEF0FF" : "#fff",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 15, fontWeight: f.weight, letterSpacing: f.letterSpacing, color: fontStyle === f.key ? "#5B5BD6" : "#111827", lineHeight: 1.2 }}>Aa</div>
                  <div style={{ fontSize: 11, color: fontStyle === f.key ? "#5B5BD6" : "#9ca3af", marginTop: 3, fontWeight: 500 }}>{f.label}</div>
                </button>
              ))}
            </div>
          </FormSection>

          {/* Layout Style */}
          <FormSection title="Layout Style">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {LAYOUT_STYLES.map(l => (
                <button key={l.key} onClick={() => setLayout(l.key)} style={{
                  padding: "10px 6px", borderRadius: 12, textAlign: "center", cursor: "pointer",
                  border: `1.5px solid ${layout === l.key ? "#5B5BD6" : "#ebe9f6"}`,
                  background: layout === l.key ? "#EEF0FF" : "#fff",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4, lineHeight: 1, color: layout === l.key ? "#5B5BD6" : "#6b7280" }}>{l.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: layout === l.key ? "#5B5BD6" : "#9ca3af" }}>{l.label}</div>
                </button>
              ))}
            </div>
          </FormSection>

          {/* Content Niche */}
          <FormSection title="Content Niche (optional)">
            <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #ebe9f6", overflow: "hidden" }}>
              <select
                value={niche}
                onChange={e => setNiche(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, color: niche ? "#111827" : "#9ca3af", background: "transparent", border: "none", outline: "none", appearance: "none", cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" }}
              >
                <option value="">Select a niche…</option>
                {CONTENT_NICHES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </FormSection>

          {/* Description */}
          <FormSection title="Description (optional)">
            <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #ebe9f6", overflow: "hidden" }}>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this template for? Any notes on when to use it…"
                rows={3}
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, color: "#111827", background: "transparent", border: "none", outline: "none", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          </FormSection>

          {/* Bottom CTA row */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => setShowPreview(true)}
              style={{ flex: 1, padding: "14px 0", fontSize: 13, fontWeight: 600, borderRadius: 14, border: "1.5px solid #5B5BD6", background: "#fff", color: "#5B5BD6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Eye size={14} /> Preview
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, padding: "14px 0", fontSize: 13, fontWeight: 700, borderRadius: 14, border: "none", background: "#5B5BD6", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 14px rgba(91,91,214,0.28)" }}
            >
              <Save size={14} /> {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div
          onClick={() => setShowPreview(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Template Preview</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>How your template will look</p>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <PreviewCard color={selectedColor} font={selectedFont} name={name} type={type} slides={slideCount} layout={layout} large />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
              {[
                ["Type",   TEMPLATE_TYPES.find(t => t.key === type)?.label],
                ["Slides", slidesNeeded ? slideCount : "1"],
                ["Color",  COLOR_SCHEMES.find(c => c.key === colorScheme)?.label],
                ["Font",   FONT_STYLES.find(f => f.key === fontStyle)?.label],
                ["Layout", LAYOUT_STYLES.find(l => l.key === layout)?.label],
                ["Niche",  niche || "General"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "#f5f4fb", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{k}</div>
                  <div style={{ fontSize: 12, color: "#111827", fontWeight: 600, marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, border: "1.5px solid #ebe9f6", background: "#fff", color: "#6b7280", cursor: "pointer" }}
              >
                Edit
              </button>
              <button
                onClick={() => { setShowPreview(false); handleSave(); }}
                disabled={saving}
                style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", cursor: "pointer", boxShadow: "0 4px 12px rgba(91,91,214,0.25)" }}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Preview Card ─────────────────────────────────────────────────────────

function PreviewCard({ color, font, name, type, slides, layout, large }) {
  const LayoutContent = () => {
    if (layout === "centered") return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%", padding: "0 12px" }}>
        <div style={{ height: 6, width: "60%", borderRadius: 3, background: color.text, opacity: 0.9 }} />
        <div style={{ height: 4, width: "80%", borderRadius: 2, background: color.text, opacity: 0.5 }} />
        <div style={{ height: 4, width: "50%", borderRadius: 2, background: color.text, opacity: 0.3 }} />
      </div>
    );
    if (layout === "split_left") return (
      <div style={{ display: "flex", gap: 6, width: "100%", padding: "0 8px" }}>
        <div style={{ width: 4, background: color.text, opacity: 0.4, borderRadius: 2, alignSelf: "stretch" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ height: 5, width: "90%", borderRadius: 2, background: color.text, opacity: 0.9 }} />
          <div style={{ height: 3, width: "70%", borderRadius: 2, background: color.text, opacity: 0.5 }} />
          <div style={{ height: 3, width: "55%", borderRadius: 2, background: color.text, opacity: 0.3 }} />
        </div>
      </div>
    );
    if (layout === "magazine") return (
      <div style={{ width: "100%", padding: "0 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ height: 28, width: "100%", borderRadius: 4, background: color.text, opacity: 0.15 }} />
        <div style={{ height: 4, width: "80%", borderRadius: 2, background: color.text, opacity: 0.7 }} />
        <div style={{ height: 3, width: "60%", borderRadius: 2, background: color.text, opacity: 0.4 }} />
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "100%", padding: "0 8px" }}>
        {[0.3, 0.4, 0.25, 0.35].map((op, i) => (
          <div key={i} style={{ height: 18, borderRadius: 4, background: color.text, opacity: op }} />
        ))}
      </div>
    );
  };

  const slidesNeeded = type === "carousel" || type === "tips" || type === "tutorial";

  return (
    <div style={{
      width: large ? 200 : 140,
      aspectRatio: "4/5",
      borderRadius: 16,
      background: color.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      flexShrink: 0,
    }}>
      {/* Type badge */}
      <div style={{ position: "absolute", top: 8, right: 8, background: color.accent, borderRadius: 6, padding: "2px 6px" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: color.bg, opacity: 0.85 }}>
          {TEMPLATE_TYPES.find(t => t.key === type)?.label?.toUpperCase() || "TEMPLATE"}
        </span>
      </div>

      {/* Name */}
      <div style={{ padding: "0 12px", textAlign: "center" }}>
        <div style={{
          fontSize: large ? 12 : 9,
          fontWeight: font.weight,
          letterSpacing: font.letterSpacing,
          color: color.text,
          lineHeight: 1.3,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {name || "My Template"}
        </div>
      </div>

      <LayoutContent />

      {/* Slide dots */}
      {slidesNeeded && (
        <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
          {Array.from({ length: Math.min(parseInt(slides, 10), 7) }).map((_, i) => (
            <div key={i} style={{ width: i === 0 ? 12 : 5, height: 4, borderRadius: 2, background: color.text, opacity: i === 0 ? 0.9 : 0.3 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Form Section ──────────────────────────────────────────────────────────────

function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
        {title}
      </label>
      {children}
    </div>
  );
}
