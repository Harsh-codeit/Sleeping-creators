import React, { useState, useRef } from "react";
import axios from "axios";
import { MOOD_TAGS } from "../constants/videoStyles";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_MB = 50;

export default function MusicUploadModal({ onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  function pickFile(f) {
    if (!f) return;
    setError("");
    if (!f.type.startsWith("audio/")) { setError("File must be an audio file (mp3 or wav)"); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`File must be under ${MAX_MB} MB`); return; }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function toggleTag(tag) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function upload() {
    if (!file) { setError("Choose a file first"); return; }
    if (!name.trim()) { setError("Name is required"); return; }
    setUploading(true);
    setError("");
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("mood_tags", JSON.stringify(selectedTags));
      const { data } = await axios.post(`${API}/music/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: e => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); },
      });
      onUploaded(data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Upload Track</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">&#x2715;</button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-700 hover:border-zinc-500"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg"
            className="hidden"
            onChange={e => pickFile(e.target.files[0])}
          />
          {file ? (
            <p className="text-sm text-zinc-300">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
          ) : (
            <>
              <p className="text-sm text-zinc-400">Drop an mp3 or wav here</p>
              <p className="text-xs text-zinc-600 mt-1">or click to browse &middot; max {MAX_MB} MB</p>
            </>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Track Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            placeholder="e.g. Energy Beat"
          />
        </div>

        {/* Mood tags */}
        <div>
          <label className="block text-xs text-zinc-400 mb-2">Mood Tags</label>
          <div className="flex flex-wrap gap-2">
            {MOOD_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-xs capitalize border transition-colors ${
                  selectedTags.includes(tag)
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {uploading && (
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} disabled={uploading} className="px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
          <button
            onClick={upload}
            disabled={uploading || !file}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            {uploading ? `Uploading ${progress}%…` : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
