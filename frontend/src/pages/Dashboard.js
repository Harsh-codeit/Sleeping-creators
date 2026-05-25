import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Users, Send, Clock, CheckCircle2, TrendingUp, Circle, Zap, Activity, CalendarClock, AlertTriangle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_STYLES = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  error: "text-red-400",
};


const BADGE_COLORS = {
  red:   "text-red-400 border-red-500/30",
  amber: "text-amber-400 border-amber-500/30",
  blue:  "text-blue-400 border-blue-500/30",
};

// ─── Design system primitives ────────────────────────────────────────────────

function Card({ children, className = "", testId }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

function CardHeader({ label, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
      <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-2">
        {action}
        {Icon && <Icon size={13} className="text-zinc-600" />}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accentClass, testId }) {
  return (
    <Card testId={testId} className="p-5">
      <div className="flex items-start justify-between mb-5">
        <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest leading-tight">{label}</span>
        <div className={`p-1.5 border border-zinc-700 bg-zinc-800 ${accentClass}`}>
          <Icon size={12} />
        </div>
      </div>
      <div className="text-3xl font-bold text-white font-mono leading-none">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-zinc-500 font-mono">{sub}</div>}
    </Card>
  );
}

// ─── Health helpers ───────────────────────────────────────────────────────────

function daysAgo(isoString) {
  if (!isoString) return Infinity;
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return Infinity;
  return (Date.now() - ms) / (1000 * 60 * 60 * 24);
}

function computeHealthIssues(client, bundleConfigured) {
  const issues = [];
  if (!bundleConfigured) issues.push({ badge: "NO BUNDLE", color: "red", priority: 1 });
  const igConnected = client.instagram_connected || (client.bundle_platforms || []).includes("instagram");
  if ((client.platforms || []).includes("instagram") && !igConnected)
    issues.push({ badge: "NO INSTAGRAM", color: "red", priority: 2 });
  if (client.instagram_publish_blocked) issues.push({ badge: "BLOCKED", color: "red", priority: 3 });
  if ((client.posts_failed || 0) > 0) issues.push({ badge: "POST FAILED", color: "red", priority: 4 });
  if (daysAgo(client.last_post_at) > 7) issues.push({ badge: "INACTIVE 7D", color: "amber", priority: 6 });
  return issues.sort((a, b) => a.priority - b.priority);
}

function getFixRoute(clientId, issues) {
  const top = issues.find((i) => i.color === "red" || i.color === "amber");
  if (!top) return null;
  return `/clients/${clientId}`;
}

// ─── Panel components ─────────────────────────────────────────────────────────

function DailySpend({ series, todayTotal, yesterdayTotal }) {
  const trend = yesterdayTotal > 0
    ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
    : null;

  return (
    <Card testId="daily-spend-chart">
      <CardHeader label="AI Spend — Last 7 Days" icon={TrendingUp} />
      <div className="p-4">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={series} barSize={14}>
            <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => `$${v.toFixed(3)}`} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 11 }}
              labelStyle={{ color: "#a1a1aa" }}
              itemStyle={{ color: "#fff" }}
              formatter={(v) => [`$${Number(v).toFixed(6)}`, "cost"]}
            />
            <Bar dataKey="cost" fill="#ffffff" radius={0} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-3">
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Today</span>
          <span className="text-sm font-mono text-white">${Number(todayTotal).toFixed(4)}</span>
          {trend !== null && (
            <span
              data-testid="spend-trend-chip"
              className={`text-[10px] font-mono px-1.5 py-0.5 border ${trend >= 0 ? "text-amber-400 border-amber-500/30" : "text-emerald-400 border-emerald-500/30"}`}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function PostsChart({ timeSeries }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader label="Posts Published — Last 14 Days" icon={Activity} />
      <div className="p-4">
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
    </Card>
  );
}

function ClientStatusCard({ clientsWithIssues, navigate }) {
  return (
    <Card>
      <CardHeader
        label="Client Status"
        action={
          <button
            onClick={() => navigate("/clients")}
            className="text-[11px] text-zinc-500 hover:text-white transition-colors duration-150 font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            View All →
          </button>
        }
      />
      <div>
        {clientsWithIssues.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] font-mono text-zinc-600">All clients healthy</div>
        )}
        {clientsWithIssues.map((client) => (
          <div
            key={client.id}
            className="px-4 py-3 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40 transition-colors duration-150 cursor-pointer"
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
                <div className="text-[11px] text-zinc-500 font-mono">{client.industry}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-white">{client.posts_today}</div>
                <div className="text-[10px] text-zinc-600 font-mono">today</div>
              </div>
            </div>
            <div className="flex gap-1 mt-2 ml-11 flex-wrap">
              {(client.platforms || []).slice(0, 6).map((p) => (
                <span key={p} className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-400">
                  {p.toUpperCase()}
                </span>
              ))}
            </div>
            {(() => {
              const issues = client._issues;
              if (issues.length === 0) return null;
              const fixRoute = getFixRoute(client.id, issues);
              const errorDetail =
                issues.some((i) => i.badge === "POST FAILED") && client.last_post_error
                  ? client.last_post_error
                  : issues.some((i) => i.badge === "BLOCKED") && client.instagram_account_warning
                  ? client.instagram_account_warning
                  : null;
              return (
                <div className="mt-1.5 ml-11">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {issues.map(({ badge, color }) => (
                      <span key={badge} className={`text-[9px] font-mono px-1.5 py-0.5 border ${BADGE_COLORS[color]}`}>
                        {badge}
                      </span>
                    ))}
                    {fixRoute && (
                      <button
                        type="button"
                        data-testid={`client-fix-btn-${client.id}`}
                        onClick={(e) => { e.stopPropagation(); navigate(fixRoute); }}
                        className="ml-auto text-[10px] font-mono border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800 hover:border-zinc-500 transition-colors duration-150 cursor-pointer focus:ring-2 focus:ring-zinc-500 focus:outline-none"
                      >
                        Fix →
                      </button>
                    )}
                  </div>
                  {errorDetail && (
                    <div className="mt-1 text-[10px] font-mono text-zinc-500 truncate max-w-xs" title={errorDetail}>
                      {errorDetail}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </Card>
  );
}

const PLATFORM_SHORT = { instagram: "IG", facebook: "FB", tiktok: "TT", linkedin: "LI", twitter: "TW", youtube: "YT", threads: "TH", pinterest: "PT" };

function UpcomingQueueCard({ upcoming }) {
  if (!upcoming) return null;
  return (
    <Card>
      <CardHeader label="Upcoming Queue" icon={CalendarClock} />
      <div>
        {upcoming.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] font-mono text-zinc-600">No posts scheduled</div>
        )}
        {upcoming.map((post, i) => {
          const d = post.scheduled_at ? new Date(post.scheduled_at) : null;
          const timeStr = d
            ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
            : "—";
          return (
            <div key={post.id || i} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 last:border-b-0">
              <span className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-400 flex-shrink-0 w-7 text-center">
                {PLATFORM_SHORT[post.platform] || (post.platform || "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="text-xs font-mono text-white truncate flex-1">{post.client_name || post.client_id}</span>
              <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">{timeStr}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const SOURCE_LABEL = { post: "POST", pipeline: "PIPELINE", log: "LOG" };
const SOURCE_STYLES = { post: "text-red-400", pipeline: "text-amber-400", log: "text-zinc-500" };

function ErrorsReportCard({ errors, navigate }) {
  if (!errors) return null;
  return (
    <Card>
      <CardHeader
        label="Errors Report"
        icon={AlertTriangle}
        action={
          <button
            onClick={() => navigate("/logs")}
            className="text-[11px] text-zinc-500 hover:text-white transition-colors duration-150 font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            View Logs →
          </button>
        }
      />
      <div>
        {errors.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] font-mono text-zinc-600">No errors</div>
        )}
        {errors.map((err, i) => {
          const ts = err.ts ? new Date(err.ts) : null;
          const timeStr = ts
            ? ts.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
            : "";
          return (
            <div key={i} className="px-4 py-2.5 border-b border-zinc-800 last:border-b-0">
              <div className="flex items-start gap-2">
                <span className={`text-[9px] font-mono font-semibold uppercase flex-shrink-0 mt-0.5 w-16 ${SOURCE_STYLES[err.source]}`}>
                  {SOURCE_LABEL[err.source]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-white truncate">{err.label}</span>
                    {err.sub && err.sub !== "log" && (
                      <span className="text-[9px] font-mono px-1 py-0.5 border border-zinc-700 text-zinc-500 flex-shrink-0">{err.sub.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5" title={err.detail}>{err.detail}</div>
                </div>
              </div>
              {timeStr && <div className="text-[10px] font-mono text-zinc-700 mt-0.5 ml-[4.5rem]">{timeStr}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [clients, setClients] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [spend, setSpend] = useState({ series: [], today_total: 0, yesterday_total: 0 });
  const [upcoming, setUpcoming] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const clientsWithIssues = useMemo(
    () => clients
      .map((c) => ({ ...c, _issues: computeHealthIssues(c, overview?.bundle_configured) }))
      .filter((c) => c._issues.length > 0),
    [clients, overview?.bundle_configured]
  );

  const fetchData = async () => {
    try {
      const [ov, cl, ts] = await Promise.all([
        axios.get(`${API}/dashboard/overview`),
        axios.get(`${API}/clients`),
        axios.get(`${API}/dashboard/time-series?days=14`),
      ]);
      setOverview(ov.data);
      setClients(cl.data);
      setTimeSeries(ts.data);
      const [sp, uq, er] = await Promise.allSettled([
        axios.get(`${API}/dashboard/spend?days=7`),
        axios.get(`${API}/dashboard/upcoming`),
        axios.get(`${API}/dashboard/errors`),
      ]);
      if (sp.status === "fulfilled") setSpend(sp.value.data);
      if (uq.status === "fulfilled") setUpcoming(uq.value.data);
      if (er.status === "fulfilled") setErrors(er.value.data);
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
    <div className="p-6 space-y-4" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
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
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <Zap size={14} className={triggering ? "animate-pulse" : ""} />
          {triggering ? "Running..." : "Run Automation"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Active Clients"
          value={overview?.active_clients ?? 0}
          sub={`of ${overview?.total_clients ?? 0} total`}
          accentClass="text-white"
          testId="stat-card-active-clients"
        />
        <StatCard
          icon={Send} label="Posts Today"
          value={overview?.posts_today ?? 0}
          sub="published successfully"
          accentClass="text-emerald-400"
          testId="stat-card-posts-today"
        />
        <StatCard
          icon={Clock} label="Queue Size"
          value={overview?.queue_size ?? 0}
          sub={`${overview?.scheduled ?? 0} scheduled · ${overview?.drafts ?? 0} drafts`}
          accentClass="text-amber-400"
          testId="stat-card-queue-size"
        />
        <StatCard
          icon={CheckCircle2} label="Success Rate"
          value={`${overview?.success_rate ?? 0}%`}
          sub={`${overview?.published ?? 0} published · ${overview?.failed ?? 0} failed`}
          accentClass="text-blue-400"
          testId="stat-card-success-rate"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PostsChart timeSeries={timeSeries} />
        <DailySpend
          series={spend.series}
          todayTotal={spend.today_total}
          yesterdayTotal={spend.yesterday_total}
        />
      </div>

      {/* Client Issues + Upcoming + Pipelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClientStatusCard clientsWithIssues={clientsWithIssues} navigate={navigate} />
        <UpcomingQueueCard upcoming={upcoming} />
        <ErrorsReportCard errors={errors} navigate={navigate} />
      </div>
    </div>
  );
}
