import { useState, useEffect } from "react";
import axios from "axios";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid, Cell
} from "recharts";
import { TrendingUp, Heart, Eye, Share2, MessageCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORM_COLORS = {
  instagram: "#E1306C", facebook: "#1877F2", linkedin: "#0A66C2",
  twitter: "#1DA1F2", threads: "#71767B", youtube: "#FF0000"
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="text-white">
          {p.name}: <span className="text-emerald-400">{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [timeSeries, setTimeSeries] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientStats, setClientStats] = useState({});
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [ov, ts, cl, allStats] = await Promise.all([
          axios.get(`${API}/analytics/overview`),
          axios.get(`${API}/analytics/time-series?days=${days}`),
          axios.get(`${API}/clients`),
          axios.get(`${API}/analytics/all-clients`),
        ]);
        setOverview(ov.data);
        setTimeSeries(ts.data);
        setClients(cl.data);
        setClientStats(allStats.data);
      } catch {}
      finally { setLoading(false); }
    };
    fetchData();
  }, [days]);

  const platformData = Object.entries(overview?.platform_distribution || {}).map(([k, v]) => ({
    platform: k.charAt(0).toUpperCase() + k.slice(1),
    posts: v,
    fill: PLATFORM_COLORS[k] || "#71717a"
  }));

  const totalImpressions = Object.values(clientStats).reduce((sum, s) => sum + (s?.total_impressions || 0), 0);
  const totalLikes = Object.values(clientStats).reduce((sum, s) => sum + (s?.total_likes || 0), 0);
  const totalComments = Object.values(clientStats).reduce((sum, s) => sum + (s?.total_comments || 0), 0);
  const totalShares = Object.values(clientStats).reduce((sum, s) => sum + (s?.total_shares || 0), 0);

  return (
    <div className="p-6 space-y-6" data-testid="analytics-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">Performance across all clients & platforms</p>
        </div>
        <div className="flex items-center gap-1 border border-zinc-800">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              data-testid={`days-btn-${d}`}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors duration-150 ${days === d ? "bg-white text-black" : "text-zinc-500 hover:text-white hover:bg-zinc-800"}`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Eye, label: "Total Impressions", value: totalImpressions.toLocaleString(), accent: "text-blue-400" },
          { icon: Heart, label: "Total Likes", value: totalLikes.toLocaleString(), accent: "text-pink-400" },
          { icon: MessageCircle, label: "Total Comments", value: totalComments.toLocaleString(), accent: "text-purple-400" },
          { icon: Share2, label: "Total Shares", value: totalShares.toLocaleString(), accent: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 p-4" data-testid={`metric-${s.label.toLowerCase().replace(/\s+/g,'-')}`}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{s.label}</div>
              <s.icon size={13} className={s.accent} />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-2">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Time Series */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <TrendingUp size={12} />
            Posts Published — Last {days} Days
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 font-mono text-xs">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeSeries}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={20} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="posts" name="Posts" stroke="#10b981" strokeWidth={1.5} fill="url(#grad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Platform Distribution */}
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-4">Platform Breakdown</div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 font-mono text-xs">Loading...</div>
          ) : platformData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-600 font-mono text-xs">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={platformData} layout="vertical">
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="platform" tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="posts" name="Posts" radius={0}>
                  {platformData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-Client Performance */}
      <div className="bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Per-Client Performance</div>
        </div>
        <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-zinc-800 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
          <div className="col-span-3">Client</div>
          <div className="col-span-1 text-center">Posts</div>
          <div className="col-span-2 text-center">Impressions</div>
          <div className="col-span-2 text-center">Likes</div>
          <div className="col-span-2 text-center">Comments</div>
          <div className="col-span-2 text-center">Avg Eng.</div>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-600 font-mono text-xs">Loading...</div>
        ) : (
          clients.map(client => {
            const stats = clientStats[client.id];
            return (
              <div key={client.id} className="grid grid-cols-12 gap-4 px-4 py-3 data-row" data-testid={`analytics-client-row-${client.id}`}>
                <div className="col-span-3 flex items-center gap-2">
                  <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                    {client.avatar}
                  </div>
                  <span className="text-sm font-semibold text-white truncate">{client.name}</span>
                </div>
                <div className="col-span-1 flex items-center justify-center text-sm font-mono text-white">{stats?.total_published ?? 0}</div>
                <div className="col-span-2 flex items-center justify-center text-sm font-mono text-zinc-300">{(stats?.total_impressions ?? 0).toLocaleString()}</div>
                <div className="col-span-2 flex items-center justify-center text-sm font-mono text-zinc-300">{(stats?.total_likes ?? 0).toLocaleString()}</div>
                <div className="col-span-2 flex items-center justify-center text-sm font-mono text-zinc-300">{(stats?.total_comments ?? 0).toLocaleString()}</div>
                <div className="col-span-2 flex items-center justify-center text-sm font-mono text-emerald-400">{stats?.avg_engagement ?? 0}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
