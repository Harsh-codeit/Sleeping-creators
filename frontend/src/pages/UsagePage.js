import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid
} from "recharts";
import { Coins, Zap, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODEL_COLORS = {
  "claude-sonnet-4-5": "#a78bfa",
  "claude-haiku-4-5-20251001": "#34d399",
};

const TYPE_LABELS = {
  text_post:      "Text Post",
  carousel_pass1: "Carousel Pass 1",
  carousel_pass2: "Carousel Pass 2",
  carousel_pass3: "Carousel Pass 3",
  carousel_pass4: "Carousel Pass 4",
  competitor:     "Competitor Analysis",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="text-white">
          {p.name}: <span style={{ color: p.color }}>{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

function StatCard({ label, value, sub, icon: Icon, color = "text-white" }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={14} className="text-zinc-600 mt-0.5" />}
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1 font-mono">{sub}</div>}
    </div>
  );
}

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary]   = useState(null);
  const [daily, setDaily]       = useState([]);
  const [clients, setClients]   = useState([]);
  const [log, setLog]           = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage]   = useState(1);
  const [genFilter, setGenFilter] = useState("");
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [s, d, c] = await Promise.all([
          axios.get(`${API}/usage/summary?days=${days}`),
          axios.get(`${API}/usage/daily?days=${days}`),
          axios.get(`${API}/usage/clients?days=${days}`),
        ]);
        setSummary(s.data);
        setDaily(d.data);
        setClients(c.data);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, [days]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const params = new URLSearchParams({ page: logPage, limit: 50 });
        if (genFilter) params.set("generation_type", genFilter);
        const r = await axios.get(`${API}/usage/log?${params}`);
        setLog(r.data);
      } catch {}
    };
    fetch();
  }, [logPage, genFilter]);

  const totalGenTypes = Object.values(summary?.by_generation_type || {}).reduce((s, v) => s + v.count, 0);
  const avgCostPerGen = totalGenTypes > 0
    ? `$${((summary?.total_cost_usd || 0) / totalGenTypes).toFixed(5)}`
    : "—";

  const modelBarData = Object.entries(summary?.by_model || {}).map(([model, v]) => ({
    model: model.replace("claude-", "").replace("-20251001", ""),
    tokens: v.tokens,
    cost_usd: v.cost_usd,
    fill: MODEL_COLORS[model] || "#71717a",
  }));

  const typeBarData = Object.entries(summary?.by_generation_type || {}).map(([type, v]) => ({
    type: TYPE_LABELS[type] || type,
    count: v.count,
    cost_usd: v.cost_usd,
  }));

  const totalInPeriod = (summary?.by_generation_type?.text_post?.count || 0)
    + (summary?.by_generation_type?.carousel_pass1?.count || 0);

  return (
    <div className="p-6 space-y-6" data-testid="usage-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Token Usage &amp; Cost</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">Anthropic API spend by client, model, and generation type</p>
        </div>
        <div className="flex items-center gap-1 border border-zinc-800">
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                days === d ? "bg-white text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-zinc-500 text-sm font-mono">Loading…</div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Cost"
            value={`$${summary.total_cost_usd.toFixed(4)}`}
            sub={`last ${days} days`}
            icon={Coins}
            color="text-violet-400"
          />
          <StatCard
            label="Total Tokens"
            value={summary.total_tokens.toLocaleString()}
            sub="input + output"
            icon={Zap}
          />
          <StatCard
            label="Generations"
            value={totalInPeriod.toLocaleString()}
            sub="posts + carousels"
            icon={TrendingUp}
          />
          <StatCard
            label="Avg Cost / Gen"
            value={avgCostPerGen}
            sub="all types combined"
            icon={Coins}
            color="text-emerald-400"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily cost line chart */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-4">Daily Cost (USD)</div>
          {daily.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-zinc-600 text-xs font-mono">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="cost_usd" name="Cost (USD)" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cost by model bar chart */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-4">Cost by Model</div>
          {modelBarData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-zinc-600 text-xs font-mono">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={modelBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cost_usd" name="Cost (USD)" radius={[0, 2, 2, 0]}>
                  {modelBarData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Generation type breakdown */}
      {typeBarData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-4">Cost by Generation Type</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={typeBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost_usd" name="Cost (USD)" fill="#a78bfa" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-client table */}
      {clients.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800">
          <div className="px-4 py-3 border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Cost by Client
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-right px-4 py-2">Tokens</th>
                <th className="text-right px-4 py-2">Cost (USD)</th>
                <th className="text-right px-4 py-2">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const pct = summary?.total_cost_usd > 0
                  ? ((c.total_cost_usd / summary.total_cost_usd) * 100).toFixed(1)
                  : "0.0";
                return (
                  <tr key={c.client_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2 text-white">{c.client_name || c.client_id}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{c.total_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-violet-400">${c.total_cost_usd.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw log */}
      <div className="bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Usage Log</span>
          <select
            value={genFilter}
            onChange={e => { setGenFilter(e.target.value); setLogPage(1); }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono px-2 py-1 focus:outline-none"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {log.items.length === 0 ? (
          <div className="px-4 py-8 text-zinc-600 text-xs font-mono text-center">No records yet</div>
        ) : (
          <>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Model</th>
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-right px-4 py-2">In</th>
                  <th className="text-right px-4 py-2">Out</th>
                  <th className="text-right px-4 py-2">Cost</th>
                  <th className="text-right px-4 py-2">OK</th>
                </tr>
              </thead>
              <tbody>
                {log.items.map(item => (
                  <tr key={item.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-1.5 text-zinc-500">{item.created_at?.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-4 py-1.5 text-zinc-300">{TYPE_LABELS[item.generation_type] || item.generation_type}</td>
                    <td className="px-4 py-1.5 text-zinc-400">{item.model?.replace("claude-", "").replace("-20251001", "")}</td>
                    <td className="px-4 py-1.5 text-zinc-400">{item.client_name || "—"}</td>
                    <td className="px-4 py-1.5 text-right text-zinc-500">{item.input_tokens?.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right text-zinc-500">{item.output_tokens?.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right text-violet-400">${item.cost_usd?.toFixed(6)}</td>
                    <td className={`px-4 py-1.5 text-right ${item.success ? "text-emerald-500" : "text-red-500"}`}>
                      {item.success ? "✓" : "✗"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {log.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 font-mono">{log.total} records</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogPage(p => Math.max(1, p - 1))}
                    disabled={logPage === 1}
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-mono text-zinc-400">{logPage} / {log.pages}</span>
                  <button
                    onClick={() => setLogPage(p => Math.min(log.pages, p + 1))}
                    disabled={logPage === log.pages}
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
