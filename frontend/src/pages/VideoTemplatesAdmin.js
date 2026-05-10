import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import VideoTemplateDetail from "../components/VideoTemplateDetail";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const STATUS_BADGE = {
  active:   "text-emerald-400 bg-emerald-400/10 border border-emerald-400/30",
  draft:    "text-amber-400 bg-amber-400/10 border border-amber-400/30",
  inactive: "text-zinc-500 bg-zinc-800 border border-zinc-700",
};

export default function VideoTemplatesAdmin() {
  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/creatomate-templates`);
      setRows(r.data);
    } catch {
      toast.error("Failed to load templates");
    }
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/creatomate-templates/sync`);
      toast.success(`+${r.data.added.length} added · ${r.data.updated.length} updated · ${r.data.deactivated.length} deactivated`);
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Page header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-950">
        <div>
          <div className="text-sm font-bold tracking-tight text-white">Video Templates</div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">CREATOMATE TEMPLATE REGISTRY</div>
        </div>
        <button
          data-testid="sync-templates-btn"
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync from Creatomate"}
        </button>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px] w-16">Thumb</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Name</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Ratio</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Duration</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Fields</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Status</th>
              <th className="text-left pb-2 font-mono text-zinc-500 uppercase tracking-widest text-[10px]">Last synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center font-mono text-zinc-600">
                  No templates. Click "Sync from Creatomate" to import.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                data-testid={`template-row-${r.id}`}
                className="border-b border-zinc-800/60 hover:bg-zinc-900 cursor-pointer transition-colors duration-200"
                onClick={() => setSelected(r)}
              >
                <td className="py-2 pr-2">
                  {r.thumbnail_url
                    ? <img src={r.thumbnail_url} alt="" className="h-10 w-16 object-cover" />
                    : <div className="h-10 w-16 bg-zinc-800 border border-zinc-700" />}
                </td>
                <td className="py-2 font-medium text-white">{r.name}</td>
                <td className="py-2 font-mono text-zinc-400">{r.aspect_ratio || "—"}</td>
                <td className="py-2 font-mono text-zinc-400">{r.duration_seconds != null ? `${r.duration_seconds}s` : "—"}</td>
                <td className="py-2 font-mono text-zinc-400">{r.field_schema?.length ?? 0}</td>
                <td className="py-2">
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-widest ${STATUS_BADGE[r.status] || STATUS_BADGE.inactive}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-2 font-mono text-zinc-500">
                  {r.last_synced_at?.slice(0, 16)?.replace("T", " ") ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <VideoTemplateDetail
          template={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { load(); setSelected(null); }}
        />
      )}
    </div>
  );
}
