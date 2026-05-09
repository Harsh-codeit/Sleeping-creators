import { useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { MoodTagPicker } from "../video/MoodTagPicker";
import { VideoField } from "../video/VideoField";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function MusicUploadModal({ open, onClose, onUploaded }) {
  const [name, setName] = useState("");
  const [moodTags, setMoodTags] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const upload = async () => {
    if (!file) return toast.error("Select an audio file");
    if (!name.trim()) return toast.error("Track name required");
    setProgress(0);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("mood_tags", JSON.stringify(moodTags));
      const r = await axios.post(`${API}/music/upload`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      toast.success("Track uploaded");
      onUploaded(r.data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg p-6 space-y-5 relative">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Add Music Track</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="text-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <VideoField label="Audio File (.mp3 or .wav)">
          <div
            className="border border-dashed border-zinc-700 p-4 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={18} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-xs font-mono text-zinc-500">
              {file ? file.name : "Click to select file"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            onChange={handleFile}
            className="hidden"
          />
        </VideoField>

        <VideoField label="Track Name">
          <input
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Track name"
          />
        </VideoField>

        <VideoField label="Mood Tags">
          <MoodTagPicker value={moodTags} onChange={setMoodTags} />
        </VideoField>

        {uploading && (
          <div className="w-full bg-zinc-800 h-1">
            <div
              className="bg-white h-1 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={upload}
            disabled={uploading || !file}
            className="px-5 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {uploading ? `Uploading ${progress}%…` : "Upload Track"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-5 py-2 border border-zinc-700 text-zinc-400 text-xs font-mono hover:text-white hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
