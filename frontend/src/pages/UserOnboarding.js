import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, Plus, X, Instagram,
  Rocket, Globe, Linkedin, Youtube, Twitter, Phone,
} from "lucide-react";
import logo from "../assets/logo.png";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function authHeaders() {
  const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Option lists ──────────────────────────────────────────────────────────────

const EMOTIONAL_STATES = ["Ambitious","Overwhelmed","Confused","Motivated","Stuck","Frustrated","Burned Out","Anxious"];
const TOPICS_LOVE = ["Mindset & Psychology","Business Strategy","Social Media Growth","Sales & Marketing","Personal Finance","Health & Wellness","Relationships","Productivity & Habits","Leadership","Content Creation","Brand Building","Entrepreneurship","Investing","Fitness","Spiritual Growth"];
const SOLUTIONS = ["Social Media Growth","Personal Branding","Content Creation","Financial Freedom","Passive Income","Confidence & Mindset","Business Scaling","Productivity","Public Speaking","Sales & Marketing","Leadership Skills","Community Building"];
const USPS = ["Proven Track Record","Simplified Approach","No Fluff, Just Results","Step-by-Step System","Personal Attention","From the Same Background","Affordable Pricing","Holistic Method","Cultural Understanding","Fast Results","Done-With-You Model","Real-Life Experience","Industry Insider","24/7 Support","Unique Framework"];
const FAQ_OPTIONS = ["How do I get started?","How much does it cost?","How long will it take?","Do I need experience?","What results can I expect?","Is this right for me?","What makes you different?","Do you offer refunds?","How much time do I need?","Can I do this part-time?","Will you work with me 1-on-1?","Do you have testimonials?"];
const LANGUAGES = ["English","हिन्दी","Hinglish","தமிழ்","తెలుగు","ಕನ್ನಡ","മലയാളം","मराठी","ગુજરાતી","বাংলা","ਪੰਜਾਬੀ","اردو","العربية","Español","Français","Português","Deutsch","Bahasa Indonesia","Bahasa Melayu","Other"];
const AVOID_PREFIXES = ["I will never post about","I refuse to","I won't create content that","I avoid","I don't do"];
const GOALS = [
  { key: "leads",      label: "Get More Leads",           icon: "🎯" },
  { key: "reach",      label: "Grow Reach & Awareness",   icon: "📡" },
  { key: "followers",  label: "Grow Followers",           icon: "👥" },
  { key: "visibility", label: "Visibility and Influence", icon: "✨" },
];
const CTAS = [
  { key: "dm",     label: "DM Me" },
  { key: "link",   label: "Visit Link" },
  { key: "book",   label: "Book Call" },
  { key: "enrol",  label: "Enrol Now" },
  { key: "other",  label: "Other" },
];
const BRAND_VOICES = [
  { key: "blunt",        label: "Blunt & Raw",    desc: "Direct, no fluff, tells it like it is" },
  { key: "motivational", label: "Motivational",   desc: "Inspiring, energetic, pushes forward" },
  { key: "educational",  label: "Educational",    desc: "Breaks things down, teaches clearly" },
  { key: "storytelling", label: "Storytelling",   desc: "Narrative-first, personal journeys" },
  { key: "humorous",     label: "Humorous",       desc: "Wit and relatability over everything" },
];
const SPICE_LABELS = ["","Safe","Balanced","Honest","Bold","Controversial"];

// ── Shared UI components ──────────────────────────────────────────────────────

function SLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function SInput({ label, value, onChange, placeholder, type = "text", required, hint, icon: Icon }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <SLabel>{label}{required && <span style={{ color: "#5B5BD6" }}> *</span>}</SLabel>}
      {hint && <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      <div style={{ display: "flex", alignItems: "center", background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 12, overflow: "hidden" }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
        {Icon && <div style={{ padding: "0 0 0 14px", color: "#555", flexShrink: 0 }}><Icon size={15} /></div>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "13px 14px", fontSize: 14, color: "#fff", fontFamily: "inherit" }} />
      </div>
    </div>
  );
}

function STextArea({ label, value, onChange, placeholder, rows = 4, hint, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <SLabel>{label}{required && <span style={{ color: "#5B5BD6" }}> *</span>}</SLabel>}
      {hint && <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: "100%", boxSizing: "border-box", background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "13px 14px", fontSize: 14, color: "#fff", fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6 }}
        onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
        onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"}
      />
    </div>
  );
}

function ChipMultiSelect({ label, hint, options, value, onChange, allowCustom = true, max }) {
  const [custom, setCustom] = useState("");
  const toggle = item => {
    if (value.includes(item)) {
      onChange(value.filter(v => v !== item));
    } else {
      if (max && value.length >= max) return;
      onChange([...value, item]);
    }
  };
  const addCustom = () => {
    const t = custom.trim();
    if (!t || value.includes(t)) return;
    if (max && value.length >= max) return;
    onChange([...value, t]);
    setCustom("");
  };
  return (
    <div style={{ marginBottom: 18 }}>
      {label && <SLabel>{label}{max && <span style={{ color: "#555", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> (pick up to {max})</span>}</SLabel>}
      {hint && <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: allowCustom ? 10 : 0 }}>
        {options.map(opt => {
          const on = value.includes(opt);
          return (
            <button key={opt} onClick={() => toggle(opt)}
              style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`, background: on ? "#1e1e3a" : "#1e1e1e", color: on ? "#8080ff" : "#aaa", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}>
              {on && <Check size={10} style={{ color: "#8080ff" }} />} {opt}
            </button>
          );
        })}
        {value.filter(v => !options.includes(v)).map(v => (
          <button key={v} onClick={() => toggle(v)}
            style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1.5px solid #5B5BD6", background: "#1e1e3a", color: "#8080ff", display: "flex", alignItems: "center", gap: 5 }}>
            <Check size={10} /> {v}
            <X size={10} style={{ marginLeft: 2 }} />
          </button>
        ))}
      </div>
      {allowCustom && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Add your own…"
            onKeyDown={e => e.key === "Enter" && addCustom()}
            style={{ flex: 1, background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }}
            onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
            onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
          <button onClick={addCustom}
            style={{ width: 40, height: 40, borderRadius: 10, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function TagInput({ label, hint, value, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput("");
  };
  return (
    <div style={{ marginBottom: 18 }}>
      {label && <SLabel>{label}</SLabel>}
      {hint && <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {value.map(v => (
            <div key={v} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "#2a0a0a", border: "1px solid #7f1d1d", fontSize: 12, color: "#ef4444" }}>
              {v}
              <button onClick={() => onChange(value.filter(x => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, display: "flex" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder || "Type and press +"}
          onKeyDown={e => e.key === "Enter" && add()}
          style={{ flex: 1, background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }}
          onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
          onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
        <button onClick={add}
          style={{ width: 40, height: 40, borderRadius: 10, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" }}>
      <span style={{ fontSize: 14, color: "#ccc" }}>{label}</span>
      <button onClick={() => onChange(!value)}
        style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: value ? "#5B5BD6" : "#2a2a2a", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
      </button>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function StepHeading({ step, total, title, desc }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#5B5BD6", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 8px" }}>
        Section {step} of {total}
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{title}</h1>
      {desc && <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>{desc}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

export default function UserOnboarding() {
  const navigate    = useNavigate();
  const user        = useUser();
  const refreshUser = user?.refreshUser;
  const clientId    = user?.client_id;

  const [step, setStep]           = useState(1);
  const [igConnected, setIg]      = useState(false);
  const [igLoading, setIgLoading] = useState(false);
  const [saving, setSaving]       = useState(false);

  // ── Form state (all sections) ──────────────────────────────────────────────
  const [form, setForm] = useState({
    // S1
    profile_name: "", whatsapp_number: "", city_country: "",
    instagram_username: "", instagram_profile_url: "",
    website_url: "", linkedin_url: "", youtube_url: "", twitter_url: "",
    // S2
    business_description: "", niche_statement: "", target_audience: "",
    audience_age_min: 18, audience_age_max: 45,
    audience_emotional_states: [], has_case_studies: false,
    topics_love: [], solutions_provided: [], unique_selling_points: [], faqs: [],
    brand_voice: "", spice_level: 3,
    // S3
    content_language: "English", content_dislikes: [],
    topics_to_avoid: ["", "", "", "", ""],
    underserved_topics: ["", "", "", "", ""],
    competitors: ["", "", "", "", "", "", "", ""],
    // S4
    primary_goal: "", content_cta: "", landing_page_url: "",
  });

  const upd = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const updArr = (key, idx, val) => setForm(f => {
    const arr = [...f[key]];
    arr[idx] = val;
    return { ...f, [key]: arr };
  });

  // Pre-fill from existing user context
  useEffect(() => {
    if (user?.name) setForm(f => ({ ...f, profile_name: f.profile_name || user.name }));
    if (user?.email) setForm(f => ({ ...f, instagram_profile_url: f.instagram_profile_url }));
  }, [user?.name, user?.email]);

  // Check Instagram connection
  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/instagram/status/${clientId}`)
      .then(r => setIg(r.data?.connected ?? false)).catch(() => {});
  }, [clientId]);

  // ── Section save (auto-save on advance) ───────────────────────────────────
  const saveSection = async (fields) => {
    const payload = {};
    fields.forEach(k => { payload[k] = form[k]; });
    // Clean up competitors and array fields
    if (fields.includes("competitors")) {
      payload.competitors = form.competitors.filter(c => c.trim()).map(c => c.replace(/^@/, ""));
    }
    if (fields.includes("topics_to_avoid")) {
      payload.topics_to_avoid = form.topics_to_avoid.filter(t => t.trim());
    }
    if (fields.includes("underserved_topics")) {
      payload.underserved_topics = form.underserved_topics.filter(t => t.trim());
    }
    try {
      await axios.put(`${API}/auth/profile`, payload, { headers: authHeaders() });
    } catch { /* non-fatal — continue even if save fails */ }
  };

  // ── Validation per step ───────────────────────────────────────────────────
  const validate = () => {
    if (step === 1) {
      if (!form.city_country.trim()) { toast.error("Enter your city & country"); return false; }
      if (!form.instagram_username.trim()) { toast.error("Enter your Instagram username"); return false; }
      if (!form.instagram_profile_url.trim()) { toast.error("Enter your Instagram profile URL"); return false; }
    }
    if (step === 2) {
      if (!form.target_audience.trim()) { toast.error("Describe your target audience"); return false; }
      if (!form.niche_statement.trim()) { toast.error("Enter your one-line niche statement"); return false; }
      if (form.solutions_provided.length === 0) { toast.error("Add at least one solution you provide"); return false; }
    }
    if (step === 3) {
      if (!form.content_language) { toast.error("Pick your content language"); return false; }
    }
    if (step === 4) {
      if (!form.primary_goal) { toast.error("Pick your primary Instagram goal"); return false; }
      if (!form.content_cta) { toast.error("Pick your preferred CTA"); return false; }
    }
    return true;
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!validate()) return;
    setSaving(true);

    const sectionFields = {
      1: ["profile_name","whatsapp_number","city_country","instagram_username","instagram_profile_url","website_url","linkedin_url","youtube_url","twitter_url"],
      2: ["business_description","niche_statement","target_audience","audience_age_min","audience_age_max","audience_emotional_states","has_case_studies","topics_love","solutions_provided","unique_selling_points","faqs","brand_voice","spice_level"],
      3: ["content_language","content_dislikes","topics_to_avoid","underserved_topics","competitors"],
      4: ["primary_goal","content_cta","landing_page_url"],
    };

    if (sectionFields[step]) await saveSection(sectionFields[step]);
    setSaving(false);

    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else handleFinish();
  };

  const handleBack = () => { if (step > 1) setStep(s => s - 1); };

  const handleConnectInstagram = async () => {
    if (!clientId) return toast.error("User not loaded yet");
    setIgLoading(true);
    try {
      const res = await axios.get(`${API}/bundle/connect/${clientId}`, { headers: authHeaders() });
      if (res.data?.already_connected) {
        setIg(true); setIgLoading(false); return;
      }
      // Open without noopener so the popup can postMessage back to window.opener
      window.open(res.data.url, "bundle_connect", "width=520,height=720,noopener=no");

      // Primary: postMessage from BundleConnected popup
      const onMessage = async (e) => {
        if (e.data?.type !== "BUNDLE_AUTH") return;
        window.removeEventListener("message", onMessage);
        window.removeEventListener("sc:app-resume", onResume);
        clearTimeout(fallback);
        const s = await axios.get(`${API}/instagram/status/${clientId}`).catch(() => ({ data: {} }));
        setIg(s.data?.connected ?? false);
        setIgLoading(false);
      };
      // Native app resume (Capacitor: user returns from system browser)
      const onResume = async () => {
        window.removeEventListener("message", onMessage);
        window.removeEventListener("sc:app-resume", onResume);
        clearTimeout(fallback);
        const s = await axios.get(`${API}/instagram/status/${clientId}`).catch(() => ({ data: {} }));
        setIg(s.data?.connected ?? false);
        setIgLoading(false);
      };
      // Fallback: poll after 90s if neither signal fires (user took very long / closed popup)
      const fallback = setTimeout(async () => {
        window.removeEventListener("message", onMessage);
        window.removeEventListener("sc:app-resume", onResume);
        const s = await axios.get(`${API}/instagram/status/${clientId}`).catch(() => ({ data: {} }));
        setIg(s.data?.connected ?? false);
        setIgLoading(false);
      }, 90000);

      window.addEventListener("message", onMessage);
      window.addEventListener("sc:app-resume", onResume);
    } catch {
      toast.error("Could not generate connect link — connect later in Settings");
      setIgLoading(false);
    }
  };

  const handleFinish = async () => {
    try { await axios.post(`${API}/auth/onboarding-complete`, {}, { headers: authHeaders() }); } catch {}
    if (refreshUser) await refreshUser();
    navigate("/");
  };

  const continueLabel =
    saving ? "Saving…" :
    step === TOTAL_STEPS && igConnected ? "Go to Dashboard" :
    step === TOTAL_STEPS ? "Skip & Go to Dashboard" :
    "Continue";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0d0d0d", overflow: "hidden" }}>

      {/* Header */}
      <header style={{ background: "#111111", borderBottom: "1px solid #222", flexShrink: 0 }}>
        <div style={{ height: "env(safe-area-inset-top)" }} />
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={logo} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: "#7c7cf8" }}>Sleeping Creators</span>
          </div>
          {/* 5-dot progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{
                height: 6,
                width: step > i + 1 ? 20 : step === i + 1 ? 28 : 16,
                borderRadius: 3,
                background: step > i + 1 ? "#5B5BD6" : step === i + 1 ? "#8080ff" : "#2a2a2a",
                transition: "all 0.3s",
              }} />
            ))}
          </div>
          <button onClick={handleFinish}
            style={{ fontSize: 12, color: "#444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
            Skip <X size={11} />
          </button>
        </div>
      </header>

      {/* Thin progress bar */}
      <div style={{ height: 3, background: "#1a1a1a", flexShrink: 0 }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg, #5B5BD6, #8080ff)", width: `${(step / TOTAL_STEPS) * 100}%`, transition: "width 0.4s ease" }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "28px 18px 24px", maxWidth: 560, margin: "0 auto" }}>

          {/* ── STEP 1: Basic Info ── */}
          {step === 1 && (
            <div>
              <StepHeading step={1} total={TOTAL_STEPS} title="Basic Info & Access" desc="Tell us who you are and where to find you." />

              <SInput label="Profile Name" value={form.profile_name} onChange={v => upd("profile_name", v)} placeholder="How you want to be known" />

              <SInput label="WhatsApp Number" value={form.whatsapp_number} onChange={v => upd("whatsapp_number", v)} placeholder="+91 98765 43210" type="tel" icon={Phone} />

              <SInput label="City & Country" required value={form.city_country} onChange={v => upd("city_country", v)} placeholder="e.g. Mumbai, India" />

              <div style={{ height: 1, background: "#1e1e1e", margin: "8px 0 20px" }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Instagram Access</p>

              <SInput label="Instagram Username" required value={form.instagram_username} onChange={v => upd("instagram_username", v.replace(/^@/, ""))} placeholder="yourhandle (without @)" icon={Instagram} />

              <SInput label="Instagram Profile URL" required value={form.instagram_profile_url} onChange={v => upd("instagram_profile_url", v)} placeholder="https://www.instagram.com/yourhandle/" icon={Globe} />

              <div style={{ height: 1, background: "#1e1e1e", margin: "8px 0 20px" }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Other Links <span style={{ fontSize: 12, fontWeight: 400, color: "#555" }}>(optional)</span></p>

              <SInput label="Website URL" value={form.website_url} onChange={v => upd("website_url", v)} placeholder="https://yourwebsite.com or NA" icon={Globe} />
              <SInput label="LinkedIn Profile" value={form.linkedin_url} onChange={v => upd("linkedin_url", v)} placeholder="Paste link or NA" icon={Linkedin} />
              <SInput label="YouTube Channel" value={form.youtube_url} onChange={v => upd("youtube_url", v)} placeholder="Paste link or NA" icon={Youtube} />
              <SInput label="Twitter / X" value={form.twitter_url} onChange={v => upd("twitter_url", v)} placeholder="Paste link or NA" icon={Twitter} />
            </div>
          )}

          {/* ── STEP 2: Story, Brand & Audience ── */}
          {step === 2 && (
            <div>
              <StepHeading step={2} total={TOTAL_STEPS} title="Story, Brand & Audience" desc="Help the AI understand your world and who you serve." />

              <STextArea label="About Your Business" value={form.business_description} onChange={v => upd("business_description", v)} rows={5}
                hint="What do you do? How do you help people? What is your process or system? (100+ words recommended)"
                placeholder="I help corporate professionals transition into freelancing by giving them a proven 90-day system to land their first 3 clients without leaving their job..." />

              <SInput label="Your One-Line Niche Statement / Designation" required value={form.niche_statement} onChange={v => upd("niche_statement", v)}
                placeholder="I help [audience] [achieve outcome]"
                hint='Suggested: "I help [specific audience] [achieve outcome]" — max 6 words' />

              <div style={{ height: 1, background: "#1e1e1e", margin: "4px 0 20px" }} />

              <STextArea label="Who is your Target Audience?" required value={form.target_audience} onChange={v => upd("target_audience", v)} rows={2}
                placeholder="e.g. Corporate employees, freelancers, coaches" />

              {/* Age Range */}
              <div style={{ marginBottom: 20 }}>
                <SLabel>Audience Age Range <span style={{ color: "#5B5BD6" }}>*</span></SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>
                  Choose wider to get more views (at least a 30-year range, e.g. 16–55).
                </div>
                <div style={{ background: "#1e1e1e", borderRadius: 16, padding: "20px 20px 16px", border: "1px solid #2a2a2a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{form.audience_age_min}</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                        {form.audience_age_min < 22 ? "Gen Z" : form.audience_age_min < 30 ? "Young Adult" : "Millennial"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", color: "#444", fontSize: 20 }}>—</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{form.audience_age_max}</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                        {form.audience_age_max < 30 ? "Gen Z" : form.audience_age_max < 45 ? "Millennial" : form.audience_age_max < 60 ? "Gen X" : "Boomer"}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <input type="range" min={13} max={65} step={1} value={form.audience_age_min}
                      onChange={e => { const v = Math.min(parseInt(e.target.value), form.audience_age_max - 5); upd("audience_age_min", v); }}
                      style={{ width: "100%", accentColor: "#5B5BD6" }} />
                  </div>
                  <input type="range" min={13} max={65} step={1} value={form.audience_age_max}
                    onChange={e => { const v = Math.max(parseInt(e.target.value), form.audience_age_min + 5); upd("audience_age_max", v); }}
                    style={{ width: "100%", accentColor: "#5B5BD6" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 4 }}>
                    <span>Min</span><span>Max</span>
                  </div>
                </div>
              </div>

              <ChipMultiSelect label="Audience Emotional State" options={EMOTIONAL_STATES} value={form.audience_emotional_states}
                onChange={v => upd("audience_emotional_states", v)} max={2} allowCustom={false} />

              <div style={{ marginBottom: 20, padding: "14px 16px", background: "#1e1e1e", borderRadius: 14, border: "1px solid #2a2a2a" }}>
                <Toggle label="Do you have Client Case Studies or Results?" value={form.has_case_studies} onChange={v => upd("has_case_studies", v)} />
              </div>

              <ChipMultiSelect label="Topics I Love to Talk About" options={TOPICS_LOVE} value={form.topics_love}
                onChange={v => upd("topics_love", v)} />

              <ChipMultiSelect label="Solutions I Provide" required options={SOLUTIONS} value={form.solutions_provided}
                onChange={v => upd("solutions_provided", v)} />

              <ChipMultiSelect label="My Unique Selling Points" options={USPS} value={form.unique_selling_points}
                onChange={v => upd("unique_selling_points", v)} />

              <ChipMultiSelect label="Frequently Asked Questions" hint="What does your audience ask most?" options={FAQ_OPTIONS} value={form.faqs}
                onChange={v => upd("faqs", v)} />

              <div style={{ height: 1, background: "#1e1e1e", margin: "8px 0 20px" }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Your Communication Style</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {BRAND_VOICES.map(v => (
                  <button key={v.key} onClick={() => upd("brand_voice", v.key)}
                    style={{ padding: "12px 14px", borderRadius: 12, textAlign: "left", cursor: "pointer", border: `1.5px solid ${form.brand_voice === v.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.brand_voice === v.key ? "#1e1e3a" : "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.brand_voice === v.key ? "#fff" : "#ccc" }}>{v.label}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{v.desc}</div>
                    </div>
                    {form.brand_voice === v.key && <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={11} style={{ color: "#fff" }} /></div>}
                  </button>
                ))}
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <SLabel>Content Boldness</SLabel>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#5B5BD6" }}>{SPICE_LABELS[form.spice_level]}</span>
                </div>
                <input type="range" min={1} max={5} step={1} value={form.spice_level}
                  onChange={e => upd("spice_level", parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "#5B5BD6" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 4 }}>
                  <span>Safe & Neutral</span><span>Controversial</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Content Strategy ── */}
          {step === 3 && (
            <div>
              <StepHeading step={3} total={TOTAL_STEPS} title="Content Strategy & Direction" desc="Define your content boundaries and competitive landscape." />

              {/* Language */}
              <div style={{ marginBottom: 20 }}>
                <SLabel>Language of Content <span style={{ color: "#5B5BD6" }}>*</span></SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>The primary language you communicate in with your audience</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LANGUAGES.map(lang => (
                    <button key={lang} onClick={() => upd("content_language", lang)}
                      style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: `1.5px solid ${form.content_language === lang ? "#5B5BD6" : "#2a2a2a"}`, background: form.content_language === lang ? "#1e1e3a" : "#1e1e1e", color: form.content_language === lang ? "#8080ff" : "#aaa", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <TagInput label="Content I Personally Dislike"
                hint="Formats, topics, tones or styles you'd never want associated with your brand. Add one at a time."
                value={form.content_dislikes} onChange={v => upd("content_dislikes", v)}
                placeholder="e.g. Aggressive selling, clickbait hooks…" />

              {/* Topics to avoid */}
              <div style={{ marginBottom: 20 }}>
                <SLabel>Topics to AVOID in Your Content</SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Complete each prompt</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {AVOID_PREFIXES.map((prefix, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", flexShrink: 0, minWidth: 100 }}>{prefix}</span>
                      <input value={form.topics_to_avoid[i]} onChange={e => updArr("topics_to_avoid", i, e.target.value)}
                        placeholder="…"
                        style={{ flex: 1, background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }}
                        onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                        onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Underserved topics */}
              <div style={{ marginBottom: 20 }}>
                <SLabel>Underserved Topics in Your Niche</SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>What gaps do you see? What is nobody talking about that your audience needs?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[0,1,2,3,4].map(i => (
                    <input key={i} value={form.underserved_topics[i]} onChange={e => updArr("underserved_topics", i, e.target.value)}
                      placeholder={i === 0 ? "e.g. Practical daily habits for beginners" : `Topic ${i + 1}`}
                      style={{ background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }}
                      onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                      onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
                  ))}
                </div>
              </div>

              {/* Competitor accounts */}
              <div style={{ marginBottom: 20 }}>
                <SLabel>8 Best Active Accounts in Your Niche</SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Instagram usernames only. Pick accounts posting daily and getting good reach.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[0,1,2,3,4,5,6,7].map(i => (
                    <div key={i} style={{ display: "flex", alignItems: "center", background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}
                      onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                      onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
                      <span style={{ padding: "0 4px 0 12px", color: "#555", fontSize: 14 }}>@</span>
                      <input value={form.competitors[i]} onChange={e => updArr("competitors", i, e.target.value.replace(/^@/, ""))}
                        placeholder="username"
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "10px 12px 10px 0", fontSize: 13, color: "#fff", fontFamily: "inherit" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Goals & CTA ── */}
          {step === 4 && (
            <div>
              <StepHeading step={4} total={TOTAL_STEPS} title="Goals, CTA & Lead Generation" desc="Define what success looks like and where your audience should go." />

              <div style={{ marginBottom: 24 }}>
                <SLabel>Primary Goal from Instagram <span style={{ color: "#5B5BD6" }}>*</span></SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>Pick your top priority</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {GOALS.map(g => (
                    <button key={g.key} onClick={() => upd("primary_goal", g.key)}
                      style={{ padding: "14px 16px", borderRadius: 14, textAlign: "left", cursor: "pointer", border: `1.5px solid ${form.primary_goal === g.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.primary_goal === g.key ? "#1e1e3a" : "#1e1e1e", display: "flex", alignItems: "center", gap: 14, transition: "all 0.15s" }}>
                      <span style={{ fontSize: 22 }}>{g.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: form.primary_goal === g.key ? "#fff" : "#ccc" }}>{g.label}</span>
                      {form.primary_goal === g.key && <div style={{ marginLeft: "auto", width: 20, height: 20, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={11} style={{ color: "#fff" }} /></div>}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <SLabel>After Watching Your Content, Where Should People Go? <span style={{ color: "#5B5BD6" }}>*</span></SLabel>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>What is the next step for someone who likes your content?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CTAS.map(c => (
                    <button key={c.key} onClick={() => upd("content_cta", c.key)}
                      style={{ padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.content_cta === c.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.content_cta === c.key ? "#1e1e3a" : "#1e1e1e", color: form.content_cta === c.key ? "#8080ff" : "#aaa", transition: "all 0.15s" }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <SInput label="Website or Landing Page URL" value={form.landing_page_url} onChange={v => upd("landing_page_url", v)}
                placeholder="https://yoursite.com or calendly link" icon={Globe} />

              <div style={{ marginTop: 24, padding: "16px", borderRadius: 16, background: "#0d2214", border: "1px solid #14532d" }}>
                <div style={{ fontSize: 12, color: "#34d399", fontWeight: 600, marginBottom: 4 }}>Everything's being used by AI</div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                  Your goals, CTA preference, and all previous answers are fed directly into the AI to generate content that drives your specific objective — not generic posts.
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Connect Instagram ── */}
          {step === 5 && (
            <div>
              <StepHeading step={5} total={TOTAL_STEPS} title="Connect Your Instagram" desc="One last step — link your account so we can start publishing content right away." />

              <div style={{ padding: "18px 16px", borderRadius: 16, border: `1.5px solid ${igConnected ? "#14532d" : "#2a2a2a"}`, background: igConnected ? "#071a0f" : "#1e1e1e", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Instagram size={20} style={{ color: "#fff" }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Instagram</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Reels, feed posts, carousels</div>
                    </div>
                  </div>
                  {igConnected ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "#22c55e" }}>
                      <Check size={14} /> Connected
                    </div>
                  ) : (
                    <button onClick={handleConnectInstagram} disabled={igLoading}
                      style={{ padding: "9px 18px", borderRadius: 10, background: "#5B5BD6", color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", opacity: igLoading ? 0.7 : 1 }}>
                      {igLoading ? "Opening…" : "Connect"}
                    </button>
                  )}
                </div>
              </div>

              {/* Trust signals */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "We only get posting & messaging access",
                  "Your password is never stored or shared",
                  "You can revoke access at any time",
                ].map((txt, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#666" }}>
                    <Check size={13} style={{ color: "#5B5BD6", flexShrink: 0 }} /> {txt}
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 12, color: "#444", textAlign: "center", marginTop: 20 }}>
                You can also connect later in Settings → Connections
              </p>

              <div style={{ marginTop: 24, padding: "16px", borderRadius: 16, background: "#1e1e3a", border: "1px solid #2a2a5a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Rocket size={20} style={{ color: "#8080ff", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>You're almost done!</div>
                    <div style={{ fontSize: 12, color: "#555" }}>Your AI content engine is calibrated. Connect Instagram to start publishing automatically.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div style={{ flexShrink: 0, background: "#111111", borderTop: "1px solid #222" }}>
        <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: step > 1 ? "space-between" : "flex-end", gap: 12 }}>
          {step > 1 && (
            <button onClick={handleBack}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#666", background: "none", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "11px 18px", cursor: "pointer" }}>
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <button onClick={handleContinue} disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #5B5BD6, #7c7cf8)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 24px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1, boxShadow: "0 4px 16px rgba(91,91,214,0.3)", flex: step === 1 ? 1 : "unset", justifyContent: "center" }}>
            {continueLabel} {!saving && <ChevronRight size={14} />}
          </button>
        </div>
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>

    </div>
  );
}
