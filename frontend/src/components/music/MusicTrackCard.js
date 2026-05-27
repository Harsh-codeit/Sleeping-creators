import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2, Music } from "lucide-react";
import { MoodTagPicker } from "./MoodTagPicker";
import { VideoField } from "./VideoField";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtDuration(secs) {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  return `${m}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
}

export function MusicTrackCard({ track, onDeleted, onUpdated, canDelete = true }) {
  const [editing, setEditing] = useState(false);
  const [moodTags, setMoodTags] = useState(track.mood_tags || []);
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${track.name}"?`)) return;
    try {
      await axios.delete(`${API}/music/${track.id}`);
      toast.success("Track deleted");
      onDeleted(track.id);
    } catch {
      toast.error("Failed to delete track");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await axios.put(`${API}/music/${track.id}`, { mood_tags: moodTags });
      toast.success("Track updated");
      onUpdated(r.data);
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3 p-4">
        <div className="flex-shrink-0 w-9 h-9 bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Music size={14} className="text-zinc-500" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{track.name}</p>
          <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
            {track.filename} · {fmtDuration(track.duration)}
          </p>
        </div>

        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {(track.mood_tags || []).map((tag) => (
            <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <Pencil size={11} />
            {editing ? "Close" : "Edit"}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-mono border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          <VideoField label="Mood Tags">
            <MoodTagPicker value={moodTags} onChange={setMoodTags} />
          </VideoField>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 border border-zinc-700 text-zinc-400 text-xs font-mono hover:text-white hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
