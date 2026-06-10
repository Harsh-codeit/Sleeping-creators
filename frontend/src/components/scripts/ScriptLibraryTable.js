import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Trash2, RefreshCw, Search, Loader2, FileText, Video, Link,
  X, Copy, ExternalLink, ArrowUpRight,
} from "lucide-react";
import NicheSelect from "../NicheSelect";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 25;

const SOURCE_TYPE_LABELS = { file: "File", gdocs: "Google Doc", reel: "Reel" };
const SOURCE_TYPE_ICONS = { file: FileText, gdocs: Link, reel: Video };
const SOURCE_TYPE_TEXT = { file: "text-amber-400", gdocs: "text-sky-400", reel: "text-rose-400" };
const SOURCE_TYPE_EDGE = { file: "border-l-amber-400/70", gdocs: "border-l-sky-400/70", reel: "border-l-rose-400/70" };

const SELECT_CLS =
  "bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono cursor-pointer";
const INPUT_CLS =
  "bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";

const TWO_LINE_CLAMP = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

function Stat({ label, value, cls }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono uppercase tracking-widest text-zinc-600">{label}</div>
      <div className={`text-[11px] font-mono truncate ${cls}`}>{value || "—"}</div>
    </div>
  );
}

function SourceCard({ source, index, onDelete, onOpen }) {
  const [deleting, setDeleting] = useState(false);
  const Icon = SOURCE_TYPE_ICONS[source.source_type] || FileText;
  const typeText = SOURCE_TYPE_TEXT[source.source_type] || "text-zinc-400";
  const typeEdge = SOURCE_TYPE_EDGE[source.source_type] || "border-l-zinc-600";

  async function handleDelete(e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${source.title}"? This removes all ${source.chunks_count} chunks.`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/content-scripts/${source.source_id}`);
      toast.success("Deleted");
      onDelete(source.source_id);
    } catch (e2) {
      toast.error(e2.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  }

  const date = source.created_at ? new Date(source.created_at).toLocaleDateString() : "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(source)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(source)}
      className={`group relative flex flex-col gap-2.5 border border-zinc-800 border-l-2 ${typeEdge}
        bg-zinc-900/30 p-4 cursor-pointer transition-colors duration-150
        hover:border-zinc-500 hover:bg-zinc-900/60 focus:outline-none focus:border-zinc-400`}
    >
      {/* header: type + index */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest ${typeText}`}>
          <Icon size={11} />
          {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
        </div>
        <span className="text-[9px] font-mono text-zinc-700">
          [{String(index + 1).padStart(2, "0")}]
        </span>
      </div>

      {/* title + url */}
      <div className="flex-1">
        <div className="text-zinc-200 text-sm font-mono leading-snug break-all" style={TWO_LINE_CLAMP}>
          {source.title}
        </div>
        {source.source_url && (
          <div className="text-[10px] text-zinc-600 font-mono truncate mt-1">{source.source_url}</div>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-4 gap-2 border-t border-zinc-800/80 pt-2.5">
        <Stat label="Niche" value={source.niche_slug} cls="text-sky-400" />
        <Stat label="Platform" value={source.platform} cls="text-violet-400" />
        <Stat label="Chunks" value={source.chunks_count} cls="text-emerald-400" />
        <Stat label="Added" value={date} cls="text-zinc-500" />
      </div>

      {/* footer: delete + open hint */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3">
        <span className="flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-widest text-zinc-500
          opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          Open <ArrowUpRight size={10} />
        </span>
        <button onClick={handleDelete} disabled={deleting} aria-label="Delete source"
          className="text-zinc-700 hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

function SourceModal({ source, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const typeText = SOURCE_TYPE_TEXT[source.source_type] || "text-zinc-400";
  const Icon = SOURCE_TYPE_ICONS[source.source_type] || FileText;
  const isReel = source.source_type === "reel";

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/content-scripts/${source.source_id}`)
      .then(({ data }) => !cancelled && setDetail(data))
      .catch((e) => !cancelled && setError(e.response?.data?.detail || "Failed to load content"));
    return () => { cancelled = true; };
  }, [source.source_id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const text = detail?.full_text || "";
  const words = text ? text.trim().split(/\s+/).length : 0;
  // ~2.5 spoken words/sec — rough runtime for reel transcripts.
  const secs = Math.round(words / 2.5);
  const duration = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  function copyText() {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Copy failed"),
    );
  }

  const date = detail?.created_at ? new Date(detail.created_at).toLocaleDateString() : "—";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{`@keyframes scriptModalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={source.title}
        className="bg-zinc-950 border border-zinc-700 w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ animation: "scriptModalIn 150ms ease-out" }}
      >
        {/* header */}
        <div className="border-b border-zinc-800 px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest ${typeText} mb-1.5`}>
              <Icon size={11} />
              {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
            </div>
            <h2 className="text-white text-sm font-mono leading-snug break-all">{source.title}</h2>
            {source.source_url && (
              <a href={source.source_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 font-mono mt-1 transition-colors">
                {source.source_url.length > 70 ? source.source_url.slice(0, 70) + "…" : source.source_url}
                <ExternalLink size={9} className="shrink-0" />
              </a>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="text-zinc-600 hover:text-white transition-colors cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* meta strip */}
        <div className="border-b border-zinc-800 px-5 py-2.5 grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Stat label="Niche" value={detail?.niche_slug ?? source.niche_slug} cls="text-sky-400" />
          <Stat label="Platform" value={detail?.platform ?? source.platform} cls="text-violet-400" />
          <Stat label="Chunks" value={detail?.chunks_count ?? source.chunks_count} cls="text-emerald-400" />
          <Stat label="Words" value={detail ? words.toLocaleString() : "…"} cls="text-zinc-300" />
          <Stat label={isReel ? "Runtime ~" : "Read ~"} value={detail ? duration : "…"} cls="text-zinc-300" />
          <Stat label="Added" value={date} cls="text-zinc-500" />
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-3">
            {isReel ? "Transcript" : "Script"}
          </div>
          {error ? (
            <div className="text-red-400 text-sm font-mono py-8 text-center">{error}</div>
          ) : !detail ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm font-mono py-8 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-300 leading-relaxed break-words">
              {text}
            </pre>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-600">
            {detail ? `${text.length.toLocaleString()} chars` : ""}
          </span>
          <button onClick={copyText} disabled={!detail}
            className="flex items-center gap-1.5 border border-zinc-700 px-3 py-1.5 text-[10px] font-mono uppercase
              tracking-widest text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30
              transition-colors cursor-pointer">
            <Copy size={11} /> Copy
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScriptLibraryTable({ refreshKey }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [niche, setNiche] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [openSource, setOpenSource] = useState(null);

  const fetchSources = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (niche) params.niche = niche;
      if (sourceType) params.source_type = sourceType;
      if (search) params.q = search;
      const { data } = await axios.get(`${API}/content-scripts`, { params });
      setSources(data.sources || []);
      setHasMore((data.sources || []).length === PAGE_SIZE);
      setPage(pg);
    } catch (e) {
      toast.error("Failed to load scripts");
    } finally {
      setLoading(false);
    }
  }, [niche, sourceType, search]);

  useEffect(() => { fetchSources(1); }, [fetchSources, refreshKey]);

  function onDelete(sourceId) {
    setSources((prev) => prev.filter((s) => s.source_id !== sourceId));
  }

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-48">
          <NicheSelect value={niche} onChange={(v) => setNiche(v)} includeAll placeholder="All niches" />
        </div>
        <select className={SELECT_CLS} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          <option value="">All types</option>
          <option value="file">File</option>
          <option value="gdocs">Google Doc</option>
          <option value="reel">Reel</option>
        </select>
        <div className="flex gap-2 flex-1 min-w-[220px]">
          <input className={`${INPUT_CLS} flex-1`} placeholder="Search titles…"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(q)} />
          <button onClick={() => setSearch(q)}
            className="border border-zinc-700 px-3 py-2 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
            <Search size={13} />
          </button>
        </div>
        <button onClick={() => fetchSources(1)} title="Refresh"
          className="border border-zinc-700 px-3 py-2 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Cards */}
      {loading && sources.length === 0 ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm font-mono py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 font-mono text-sm">
          No scripts imported yet. Upload a doc or transcribe a reel to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sources.map((s, i) => (
            <SourceCard key={s.source_id} source={s} index={(page - 1) * PAGE_SIZE + i}
              onDelete={onDelete} onOpen={setOpenSource} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex gap-3 justify-end pt-2">
          <button disabled={page <= 1} onClick={() => fetchSources(page - 1)}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition-colors">
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-xs font-mono text-zinc-500">Page {page}</span>
          <button disabled={!hasMore} onClick={() => fetchSources(page + 1)}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition-colors">
            Next →
          </button>
        </div>
      )}

      {/* Detail popup */}
      {openSource && <SourceModal source={openSource} onClose={() => setOpenSource(null)} />}
    </div>
  );
}
