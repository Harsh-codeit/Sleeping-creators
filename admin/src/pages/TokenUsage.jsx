import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Coins, Zap, Hash, TrendingUp } from "lucide-react";
import api from "../api.js";

export default function TokenUsage() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("__all__");
  const [data, setData] = useState(null);
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load user list
  useEffect(() => {
    api.get("/api/admin/users").then(r => setUsers(r.data)).catch(() => {});
  }, []);

  // Load token data when selection changes
  useEffect(() => {
    setLoading(true);
    setData(null);
    if (selectedUser === "__all__") {
      api.get("/api/admin/tokens")
        .then(r => { setAllData(r.data); setData(r.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      api.get(`/api/admin/users/${selectedUser}/tokens`)
        .then(r => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [selectedUser]);

  const kpis = data ? [
    { icon: Hash,     label: "Total Calls",    value: (data.total_calls || 0).toLocaleString(),  color: "#5B5BD6" },
    { icon: Zap,      label: "Total Tokens",   value: (data.total_tokens || 0).toLocaleString(), color: "#8080ff" },
    { icon: Coins,    label: "Est. Cost",      value: `$${(data.estimated_cost_usd || 0).toFixed(4)}`, color: "#f59e0b" },
    { icon: TrendingUp, label: "Avg Tokens/Call", value: data.total_calls ? Math.round(data.total_tokens / data.total_calls).toLocaleString() : "—", color: "#34d399" },
  ] : [];

  const modelBreakdown = data?.model_breakdown ? Object.entries(data.model_breakdown) : [];

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Token Usage</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>AI token consumption and cost estimates from generation_log</p>

      {/* User selector */}
      <div style={{ marginBottom: 24 }}>
        <select
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: "11px 16px", color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer", outline: "none", minWidth: 280 }}
        >
          <option value="__all__">All Users (aggregated)</option>
          {users.map(u => (
            <option key={u._id} value={u._id}>
              {u.name || u.email || u.phone || u._id}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: "#555", fontSize: 14, padding: 20 }}>Loading…</div>
      ) : !data ? (
        <div style={{ color: "#f87171", fontSize: 14, padding: 20 }}>No data</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {kpis.map(({ icon: Icon, label, value, color }) => (
              <div key={label} style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Line chart */}
          {data.daily?.length > 0 && (
            <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Daily Token Usage (30 days)</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="tokens" stroke="#5B5BD6" strokeWidth={2} dot={false} name="Tokens" />
                  <Line type="monotone" dataKey="calls" stroke="#34d399" strokeWidth={1.5} dot={false} name="Calls" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bottom row: model breakdown + per-user table (all users view) */}
          <div style={{ display: "grid", gridTemplateColumns: modelBreakdown.length && selectedUser === "__all__" ? "1fr 2fr" : "1fr", gap: 20 }}>
            {/* Model breakdown */}
            {modelBreakdown.length > 0 && (
              <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>By Model</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                      {["Model", "Calls", "Tokens", "Est. Cost"].map(h => (
                        <th key={h} style={{ padding: "8px 0", textAlign: "left", fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modelBreakdown.map(([model, stats]) => {
                      const shortName = model.includes("haiku") ? "haiku" : model.includes("sonnet") ? "sonnet" : model.split("-").pop();
                      const rate = model.includes("haiku") ? 0.80 : 3.00;
                      const cost = ((stats.tokens || 0) / 1_000_000) * rate;
                      return (
                        <tr key={model} style={{ borderBottom: "1px solid #1e1e1e" }}>
                          <td style={{ padding: "10px 0" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: model.includes("haiku") ? "#34d399" : "#5B5BD6", background: model.includes("haiku") ? "#0a2a1a" : "#1e1e3a", borderRadius: 5, padding: "2px 7px" }}>{shortName}</span>
                          </td>
                          <td style={{ padding: "10px 0", fontSize: 12, color: "#ccc" }}>{(stats.calls || 0).toLocaleString()}</td>
                          <td style={{ padding: "10px 0", fontSize: 12, color: "#ccc" }}>{(stats.tokens || 0).toLocaleString()}</td>
                          <td style={{ padding: "10px 0", fontSize: 12, color: "#f59e0b" }}>${cost.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-user breakdown (all view only) */}
            {selectedUser === "__all__" && data.per_user?.length > 0 && (
              <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Top Users by Token Usage</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                      {["User", "Calls", "Tokens", "Est. Cost"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_user.map(u => (
                      <tr key={u.user_id} style={{ borderBottom: "1px solid #1e1e1e" }}>
                        <td style={{ padding: "10px 10px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{u.name || u.email || u.phone || "—"}</div>
                          <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{u.user_id?.slice(-8)}</div>
                        </td>
                        <td style={{ padding: "10px 10px", fontSize: 12, color: "#ccc" }}>{(u.total_calls || 0).toLocaleString()}</td>
                        <td style={{ padding: "10px 10px", fontSize: 12, color: "#ccc" }}>{(u.total_tokens || 0).toLocaleString()}</td>
                        <td style={{ padding: "10px 10px", fontSize: 12, color: "#f59e0b" }}>${(u.estimated_cost_usd || 0).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
