import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X, Upload, RefreshCw, Play } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ClipPickerModal({ clientId, onSelect, onClose }) {
  const [tab, setTab]               = useState("drive");
  const [clips, setClips]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => { loadClips(); }, [clientId]); // eslint-disable-line

  async function loadClips() {
    if (!clientId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/clients/${clientId}/drive-clips`);
      setClips(r.data || []);
    } catch {}
    finally { setLoading(false); }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/clients/${clientId}/drive-clips/sync`);
      toast.success(`✓ ${r.data.synced} clips synced`);
      await loadClips();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sync failed");
    } finally { setSyncing(false); }
  }

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await axios.post(`${API}/clients/${clientId}/clips/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded / e.total) * 100)),
      });
      toast.success("Clip uploaded");
      onSelect(r.data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("video/")) handleUpload(file);
    else toast.error("Please drop a video file");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 w-[620px] max-h-[78vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center border border-zinc-800">
            {[["drive", "Drive"], ["upload", "Upload"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTab(val)}
                className={`px-5 py-1.5 text-xs font-mono uppercase border-r border-zinc-800 last:border-0 transition-colors ${
                  tab === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {tab === "drive" && (
              <button
                onClick={handleSync}
                disabled={syncing || !clientId}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing…" : "Sync"}
              </button>
            )}
            <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors p-1">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Drive tab */}
        {tab === "drive" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-[11px] font-mono text-zinc-600">Loading clips…</p>
              ) : clips.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Play size={24} className="text-zinc-700" />
                  <p className="text-[11px] font-mono text-zinc-600">No clips synced yet.</p>
                  <button
                    onClick={handleSync}
                    disabled={syncing || !clientId}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Syncing…" : "Sync from Drive folder"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {clips.map(clip => (
                    <button
                      key={clip.drive_file_id}
                      onClick={() => { onSelect(clip); onClose(); }}
                      className="group border border-zinc-800 hover:border-zinc-500 transition-colors text-left overflow-hidden"
                    >
                      <div className="bg-zinc-900 aspect-video flex items-center justify-center overflow-hidden relative">
                        {clip.thumbnail_url ? (
                          <img
                            src={clip.thumbnail_url}
                            alt={clip.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                            onError={e => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <Play size={20} className="text-zinc-700" />
                        )}
                        {clip.source === "upload" && (
                          <span className="absolute top-1 right-1 text-[8px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5">UPLOAD</span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 bg-zinc-950">
                        <p className="text-[11px] font-mono text-zinc-300 truncate">{clip.name}</p>
                        {clip.duration > 0 && (
                          <p className="text-[9px] font-mono text-zinc-600">{clip.duration.toFixed(1)}s</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload tab */}
        {tab === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => handleUpload(e.target.files[0])}
            />
            <div
              className={`w-full border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 py-14 ${
                uploading ? "border-zinc-700 cursor-not-allowed" : "border-zinc-700 hover:border-zinc-500"
              }`}
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload size={30} className="text-zinc-600" />
              <p className="text-sm font-mono text-zinc-400">Drop video here or click to browse</p>
              <p className="text-[10px] font-mono text-zinc-600">MP4, MOV, WebM · max 500 MB recommended</p>
            </div>

            {uploading && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                  <span>Uploading…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-zinc-800 h-0.5">
                  <div
                    className="bg-white h-0.5 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
