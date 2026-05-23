import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Plus, Music, HardDrive } from "lucide-react";
import { MusicTrackCard } from "../components/music/MusicTrackCard";
import { MusicUploadModal } from "../components/music/MusicUploadModal";
import { MusicDriveImportModal } from "../components/music/MusicDriveImportModal";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MOOD_FILTERS = ["all", "energy", "power", "authority", "calm", "inspiring", "urgent", "celebratory", "mysterious", "playful"];

export default function MusicLibraryPage() {
  const { role, permissions } = useUser();
  const mp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.music ?? { view: true, create: true, edit: true, delete: true });
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moodFilter, setMoodFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showDriveImport, setShowDriveImport] = useState(false);

  const fetchTracks = useCallback(() => {
    const params = moodFilter !== "all" ? { mood: moodFilter } : {};
    axios.get(`${API}/music`, { params })
      .then((r) => setTracks(r.data || []))
      .catch(() => toast.error("Failed to load tracks"))
      .finally(() => setLoading(false));
  }, [moodFilter]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  const handleUploaded = (track) => {
    setTracks((prev) => [track, ...prev]);
  };

  const handleDeleted = (id) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUpdated = (updated) => {
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Music size={16} className="text-zinc-500" />
          <h1 className="text-lg font-bold text-white tracking-tight">Music Library</h1>
          <span className="text-[10px] font-mono text-zinc-600 ml-1">{tracks.length} tracks</span>
        </div>
        {mp.create && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDriveImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              <HardDrive size={14} />
              Import from Drive
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              <Plus size={14} />
              Upload Track
            </button>
          </div>
        )}
      </div>

      {/* Mood filter bar */}
      <div className="flex gap-1.5 px-6 py-3 border-b border-zinc-800 overflow-x-auto">
        {MOOD_FILTERS.map((mood) => (
          <button
            key={mood}
            type="button"
            onClick={() => setMoodFilter(mood)}
            className={`flex-shrink-0 px-3 py-1 text-[10px] font-mono border transition-colors capitalize ${
              moodFilter === mood
                ? "bg-white text-black border-white"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {loading && (
          <p className="text-xs font-mono text-zinc-600">Loading…</p>
        )}
        {!loading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
            <Music size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-mono">No tracks in the library.</p>
            <p className="text-xs font-mono mt-1 opacity-60">
              Upload your first track to get started.
            </p>
          </div>
        )}
        {tracks.map((track) => (
          <MusicTrackCard
            key={track.id}
            track={track}
            onDeleted={handleDeleted}
            onUpdated={handleUpdated}
            canDelete={mp.delete}
          />
        ))}
      </div>

      <MusicUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={handleUploaded}
      />
      <MusicDriveImportModal
        open={showDriveImport}
        onClose={() => setShowDriveImport(false)}
        onImported={fetchTracks}
      />
    </div>
  );
}
