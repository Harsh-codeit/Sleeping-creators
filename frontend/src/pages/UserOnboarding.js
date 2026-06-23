import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { LayoutTemplate, Share2, Rocket, Check, ChevronRight, Instagram, Sparkles, ArrowRight, X } from "lucide-react";
import logo from "../assets/logo.png";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEPS = [
  { id: 1, label: "Templates", icon: LayoutTemplate },
  { id: 2, label: "Connect",   icon: Share2 },
  { id: 3, label: "Ready",     icon: Rocket },
];

export default function UserOnboarding() {
  const navigate   = useNavigate();
  const user       = useUser();
  const refreshUser = user?.refreshUser;
  const clientId   = user?.client_id;

  const [step, setStep]         = useState(1);
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected]   = useState([]);
  const [igConnected, setIg]      = useState(false);

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

  const handleFinish = async () => {
    try { await axios.post(`${API}/auth/onboarding-complete`); } catch {}
    if (refreshUser) await refreshUser();
    navigate("/");
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f4fb" }}>

      {/* Top bar */}
      <header style={{ background: "#fff", borderBottom: "1px solid #ebe9f6", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={logo} alt="Sleeping Creators" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#5B5BD6" }}>Sleeping Creators</span>
        </div>

        {/* Step pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                padding: "5px 10px", borderRadius: 20,
                background: step === s.id ? "#5B5BD6" : step > s.id ? "#EEF0FF" : "#f5f4fb",
                color: step === s.id ? "#fff" : step > s.id ? "#5B5BD6" : "#9ca3af",
                border: `1px solid ${step === s.id ? "#5B5BD6" : "#ebe9f6"}`,
              }}>
                {step > s.id ? <Check size={10} /> : <s.icon size={10} />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 20, height: 1, background: step > s.id ? "#5B5BD6" : "#ebe9f6" }} />
              )}
            </div>
          ))}
        </div>

        <button onClick={handleFinish} style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
          Skip <X size={12} />
        </button>
      </header>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#ebe9f6", flexShrink: 0 }}>
        <div style={{ height: "100%", background: "#5B5BD6", width: `${((step - 1) / 2) * 100}%`, transition: "width 0.4s ease" }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* ── Step 1: Templates ── */}
          {step === 1 && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF0FF", border: "1px solid #c7d2fe", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#5B5BD6", marginBottom: 12 }}>
                  <Sparkles size={10} /> Step 1 of 3
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Pick your content style</h1>
                <p style={{ fontSize: 13, color: "#6b7280" }}>Select templates that match your brand</p>
              </div>

              {templates.length === 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ aspectRatio: "4/5", background: "#f0edf8", borderRadius: 14, border: "1px solid #ebe9f6" }} className="animate-pulse" />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                  {templates.map(t => {
                    const on = selected.includes(t._id || t.id);
                    return (
                      <button key={t._id || t.id} onClick={() => setSelected(p => on ? p.filter(x => x !== (t._id || t.id)) : [...p, t._id || t.id])}
                        style={{
                          position: "relative", aspectRatio: "4/5", borderRadius: 14, overflow: "hidden",
                          border: `2px solid ${on ? "#5B5BD6" : "#ebe9f6"}`,
                          boxShadow: on ? "0 0 0 3px rgba(91,91,214,0.15)" : "none",
                          background: "#f5f4fb", cursor: "pointer", padding: 0,
                        }}>
                        {t.thumbnail_url
                          ? <img src={t.thumbnail_url} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <LayoutTemplate size={22} style={{ color: "#c7d2fe" }} />
                            </div>
                        }
                        {on && (
                          <div style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: "50%", background: "#5B5BD6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Check size={11} style={{ color: "#fff" }} />
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "6px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}>
                          <p style={{ fontSize: 10, color: "#fff", fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>
                  {selected.length > 0 ? `${selected.length} selected` : "Select any or skip"}
                </span>
                <button onClick={() => setStep(2)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Connect Instagram ── */}
          {step === 2 && (
            <div style={{ maxWidth: 420, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF0FF", border: "1px solid #c7d2fe", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#5B5BD6", marginBottom: 12 }}>
                  <Share2 size={10} /> Step 2 of 3
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Connect your account</h1>
                <p style={{ fontSize: 13, color: "#6b7280" }}>Link Instagram so we can publish directly for you</p>
              </div>

              {/* Instagram only */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: 16, borderRadius: 16, border: `1.5px solid ${igConnected ? "#6ee7b7" : "#ebe9f6"}`,
                background: igConnected ? "#ecfdf5" : "#fff",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Instagram size={20} style={{ color: "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>Instagram</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Reels, feed posts, stories</div>
                  </div>
                </div>
                {igConnected ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#059669" }}>
                    <Check size={13} /> Connected
                  </div>
                ) : (
                  <a href={clientId ? `${process.env.REACT_APP_BACKEND_URL}/api/instagram/connect/${clientId}` : "#"}
                    style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 10, background: "#5B5BD6", color: "#fff", textDecoration: "none" }}>
                    Connect
                  </a>
                )}
              </div>

              <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
                You can always connect Instagram later in Settings
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={{ fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>
                  ← Back
                </button>
                <button onClick={() => setStep(3)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer" }}>
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Ready ── */}
          {step === 3 && (
            <div style={{ maxWidth: 400, margin: "0 auto", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "#EEF0FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <Rocket size={28} style={{ color: "#5B5BD6" }} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 }}>You're all set!</h1>
              <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
                Your workspace is ready. Start creating content, schedule your first post, or explore what's possible.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[
                  { label: "Browse Templates", desc: "Pick a design and start editing" },
                  { label: "Create a Post", desc: "Generate captions & schedule with AI" },
                  { label: "View Calendar",  desc: "See your upcoming scheduled posts" },
                ].map(item => (
                  <button key={item.label} onClick={handleFinish}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #ebe9f6", background: "#fff", cursor: "pointer", textAlign: "left" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <ArrowRight size={14} style={{ color: "#d1d5db", flexShrink: 0 }} />
                  </button>
                ))}
              </div>

              <button onClick={handleFinish}
                style={{ width: "100%", padding: "14px 0", background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 14, borderRadius: 14, border: "none", cursor: "pointer", boxShadow: "0 4px 14px rgba(91,91,214,0.28)" }}>
                Go to Dashboard
              </button>

              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
                Welcome aboard, {user?.name?.split(" ")[0] || "creator"} 👋
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
