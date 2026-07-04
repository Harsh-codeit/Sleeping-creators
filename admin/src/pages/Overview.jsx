import { useState, useEffect } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, Zap, CheckCircle, Clock, Cpu } from "lucide-react";
import api from "../api.js";

const COLORS = ["#5B5BD6", "#34d399", "#f59e0b", "#f87171", "#a78bfa"];

function KpiCard({ icon: Icon, label, value, sub, color = "#5B5BD6" }) {
  return (
    <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/admin/overview").then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <Err />;

  const hookData = Object.entries(data.hook_type_distribution || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const modelData = Object.entries(data.model_breakdown || {}).map(([name, value]) => ({ name, value }));

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>AI Engine Overview</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 28 }}>Real-time metrics from sc_mobile generation pipeline</p>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
        <KpiCard icon={Users}       label="Total Users"    value={data.total_users}       color="#5B5BD6" />
        <KpiCard icon={Zap}         label="Generations"    value={data.total_generations}  sub={`${data.generations_7d} this week`} color="#8080ff" />
        <KpiCard icon={CheckCircle} label="Success Rate"   value={`${data.success_rate_pct}%`} color="#34d399" />
        <KpiCard icon={Clock}       label="Avg Latency"    value={`${(data.avg_latency_ms/1000).toFixed(1)}s`} color="#f59e0b" />
        <KpiCard icon={Cpu}         label="Avg Tokens"     value={Math.round(data.avg_tokens).toLocaleString()} color="#a78bfa" />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Daily generations */}
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Daily Generations (14 days)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.daily_counts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="#5B5BD6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Model breakdown */}
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Model Split</div>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={modelData} dataKey="value" cx="50%" cy="50%" outerRadius={50} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {modelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {modelData.map((m, i) => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: "#888" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
                <span style={{ color: "#ccc" }}>{m.name}</span>: {m.value.toLocaleString()}
              </div>
            ))}
          </div>
        </div>

        {/* Top niches */}
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Top Niches</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data.top_niches || []).map(({ niche, user_count }) => (
              <div key={niche} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#ccc", textTransform: "capitalize" }}>{niche}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#5B5BD6" }}>{user_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hook type distribution */}
      {hookData.length > 0 && (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Hook Type Usage</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hookData} layout="vertical" margin={{ top: 0, right: 16, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#ccc", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="#8080ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return <div style={{ padding: 40, color: "#555", fontSize: 14 }}>Loading…</div>;
}
function Err() {
  return <div style={{ padding: 40, color: "#f87171", fontSize: 14 }}>Failed to load overview. Check backend connection.</div>;
}
