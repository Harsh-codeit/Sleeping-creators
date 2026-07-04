import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Clock } from "lucide-react";
import api from "../api.js";

function ago(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/admin/users").then(r => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const niches = [...new Set(users.map(u => u.niche).filter(Boolean))].sort();

  const filtered = users.filter(u => {
    const matchQ = !q || [u.name, u.email, u.phone].some(v => v?.toLowerCase().includes(q.toLowerCase()));
    const matchN = !niche || u.niche === niche;
    return matchQ && matchN;
  });

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Users</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>{users.length} registered users</p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "10px 14px" }}>
          <Search size={14} style={{ color: "#555" }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, email, or phone…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13, fontFamily: "inherit" }}
          />
        </div>
        <select
          value={niche}
          onChange={e => setNiche(e.target.value)}
          style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "10px 14px", color: niche ? "#fff" : "#555", fontSize: 13, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
        >
          <option value="">All niches</option>
          {niches.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: "#555", fontSize: 14, padding: 20 }}>Loading…</div>
      ) : (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                {["User", "Niche", "Generations", "Published", "Win Rate", "Last Active", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No users found</td></tr>
              ) : filtered.map(u => (
                <tr
                  key={u._id}
                  onClick={() => navigate(`/users/${u._id}`)}
                  style={{ borderBottom: "1px solid #1e1e1e", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1a1a2e"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#8080ff" }}>
                          {(u.name || u.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{u.name || "—"}</div>
                        <div style={{ fontSize: 11, color: "#555" }}>{u.email || u.phone || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {u.niche ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", background: "#1e1e3a", borderRadius: 6, padding: "3px 8px", textTransform: "capitalize" }}>{u.niche}</span>
                    ) : <span style={{ color: "#444", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{(u.total_gens || 0).toLocaleString()}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#34d399" }}>{u.published || 0}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: u.win_rate_pct > 0 ? "#f59e0b" : "#555" }}>
                      {u.win_rate_pct > 0 ? `${u.win_rate_pct}%` : "—"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555" }}>
                      <Clock size={11} />
                      {ago(u.last_active)}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <ChevronRight size={14} style={{ color: "#555" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
