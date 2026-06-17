import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Upload, Trash2, Play, Film, Image, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmt(secs) {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s.toFixed(1)}s`;
}

function MediaCard({ clip, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const isVideo = (clip.mime_type || "").startsWith("video/");

  async function handleDelete(e) {
    e.stopPropagation();
    const isDriveImage = clip.source === "drive" && (clip.mime_type || "").startsWith("image/");
    const msg = isDriveImage
      ? `Remove "${clip.name}" from media? This also stops the carousel from using it.`
      : `Delete "${clip.name}"?`;
    if (!window.confirm(msg)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/clients/${clip.client_id}/clips/${clip.drive_file_id}`);
      onDelete(clip.drive_file_id);
      toast.success("Clip deleted");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="group relative border border-zinc-800 hover:border-zinc-600 transition-colors overflow-hidden">
      {/* Thumbnail / preview */}
      <div className="bg-zinc-900 aspect-video flex items-center justify-center overflow-hidden relative">
        {clip.thumbnail_url ? (
          <img
            src={clip.thumbnail_url}
            alt={clip.name}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = "none"; }}
          />
        ) : isVideo ? (
          <video
            src={clip.r2_url}
            preload="metadata"
            className="w-full h-full object-cover"
            muted
          />
        ) : (
          <img
            src={clip.r2_url}
            alt={clip.name}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = "none"; }}
          />
        )}

        {/* No-preview fallback icon */}
        {!clip.thumbnail_url && !clip.r2_url && (
          isVideo
            ? <Film size={22} className="text-zinc-700" />
            : <Image size={22} className="text-zinc-700" />
        )}

        {/* Source badge */}
        <span className={`absolute top-1 left-1 text-[8px] font-mono px-1.5 py-0.5 border ${
          clip.source === "upload"
            ? "border-amber-800 text-amber-400 bg-amber-950/60"
            : "border-zinc-700 text-zinc-400 bg-zinc-900/80"
        }`}>
          {clip.source === "upload" ? "UPLOAD" : "DRIVE"}
        </span>

        {/* Delete button — appears on hover */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-1 right-1 p-1 bg-zinc-900/90 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-800 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
          title="Delete clip"
        >
          {deleting ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />}
        </button>
      </div>

      {/* Meta row */}
      <div className="px-2 py-1.5 bg-zinc-950">
        <p className="text-[11px] font-mono text-zinc-300 truncate" title={clip.name}>{clip.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {isVideo
            ? <Film size={8} className="text-zinc-600 shrink-0" />
            : <Image size={8} className="text-zinc-600 shrink-0" />
          }
          {fmt(clip.duration) && (
            <span className="text-[9px] font-mono text-zinc-600">{fmt(clip.duration)}</span>
          )}
          {clip.width > 0 && clip.height > 0 && (
            <span className="text-[9px] font-mono text-zinc-700">{clip.width}×{clip.height}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadPanel({ clientId, onUploaded, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Please select a video or image file");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      let meta = { duration: 0, width: 0, height: 0 };
      if (isVideo) {
        meta = await new Promise(resolve => {
          const vid = document.createElement("video");
          vid.preload = "metadata";
          vid.onloadedmetadata = () => {
            resolve({ duration: vid.duration, width: vid.videoWidth, height: vid.videoHeight });
            URL.revokeObjectURL(vid.src);
          };
          vid.onerror = () => { resolve(meta); URL.revokeObjectURL(vid.src); };
          vid.src = URL.createObjectURL(file);
        });
      } else if (isImage) {
        meta = await new Promise(resolve => {
          const img = document.createElement("img");
          img.onload = () => { resolve({ duration: 0, width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
          img.onerror = () => { resolve(meta); URL.revokeObjectURL(img.src); };
          img.src = URL.createObjectURL(file);
        });
      }

      const { data: { upload_url, key, clip_id } } = await axios.get(
        `${API}/clients/${clientId}/clips/presign`,
        { params: { filename: file.name, content_type: file.type } }
      );
      setProgress(20);

      const r2 = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!r2.ok) throw new Error(`Storage upload failed: ${r2.status}`);
      setProgress(80);

      const { data: clip } = await axios.post(`${API}/clients/${clientId}/clips/register`, {
        key, clip_id, filename: file.name,
        content_type: file.type,
        duration: meta.duration, width: meta.width, height: meta.height,
        is_vertical: meta.height > meta.width,
      });
      setProgress(100);
      toast.success("Uploaded");
      onUploaded(clip);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Upload media</p>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={13} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />
      <div
        className={`border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-10 cursor-pointer ${
          uploading ? "border-zinc-800 cursor-not-allowed" : "border-zinc-700 hover:border-zinc-500"
        }`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Upload size={24} className="text-zinc-600" />
        <p className="text-xs font-mono text-zinc-400">Drop file here or click to browse</p>
        <p className="text-[10px] font-mono text-zinc-600">Video (MP4, MOV) or Image (JPG, PNG, WebP)</p>
      </div>

      {uploading && (
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono text-zinc-500">
            <span>Uploading…</span><span>{progress}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-px">
            <div className="bg-white h-px transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientMediaTab({ clientId }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");   // all | video | image
  const [srcFilter, setSrcFilter] = useState("all");    // all | drive | upload
  const [showUpload, setShowUpload] = useState(false);
  const [excluded, setExcluded] = useState([]);
  const [excludedLoading, setExcludedLoading] = useState(false);

  const fetchExcluded = useCallback(async () => {
    if (!clientId) return;
    setExcludedLoading(true);
    try {
      const { data } = await axios.get(`${API}/clients/${clientId}/excluded-images`);
      setExcluded(data || []);
    } catch {
      toast.error("Failed to load excluded images");
    } finally {
      setExcludedLoading(false);
    }
  }, [clientId]);

  async function handleRestore(driveFileId) {
    try {
      await axios.post(`${API}/clients/${clientId}/excluded-images/${driveFileId}/restore`);
      setExcluded(prev => prev.filter(i => i.drive_file_id !== driveFileId));
      toast.success("Restored — Sync Drive to bring it back");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Restore failed");
    }
  }

  const fetchClips = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/clients/${clientId}/drive-clips`);
      setClips(data || []);
    } catch {
      toast.error("Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClips(); }, [fetchClips]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data } = await axios.post(`${API}/clients/${clientId}/drive-clips/sync`);
      toast.success(`Synced ${data.synced ?? 0} clips from Drive`);
      await fetchClips();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function handleUploaded(clip) {
    setClips(prev => [clip, ...prev]);
    setShowUpload(false);
  }

  function handleDelete(clipId) {
    setClips(prev => prev.filter(c => c.drive_file_id !== clipId));
  }

  const filtered = clips.filter(c => {
    const mime = c.mime_type || "";
    if (typeFilter === "video" && !mime.startsWith("video/")) return false;
    if (typeFilter === "image" && !mime.startsWith("image/")) return false;
    if (srcFilter === "drive" && c.source !== "drive") return false;
    if (srcFilter === "upload" && c.source !== "upload") return false;
    return true;
  });

  const videoCount = clips.filter(c => (c.mime_type || "").startsWith("video/")).length;
  const imageCount = clips.filter(c => (c.mime_type || "").startsWith("image/")).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Media Library — {clips.length} files
            <span className="ml-2 text-zinc-700">({videoCount} video · {imageCount} image)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Drive"}
          </button>
          <button
            onClick={() => setShowUpload(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border transition-colors ${
              showUpload
                ? "border-white text-white bg-zinc-800"
                : "border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <Upload size={10} />
            Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          {[["all", "All"], ["video", "Video"], ["image", "Image"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                typeFilter === val
                  ? "border-white text-white bg-zinc-800"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[["all", "All Sources"], ["drive", "Drive"], ["upload", "Upload"], ["excluded", "Excluded"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setSrcFilter(val); if (val === "excluded") fetchExcluded(); }}
              className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                srcFilter === val
                  ? "border-white text-white bg-zinc-800"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <UploadPanel
          clientId={clientId}
          onUploaded={handleUploaded}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Grid */}
      {srcFilter === "excluded" ? (
        excludedLoading ? (
          <p className="text-[11px] font-mono text-zinc-600 py-8 text-center">Loading…</p>
        ) : excluded.length === 0 ? (
          <div className="border border-dashed border-zinc-800 py-14 flex flex-col items-center gap-3">
            <p className="text-sm font-mono text-zinc-600">No excluded images.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {excluded.map(img => (
              <div key={img.drive_file_id} className="border border-zinc-800 overflow-hidden">
                <div className="bg-zinc-900 aspect-video flex items-center justify-center overflow-hidden">
                  <img src={img.thumbnail_url} alt={img.name || img.drive_file_id}
                    className="w-full h-full object-cover opacity-50"
                    onError={e => { e.target.style.display = "none"; }} />
                </div>
                <div className="px-2 py-1.5 bg-zinc-950">
                  <button onClick={() => handleRestore(img.drive_file_id)}
                    className="w-full py-1 text-[10px] font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <p className="text-[11px] font-mono text-zinc-600 py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-zinc-800 py-14 flex flex-col items-center gap-3">
          <Play size={24} className="text-zinc-700" />
          <p className="text-sm font-mono text-zinc-600">
            {clips.length === 0
              ? "No media yet. Upload files or sync from Drive."
              : "No files match the current filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(clip => (
            <MediaCard key={clip.drive_file_id} clip={clip} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
