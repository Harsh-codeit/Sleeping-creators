import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { RefreshCw } from "lucide-react";
import ClientAnalyticsPanel, { timeAgo } from "../components/analytics/ClientAnalyticsPanel";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Analytics() {
  const user = useUser();
  const clientId = user?.client_id;

  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    if (!clientId) return;
    setDataLoading(true);
    try {
      const { data } = await axios.get(`${API}/analytics/clients/${clientId}`);
      setData(data);
    } catch {
      setData(null);
    } finally {
      setDataLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") fetchAnalytics(); };
    window.addEventListener("sc:refresh", fetchAnalytics);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("sc:refresh", fetchAnalytics);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchAnalytics]);

  const onRefresh = async () => {
    if (!clientId || refreshing) return;
    setRefreshing(true);
    try {
      await axios.post(`${API}/analytics/clients/${clientId}/refresh`);
      await fetchAnalytics();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const lastRefreshed = data?.bundle?.socials_refreshed_at;
  const lastRefreshedLabel = useMemo(
    () => lastRefreshed ? `Last refreshed ${timeAgo(lastRefreshed)}` : "Never refreshed",
    [lastRefreshed]
  );

  return (
    <div className="p-6 space-y-6" data-testid="analytics-page">
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur -mx-6 px-6 py-2 -mt-6 mb-2 border-b border-zinc-900">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">Your social account metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <button
                data-testid="analytics-refresh-btn"
                onClick={onRefresh}
                disabled={refreshing || !clientId || !data?.bundle_connected}
                title={!data?.bundle_connected ? "Connect Instagram in Settings → Connections to enable refresh" : "Refresh analytics"}
                className="flex items-center gap-2 bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing…" : "Refresh now"}
              </button>
              {!data?.bundle_connected && (
                <span className="text-[10px]" style={{ color: "#666" }}>Connect Instagram to enable</span>
              )}
            </div>
            <div className="text-[10px] font-mono text-zinc-500" data-testid="analytics-last-refreshed">
              {lastRefreshedLabel}
            </div>
          </div>
        </div>
      </div>

      {!clientId || dataLoading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="h-56 bg-zinc-900 border border-zinc-800 animate-pulse rounded-xl" />
        </div>
      ) : data && data.bundle_connected === false ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center rounded-xl" data-testid="analytics-not-connected">
          <div className="text-sm text-zinc-300 mb-2">Your Instagram isn't connected yet.</div>
          <a href="/settings?tab=connections" className="text-xs text-violet-400 font-mono hover:underline">
            Connect your Instagram in Settings →
          </a>
        </div>
      ) : data && (data.bundle?.socials || []).length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center rounded-xl" data-testid="analytics-empty">
          <div className="text-sm text-zinc-300 mb-2">No analytics yet.</div>
          <div className="text-xs text-zinc-500 font-mono">
            Click <span className="text-white">Refresh now</span> to pull the latest data.
          </div>
        </div>
      ) : data ? (
        <ClientAnalyticsPanel data={data} />
      ) : null}
    </div>
  );
}
