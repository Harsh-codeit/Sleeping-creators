import React, { useState, useEffect } from "react";
import axios from "axios";
import { MOOD_TAGS } from "../constants/videoStyles";
import MusicUploadModal from "../components/MusicUploadModal";
import WaveformEditor from "../components/WaveformEditor";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MusicLibrary() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moodFilter, setMoodFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState("list");

  useEffect(() => { fetchTracks(); }, [moodFilter]);

  async function fetchTracks() {
    setLoading(true);
    try {
      const url = moodFilter ? `${API}/music?mood=${moodFilter}` : `${API}/music`;
      const { data } = await axios.get(url);
      setTracks(data);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTrack(id) {
    if (!window.confirm("Delete this track?")) return;
    await axios.delete(`${API}/music/${id}`);
    setTracks(prev => prev.filter(t => t.id !== id));
  }

  async function saveTagsInline(trackId, mood_tags) {
    await axios.put(`${API}/music/${trackId}`, { mood_tags });
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, mood_tags } : t));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Music Library</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded transition-colors"
        >
          + Upload Track
        </button>
      </div>

      {/* Mood filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setMoodFilter("")}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            moodFilter === "" ? "bg-indigo-600 border-indigo-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          All
        </button>
        {MOOD_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => setMoodFilter(tag === moodFilter ? "" : tag)}
            className={`px-3 py-1 rounded-full text-xs border capitalize transition-colors ${
              moodFilter === tag ? "bg-indigo-600 border-indigo-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {tag}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {["list", "grid"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                view === v ? "border-indigo-500 text-white" : "border-zinc-700 text-zinc-500"
              }`}
            >
              {v === "list" ? "☰" : "⊞"}
            </button>
          ))}
        </div>
      </div>

      {/* Track list */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : tracks.length === 0 ? (
        <p className="text-zinc-500 text-sm">No tracks yet. Upload your first track.</p>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-2 gap-4" : "space-y-3"}>
          {tracks.map(track => (
            <div key={track.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-white">{track.name}</p>
                  <p className="text-xs text-zinc-500">{track.filename}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingId(editingId === track.id ? null : track.id)}
                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    {editingId === track.id ? "Close" : "Edit"}
                  </button>
                  <button
                    onClick={() => deleteTrack(track.id)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <MoodTagEditor
                tags={track.mood_tags || []}
                onChange={tags => saveTagsInline(track.id, tags)}
              />
              {editingId === track.id && (
                <div className="mt-4">
                  <WaveformEditor
                    url={track.r2_url}
                    segments={track.segments || []}
                    onSave={async segs => {
                      await axios.put(`${API}/music/${track.id}`, { segments: segs });
                      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, segments: segs } : t));
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <MusicUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={track => {
            setTracks(prev => [track, ...prev]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

function MoodTagEditor({ tags, onChange }) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  function removeTag(tag) { onChange(tags.filter(t => t !== tag)); }

  function addTag(tag) {
    const cleaned = tag.trim().toLowerCase();
    if (cleaned && !tags.includes(cleaned)) onChange([...tags, cleaned]);
    setInput("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300">
          {tag}
          <button onClick={() => removeTag(tag)} className="text-zinc-500 hover:text-white ml-0.5 leading-none">×</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") addTag(input);
            if (e.key === "Escape") { setAdding(false); setInput(""); }
          }}
          onBlur={() => { if (input) addTag(input); else setAdding(false); }}
          className="w-20 bg-zinc-800 border border-zinc-600 rounded-full text-xs px-2 py-0.5 text-white outline-none"
          placeholder="mood..."
        />
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-zinc-500 hover:text-zinc-300 px-1">+ tag</button>
      )}
    </div>
  );
}
