import { useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Upload, Link, Loader2, CheckCircle2, FileText } from "lucide-react";
import NicheSelect from "../NicheSelect";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORMS = [
  { value: "", label: "Any platform" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
];

const ALLOWED_EXT = ["pdf", "docx", "txt"];
const MAX_BYTES = 10 * 1024 * 1024;

const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";
const SELECT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono cursor-pointer";

export default function ScriptIngest({ onDone }) {
  const [mode, setMode] = useState("file"); // "file" | "gdocs"
  const [file, setFile] = useState(null);
  const [gdocsUrl, setGdocsUrl] = useState("");
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  function pickFile(f) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      toast.error(`Unsupported file type: .${ext}. Allowed: PDF, DOCX, TXT`);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File must be under 10 MB");
      return;
    }
    setFile(f);
    setResult(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (mode === "file" && !file) { toast.error("Select a file"); return; }
    if (mode === "gdocs" && !gdocsUrl.trim()) { toast.error("Enter a Google Docs URL"); return; }

    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      if (mode === "file") fd.append("file", file);
      if (mode === "gdocs") fd.append("gdocs_url", gdocsUrl.trim());
      if (title) fd.append("title", title);
      if (niche) fd.append("niche_slug", niche);
      if (platform) fd.append("platform", platform);

      const { data } = await axios.post(`${API}/content-scripts/ingest`, fd);
      setResult(data);
      toast.success(`Ingested — ${data.chunks_created} chunks stored`);
      setFile(null);
      setGdocsUrl("");
      setTitle("");
      onDone?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ingest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-5">
      <div>
        <h2 className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Source</h2>
        <div className="flex gap-2">
          {[{ v: "file", label: "File Upload", icon: Upload }, { v: "gdocs", label: "Google Docs", icon: Link }].map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => { setMode(v); setResult(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-widest border transition-colors cursor-pointer ${
                mode === v ? "border-white text-white bg-zinc-900" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "file" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-white bg-zinc-900" : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
              onChange={(e) => e.target.files[0] && pickFile(e.target.files[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <FileText size={16} />
                <span className="text-sm font-mono">{file.name}</span>
                <span className="text-xs text-zinc-500">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <div className="text-zinc-500 text-xs font-mono">
                <Upload size={20} className="mx-auto mb-2 text-zinc-600" />
                Drop PDF, DOCX, or TXT here · max 10 MB
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Google Docs URL</label>
            <input
              className={INPUT_CLS}
              placeholder="https://docs.google.com/document/d/…"
              value={gdocsUrl}
              onChange={(e) => setGdocsUrl(e.target.value)}
            />
            <p className="text-[10px] font-mono text-zinc-600 mt-1">Document must be publicly accessible (anyone with link)</p>
          </div>
        )}

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Title (optional)</label>
          <input className={INPUT_CLS} placeholder="e.g. Sales script — fitness coaches"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Niche (optional)</label>
            <NicheSelect value={niche} onChange={setNiche} includeAll placeholder="Any niche" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Platform (optional)</label>
            <select className={SELECT_CLS} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-xs font-mono uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {loading ? "Ingesting…" : "Ingest Script"}
        </button>

        {result && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono border border-emerald-900 bg-emerald-950/30 px-4 py-3">
            <CheckCircle2 size={14} />
            Stored {result.chunks_created} chunks · source_id: {result.source_id?.slice(0, 8)}…
          </div>
        )}
      </form>
    </div>
  );
}
