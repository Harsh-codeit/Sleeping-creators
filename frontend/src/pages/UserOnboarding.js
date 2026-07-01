import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  LayoutTemplate, Share2, Rocket, Check, ChevronRight,
  Instagram, Sparkles, ArrowRight, X, Mic,
} from "lucide-react";
import logo from "../assets/logo.png";
import { useUser } from "../context/UserContext";
import SlidePreview from "../components/SlidePreview";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEPS = [
  { id: 1, label: "Style",   icon: LayoutTemplate },
  { id: 2, label: "Voice",   icon: Mic },
  { id: 3, label: "Connect", icon: Share2 },
  { id: 4, label: "Ready",   icon: Rocket },
];

const BRAND_VOICES = [
  { key: "blunt",        label: "Blunt & Raw",    desc: "Direct, no fluff, tells it as it is" },
  { key: "motivational", label: "Motivational",   desc: "Inspiring, energetic, pushes forward" },
  { key: "educational",  label: "Educational",    desc: "Breaks things down, teaches clearly" },
  { key: "storytelling", label: "Storytelling",   desc: "Narrative-first, personal journeys" },
  { key: "humorous",     label: "Humorous",       desc: "Wit and relatability over everything" },
];

const SPICE_LABELS = ["", "Safe", "Balanced", "Honest", "Bold", "Controversial"];

function authHeaders() {
  const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function UserOnboarding() {
  const navigate    = useNavigate();
  const user        = useUser();
  const refreshUser = user?.refreshUser;
  const clientId    = user?.client_id;

  const [step, setStep]               = useState(1);
  const [templates, setTemplates]     = useState([]);
  const [selected, setSelected]       = useState([]);
  const [igConnected, setIg]          = useState(false);
  const [igLoading, setIgLoading]     = useState(false);

  // Step 2 state
  const [targetAudience, setTargetAudience] = useState("");
  const [brandVoice, setBrandVoice]         = useState("");
  const [spiceLevel, setSpiceLevel]         = useState(3);

  useEffect(() => {
    axios.get(`${API}/templates`).then(r => {
      const list = r.data?.templates || r.data || [];
      setTemplates(list.slice(0, 12));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/instagram/status/${clientId}`)
      .then(r => setIg(r.data?.connected ?? false)).catch(() => {});
  }, [clientId]);

  const saveCreatorVoice = async () => {
    if (!brandVoice) return toast.error("Pick a brand voice to continue");
    if (!targetAudience.trim()) return toast.error("Describe your audience first");
    try {
      await axios.put(`${API}/auth/profile`, {
        target_audience: targetAudience.trim(),
        brand_voice: brandVoice,
        spice_level: spiceLevel,
      }, { headers: authHeaders() });
    } catch { /* non-fatal */ }
    setStep(3);
  };

  const handleConnectInstagram = async () => {
    if (!clientId) return toast.error("User not loaded yet");
    setIgLoading(true);
    try {
      const res = await axios.get(`${API}/bundle/connect/${clientId}`, { headers: authHeaders() });
      window.open(res.data.url, "_blank");
      // Poll status after a short delay
      setTimeout(async () => {
        const s = await axios.get(`${API}/instagram/status/${clientId}`).catch(() => ({ data: {} }));
        setIg(s.data?.connected ?? false);
        setIgLoading(false);
      }, 4000);
    } catch {
      toast.error("Could not generate connect link — check Settings later");
      setIgLoading(false);
    }
  };

  const handleFinish = async () => {
    try { await axios.post(`${API}/auth/onboarding-complete`, {}, { headers: authHeaders() }); } catch {}
    if (refreshUser) await refreshUser();
    navigate("/");
  };

  const totalSteps = STEPS.length;

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0d0d0d" }}>

      {/* Top bar */}
      <header style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={logo} alt="Sleeping Creators" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#5B5BD6" }}>Sleeping Creators</span>
        </div>

        {/* Step pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                padding: "4px 8px", borderRadius: 20,
                background: step === s.id ? "#5B5BD6" : step > s.id ? "#1e1e3a" : "#1e1e1e",
                color: step === s.id ? "#fff" : step > s.id ? "#8080ff" : "#555",
                border: `1px solid ${step === s.id ? "#5B5BD6" : "#2a2a2a"}`,
                transition: "all 0.2s",
              }}>
                {step > s.id ? <Check size={9} /> : <s.icon size={9} />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 14, height: 1, background: step > s.id ? "#5B5BD6" : "#2a2a2a" }} />
              )}
            </div>
          ))}
        </div>

        <button onClick={handleFinish} style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
          Skip <X size={12} />
        </button>
      </header>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#2a2a2a", flexShrink: 0 }}>
        <div style={{ height: "100%", background: "#5B5BD6", width: `${((step - 1) / (totalSteps - 1)) * 100}%`, transition: "width 0.4s ease" }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* ── Step 1: Templates ── */}
          {step === 1 && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1e1e3a", border: "1px solid #3a3a6a", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#8080ff", marginBottom: 10 }}>
                  <Sparkles size={10} /> Step 1 of {totalSteps}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Pick your content style</h1>
                <p style={{ fontSize: 13, color: "#888" }}>These templates will be used to generate your posts</p>
              </div>

              {templates.length === 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ aspectRatio: "4/5", background: "#1e1e1e", borderRadius: 14, border: "1px solid #2a2a2a" }} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                  {templates.map(t => {
                    const on = selected.includes(t._id || t.id);
                    return (
                      <button key={t._id || t.id}
                        onClick={() => setSelected(p => on ? p.filter(x => x !== (t._id || t.id)) : [...p, t._id || t.id])}
                        style={{
                          position: "relative", aspectRatio: "4/5", borderRadius: 14, overflow: "hidden",
                          border: `2px solid ${on ? "#5B5BD6" : "#2a2a2a"}`,
                          boxShadow: on ? "0 0 0 3px rgba(91,91,214,0.15)" : "none",
                          background: "#0d0d0d", cursor: "pointer", padding: 0,
                        }}>
                        {t.thumbnail_url
                          ? <img src={t.thumbnail_url} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <SlidePreview template={t} compact={true} />
                        }
                        {on && (
                          <div style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Check size={10} style={{ color: "#fff" }} />
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "5px 7px", background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}>
                          <p style={{ fontSize: 9, color: "#fff", fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22 }}>
                <span style={{ fontSize: 12, color: "#555" }}>
                  {selected.length > 0 ? `${selected.length} selected` : "Select any or skip"}
                </span>
                <button onClick={() => setStep(2)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Creator Voice ── */}
          {step === 2 && (
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1e1e3a", border: "1px solid #3a3a6a", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#8080ff", marginBottom: 10 }}>
                  <Mic size={10} /> Step 2 of {totalSteps}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Define your creator voice</h1>
                <p style={{ fontSize: 13, color: "#888" }}>The AI uses this to write content that sounds like you, not a robot</p>
              </div>

              {/* Target audience */}
              <div style={{ marginBottom: 22 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.7px", margin: "0 0 10px" }}>Who are you talking to?</p>
                <textarea
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  placeholder="e.g. 25–35 year old Indian startup founders who are building without VC money and feel overwhelmed"
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 13, lineHeight: 1.6,
                    borderRadius: 14, border: "1.5px solid #2a2a2a", background: "#161616",
                    color: "#fff", outline: "none", resize: "none", fontFamily: "inherit",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"}
                />
                <p style={{ fontSize: 11, color: "#444", margin: "5px 0 0" }}>The more specific you are, the better the AI performs</p>
              </div>

              {/* Brand voice */}
              <div style={{ marginBottom: 22 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.7px", margin: "0 0 10px" }}>Your communication style</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {BRAND_VOICES.map(v => (
                    <button key={v.key} onClick={() => setBrandVoice(v.key)}
                      style={{
                        padding: "12px 14px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                        border: `1.5px solid ${brandVoice === v.key ? "#5B5BD6" : "#222"}`,
                        background: brandVoice === v.key ? "#1a1a3a" : "#161616",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        transition: "all 0.15s",
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: brandVoice === v.key ? "#fff" : "#ccc" }}>{v.label}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{v.desc}</div>
                      </div>
                      {brandVoice === v.key && (
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Check size={11} style={{ color: "#fff" }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spice level */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.7px", margin: 0 }}>Content boldness</p>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#5B5BD6" }}>{SPICE_LABELS[spiceLevel]}</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1}
                  value={spiceLevel}
                  onChange={e => setSpiceLevel(parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "#5B5BD6", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 4 }}>
                  <span>Safe & Neutral</span>
                  <span>Controversial</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={{ fontSize: 13, color: "#555", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
                <button onClick={saveCreatorVoice}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Connect Instagram ── */}
          {step === 3 && (
            <div style={{ maxWidth: 420, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1e1e3a", border: "1px solid #3a3a6a", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#8080ff", marginBottom: 10 }}>
                  <Share2 size={10} /> Step 3 of {totalSteps}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Connect your Instagram</h1>
                <p style={{ fontSize: 13, color: "#888" }}>So we can publish directly when you're ready</p>
              </div>

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: 16, borderRadius: 16,
                border: `1.5px solid ${igConnected ? "#14532d" : "#2a2a2a"}`,
                background: igConnected ? "#0a2016" : "#161616",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Instagram size={20} style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>Instagram</div>
                    <div style={{ fontSize: 12, color: "#555" }}>Reels, feed posts, stories</div>
                  </div>
                </div>
                {igConnected ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#059669" }}>
                    <Check size={13} /> Connected
                  </div>
                ) : (
                  <button
                    onClick={handleConnectInstagram}
                    disabled={igLoading}
                    style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 10, background: "#5B5BD6", color: "#fff", border: "none", cursor: "pointer", opacity: igLoading ? 0.7 : 1 }}>
                    {igLoading ? "Opening…" : "Connect"}
                  </button>
                )}
              </div>

              <p style={{ fontSize: 11, color: "#444", textAlign: "center", marginTop: 10 }}>
                You can always connect later in Settings → Connections
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
                <button onClick={() => setStep(2)} style={{ fontSize: 13, color: "#555", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
                <button onClick={() => setStep(4)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                  {igConnected ? "Continue" : "Skip for now"} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Ready ── */}
          {step === 4 && (
            <div style={{ maxWidth: 400, margin: "0 auto", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <Rocket size={28} style={{ color: "#8080ff" }} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6 }}>You're all set!</h1>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginBottom: 22 }}>
                Your AI engine is now calibrated to your voice and audience. Every post it generates will sound like you.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[
                  { label: "Create a Post",  desc: "Generate your first AI carousel" },
                  { label: "Browse Templates", desc: "Pick a style for your content" },
                  { label: "View Calendar",   desc: "Schedule and manage posts" },
                ].map(item => (
                  <button key={item.label} onClick={handleFinish}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #2a2a2a", background: "#161616", cursor: "pointer", textAlign: "left" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <ArrowRight size={14} style={{ color: "#444", flexShrink: 0 }} />
                  </button>
                ))}
              </div>

              <button onClick={handleFinish}
                style={{ width: "100%", padding: "14px 0", background: "#5B5BD6", color: "#fff", fontWeight: 700, fontSize: 14, borderRadius: 14, border: "none", cursor: "pointer", boxShadow: "0 4px 14px rgba(91,91,214,0.28)" }}>
                Go to Dashboard
              </button>

              <p style={{ fontSize: 12, color: "#444", marginTop: 12 }}>
                Welcome, {user?.name?.split(" ")[0] || "creator"} 🎉
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
