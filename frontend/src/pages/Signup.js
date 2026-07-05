import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import logo from "../assets/logo.png";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INTERESTS = [
  { value: "lifestyle",     label: "Lifestyle" },
  { value: "business",     label: "Business & Entrepreneurship" },
  { value: "education",    label: "Education & Learning" },
  { value: "fitness",      label: "Fitness & Health" },
  { value: "diets",        label: "Diets & Nutrition" },
  { value: "food",         label: "Food & Cooking" },
  { value: "travel",       label: "Travel & Adventure" },
  { value: "fashion",      label: "Fashion & Beauty" },
  { value: "finance",      label: "Finance & Investing" },
  { value: "tech",         label: "Tech & Gaming" },
  { value: "science",      label: "Science & Research" },
  { value: "music",        label: "Music & Entertainment" },
  { value: "motivation",   label: "Motivation & Mindset" },
  { value: "mental_health", label: "Mental Health" },
  { value: "sports",       label: "Sports & Athletics" },
  { value: "personal_dev", label: "Personal Development" },
  { value: "other",        label: "Other" },
];

export default function Signup({ onLogin }) {
  const [step, setStep]       = useState(1);
  const [name, setName]       = useState("");
  const [identifier, setId]   = useState("");

  // Wake up Render on mount so it's warm when the user hits Continue
  useEffect(() => { axios.get(`${API.replace("/api", "")}/health`).catch(() => {}); }, []);

  return (
    <div style={{ height: "100dvh", display: "flex", overflow: "hidden", background: "#0d0d0d" }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between p-12"
        style={{ background: "#141414", borderRight: "1px solid #2a2a2a" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="Sleeping Creators" className="w-9 h-9 rounded-xl" />
          <span className="font-bold text-lg" style={{ color: "#7c7cf8" }}>Sleeping Creators</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[
            { title: "Pick a template", desc: "Choose from proven content formats for your niche." },
            { title: "Generate with AI", desc: "Describe your topic — AI writes the caption, hook, and slides." },
            { title: "Auto-schedule", desc: "Posts go out automatically on your schedule." },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <Check size={11} style={{ color: "#8080ff" }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#444" }}>Free to start · No credit card required</p>
      </div>

      {/* Right form — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 20px" }}>
        <div style={{ maxWidth: 380, margin: "0 auto" }}>
          {/* Logo mobile — only on step 1 */}
          {step === 1 && (
            <div className="flex items-center gap-2.5 lg:hidden" style={{ marginBottom: 20 }}>
              <img src={logo} alt="" style={{ width: 30, height: 30, borderRadius: 10 }} />
              <span className="font-bold" style={{ color: "#7c7cf8", fontSize: 15 }}>Sleeping Creators</span>
            </div>
          )}

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                  background: step >= s ? "#5B5BD6" : "#1e1e3a",
                  color: step >= s ? "#fff" : "#555",
                  boxShadow: step === s ? "0 0 0 3px rgba(91,91,214,0.25)" : "none",
                }}>
                  {step > s ? <Check size={10} /> : s}
                </div>
                {s < 3 && <div style={{ width: 24, height: 2, borderRadius: 2, background: step > s ? "#5B5BD6" : "#2a2a2a" }} />}
              </div>
            ))}
            <span style={{ marginLeft: 4, fontSize: 11, color: "#555" }}>
              {step === 1 ? "Your info" : step === 2 ? "Verify" : "Interests"}
            </span>
          </div>

          {step === 1 && (
            <StepInfo
              name={name} setName={setName}
              identifier={identifier} setId={setId}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepOTP
              identifier={identifier}
              onBack={() => setStep(1)}
              onVerified={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepInterests name={name} identifier={identifier} onBack={() => setStep(2)} onLogin={onLogin} />
          )}

          <p className="text-center" style={{ marginTop: 20, fontSize: 13, color: "#555" }}>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold" style={{ color: "#8080ff" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function StepInfo({ name, setName, identifier, setId, onNext }) {
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!name.trim())           return toast.error("Enter your full name");
    const val = identifier.trim();
    if (!val || val.length < 5) return toast.error("Enter your phone number or email");
    setLoading(true);
    try {
      await axios.post(`${API}/auth/otp/send`, { identifier: val, purpose: "register" });
      toast.success("OTP sent! Check your inbox.");
      onNext();
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not send OTP";
      if (msg.toLowerCase().includes("already exists")) toast.error("Account already exists — sign in instead");
      else toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>Create your account</h1>
        <p style={{ fontSize: 14, color: "#888" }}>Takes less than a minute</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Full Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Your full name" autoFocus onKeyDown={e => e.key === "Enter" && handleNext()}
            style={inpStyle} />
        </Field>
        <Field label="Phone number or email">
          <input type="text" value={identifier} onChange={e => setId(e.target.value)}
            placeholder="+91 98765 43210 or you@email.com"
            onKeyDown={e => e.key === "Enter" && handleNext()}
            style={inpStyle} />
        </Field>
        <Btn loading={loading} onClick={handleNext}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Sending OTP…</> : "Continue →"}
        </Btn>
      </div>
    </>
  );
}

function StepOTP({ identifier, onBack, onVerified }) {
  const [otp, setOtp]         = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCd]    = useState(30);
  const inputRef              = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCd(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(val);
  };

  const verify = async () => {
    const finalCode = otp;
    if (finalCode.length < 6) return toast.error("Enter all 6 digits");
    setLoading(true);
    try {
      await axios.post(`${API}/auth/otp/verify`, { identifier: identifier.trim(), otp: finalCode, purpose: "register" });

      onVerified();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Incorrect OTP");
      setOtp("");
      inputRef.current?.focus();
    } finally { setLoading(false); }
  };

  const resend = async () => {
    try {
      await axios.post(`${API}/auth/otp/send`, { identifier: identifier.trim(), purpose: "register" });
      setOtp(""); setCd(30);
      inputRef.current?.focus();
    } catch { toast.error("Could not resend"); }
  };

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onBack} className="flex items-center gap-1.5 font-medium"
          style={{ color: "#8080ff", fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={13} /> Change
        </button>
        <h1 className="font-bold" style={{ fontSize: 20, color: "#fff", marginBottom: 3 }}>Enter OTP</h1>
        <p style={{ fontSize: 13, color: "#888" }}>
          Sent to <strong style={{ color: "#fff" }}>{identifier}</strong>
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#bbb", marginBottom: 8 }}>6-digit code</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={handleChange}
            onKeyDown={e => e.key === "Enter" && verify()}
            placeholder="••••••"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "14px 18px",
              background: "#1a1a1a",
              border: `2px solid ${otp.length === 6 ? "#5B5BD6" : "#333"}`,
              borderRadius: 14,
              fontSize: 22, fontWeight: 700, letterSpacing: "0.3em",
              color: "#8080ff", outline: "none", textAlign: "center",
              transition: "border-color 0.15s",
            }}
          />
        </div>
        <Btn loading={loading} onClick={() => verify()}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : "Verify OTP"}
        </Btn>
        <p className="text-center" style={{ fontSize: 13, color: "#555" }}>
          {countdown > 0 ? `Resend in ${countdown}s` : (
            <button onClick={resend} style={{ color: "#8080ff", fontWeight: 600 }}>Resend OTP</button>
          )}
        </p>
      </div>
    </>
  );
}

function StepInterests({ name, identifier, onBack, onLogin }) {
  const [selected, setSelected]   = useState([]);
  const [otherText, setOtherText] = useState("");
  const [loading, setLoading]     = useState(false);
  const toggle = val => setSelected(p => p.includes(val) ? p.filter(v => v !== val) : [...p, val]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const resp = await axios.post(`${API}/auth/register`, {
        name: name.trim(), identifier: identifier.trim(),
        interests: selected.filter(v => v !== "other"),
        other_interest: selected.includes("other") ? otherText.trim() : "",
      });
      localStorage.setItem("sc_token", resp.data.token);
      onLogin(resp.data.token);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not create account");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button onClick={onBack} className="flex items-center gap-1.5 font-medium"
          style={{ color: "#8080ff", fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={13} /> Back
        </button>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>Areas of interest</h1>
        <p style={{ fontSize: 13, color: "#888" }}>Pick what you create — editable later in Settings</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {INTERESTS.map(({ value, label }) => {
            const on = selected.includes(value);
            return (
              <button key={value} onClick={() => toggle(value)}
                style={{
                  padding: "9px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, textAlign: "left",
                  border: `2px solid ${on ? "#5B5BD6" : "#2a2a2a"}`,
                  background: on ? "#1e1e3a" : "#1a1a1a", color: on ? "#8080ff" : "#aaa",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  minHeight: 38,
                }}>
                <span>{label}</span>
                {on && <Check size={11} style={{ color: "#8080ff", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        {selected.includes("other") && (
          <input type="text" value={otherText} onChange={e => setOtherText(e.target.value)}
            placeholder="What do you create?" autoFocus
            style={{ ...inpStyle, border: "2px solid #5B5BD6", borderRadius: 12, padding: "11px 14px", background: "#1a1a1a" }} />
        )}
        <Btn loading={loading} onClick={handleCreate}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create Account"}
        </Btn>
      </div>
    </>
  );
}

const inpStyle = {
  width: "100%", background: "transparent", padding: "13px 16px",
  fontSize: 14, color: "#fff", outline: "none", boxSizing: "border-box",
};

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#bbb", marginBottom: 5 }}>{label}</label>
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Btn({ children, loading, onClick }) {
  return (
    <button disabled={loading} onClick={onClick}
      style={{
        width: "100%", padding: "14px 0", fontWeight: 600, fontSize: 14, borderRadius: 16,
        color: "#fff", background: "#5B5BD6", border: "none",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer",
        boxShadow: "0 4px 14px rgba(91,91,214,0.3)",
      }}>
      {children}
    </button>
  );
}
