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

const ACTOR_COLORS = {
  "apify~instagram-scraper":         "#fbbf24",
  "apify~linkedin-profile-scraper":  "#60a5fa",
};

const TYPE_LABELS = {
  text_post:      "Text Post",
  carousel_pass1: "Carousel Pass 1",
  carousel_pass2: "Carousel Pass 2",
  carousel_pass3: "Carousel Pass 3",
  carousel_pass4: "Carousel Pass 4",
  competitor:     "Competitor Analysis",
};

const PLATFORM_LABELS = {
  instagram: "Instagram",
  linkedin:  "LinkedIn",
};

const shortActor = a => (a || "").replace("apify~", "").replace("-scraper", "").replace("-profile", "");

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
  const [provider, setProvider] = useState("claude"); // "claude" | "apify"
  const [days, setDays] = useState(30);
  const [summary, setSummary]   = useState(null);
  const [daily, setDaily]       = useState([]);
  const [clients, setClients]   = useState([]);
  const [log, setLog]           = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage]   = useState(1);
  const [filter, setFilter]     = useState(""); // generation_type (Claude) or platform (Apify)
  const [loading, setLoading]   = useState(true);

  const isApify = provider === "apify";
  const base = isApify ? `${API}/usage/apify` : `${API}/usage`;
  const accent = isApify ? "text-amber-400" : "text-violet-400";
  const accentHex = isApify ? "#fbbf24" : "#a78bfa";

  // Reset secondary filter and page when provider switches
  useEffect(() => {
    setFilter("");
    setLogPage(1);
  }, [provider]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [s, d, c] = await Promise.all([
          axios.get(`${base}/summary?days=${days}`),
          axios.get(`${base}/daily?days=${days}`),
          axios.get(`${base}/clients?days=${days}`),
        ]);
        setSummary(s.data);
        setDaily(d.data);
        setClients(c.data);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, [days, base]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const params = new URLSearchParams({ page: logPage, limit: 50 });
        if (filter) params.set(isApify ? "platform" : "generation_type", filter);
        const r = await axios.get(`${base}/log?${params}`);
        setLog(r.data);
      } catch {}
    };
    fetch();
  }, [logPage, filter, base, isApify]);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const totalCost = summary?.total_cost_usd || 0;

  let stat2 = null, stat3 = null, stat4 = null;
  if (isApify) {
    const totalRuns = summary?.total_runs || 0;
    const totalResults = summary?.total_results || 0;
    const avgPerRun = totalRuns > 0 ? `$${(totalCost / totalRuns).toFixed(5)}` : "—";
    stat2 = { label: "Total Runs",     value: totalRuns.toLocaleString(),    sub: "actor invocations", icon: Zap };
    stat3 = { label: "Posts Scraped",  value: totalResults.toLocaleString(), sub: "results returned",  icon: TrendingUp };
    stat4 = { label: "Avg Cost / Run", value: avgPerRun,                     sub: "all actors",        icon: Coins, color: "text-emerald-400" };
  } else {
    const totalGenTypes = Object.values(summary?.by_generation_type || {}).reduce((s, v) => s + v.count, 0);
    const avgCostPerGen = totalGenTypes > 0 ? `$${(totalCost / totalGenTypes).toFixed(5)}` : "—";
    const totalInPeriod = (summary?.by_generation_type?.text_post?.count || 0)
      + (summary?.by_generation_type?.carousel_pass1?.count || 0);
    stat2 = { label: "Total Tokens",   value: (summary?.total_tokens || 0).toLocaleString(), sub: "input + output",      icon: Zap };
    stat3 = { label: "Generations",    value: totalInPeriod.toLocaleString(),                 sub: "posts + carousels",   icon: TrendingUp };
    stat4 = { label: "Avg Cost / Gen", value: avgCostPerGen,                                  sub: "all types combined",  icon: Coins, color: "text-emerald-400" };
  }

  // Top-right bar chart data: actor for Apify, model for Claude
  const topRightData = isApify
    ? Object.entries(summary?.by_actor || {}).map(([actor, v]) => ({
        key: shortActor(actor),
        cost_usd: v.cost_usd,
        fill: ACTOR_COLORS[actor] || "#71717a",
      }))
    : Object.entries(summary?.by_model || {}).map(([model, v]) => ({
        key: model.replace("claude-", "").replace("-20251001", ""),
        cost_usd: v.cost_usd,
        fill: MODEL_COLORS[model] || "#71717a",
      }));

  // Secondary bar chart data: platform for Apify, generation type for Claude
  const secondaryData = isApify
    ? Object.entries(summary?.by_platform || {}).map(([plat, v]) => ({
        type: PLATFORM_LABELS[plat] || plat,
        cost_usd: v.cost_usd,
      }))
    : Object.entries(summary?.by_generation_type || {}).map(([type, v]) => ({
        type: TYPE_LABELS[type] || type,
        count: v.count,
        cost_usd: v.cost_usd,
      }));

  const headerSubtitle = isApify
    ? "Apify scrape spend by client, actor, and platform"
    : "Anthropic API spend by client, model, and generation type";

  return (
    <div className="p-6 space-y-6" data-testid="usage-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            {isApify ? "Apify Usage & Cost" : "Token Usage & Cost"}
          </h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{headerSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="provider-select"
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono px-2 py-1.5 focus:outline-none"
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="apify">Apify</option>
          </select>
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
      </div>

      {loading && (
        <div className="text-zinc-500 text-sm font-mono">Loading…</div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Cost"
            value={`$${totalCost.toFixed(4)}`}
            sub={`last ${days} days`}
            icon={Coins}
            color={accent}
          />
          <StatCard {...stat2} />
          <StatCard {...stat3} />
          <StatCard {...stat4} />
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
                <Line type="monotone" dataKey="cost_usd" name="Cost (USD)" stroke={accentHex} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cost by Model / Actor bar chart */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-4">
            {isApify ? "Cost by Actor" : "Cost by Model"}
          </div>
          {topRightData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-zinc-600 text-xs font-mono">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={topRightData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} />
                <YAxis type="category" dataKey="key" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cost_usd" name="Cost (USD)" radius={[0, 2, 2, 0]}>
                  {topRightData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Generation Type / Platform breakdown */}
      {secondaryData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-4">
            {isApify ? "Cost by Platform" : "Cost by Generation Type"}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={secondaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost_usd" name="Cost (USD)" fill={accentHex} radius={[2, 2, 0, 0]} />
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
                <th className="text-right px-4 py-2">{isApify ? "Runs" : "Tokens"}</th>
                <th className="text-right px-4 py-2">Cost (USD)</th>
                <th className="text-right px-4 py-2">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const pct = totalCost > 0
                  ? ((c.total_cost_usd / totalCost) * 100).toFixed(1)
                  : "0.0";
                const metric = isApify ? c.total_runs : c.total_tokens;
                return (
                  <tr key={c.client_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2 text-white">{c.client_name || c.client_id}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{(metric || 0).toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right ${accent}`}>${c.total_cost_usd.toFixed(4)}</td>
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
            value={filter}
            onChange={e => { setFilter(e.target.value); setLogPage(1); }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono px-2 py-1 focus:outline-none"
          >
            {isApify ? (
              <>
                <option value="">All platforms</option>
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </>
            ) : (
              <>
                <option value="">All types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </>
            )}
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
                  {isApify ? (
                    <>
                      <th className="text-left px-4 py-2">Actor</th>
                      <th className="text-left px-4 py-2">Platform</th>
                      <th className="text-left px-4 py-2">Client</th>
                      <th className="text-left px-4 py-2">Competitor</th>
                      <th className="text-right px-4 py-2">Results</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-left px-4 py-2">Model</th>
                      <th className="text-left px-4 py-2">Client</th>
                      <th className="text-right px-4 py-2">In</th>
                      <th className="text-right px-4 py-2">Out</th>
                    </>
                  )}
                  <th className="text-right px-4 py-2">Cost</th>
                  <th className="text-right px-4 py-2">OK</th>
                </tr>
              </thead>
              <tbody>
                {log.items.map(item => (
                  <tr key={item.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-1.5 text-zinc-500">{item.created_at?.slice(0, 16).replace("T", " ")}</td>
                    {isApify ? (
                      <>
                        <td className="px-4 py-1.5 text-zinc-300">{shortActor(item.actor)}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{PLATFORM_LABELS[item.platform] || item.platform}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{item.client_name || "—"}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{item.competitor_handle || "—"}</td>
                        <td className="px-4 py-1.5 text-right text-zinc-500">{(item.results_count || 0).toLocaleString()}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-1.5 text-zinc-300">{TYPE_LABELS[item.generation_type] || item.generation_type}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{item.model?.replace("claude-", "").replace("-20251001", "")}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{item.client_name || "—"}</td>
                        <td className="px-4 py-1.5 text-right text-zinc-500">{item.input_tokens?.toLocaleString()}</td>
                        <td className="px-4 py-1.5 text-right text-zinc-500">{item.output_tokens?.toLocaleString()}</td>
                      </>
                    )}
                    <td className={`px-4 py-1.5 text-right ${accent}`}>${item.cost_usd?.toFixed(6)}</td>
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
