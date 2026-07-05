import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Save, Check } from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES    = ["Education", "Technology", "Business", "Marketing", "Finance", "Product Showcase", "Motivation", "Custom"];
const SCENE_COUNTS  = ["3", "5", "7", "10"];
const VIDEO_FLOWS   = [
  "Hook → Content → CTA",
  "Hook → Problem → Solution → CTA",
  "Hook → Tips → CTA",
  "Hook → Steps → CTA",
  "Custom",
];
const VISUAL_STYLES = ["Modern", "Professional", "Minimal", "Corporate", "Creative"];
const THEMES        = ["Light", "Dark", "Blue", "Green", "Custom"];

export default function VideoTemplateBuilder() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const user      = useUser();
  const isNew     = !id;

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]       = useState("Education");
  const [scenes, setScenes]           = useState("5");
  const [videoFlow, setVideoFlow]     = useState("Hook → Content → CTA");
  const [contentConfig, setContentConfig] = useState({
    headline: true, scene_titles: true, scene_descriptions: true,
    voiceover: true, hashtags: true, cta: true,
  });
  const [visualStyle, setVisualStyle]   = useState("Modern");
  const [theme, setTheme]               = useState("Light");
  const [primaryColor, setPrimaryColor]     = useState("#5B5BD6");
  const [secondaryColor, setSecondaryColor] = useState("#ffffff");
  const [maxHeadlineLength, setMaxHeadlineLength] = useState(80);
  const [maxDescLength, setMaxDescLength]         = useState(200);
  const [showCTA, setShowCTA]           = useState(true);
  const [ctaText, setCtaText]           = useState("Follow for more content");
  const [generateCover, setGenerateCover] = useState(true);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!id) return;
    axios.get(`${API}/templates/${id}`).then(r => {
      const t = r.data;
      setName(t.name || "");
      setDescription(t.description || "");
      setCategory(t.category || "Education");
      setScenes(String(t.number_of_scenes || 5));
      setVideoFlow(t.video_flow || "Hook → Content → CTA");
      if (t.content_config) setContentConfig(t.content_config);
      setVisualStyle(t.visual_style || "Modern");
      setTheme(t.theme || "Light");
      setPrimaryColor(t.primary_color || "#5B5BD6");
      setSecondaryColor(t.secondary_color || "#ffffff");
      setMaxHeadlineLength(t.max_headline_length || 80);
      setMaxDescLength(t.max_description_length || 200);
      setShowCTA(t.show_cta ?? true);
      setCtaText(t.cta_text || "Follow for more content");
      setGenerateCover(t.generate_cover ?? true);
    }).catch(() => { toast.error("Failed to load template"); navigate("/templates?tab=video"); });
  }, [id, navigate]);

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    category,
    kind: "video",
    number_of_scenes: parseInt(scenes, 10),
    video_flow: videoFlow,
    content_config: contentConfig,
    visual_style: visualStyle,
    theme,
    primary_color:   theme === "Custom" ? primaryColor   : undefined,
    secondary_color: theme === "Custom" ? secondaryColor : undefined,
    max_headline_length: maxHeadlineLength,
    max_description_length: maxDescLength,
    generate_cover: generateCover,
    show_cta: showCTA,
    cta_text: showCTA ? ctaText : undefined,
    scope: "user",
    client_id: user?.client_id || null,
    canvas: { width: 1080, height: 1920 },
    elements: [],
  });

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    setSaving(true);
    try {
      if (isNew) {
        await axios.post(`${API}/templates`, buildPayload());
        toast.success("Video template created!");
      } else {
        await axios.put(`${API}/templates/${id}`, buildPayload());
        toast.success("Template updated!");
      }
      navigate("/templates?tab=video");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleConfig = key => setContentConfig(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ minHeight: "100dvh", background: "#0d0d0d", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10, flexShrink: 0 }}>
        <button onClick={() => navigate("/templates?tab=video")} style={hdrBtn}>
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Template name (required)"
          style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#ffffff", background: "transparent", border: "none", outline: "none", minWidth: 0 }}
        />
        <button onClick={handleSave} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", fontSize: 12, fontWeight: 700, borderRadius: 10, border: "none", background: "#5B5BD6", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, boxShadow: "0 2px 8px rgba(91,91,214,0.25)", flexShrink: 0 }}>
          <Save size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Basic Information */}
          <VCard title="Basic Information">
            <VField label="Description">
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What is this template for?" rows={2}
                style={{ ...vinput, resize: "vertical", lineHeight: 1.6 }} />
            </VField>
            <VField label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...vinput, appearance: "none", cursor: "pointer" }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </VField>
          </VCard>

          {/* Video Structure */}
          <VCard title="Video Structure">
            <VField label="Number of Scenes">
              <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
                {SCENE_COUNTS.map(n => (
                  <button key={n} onClick={() => setScenes(n)} style={{
                    width: 52, height: 40, borderRadius: 10, fontSize: 14, fontWeight: 600,
                    border: `1.5px solid ${scenes === n ? "#5B5BD6" : "#2a2a2a"}`,
                    background: scenes === n ? "#5B5BD6" : "#161616",
                    color: scenes === n ? "#fff" : "#cccccc",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{n}</button>
                ))}
              </div>
            </VField>
            <VField label="Video Flow">
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {VIDEO_FLOWS.map((f, i) => (
                  <button key={f} onClick={() => setVideoFlow(f)} style={{
                    padding: "11px 14px", textAlign: "left", fontSize: 13,
                    background: videoFlow === f ? "#1e1e3a" : "#161616",
                    color: videoFlow === f ? "#8080ff" : "#cccccc",
                    fontWeight: videoFlow === f ? 600 : 400,
                    border: "none", borderBottom: i < VIDEO_FLOWS.length - 1 ? "1px solid #1e1e1e" : "none",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    {f}
                    {videoFlow === f && <Check size={13} style={{ color: "#5B5BD6" }} />}
                  </button>
                ))}
              </div>
            </VField>
          </VCard>

          {/* Content Configuration */}
          <VCard title="Content Configuration">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { key: "headline",           label: "Generate Headline" },
                { key: "scene_titles",       label: "Scene Titles" },
                { key: "scene_descriptions", label: "Scene Descriptions" },
                { key: "voiceover",          label: "Voiceover Script" },
                { key: "cta",                label: "Generate CTA" },
                { key: "hashtags",           label: "Generate Hashtags" },
              ].map(({ key, label }) => {
                const on = contentConfig[key];
                return (
                  <button key={key} onClick={() => toggleConfig(key)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                    border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`,
                    background: on ? "#1e1e3a" : "#161616", cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? "#5B5BD6" : "#444444"}`, background: on ? "#5B5BD6" : "#161616", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {on && <Check size={10} style={{ color: "#fff" }} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: on ? "#8080ff" : "#cccccc", textAlign: "left" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </VCard>

          {/* Visual Style */}
          <VCard title="Visual Style">
            <VField label="Style">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 14px" }}>
                {VISUAL_STYLES.map(s => (
                  <button key={s} onClick={() => setVisualStyle(s)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${visualStyle === s ? "#5B5BD6" : "#2a2a2a"}`,
                    background: visualStyle === s ? "#5B5BD6" : "#161616",
                    color: visualStyle === s ? "#fff" : "#cccccc",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{s}</button>
                ))}
              </div>
            </VField>
            <VField label="Theme">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 14px" }}>
                {THEMES.map(t => (
                  <button key={t} onClick={() => setTheme(t)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${theme === t ? "#5B5BD6" : "#2a2a2a"}`,
                    background: theme === t ? "#5B5BD6" : "#161616",
                    color: theme === t ? "#fff" : "#cccccc",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{t}</button>
                ))}
              </div>
            </VField>
            {theme === "Custom" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <VField label="Primary Color">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", padding: 2, background: "transparent" }} />
                    <span style={{ fontSize: 12, color: "#cccccc", fontFamily: "monospace" }}>{primaryColor}</span>
                  </div>
                </VField>
                <VField label="Secondary Color">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
                    <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", padding: 2, background: "transparent" }} />
                    <span style={{ fontSize: 12, color: "#cccccc", fontFamily: "monospace" }}>{secondaryColor}</span>
                  </div>
                </VField>
              </div>
            )}
          </VCard>

          {/* Content Limits */}
          <VCard title="Content Limits">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <VField label="Max Headline (chars)">
                <input type="number" value={maxHeadlineLength}
                  onChange={e => setMaxHeadlineLength(parseInt(e.target.value) || 80)}
                  min={20} max={200} style={{ ...vinput }} />
              </VField>
              <VField label="Max Scene Desc (chars)">
                <input type="number" value={maxDescLength}
                  onChange={e => setMaxDescLength(parseInt(e.target.value) || 200)}
                  min={50} max={500} style={{ ...vinput }} />
              </VField>
            </div>
          </VCard>

          {/* CTA Settings */}
          <VCard title="CTA Settings">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>Show CTA Scene</div>
                <div style={{ fontSize: 11, color: "#666666", marginTop: 2 }}>Add a call-to-action slide at the end</div>
              </div>
              <VToggle checked={showCTA} onChange={setShowCTA} />
            </div>
            {showCTA && (
              <div style={{ marginTop: 12 }}>
                <VField label="CTA Text">
                  <input value={ctaText} onChange={e => setCtaText(e.target.value)}
                    placeholder="e.g. Follow for more content"
                    style={{ ...vinput }} />
                </VField>
              </div>
            )}
          </VCard>

          {/* Cover Settings */}
          <VCard title="Cover Settings">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>Generate Cover Scene</div>
                <div style={{ fontSize: 11, color: "#666666", marginTop: 2 }}>Create an intro/cover slide for the video</div>
              </div>
              <VToggle checked={generateCover} onChange={setGenerateCover} />
            </div>
          </VCard>

          {/* Save */}
          <button onClick={handleSave} disabled={saving} style={{
            width: "100%", padding: "15px 0", fontSize: 14, fontWeight: 700, borderRadius: 14,
            border: "none", background: "#5B5BD6", color: "#fff",
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
            boxShadow: "0 4px 16px rgba(91,91,214,0.3)",
          }}>
            {saving ? "Saving…" : isNew ? "Create Template" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

const vinput = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 13,
  color: "#ffffff", background: "transparent", border: "none", outline: "none", fontFamily: "inherit",
};

const hdrBtn = {
  width: 36, height: 36, borderRadius: 10, border: "1.5px solid #2a2a2a",
  background: "#161616", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "#888888", flexShrink: 0,
};

function VCard({ title, children }) {
  return (
    <div style={{ background: "#161616", borderRadius: 16, border: "1.5px solid #2a2a2a", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#cccccc", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</div>
      {children}
    </div>
  );
}

function VField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#888888", marginBottom: 6 }}>{label}</div>
      <div style={{ background: "#1a1a1a", border: "1.5px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
        {children}
      </div>
    </div>
  );
}

function VToggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
      background: checked ? "#5B5BD6" : "#2a2a2a", position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: checked ? 23 : 3, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}
