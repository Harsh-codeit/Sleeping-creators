import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { RefreshCw } from "lucide-react";
import ClientAnalyticsPanel, { timeAgo } from "../components/analytics/ClientAnalyticsPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LS_KEY = "analytics:lastClient";

function sortByCreatedAsc(list) {
  return [...list].sort((a, b) => {
    const at = a.created_at || "";
    const bt = b.created_at || "";
    return at.localeCompare(bt);
  });
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedClientId = searchParams.get("clientId") || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/clients`);
        if (cancelled) return;
        const sorted = sortByCreatedAsc(data || []);
        setClients(sorted);

        if (!searchParams.get("clientId")) {
          const stored = localStorage.getItem(LS_KEY);
          const fallback = sorted[0]?.id;
          const pick = (stored && sorted.find(c => c.id === stored) ? stored : fallback);
          if (pick) {
            setSearchParams({ clientId: pick }, { replace: true });
          }
        }
      } catch {}
      finally { if (!cancelled) setClientsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(async (id) => {
    if (!id) return;
    setDataLoading(true);
    try {
      const [analyticsRes, histRes] = await Promise.all([
        axios.get(`${API}/analytics/clients/${id}`),
        axios.get(`${API}/analytics/clients/${id}/history`),
      ]);
      setData(analyticsRes.data);
      setHistoryData(histRes.data);
    } catch {
      setData(null);
      setHistoryData(null);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClientId) { setData(null); setHistoryData(null); return; }
    localStorage.setItem(LS_KEY, selectedClientId);
    fetchAnalytics(selectedClientId);
  }, [selectedClientId, fetchAnalytics]);

  const onSelectClient = (id) => {
    setSearchParams({ clientId: id });
  };

  const onRefresh = async () => {
    if (!selectedClientId || refreshing) return;
    setRefreshing(true);
    try {
      await axios.post(`${API}/analytics/clients/${selectedClientId}/refresh`);
      await fetchAnalytics(selectedClientId);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const lastRefreshed = data?.bundle?.socials_refreshed_at;
  const lastRefreshedLabel = useMemo(() => lastRefreshed ? `Last refreshed ${timeAgo(lastRefreshed)}` : "Never refreshed", [lastRefreshed]);

  return (
    <div className="p-6 space-y-6" data-testid="analytics-page">
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur -mx-6 px-6 py-2 -mt-6 mb-2 border-b border-zinc-900">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">Live social-account metrics from Bundle</p>
          </div>
          <div className="flex items-center gap-3">
            {clientsLoading ? (
              <div className="h-7 w-44 bg-zinc-900 border border-zinc-800 animate-pulse" />
            ) : (
              <select
                data-testid="analytics-client-select"
                value={selectedClientId}
                onChange={e => onSelectClient(e.target.value)}
                disabled={clients.length === 0}
                className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none disabled:opacity-50"
              >
                {clients.length === 0 ? (
                  <option value="">No clients</option>
                ) : (
                  clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                )}
              </select>
            )}
            <button
              data-testid="analytics-refresh-btn"
              onClick={onRefresh}
              disabled={refreshing || !selectedClientId || !data?.bundle_connected}
              className="flex items-center gap-2 bg-white text-black text-xs font-semibold px-3 py-1.5 hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
            <div className="text-[10px] font-mono text-zinc-500" data-testid="analytics-last-refreshed">
              {lastRefreshedLabel}
            </div>
          </div>
        </div>
      </div>

      {clientsLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 animate-pulse" />
            ))}
          </div>
          <div className="h-56 bg-zinc-900 border border-zinc-800 animate-pulse" />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center" data-testid="analytics-no-clients">
          <div className="text-sm text-zinc-300 mb-2">No clients yet.</div>
          <Link to="/clients" className="text-xs text-emerald-400 font-mono hover:underline">
            Create a client to see analytics →
          </Link>
        </div>
      ) : !selectedClientId ? null : dataLoading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 animate-pulse" />
            ))}
          </div>
          <div className="h-56 bg-zinc-900 border border-zinc-800 animate-pulse" />
        </div>
      ) : data && data.bundle_connected === false ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center" data-testid="analytics-not-connected">
          <div className="text-sm text-zinc-300 mb-2">
            {data.client_name} isn't connected to Bundle yet.
          </div>
          <Link
            to={`/clients/${data.client_id}`}
            className="text-xs text-emerald-400 font-mono hover:underline"
          >
            Connect on the client detail page →
          </Link>
        </div>
      ) : data && (data.bundle?.socials || []).length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 text-center" data-testid="analytics-empty">
          <div className="text-sm text-zinc-300 mb-2">No analytics yet.</div>
          <div className="text-xs text-zinc-500 font-mono">
            Click <span className="text-white">Refresh now</span> to pull the latest from Bundle.
          </div>
        </div>
      ) : (
        <ClientAnalyticsPanel data={data} history={historyData} />
      )}
    </div>
  );
}
