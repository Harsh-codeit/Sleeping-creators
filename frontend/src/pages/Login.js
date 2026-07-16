import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import logo from "../assets/logo.png";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Login({ onLogin }) {
  const [step, setStep]         = useState(1);
  const [identifier, setId]     = useState("");
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending]   = useState(false);

  // Wake up Render on mount so it's warm when the user hits Continue
  useEffect(() => { axios.get(`${API.replace("/api", "")}/health`).catch(() => {}); }, []);

  const sendOTP = async () => {
    const val = identifier.trim();
    if (!val) return toast.error("Enter your phone number or email");
    setNotFound(false);
    setSending(true);
    try {
      await axios.post(`${API}/auth/otp/send`, { identifier: val, purpose: "login" });
      setStep(2);
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      else toast.error(err.response?.data?.detail || "Could not send OTP");
    } finally { setSending(false); }
  };

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden", background: "#0d0d0d" }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between p-12"
        style={{ background: "#141414", borderRight: "1px solid #2a2a2a" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="Sleeping Creators" className="w-9 h-9 rounded-xl" />
          <span className="font-bold text-lg" style={{ color: "#7c7cf8" }}>Sleeping Creators</span>
        </div>
        <div>
          <div className="text-3xl font-bold leading-snug mb-3" style={{ color: "#fff" }}>
            Create content<br />while you sleep.
          </div>
          <p style={{ color: "#888", fontSize: 14 }}>
            Schedule once, publish to Instagram automatically — powered by AI.
          </p>
        </div>
        <p style={{ fontSize: 11, color: "#444" }}>Free to start · No credit card required</p>
      </div>

      {/* Right form — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px 32px", paddingTop: "calc(40px + env(safe-area-inset-top))" }}>
        <div style={{ maxWidth: 380, margin: "0 auto" }}>
          <div className="flex items-center gap-2.5 lg:hidden" style={{ marginBottom: 32 }}>
            <img src={logo} alt="" style={{ width: 32, height: 32, borderRadius: 10 }} />
            <span className="font-bold" style={{ color: "#7c7cf8", fontSize: 15 }}>Sleeping Creators</span>
          </div>

          {step === 1 && (
            <Step1 identifier={identifier} setId={setId} notFound={notFound} sending={sending} onSend={sendOTP} />
          )}
          {step === 2 && (
            <Step2
              identifier={identifier}
              onBack={() => { setStep(1); setNotFound(false); }}
              onLogin={onLogin}
            />
          )}

          <p className="text-center text-sm" style={{ marginTop: 24, color: "#555" }}>
            Don't have an account?{" "}
            <Link to="/signup" className="font-semibold" style={{ color: "#8080ff" }}>Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Step1({ identifier, setId, notFound, sending, onSend }) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>Welcome back</h1>
        <p style={{ fontSize: 14, color: "#888" }}>Enter your phone or email to log in</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#bbb", marginBottom: 5 }}>
            Phone number or email
          </label>
          <div style={{ background: "#1a1a1a", border: `1.5px solid ${notFound ? "#7f1d1d" : "#333"}`, borderRadius: 14, overflow: "hidden" }}>
            <input
              type="text" value={identifier} onChange={e => setId(e.target.value)}
              placeholder="+91 98765 43210 or you@email.com"
              autoFocus onKeyDown={e => e.key === "Enter" && onSend()}
              style={{ width: "100%", background: "transparent", padding: "13px 16px", fontSize: 14, color: "#fff", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {notFound && (
            <p style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>
              No account found.{" "}
              <Link to="/signup" style={{ color: "#ef4444", textDecoration: "underline" }}>Sign up instead →</Link>
            </p>
          )}
        </div>
        <Btn loading={sending} onClick={onSend}>
          {sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : "Continue"}
        </Btn>
      </div>
    </>
  );
}

function Step2({ identifier, onBack, onLogin }) {
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
    if (otp.length < 6) return toast.error("Enter all 6 digits");
    setLoading(true);
    try {
      const resp = await axios.post(`${API}/auth/otp/verify`, {
        identifier: identifier.trim(),
        otp,
        purpose: "login",
      });
      localStorage.setItem("sc_token", resp.data.token);
      onLogin(resp.data.token);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not verify. Try again.");
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await axios.post(`${API}/auth/otp/send`, { identifier: identifier.trim(), purpose: "login" });
      setOtp(""); setCd(30);
      inputRef.current?.focus();
    } catch { toast.error("Could not resend"); }
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <button onClick={onBack} className="flex items-center gap-1.5 font-medium"
          style={{ color: "#8080ff", fontSize: 13, marginBottom: 12 }}>
          <ArrowLeft size={13} /> Change
        </button>
        <h1 className="font-bold" style={{ fontSize: 22, color: "#fff", marginBottom: 4 }}>Enter OTP</h1>
        <p style={{ fontSize: 14, color: "#888" }}>
          Sent to <strong style={{ color: "#fff" }}>{identifier}</strong>
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#bbb", marginBottom: 8 }}>
            6-digit code
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={handleChange}
            onKeyDown={e => e.key === "Enter" && verify()}
            placeholder="••••••"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 18px",
              background: "#1a1a1a",
              border: `2px solid ${otp.length === 6 ? "#5B5BD6" : "#333"}`,
              borderRadius: 14,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.3em",
              color: "#8080ff",
              outline: "none",
              textAlign: "center",
              transition: "border-color 0.15s",
            }}
          />
        </div>

        <Btn loading={loading} onClick={verify}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Logging in…</> : "Login"}
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
