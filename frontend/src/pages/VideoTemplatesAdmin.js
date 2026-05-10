import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import VideoTemplateDetail from "../components/VideoTemplateDetail";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function VideoTemplatesAdmin() {
  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const r = await axios.get(`${API}/creatomate-templates`);
    setRows(r.data);
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/creatomate-templates/sync`);
      toast.success(`Sync: +${r.data.added.length} added, ${r.data.updated.length} updated, ${r.data.deactivated.length} deactivated`);
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Video Templates</h1>
        <Button onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync from Creatomate"}</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th>Thumbnail</th><th>Name</th><th>Ratio</th><th>Duration</th><th>Status</th><th>Last synced</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={() => setSelected(r)}>
              <td className="py-2">{r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="h-12 rounded" />}</td>
              <td>{r.name}</td>
              <td>{r.aspect_ratio || "—"}</td>
              <td>{r.duration_seconds ? `${r.duration_seconds}s` : "—"}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${
                r.status === "active" ? "bg-green-100 text-green-800" :
                r.status === "draft" ? "bg-yellow-100 text-yellow-800" :
                "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
              <td>{r.last_synced_at?.slice(0, 16)?.replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <VideoTemplateDetail
          template={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
