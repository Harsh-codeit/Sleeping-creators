import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Users, Send, Clock, CheckCircle2, TrendingUp, Circle, RefreshCw, Zap } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORM_COLORS = {
  instagram: "#E1306C", facebook: "#1877F2", linkedin: "#0A66C2",
  twitter: "#1DA1F2", threads: "#000000", youtube: "#FF0000"
};

const STATUS_STYLES = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  error: "text-red-400",
};

const LOG_LEVEL_STYLES = {
  success: "text-emerald-400",
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="stat-card" data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g,'-')}`}>
      <div className="flex items-start justify-between">
        <div className="text-zinc-500 text-xs font-mono uppercase tracking-widest">{label}</div>
        <Icon size={14} className={accent || "text-zinc-600"} />
      </div>
      <div className="mt-3 text-3xl font-bold text-white font-mono">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500 font-mono">{sub}</div>}
    </div>
  );
}

function DailySpend({ series, todayTotal, yesterdayTotal }) {
  const trend = yesterdayTotal > 0
    ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
    : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">AI Spend — Last 7 Days</div>
        <TrendingUp size={13} className="text-zinc-600" />
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={series} barSize={14}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }}
            axisLine={false}
            tickLine={false}
            width={38}
            tickFormatter={(v) => `$${v.toFixed(3)}`}
          />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 11 }}
            labelStyle={{ color: "#a1a1aa" }}
            itemStyle={{ color: "#fff" }}
            formatter={(v) => [`$${Number(v).toFixed(6)}`, "cost"]}
          />
          <Bar dataKey="cost" fill="#ffffff" radius={0} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Today</span>
        <span className="text-sm font-mono text-white">${Number(todayTotal).toFixed(4)}</span>
        {trend !== null && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${trend >= 0 ? "text-amber-400 border-amber-500/30" : "text-emerald-400 border-emerald-500/30"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [clients, setClients] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [spend, setSpend] = useState({ series: [], today_total: 0, yesterday_total: 0 });
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchData = async () => {
    try {
      const [ov, cl, ts, sp] = await Promise.all([
        axios.get(`${API}/dashboard/overview`),
        axios.get(`${API}/clients`),
        axios.get(`${API}/dashboard/time-series?days=14`),
        axios.get(`${API}/dashboard/spend?days=7`),
      ]);
      setOverview(ov.data);
      setClients(cl.data);
      setTimeSeries(ts.data);
      setSpend(sp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const triggerAutomation = async () => {
    setTriggering(true);
    try {
      await axios.post(`${API}/automation/trigger`);
      await fetchData();
    } catch {}
    setTriggering(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-500 font-mono text-sm animate-pulse">LOADING ENGINE DATA...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Command Center</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            {new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          data-testid="trigger-automation-btn"
          onClick={triggerAutomation}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
        >
          <Zap size={14} className={triggering ? "animate-pulse" : ""} />
          {triggering ? "Running..." : "Run Automation"}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Clients" value={overview?.active_clients ?? 0} sub={`of ${overview?.total_clients ?? 0} total`} accent="text-white" />
        <StatCard icon={Send} label="Posts Today" value={overview?.posts_today ?? 0} sub="published successfully" accent="text-emerald-400" />
        <StatCard icon={Clock} label="Queue Size" value={overview?.queue_size ?? 0} sub={`${overview?.scheduled ?? 0} scheduled · ${overview?.drafts ?? 0} drafts`} accent="text-amber-400" />
        <StatCard icon={CheckCircle2} label="Success Rate" value={`${overview?.success_rate ?? 0}%`} sub={`${overview?.published ?? 0} published · ${overview?.failed ?? 0} failed`} accent="text-blue-400" />
      </div>

      {/* Chart + Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Time Series Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Posts Published — Last 14 Days</div>
            <TrendingUp size={13} className="text-zinc-600" />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="postGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fff" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={25} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 11 }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "#fff" }}
              />
              <Area type="monotone" dataKey="posts" stroke="#fff" strokeWidth={1.5} fill="url(#postGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Daily AI Spend */}
        <DailySpend
          series={spend.series}
          todayTotal={spend.today_total}
          yesterdayTotal={spend.yesterday_total}
        />
      </div>

      {/* Clients Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client Status */}
        <div className="bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Client Status</div>
            <button onClick={() => navigate("/clients")} className="text-xs text-zinc-500 hover:text-white transition-colors duration-150 font-mono">
              View All →
            </button>
          </div>
          <div>
            {clients.map((client) => (
              <div
                key={client.id}
                className="data-row px-4 py-3 cursor-pointer"
                onClick={() => navigate(`/clients/${client.id}`)}
                data-testid={`client-row-${client.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {client.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{client.name}</span>
                      <Circle size={6} className={`fill-current ${STATUS_STYLES[client.status] || "text-zinc-500"}`} />
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">{client.industry}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-white">{client.posts_today}</div>
                    <div className="text-[10px] text-zinc-600 font-mono">today</div>
                  </div>
                </div>
                <div className="flex gap-1 mt-2 ml-11">
                  {(client.platforms || []).slice(0, 6).map((p) => (
                    <span
                      key={p}
                      className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-400"
                    >
                      {p.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Recent Activity</div>
            <button onClick={() => navigate("/logs")} className="text-xs text-zinc-500 hover:text-white transition-colors duration-150 font-mono">
              View Logs →
            </button>
          </div>
          <div className="divide-y divide-zinc-800">
            {(overview?.recent_activity || []).slice(0, 8).map((log, i) => (
              <div key={log.id || i} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-mono font-semibold uppercase w-14 flex-shrink-0 mt-0.5 ${LOG_LEVEL_STYLES[log.level] || "text-zinc-400"}`}>
                    {log.level}
                  </span>
                  <span className="text-xs text-zinc-300 font-mono leading-relaxed">{log.message}</span>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono mt-0.5 ml-16">
                  {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
