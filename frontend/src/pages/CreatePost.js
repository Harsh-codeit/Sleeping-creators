import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, LayoutTemplate, Film, ChevronDown, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TONES = ["Educational", "Entertaining", "Inspirational", "Professional", "Casual"];
const SLIDE_COUNTS = ["3", "5", "7", "10"];
const HOOK_STYLES = ["Question", "Bold Claim", "Statistic", "Story / Anecdote", "Challenge"];
const DURATIONS = ["15 seconds", "30 seconds", "60 seconds", "90 seconds"];
const CTAS = ["Follow for more", "Link in bio", "Comment below", "Share this", "Save for later", "Send a DM"];

export default function CreatePost() {
  const [tab, setTab] = useState("carousel");

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#f5f4fb" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #ebe9f6", padding: "18px 20px 0" }}>
        <h1 style={{ fontWeight: 700, fontSize: 18, color: "#111827", marginBottom: 14 }}>Create Post</h1>
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "carousel", label: "Carousel", icon: LayoutTemplate },
            { key: "video",    label: "Video",    icon: Film },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 18px",
                fontSize: 13, fontWeight: 500, background: "none", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${tab === key ? "#5B5BD6" : "transparent"}`,
                color: tab === key ? "#5B5BD6" : "#6b7280",
              }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "20px 16px 40px" }}>
        {tab === "carousel" && <CarouselForm />}
        {tab === "video"    && <VideoForm />}
      </div>
    </div>
  );
}

// ─── Carousel Form ────────────────────────────────────────────────────────────

function CarouselForm() {
  const [templates, setTemplates]       = useState([]);
  const [selectedTpl, setSelectedTpl]   = useState(null);
  const [topic, setTopic]               = useState("");
  const [tone, setTone]                 = useState("");
  const [slides, setSlides]             = useState("5");
  const [audience, setAudience]         = useState("");
  const [keyPoints, setKeyPoints]       = useState("");

  useEffect(() => {
    axios.get(`${API}/templates`).then(r => {
      const list = r.data?.templates || r.data || [];
      setTemplates(list);
    }).catch(() => {});
  }, []);

  const handleGenerate = () => {
    if (!topic.trim()) return toast.error("Enter a topic first");
    if (!selectedTpl)  return toast.error("Select a template");
    toast.success("AI generation coming soon!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Template picker */}
      <Section title="Choose a Template *">
        {templates.length === 0 ? (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse flex-shrink-0"
                style={{ width: 90, aspectRatio: "4/5", background: "#f0edf8", borderRadius: 12, border: "1px solid #ebe9f6" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
            {templates.map(t => {
              const on = selectedTpl === (t.id || t._id);
              return (
                <button key={t.id || t._id} onClick={() => setSelectedTpl(t.id || t._id)}
                  style={{
                    flexShrink: 0, width: 90, aspectRatio: "4/5", borderRadius: 12, overflow: "hidden",
                    border: `2px solid ${on ? "#5B5BD6" : "#ebe9f6"}`,
                    boxShadow: on ? "0 0 0 3px rgba(91,91,214,0.15)" : "none",
                    background: "#f5f4fb", cursor: "pointer", padding: 0, position: "relative",
                  }}>
                  {t.thumbnail_url
                    ? <img src={t.thumbnail_url} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <LayoutTemplate size={18} style={{ color: "#c7d2fe" }} />
                      </div>
                  }
                  {on && (
                    <div style={{ position: "absolute", inset: 0, border: "2px solid #5B5BD6", borderRadius: 10, pointerEvents: "none" }} />
                  )}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "rgba(0,0,0,0.45)" }}>
                    <p style={{ fontSize: 9, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Topic */}
      <Section title="Topic / Subject *">
        <input
          type="text" value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="e.g. 5 productivity tips for entrepreneurs"
          style={inputStyle}
        />
      </Section>

      {/* Tone + Slides row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Tone">
          <SelectField value={tone} onChange={setTone} options={TONES} placeholder="Choose tone" />
        </Section>
        <Section title="Number of Slides">
          <SelectField value={slides} onChange={setSlides} options={SLIDE_COUNTS} />
        </Section>
      </div>

      {/* Target Audience */}
      <Section title="Target Audience">
        <input
          type="text" value={audience} onChange={e => setAudience(e.target.value)}
          placeholder="e.g. Small business owners, students"
          style={inputStyle}
        />
      </Section>

      {/* Key Points */}
      <Section title="Key Points / Notes">
        <textarea
          value={keyPoints} onChange={e => setKeyPoints(e.target.value)}
          placeholder="Any specific points, statistics, or ideas to include…"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </Section>

      <GenerateBtn onClick={handleGenerate} label="Generate Carousel" />
    </div>
  );
}

// ─── Video Form ───────────────────────────────────────────────────────────────

function VideoForm() {
  const [topic, setTopic]         = useState("");
  const [hook, setHook]           = useState("");
  const [duration, setDuration]   = useState("");
  const [tone, setTone]           = useState("");
  const [cta, setCta]             = useState("");
  const [audience, setAudience]   = useState("");
  const [notes, setNotes]         = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [videoTemplates, setVideoTemplates]     = useState([]);
  const [loadingTpls, setLoadingTpls]           = useState(true);

  useEffect(() => {
    axios.get(`${API}/templates`)
      .then(r => {
        const all = r.data?.templates ?? r.data ?? [];
        setVideoTemplates(all.filter(t => t.kind === "video"));
      })
      .catch(() => {})
      .finally(() => setLoadingTpls(false));
  }, []);

  const handleGenerate = () => {
    if (!topic.trim()) return toast.error("Enter a topic first");
    const payload = {
      topic, hook_style: hook, duration, tone, cta, audience, notes,
      template: selectedTemplate || undefined,
    };
    console.log("generate video", payload);
    toast.success("AI generation coming soon!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Video Template Selector */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
          Select Video Template <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
        </label>
        {loadingTpls ? (
          <div style={{ height: 60, borderRadius: 14, background: "#fff", border: "1.5px solid #e5e4f0", display: "flex", alignItems: "center", paddingLeft: 16 }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Loading templates…</span>
          </div>
        ) : videoTemplates.length === 0 ? (
          <div style={{ padding: "12px 16px", borderRadius: 14, background: "#fff", border: "1.5px dashed #e5e4f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>No video templates yet</span>
            <a href="/templates?tab=video" style={{ fontSize: 11, fontWeight: 600, color: "#5B5BD6", textDecoration: "none" }}>Create one →</a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* "No template" option */}
            <button onClick={() => setSelectedTemplate(null)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12,
              border: `1.5px solid ${!selectedTemplate ? "#5B5BD6" : "#e5e4f0"}`,
              background: !selectedTemplate ? "#EEF0FF" : "#fff", cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${!selectedTemplate ? "#5B5BD6" : "#d1d5db"}`, background: !selectedTemplate ? "#5B5BD6" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {!selectedTemplate && <Check size={9} style={{ color: "#fff" }} />}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: !selectedTemplate ? "#5B5BD6" : "#6b7280" }}>No template — custom brief only</span>
            </button>
            {videoTemplates.map(t => {
              const sel = selectedTemplate?.id === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedTemplate(sel ? null : t)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                  border: `1.5px solid ${sel ? "#5B5BD6" : "#e5e4f0"}`,
                  background: sel ? "#EEF0FF" : "#fff", cursor: "pointer", textAlign: "left",
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel ? "#5B5BD6" : "#d1d5db"}`, background: sel ? "#5B5BD6" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {sel && <Check size={9} style={{ color: "#fff" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? "#5B5BD6" : "#111827", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{t.name}</div>
                    {(t.category || t.number_of_scenes || t.video_flow) && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {[t.category, t.number_of_scenes && `${t.number_of_scenes} scenes`, t.video_flow].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <Film size={13} style={{ color: sel ? "#5B5BD6" : "#d1d5db", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Section title="Topic / Subject *">
        <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="e.g. How I grew my Instagram in 30 days"
          style={inputStyle} />
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Hook Style">
          <SelectField value={hook} onChange={setHook} options={HOOK_STYLES} placeholder="Choose hook" />
        </Section>
        <Section title="Duration">
          <SelectField value={duration} onChange={setDuration} options={DURATIONS} placeholder="Choose length" />
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Tone">
          <SelectField value={tone} onChange={setTone} options={TONES} placeholder="Choose tone" />
        </Section>
        <Section title="Call to Action">
          <SelectField value={cta} onChange={setCta} options={CTAS} placeholder="Choose CTA" />
        </Section>
      </div>

      <Section title="Target Audience">
        <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
          placeholder="e.g. Fitness enthusiasts, 18–30" style={inputStyle} />
      </Section>

      <Section title="Additional Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any specific ideas, references, or style notes…"
          rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
      </Section>

      <GenerateBtn onClick={handleGenerate} label="Generate Video Script" />
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 14,
  color: "#111827", background: "transparent", outline: "none", border: "none",
  fontFamily: "inherit",
};

function Section({ title, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{title}</label>
      <div style={{ background: "#fff", border: "1.5px solid #e5e4f0", borderRadius: 14, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer", color: value ? "#111827" : "#9ca3af" }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
    </div>
  );
}

function GenerateBtn({ onClick, label }) {
  return (
    <button onClick={onClick}
      style={{
        width: "100%", padding: "15px 0", fontWeight: 700, fontSize: 15, borderRadius: 16,
        color: "#fff", background: "#5B5BD6", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: "0 4px 16px rgba(91,91,214,0.3)", marginTop: 4,
      }}>
      <Sparkles size={16} /> {label}
    </button>
  );
}
