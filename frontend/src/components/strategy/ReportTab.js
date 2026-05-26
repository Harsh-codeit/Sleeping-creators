import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { TrendingUp, Users, BarChart3, RefreshCw, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-3">
      <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">{label}</div>
      <div className="text-lg font-bold text-white font-mono">{value ?? "—"}</div>
      {sub && <div className="text-[10px] font-mono text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, onLink }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-zinc-400" />
        <span className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-widest">{title}</span>
      </div>
      <button
        onClick={onLink}
        className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        View details <ExternalLink size={9} />
      </button>
    </div>
  );
}

export default function ReportTab({ clientId, onNavigate }) {
  const [trends, setTrends] = useState(null);
  const [competitors, setCompetitors] = useState(null);
  const [compPosts, setCompPosts] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tRes, compRes, cpRes, aRes] = await Promise.allSettled([
        axios.get(`${API}/clients/${clientId}/trends?limit=20`),
        axios.get(`${API}/clients/${clientId}/competitors`),
        axios.get(`${API}/clients/${clientId}/competitor-posts`),
        axios.get(`${API}/analytics/clients/${clientId}`),
      ]);
      if (tRes.status === "fulfilled") setTrends(tRes.value.data);
      if (compRes.status === "fulfilled") setCompetitors(compRes.value.data);
      if (cpRes.status === "fulfilled") setCompPosts(cpRes.value.data);
      if (aRes.status === "fulfilled") setAnalytics(aRes.value.data);
    } catch { /* individual errors handled via allSettled */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAnalytics = async () => {
    setRefreshing(true);
    try {
      await axios.post(`${API}/analytics/clients/${clientId}/refresh`);
      const resp = await axios.get(`${API}/analytics/clients/${clientId}`);
      setAnalytics(resp.data);
      toast.success("Analytics refreshed");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const topTrends = (trends || []).slice(0, 5);
  const trendFormats = (() => {
    if (!trends || trends.length === 0) return null;
    const counts = {};
    trends.forEach(t => {
      const f = t.format || t.post_type || "carousel";
      counts[f] = (counts[f] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f} ${Math.round((n / trends.length) * 100)}%`)
      .join(" · ");
  })();

  const activeCompetitors = (competitors || []).filter(c => c.is_active !== false).length;
  const avgCompEngagement = (() => {
    if (!compPosts || compPosts.length === 0) return null;
    const total = compPosts.reduce((s, p) => s + (p.engagement_score || 0), 0);
    return Math.round(total / compPosts.length);
  })();
  const compTopFormat = (() => {
    if (!compPosts || compPosts.length === 0) return null;
    const counts = {};
    compPosts.forEach(p => { const f = p.post_type || "single"; counts[f] = (counts[f] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();
  const compTopHashtags = (() => {
    if (!compPosts) return [];
    const freq = {};
    compPosts.forEach(p => (p.hashtags || []).forEach(h => { freq[h] = (freq[h] || 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => h);
  })();

  const bundleData = analytics?.bundle || analytics;
  const totals = analytics?.totals || {};
  const postsThisMonth = totals.post_count ?? null;
  const avgEngagement = totals.engagement_rate != null
    ? `${totals.engagement_rate}%`
    : null;
  const topPlatform = (() => {
    const breakdown = analytics?.platform_breakdown || {};
    return Object.entries(breakdown)
      .sort((a, b) => (b[1].followers || 0) - (a[1].followers || 0))[0]?.[0] || null;
  })();

  if (loading) {
    return <div className="text-zinc-500 font-mono text-sm animate-pulse py-12 text-center">Loading report…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          Refresh All
        </button>
      </div>

      {/* Section 1: Market Trends */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <SectionHeader icon={TrendingUp} title="Market Trends" onLink={() => onNavigate?.("Trends")} />
        {topTrends.length === 0 ? (
          <p className="text-xs font-mono text-zinc-600">No trend data yet. Trends refresh every 6 hours.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KpiCard label="Trending Topics" value={topTrends.length} sub="tracked this week" />
              {trendFormats && <KpiCard label="Format Mix" value={trendFormats.split(" · ")[0]} sub={trendFormats} />}
            </div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Top Topics</div>
              <div className="flex flex-wrap gap-1.5">
                {topTrends.map((t, i) => (
                  <span key={i} className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {t.hashtag || t.topic || "—"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Competitor Benchmark */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <SectionHeader icon={Users} title="Competitor Benchmark" onLink={() => onNavigate?.("Competitors")} />
        {activeCompetitors === 0 ? (
          <p className="text-xs font-mono text-zinc-600">No competitors tracked yet. Add competitors in the Competitors tab.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KpiCard label="Active Competitors" value={activeCompetitors} />
              <KpiCard label="Avg Competitor Engagement" value={avgCompEngagement ?? "—"} sub="per post" />
              {compTopFormat && <KpiCard label="Their Top Format" value={compTopFormat} />}
            </div>
            {compTopHashtags.length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Their Top Hashtags</div>
                <div className="flex flex-wrap gap-1.5">
                  {compTopHashtags.map((h, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700">{h}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Client Profile */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <SectionHeader icon={BarChart3} title="Client Profile" onLink={() => onNavigate?.("Analytics")} />
        {!analytics || (!postsThisMonth && !avgEngagement && !topPlatform) ? (
          <p className="text-xs font-mono text-zinc-600">No analytics data yet. Connect Bundle.social in Settings or refresh.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {postsThisMonth !== null && <KpiCard label="Total Posts" value={postsThisMonth} />}
              {avgEngagement !== null && <KpiCard label="Engagement Rate" value={avgEngagement} sub="likes + comments / followers" />}
              {topPlatform && <KpiCard label="Top Platform" value={topPlatform} sub="by followers" />}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-600">
                Last refreshed: {bundleData?.socials_refreshed_at ? new Date(bundleData.socials_refreshed_at).toLocaleDateString() : "—"}
              </div>
              <button
                onClick={refreshAnalytics}
                disabled={refreshing}
                className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
              >
                <RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
