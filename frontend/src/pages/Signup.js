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
  const [step, setStep]     = useState(1);
  const [name, setName]     = useState("");
  const [identifier, setId] = useState("");
  const [devMode, setDevMode] = useState(false);

  return (
    <div style={{ height: "100dvh", display: "flex", overflow: "hidden", background: "#f5f4fb" }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between p-12"
        style={{ background: "#fff", borderRight: "1px solid #ebe9f6" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="Sleeping Creators" className="w-9 h-9 rounded-xl" />
          <span className="font-bold text-lg" style={{ color: "#5B5BD6" }}>Sleeping Creators</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[
            { title: "Pick a template", desc: "Choose from proven content formats for your niche." },
            { title: "Generate with AI", desc: "Describe your topic — AI writes the caption, hook, and slides." },
            { title: "Auto-schedule", desc: "Posts go out automatically on your schedule." },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#EEF0FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <Check size={11} style={{ color: "#5B5BD6" }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#111827", marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#d1d5db" }}>Free to start · No credit card required</p>
      </div>

      {/* Right form — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 20px" }}>
        <div style={{ maxWidth: 380, margin: "0 auto" }}>
          {/* Logo mobile — only on step 1 */}
          {step === 1 && (
            <div className="flex items-center gap-2.5 lg:hidden" style={{ marginBottom: 20 }}>
              <img src={logo} alt="" style={{ width: 30, height: 30, borderRadius: 10 }} />
              <span className="font-bold" style={{ color: "#5B5BD6", fontSize: 15 }}>Sleeping Creators</span>
            </div>
          )}

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                  background: step >= s ? "#5B5BD6" : "#EEF0FF",
                  color: step >= s ? "#fff" : "#9ca3af",
                  boxShadow: step === s ? "0 0 0 3px rgba(91,91,214,0.18)" : "none",
                }}>
                  {step > s ? <Check size={10} /> : s}
                </div>
                {s < 3 && <div style={{ width: 24, height: 2, borderRadius: 2, background: step > s ? "#5B5BD6" : "#e5e4f0" }} />}
              </div>
            ))}
            <span style={{ marginLeft: 4, fontSize: 11, color: "#9ca3af" }}>
              {step === 1 ? "Your info" : step === 2 ? "Verify" : "Interests"}
            </span>
          </div>

          {step === 1 && (
            <StepInfo
              name={name} setName={setName}
              identifier={identifier} setId={setId}
              onNext={(isDev) => { setDevMode(isDev); setStep(2); }}
            />
          )}
          {step === 2 && (
            <StepOTP
              identifier={identifier}
              devMode={devMode}
              onBack={() => setStep(1)}
              onVerified={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepInterests name={name} identifier={identifier} onBack={() => setStep(2)} onLogin={onLogin} />
          )}

          <p className="text-center" style={{ marginTop: 20, fontSize: 13, color: "#9ca3af" }}>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold" style={{ color: "#5B5BD6" }}>Sign in</Link>
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
      const resp = await axios.post(`${API}/auth/otp/send`, { identifier: val, purpose: "register" });
      toast.success("OTP sent!");
      onNext(!!resp.data.debug_otp);
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not send OTP";
      if (msg.toLowerCase().includes("already exists")) toast.error("Account already exists — sign in instead");
      else toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#111827", marginBottom: 4 }}>Create your account</h1>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Takes less than a minute</p>
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

function StepOTP({ identifier, devMode, onBack, onVerified }) {
  const [otp, setOtp]         = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCd]    = useState(30);
  const inputRef = useRef(null);

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
    if (devMode) { onVerified(); return; }
    if (otp.length < 6) return toast.error("Enter all 6 digits");
    setLoading(true);
    try {
      await axios.post(`${API}/auth/otp/verify`, { identifier: identifier.trim(), otp, purpose: "register" });
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
          style={{ color: "#5B5BD6", fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={13} /> Change
        </button>
        <h1 className="font-bold" style={{ fontSize: 20, color: "#111827", marginBottom: 3 }}>Enter OTP</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Sent to <strong style={{ color: "#111827" }}>{identifier}</strong>
        </p>
      </div>

      {devMode && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#854d0e", textAlign: "center" }}>
          Dev mode — tap Verify to continue (any input works)
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="6-digit code">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={handleChange}
            onKeyDown={e => e.key === "Enter" && verify()}
            placeholder="••••••"
            style={{ ...inpStyle, letterSpacing: "0.25em", fontSize: 20, fontWeight: 700, color: "#5B5BD6" }}
          />
        </Field>
        <Btn loading={loading} onClick={verify}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : "Verify OTP"}
        </Btn>
        <p className="text-center" style={{ fontSize: 13, color: "#9ca3af" }}>
          {countdown > 0 ? `Resend in ${countdown}s` : (
            <button onClick={resend} style={{ color: "#5B5BD6", fontWeight: 600 }}>Resend OTP</button>
          )}
        </p>
      </div>
    </>
  );
}

function StepInterests({ name, identifier, onBack, onLogin }) {
  const [selected, setSelected] = useState([]);
  const [otherText, setOtherText] = useState("");
  const [loading, setLoading]   = useState(false);
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
          style={{ color: "#5B5BD6", fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={13} /> Back
        </button>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#111827", marginBottom: 4 }}>Areas of interest</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>Pick what you create — editable later in Settings</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {INTERESTS.map(({ value, label }) => {
            const on = selected.includes(value);
            return (
              <button key={value} onClick={() => toggle(value)}
                style={{
                  padding: "9px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, textAlign: "left",
                  border: `2px solid ${on ? "#5B5BD6" : "#e5e4f0"}`,
                  background: on ? "#EEF0FF" : "#fff", color: on ? "#5B5BD6" : "#374151",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  minHeight: 38,
                }}>
                <span>{label}</span>
                {on && <Check size={11} style={{ color: "#5B5BD6", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        {selected.includes("other") && (
          <input type="text" value={otherText} onChange={e => setOtherText(e.target.value)}
            placeholder="What do you create?" autoFocus
            style={{ ...inpStyle, border: "2px solid #5B5BD6", borderRadius: 12, padding: "11px 14px" }} />
        )}
        <Btn loading={loading} onClick={handleCreate}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create Account"}
        </Btn>
      </div>
    </>
  );
}

const inpStyle = { width: "100%", background: "transparent", padding: "13px 16px", fontSize: 14, color: "#111827", outline: "none", boxSizing: "border-box" };

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#374151", marginBottom: 5 }}>{label}</label>
      <div style={{ background: "#fff", border: "1.5px solid #e5e4f0", borderRadius: 14, overflow: "hidden" }}>{children}</div>
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
        boxShadow: "0 4px 14px rgba(91,91,214,0.28)",
      }}>
      {children}
    </button>
  );
}
