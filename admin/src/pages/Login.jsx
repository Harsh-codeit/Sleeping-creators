import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Sparkles } from "lucide-react";
import api from "../api.js";

export default function Login() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async e => {
    e.preventDefault();
    if (!secret.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post("/api/admin/auth", { secret });
      localStorage.setItem("sc_admin_token", data.token);
      navigate("/overview");
    } catch {
      toast.error("Invalid admin secret");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d" }}>
      <div style={{ width: 360, padding: 40, background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={20} style={{ color: "#8080ff" }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Sleeping Creators</div>
            <div style={{ fontSize: 11, color: "#555", fontWeight: 500 }}>ADMIN DASHBOARD</div>
          </div>
        </div>

        <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>
              Admin Secret
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "12px 16px" }}>
              <Lock size={14} style={{ color: "#555", flexShrink: 0 }} />
              <input
                type="password"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "inherit" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !secret.trim()}
            style={{
              padding: "13px 0", borderRadius: 12, border: "none",
              background: loading ? "#3a3a6a" : "#5B5BD6", color: "#fff",
              fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
