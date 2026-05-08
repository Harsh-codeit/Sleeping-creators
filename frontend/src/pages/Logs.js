import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Trash2, Filter, Circle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LEVEL_STYLES = {
  success: { dot: "text-emerald-400", text: "text-emerald-400", label: "bg-emerald-950 border-emerald-800 text-emerald-400" },
  info: { dot: "text-blue-400", text: "text-blue-400", label: "bg-blue-950 border-blue-800 text-blue-400" },
  warning: { dot: "text-amber-400", text: "text-amber-400", label: "bg-amber-950 border-amber-800 text-amber-400" },
  error: { dot: "text-red-400", text: "text-red-400", label: "bg-red-950 border-red-800 text-red-400" },
};

const LEVELS = ["all", "success", "info", "warning", "error"];

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/logs`, {
        params: { level: levelFilter === "all" ? undefined : levelFilter, limit: 200 }
      });
      setLogs(resp.data);
    } catch { toast.error("Failed to load logs"); }
    finally { setLoading(false); }
  }, [levelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const clearLogs = async () => {
    if (!window.confirm("Clear all logs?")) return;
    try {
      await axios.delete(`${API}/logs`);
      setLogs([]);
      toast.success("Logs cleared");
    } catch { toast.error("Failed to clear logs"); }
  };

  const counts = {};
  logs.forEach(l => { counts[l.level] = (counts[l.level] || 0) + 1; });

  return (
    <div className="p-6" data-testid="logs-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Automation Logs</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{logs.length} entries</p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="auto-refresh-btn"
            onClick={() => setAutoRefresh(r => !r)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border transition-colors duration-150 font-mono ${
              autoRefresh ? "border-emerald-800 text-emerald-400 bg-emerald-950" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800"
            }`}
          >
            <Circle size={7} className={`fill-current ${autoRefresh ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
          <button
            onClick={fetchLogs}
            data-testid="refresh-logs-btn"
            className="p-2 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={clearLogs}
            data-testid="clear-logs-btn"
            className="flex items-center gap-2 px-3 py-2 border border-red-900 text-red-400 text-xs hover:bg-red-950 transition-colors duration-150"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Level Filter */}
      <div className="flex items-center gap-0 border border-zinc-800 mb-6 w-fit">
        {LEVELS.map(level => (
          <button
            key={level}
            data-testid={`log-filter-${level}`}
            onClick={() => setLevelFilter(level)}
            className={`px-4 py-2 text-xs font-mono uppercase transition-colors duration-150 border-r border-zinc-800 last:border-0 ${
              levelFilter === level ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {level}
            {level !== "all" && counts[level] ? (
              <span className="ml-1.5 opacity-60">{counts[level]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Log Feed */}
      <div className="bg-zinc-900 border border-zinc-800 font-mono">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
          <div className="col-span-1">Level</div>
          <div className="col-span-5">Message</div>
          <div className="col-span-2">Client</div>
          <div className="col-span-2">Platform</div>
          <div className="col-span-2">Time</div>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-600 text-sm">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-12 text-center text-zinc-600 text-sm">No logs found.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {logs.map((log, i) => {
              const style = LEVEL_STYLES[log.level] || LEVEL_STYLES.info;
              return (
                <div
                  key={log.id || i}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-zinc-800 transition-colors duration-100"
                  data-testid={`log-row-${i}`}
                >
                  <div className="col-span-1 flex items-center">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 border uppercase ${style.label}`}>
                      {log.level?.slice(0, 4)}
                    </span>
                  </div>
                  <div className="col-span-5 flex items-center">
                    <span className="text-xs text-zinc-300 leading-relaxed">{log.message}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-[10px] text-zinc-500 truncate">{log.client_name || "—"}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-[10px] text-zinc-600 uppercase">{log.platform || "—"}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-[10px] text-zinc-600">
                      {log.created_at ? new Date(log.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                      }) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
