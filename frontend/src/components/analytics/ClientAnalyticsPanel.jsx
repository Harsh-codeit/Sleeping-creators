import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { Users, Eye, Heart, MessageCircle } from "lucide-react";

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
  { key: "followers",   label: "Followers",   Icon: Users,          accent: "text-white" },
  { key: "impressions", label: "Impressions", Icon: Eye,            accent: "text-blue-400" },
  { key: "likes",       label: "Likes",       Icon: Heart,          accent: "text-pink-400" },
  { key: "comments",    label: "Comments",    Icon: MessageCircle,  accent: "text-purple-400" },
];

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
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="text-white">
          {p.name}: <span className="text-emerald-400">{(p.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function ClientAnalyticsPanel({ data, compact = false }) {
  const totals = data?.totals || { followers: 0, impressions: 0, likes: 0, comments: 0, post_count: 0 };
  const socials = data?.bundle?.socials || [];
  const breakdown = data?.platform_breakdown || {};

  const chartData = Object.entries(breakdown).map(([platform, v]) => ({
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    followers: v.followers || 0,
    fill: PLATFORM_COLORS[platform] || "#71717a",
  }));

  return (
    <div className="space-y-4" data-testid="client-analytics-panel">
      <div className={`grid gap-4 ${compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        {KPI_DEFS.map(({ key, label, Icon, accent }) => (
          <div
            key={key}
            className="bg-zinc-900 border border-zinc-800 p-4"
            data-testid={`kpi-${key}`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{label}</div>
              <Icon size={13} className={accent} />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-2">
              {(totals[key] ?? 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-4">
          Followers by Platform
        </div>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-zinc-600 font-mono text-xs">
            No connected platforms yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical">
              <XAxis
                type="number"
                tick={{ fill: "#52525b", fontSize: 9, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="platform"
                tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a" }} />
              <Bar dataKey="followers" name="Followers" radius={0}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Per-Platform</div>
        </div>
        <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-zinc-800 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
          <div className="col-span-3">Account</div>
          <div className="col-span-2 text-center">Followers</div>
          <div className="col-span-2 text-center">Impressions</div>
          <div className="col-span-1 text-center">Likes</div>
          <div className="col-span-1 text-center">Comments</div>
          <div className="col-span-1 text-center">Posts</div>
          <div className="col-span-2 text-right">Refreshed</div>
        </div>
        {socials.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 font-mono text-xs">
            No data yet — click Refresh to pull from Bundle
          </div>
        ) : (
          socials.map(s => (
            <div
              key={s.platform}
              className="grid grid-cols-12 gap-4 px-4 py-3 data-row"
              data-testid={`social-row-${s.platform}`}
            >
              <div className="col-span-3 flex items-center gap-2 min-w-0">
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
              <div className="col-span-2 flex items-center justify-center text-sm font-mono text-white">
                {(s.followers ?? 0).toLocaleString()}
              </div>
              <div className="col-span-2 flex items-center justify-center text-sm font-mono text-zinc-300">
                {(s.impressions ?? 0).toLocaleString()}
              </div>
              <div className="col-span-1 flex items-center justify-center text-sm font-mono text-zinc-300">
                {(s.likes ?? 0).toLocaleString()}
              </div>
              <div className="col-span-1 flex items-center justify-center text-sm font-mono text-zinc-300">
                {(s.comments ?? 0).toLocaleString()}
              </div>
              <div className="col-span-1 flex items-center justify-center text-sm font-mono text-zinc-300">
                {(s.post_count ?? 0).toLocaleString()}
              </div>
              <div className="col-span-2 flex items-center justify-end text-[10px] font-mono text-zinc-500">
                {timeAgo(s.refreshed_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { timeAgo };
