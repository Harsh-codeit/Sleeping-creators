import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Login({ onLogin }) {
  const [mode, setMode]         = useState(null); // "setup" | "login"
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);

  useEffect(() => {
    axios.get(`${API}/auth/status`).then(r => {
      setMode(r.data.setup_required ? "setup" : "login");
    }).catch(() => setMode("login"));
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!password) return toast.error("Enter a password");
    if (mode === "setup") {
      if (password.length < 6) return toast.error("Password must be at least 6 characters");
      if (password !== confirm)  return toast.error("Passwords don't match");
    }
    setLoading(true);
    try {
      const endpoint = mode === "setup" ? "/auth/setup" : "/auth/login";
      const { data } = await axios.post(`${API}${endpoint}`, { password });
      localStorage.setItem("automonk_token", data.token);
      onLogin(data.token);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (!mode) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl mb-5">
            <span className="text-black font-black text-xl tracking-tight">AM</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AutoMonk</h1>
          <p className="text-zinc-500 text-sm mt-1 font-mono">
            {mode === "setup" ? "Set up your admin password to get started" : "Enter your password to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-950 border border-zinc-800 p-6 space-y-4">

          {mode === "setup" && (
            <div className="bg-zinc-900 border border-zinc-700 px-4 py-3 text-xs text-zinc-400 font-mono">
              First time setup — choose a strong password to protect your dashboard.
            </div>
          )}

          {/* Password field */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
              {mode === "setup" ? "New Password" : "Password"}
            </label>
            <div className="relative">
              <input
                data-testid="password-input"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !confirm && handleSubmit(e)}
                placeholder="••••••••"
                autoFocus
                className="w-full bg-black border border-zinc-700 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs font-mono"
              >
                {showPw ? "hide" : "show"}
              </button>
            </div>
          </div>

          {/* Confirm field (setup only) */}
          {mode === "setup" && (
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
                Confirm Password
              </label>
              <input
                data-testid="confirm-password-input"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit(e)}
                placeholder="••••••••"
                className="w-full bg-black border border-zinc-700 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors"
              />
            </div>
          )}

          {/* Submit */}
          <button
            data-testid="login-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-white text-black font-bold text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-150 mt-2"
          >
            {loading ? "Please wait..." : mode === "setup" ? "Set Password & Enter" : "Enter Dashboard"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">
          <Link to="/privacy-policy" className="transition-colors duration-150 hover:text-white">
            Privacy Policy
          </Link>
          <span className="text-zinc-800">/</span>
          <Link to="/terms-of-service" className="transition-colors duration-150 hover:text-white">
            Terms of Service
          </Link>
        </div>

        <p className="text-center text-[10px] font-mono text-zinc-700 mt-6 tracking-widest">
          AUTOMONK · CONTENT ENGINE
        </p>
      </div>
    </div>
  );
}
