import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Upload, Loader2, X, CheckCircle2 } from "lucide-react";
import { API, ALLOWED_MIME, MAX_BYTES } from "./hookConstants";

const POLL_INTERVAL_MS = 1500;

const PLATFORMS = [
  { value: "", label: "Auto / unspecified" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter / X" },
];

const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono cursor-pointer";

function validate(files) {
  const ok = [];
  const skipped = [];
  for (const f of files) {
    if (!ALLOWED_MIME.includes(f.type)) {
      skipped.push(`${f.name}: unsupported type`);
    } else if (f.size > MAX_BYTES) {
      skipped.push(`${f.name}: over 10MB`);
    } else {
      ok.push(f);
    }
  }
  return { ok, skipped };
}

function Counter({ label, value, tone = "text-zinc-300" }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">{label}</div>
      <div className={`text-lg font-mono font-semibold ${tone}`}>{value ?? 0}</div>
    </div>
  );
}

/**
 * Bulk-upload area: pick/drag many screenshots → POST multipart to
 * /viral-hooks/ingest → poll /viral-hooks/ingest/{batch_id} until done.
 */
export default function HookUpload({ onBatchDone }) {
  const [selected, setSelected] = useState([]); // File[]
  const [platform, setPlatform] = useState("");
  const [uploading, setUploading] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [progress, setProgress] = useState(null); // batch doc
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  function addFiles(fileList) {
    const { ok, skipped } = validate(Array.from(fileList || []));
    if (skipped.length) toast.error(`Skipped ${skipped.length}: ${skipped.slice(0, 3).join("; ")}`);
    if (ok.length) setSelected((prev) => [...prev, ...ok]);
  }

  function handleDrop(e) {
    e.preventDefault();
    if (uploading) return;
    addFiles(e.dataTransfer.files);
  }

  function removeAt(idx) {
    setSelected((prev) => prev.filter((_, i) => i !== idx));
  }

  const poll = useCallback(
    async (id) => {
      try {
        const { data } = await axios.get(`${API}/viral-hooks/ingest/${id}`);
        setProgress(data);
        if (data.total > 0 && data.processed >= data.total) {
          clearPoll();
          setUploading(false);
          toast.success(`Batch done — ${data.inserted} inserted, ${data.review} in review`);
          onBatchDone?.();
        }
      } catch {
        // Transient error — keep polling; the worker may still be catching up.
      }
    },
    [clearPoll, onBatchDone]
  );

  async function handleUpload() {
    if (!selected.length) {
      toast.error("Select at least one image");
      return;
    }
    setUploading(true);
    setProgress(null);
    setBatchId(null);
    const form = new FormData();
    selected.forEach((f) => form.append("files", f));
    if (platform) form.append("platform", platform);

    try {
      const { data } = await axios.post(`${API}/viral-hooks/ingest`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBatchId(data.batch_id);
      setProgress({ total: data.queued, processed: 0, inserted: 0, duplicates: 0, rejected: 0, review: 0, errors: 0 });
      setSelected([]);
      clearPoll();
      pollRef.current = setInterval(() => poll(data.batch_id), POLL_INTERVAL_MS);
      poll(data.batch_id);
    } catch (e) {
      setUploading(false);
      toast.error(e.response?.data?.detail || "Upload failed");
    }
  }

  const total = progress?.total || 0;
  const processed = progress?.processed || 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const done = total > 0 && processed >= total;

  return (
    <div className="p-6 space-y-4">
      {/* Drop zone */}
      <input
        ref={fileRef}
        type="file"
        accept={ALLOWED_MIME.join(",")}
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <div
        className={`border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-12 ${
          uploading ? "border-zinc-800 cursor-not-allowed" : "border-zinc-700 hover:border-zinc-500 cursor-pointer"
        }`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        data-testid="hook-dropzone"
      >
        <Upload size={26} className="text-zinc-600" />
        <p className="text-sm font-mono text-zinc-300">Drop screenshots here or click to browse</p>
        <p className="text-[10px] font-mono text-zinc-600">JPEG · PNG · WebP · GIF — max 10MB each, many at once</p>
      </div>

      {/* Platform + selected count + upload */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label htmlFor="hook-platform" className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">
            Platform (optional)
          </label>
          <select
            id="hook-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            disabled={uploading}
            className={INPUT_CLS}
            data-testid="hook-platform-select"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleUpload}
          disabled={uploading || !selected.length}
          data-testid="hook-upload-btn"
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-150 cursor-pointer"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Processing…" : `Upload ${selected.length || ""}`.trim()}
        </button>
      </div>

      {/* Staged files */}
      {selected.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-950">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{selected.length} staged</span>
            <button onClick={() => setSelected([])} className="text-[10px] font-mono text-zinc-600 hover:text-red-400 transition-colors">
              Clear all
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto scrollbar-thin divide-y divide-zinc-900">
            {selected.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-mono text-zinc-400 truncate">{f.name}</span>
                <button
                  onClick={() => removeAt(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors ml-2 shrink-0"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-3" data-testid="hook-progress">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              {done ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Loader2 size={12} className="animate-spin text-zinc-400" />}
              Batch {batchId ? batchId.slice(0, 8) : ""} — {processed}/{total}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">{pct}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-1">
            <div
              className={`h-1 transition-all duration-300 ${done ? "bg-emerald-400" : "bg-white"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Counter label="Total" value={progress.total} />
            <Counter label="Processed" value={progress.processed} />
            <Counter label="Inserted" value={progress.inserted} tone="text-emerald-400" />
            <Counter label="Duplicates" value={progress.duplicates} tone="text-zinc-500" />
            <Counter label="Review" value={progress.review} tone="text-amber-400" />
            <Counter label="Rejected" value={progress.rejected} tone="text-zinc-500" />
          </div>
          {progress.errors > 0 && (
            <p className="text-[11px] font-mono text-red-400">{progress.errors} error(s) during processing</p>
          )}
        </div>
      )}
    </div>
  );
}
