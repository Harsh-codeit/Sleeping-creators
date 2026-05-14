import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Users, Eye, PlayCircle, Heart, MessageCircle,
  UserCheck, EyeOff, Film, LayoutGrid, TrendingUp,
} from "lucide-react";
import MonthlyTrendChart from "./MonthlyTrendChart";

export const PLATFORM_COLORS = {
  instagram: "#E1306C",
  facebook:  "#1877F2",
  linkedin:  "#0A66C2",
  twitter:   "#1DA1F2",
  threads:   "#71767B",
  youtube:   "#FF0000",
  tiktok:    "#FE2C55",
  pinterest: "#E60023",
  reddit:    "#FF4500",
  bluesky:   "#1185FE",
};

const KPI_DEFS = [
  { key: "followers",         label: "Followers",         Icon: Users,         accent: "text-white",       fmt: "number" },
  { key: "impressions",       label: "Impressions",       Icon: Eye,           accent: "text-blue-400",    fmt: "number" },
  { key: "views",             label: "Views",             Icon: PlayCircle,    accent: "text-emerald-400", fmt: "number" },
  { key: "likes",             label: "Likes",             Icon: Heart,         accent: "text-pink-400",    fmt: "number" },
  { key: "comments",          label: "Comments",          Icon: MessageCircle, accent: "text-purple-400",  fmt: "number" },
  { key: "following",         label: "Following",         Icon: UserCheck,     accent: "text-zinc-400",    fmt: "number" },
  { key: "impressions_unique",label: "Uniq. Impressions", Icon: EyeOff,        accent: "text-sky-400",     fmt: "number" },
  { key: "views_unique",      label: "Uniq. Views",       Icon: Film,          accent: "text-teal-400",    fmt: "number" },
  { key: "post_count",        label: "Posts",             Icon: LayoutGrid,    accent: "text-orange-400",  fmt: "number" },
  { key: "engagement_rate",   label: "Eng. Rate",         Icon: TrendingUp,    accent: "text-yellow-400",  fmt: "percent" },
];

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 0,
  fontSize: 11,
};

const kFormat = v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v;

function timeAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ChartSection({ title, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">{title}</div>
      {children}
    </div>
  );
}

function PerformanceChart({ chartData }) {
  if (!chartData.length) return <EmptyChart />;
  return (
    <ChartSection title="Performance by Platform">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="platform" tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={kFormat} tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#27272a" }} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono", paddingTop: 8 }} />
          <Bar dataKey="followers"   name="Followers"   fill="#a1a1aa" radius={0} />
          <Bar dataKey="impressions" name="Impressions" fill="#60a5fa" radius={0} />
          <Bar dataKey="views"       name="Views"       fill="#34d399" radius={0} />
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

function EngagementChart({ chartData }) {
  if (!chartData.length) return <EmptyChart />;
  return (
    <ChartSection title="Engagement by Platform">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="platform" tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tickFormatter={kFormat} tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={36} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#27272a" }} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono", paddingTop: 8 }} />
          <Bar yAxisId="left" dataKey="likes"    name="Likes"    fill="#f472b6" radius={0} />
          <Bar yAxisId="left" dataKey="comments" name="Comments" fill="#c084fc" radius={0} />
          <Line yAxisId="right" type="monotone" dataKey="engagement_rate" name="Eng. Rate %" stroke="#fbbf24" dot={{ r: 3 }} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

function ReachChart({ chartData }) {
  if (!chartData.length) return <EmptyChart />;
  return (
    <ChartSection title="Reach vs Unique Views">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis type="number" tickFormatter={kFormat} tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="platform" tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={70} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#27272a" }} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono", paddingTop: 8 }} />
          <Bar dataKey="impressions_unique" name="Uniq. Reach"  fill="#38bdf8" radius={0} />
          <Bar dataKey="views_unique"       name="Uniq. Views"  fill="#2dd4bf" radius={0} />
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

function EmptyChart() {
  return (
    <div className="h-40 flex items-center justify-center text-zinc-600 font-mono text-xs">
      No connected platforms yet
    </div>
  );
}

const TABLE_COLS = [
  { label: "Account",          key: null,                  cls: "min-w-[160px]" },
  { label: "Followers",        key: "followers",           cls: "min-w-[90px] text-center" },
  { label: "Following",        key: "following",           cls: "min-w-[90px] text-center" },
  { label: "Impressions",      key: "impressions",         cls: "min-w-[100px] text-center" },
  { label: "Uniq. Impr.",      key: "impressions_unique",  cls: "min-w-[100px] text-center" },
  { label: "Views",            key: "views",               cls: "min-w-[80px] text-center" },
  { label: "Uniq. Views",      key: "views_unique",        cls: "min-w-[90px] text-center" },
  { label: "Likes",            key: "likes",               cls: "min-w-[70px] text-center" },
  { label: "Comments",         key: "comments",            cls: "min-w-[80px] text-center" },
  { label: "Posts",            key: "post_count",          cls: "min-w-[60px] text-center" },
  { label: "Eng. Rate",        key: "engagement_rate",     cls: "min-w-[80px] text-center" },
  { label: "Refreshed",        key: null,                  cls: "min-w-[80px] text-right" },
];

export default function ClientAnalyticsPanel({ data, history, compact = false }) {
  const totals = data?.totals || {};
  const socials = data?.bundle?.socials || [];
  const breakdown = data?.platform_breakdown || {};

  const chartData = Object.entries(breakdown).map(([platform, v]) => ({
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    followers:          v.followers || 0,
    following:          v.following || 0,
    impressions:        v.impressions || 0,
    impressions_unique: v.impressions_unique || 0,
    views:              v.views || 0,
    views_unique:       v.views_unique || 0,
    likes:              v.likes || 0,
    comments:           v.comments || 0,
    post_count:         v.post_count || 0,
    engagement_rate:    v.engagement_rate || 0,
    fill: PLATFORM_COLORS[platform] || "#71717a",
  }));

  return (
    <div className="space-y-4" data-testid="client-analytics-panel">
      <div className={`grid gap-3 grid-cols-2 sm:grid-cols-5`}>
        {KPI_DEFS.map(({ key, label, Icon, accent, fmt }) => (
          <div key={key} className="bg-zinc-900 border border-zinc-800 p-4" data-testid={`kpi-${key}`}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{label}</div>
              <Icon size={13} className={accent} />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-2">
              {fmt === "percent"
                ? `${(totals[key] ?? 0).toFixed(2)}%`
                : (totals[key] ?? 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <MonthlyTrendChart history={history} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PerformanceChart chartData={chartData} />
        <EngagementChart chartData={chartData} />
        <ReachChart chartData={chartData} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Per-Platform</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-zinc-800">
                {TABLE_COLS.map(col => (
                  <th
                    key={col.label}
                    className={`px-3 py-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest font-normal ${col.cls}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {socials.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length} className="px-4 py-6 text-center text-zinc-600 font-mono text-xs">
                    No data yet — click Refresh to pull from Bundle
                  </td>
                </tr>
              ) : (
                socials.map(s => {
                  const bd = breakdown[s.platform] || {};
                  return (
                    <tr
                      key={s.platform}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                      data-testid={`social-row-${s.platform}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {s.avatar_url ? (
                            <img
                              src={s.avatar_url}
                              alt={s.username || s.platform}
                              className="w-6 h-6 rounded-full object-cover border border-zinc-700 flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-6 h-6 border border-zinc-700 flex-shrink-0"
                              style={{ background: PLATFORM_COLORS[s.platform] || "#27272a" }}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-zinc-300 truncate">
                              {s.username ? `@${s.username}` : "—"}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-600 uppercase">{s.platform}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-white">{(bd.followers ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.following ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.impressions ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.impressions_unique ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.views ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.views_unique ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.likes ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.comments ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-zinc-300">{(bd.post_count ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-yellow-400">{(bd.engagement_rate ?? 0).toFixed(2)}%</td>
                      <td className="px-3 py-3 text-right text-[10px] font-mono text-zinc-500">{timeAgo(s.refreshed_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { timeAgo };
