// frontend/src/components/DriveClipGrid.js
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL || "";

export default function DriveClipGrid({ clientId, selectedClipId, onSelect }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchClips = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/clients/${clientId}/drive-clips`);
      setClips(r.data);
    } catch {
      toast.error("Failed to load clips");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClips(); }, [fetchClips]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/api/clients/${clientId}/drive-clips/sync`);
      toast.success(`Synced ${r.data.synced} clips`);
      await fetchClips();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!clientId) return <p className="text-zinc-500 text-sm">Select a client first.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 font-mono">{clips.length} clips in Drive folder</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          {syncing ? "Syncing\u2026" : "Sync from Drive"}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading clips\u2026</p>
      ) : clips.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No clips found. Add videos to the client's Drive folder and sync.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
          {clips.map(clip => (
            <div
              key={clip.drive_file_id}
              onClick={() => onSelect(clip)}
              className={`rounded-lg overflow-hidden border transition-all cursor-pointer ${
                selectedClipId === clip.drive_file_id
                  ? "border-violet-500"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <div className="bg-zinc-900 aspect-video flex items-center justify-center overflow-hidden">
                <img
                  src={clip.thumbnail_url}
                  alt={clip.name}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = "none"; }}
                />
              </div>
              <div className="px-2 py-1.5 bg-zinc-950">
                <p className="text-xs text-zinc-300 truncate">{clip.name}</p>
                {clip.duration > 0 && (
                  <p className="text-[10px] text-zinc-500 font-mono">{clip.duration.toFixed(1)}s</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
