import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { PLATFORM_COLORS } from "./ClientAnalyticsPanel";

const METRICS = [
  { key: "followers",        label: "Followers" },
  { key: "impressions",      label: "Impressions" },
  { key: "views",            label: "Views" },
  { key: "likes",            label: "Likes" },
  { key: "comments",         label: "Comments" },
  { key: "engagement_rate",  label: "Eng. Rate" },
];

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 0,
  fontSize: 11,
};

const kFormat = v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v;

function formatMonth(m) {
  return new Date(m + "-01").toLocaleDateString("en", { month: "short", year: "2-digit" });
}

export default function MonthlyTrendChart({ history }) {
  const [metric, setMetric] = useState("followers");

  if (!history) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Monthly Trends</div>
        <div className="h-[220px] bg-zinc-800/40 animate-pulse" />
      </div>
    );
  }

  const { months = [], by_platform = {} } = history;
  const platforms = Object.keys(by_platform);

  const chartData = months.map(m => {
    const point = { month: formatMonth(m), rawMonth: m };
    for (const plat of platforms) {
      point[plat] = by_platform[plat][m]?.[metric] ?? null;
    }
    return point;
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Monthly Trends</div>
        <div className="flex items-center gap-1 flex-wrap">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border transition-colors ${
                metric === m.key
                  ? "border-white text-white"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {months.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-zinc-600 font-mono text-xs text-center px-4">
          Refresh analytics to start building history — monthly trends appear after your second refresh.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={kFormat}
                tick={{ fill: "#71717a", fontSize: 9, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono", paddingTop: 8 }} />
              {platforms.map(plat => (
                <Line
                  key={plat}
                  type="monotone"
                  dataKey={plat}
                  name={plat.charAt(0).toUpperCase() + plat.slice(1)}
                  stroke={PLATFORM_COLORS[plat] || "#71767b"}
                  dot={{ r: 3 }}
                  strokeWidth={2}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {months.length === 1 && (
            <div className="mt-2 text-[10px] font-mono text-zinc-600 text-center">
              Refresh analytics again next month to start seeing trends.
            </div>
          )}
        </>
      )}
    </div>
  );
}
