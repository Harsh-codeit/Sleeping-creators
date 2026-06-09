import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Trash2, RefreshCw, Search, Loader2, FileText, Video, Link } from "lucide-react";
import NicheSelect from "../NicheSelect";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 25;

const SOURCE_TYPE_LABELS = { file: "File", gdocs: "Google Doc", reel: "Reel" };
const SOURCE_TYPE_ICONS = { file: FileText, gdocs: Link, reel: Video };

const SELECT_CLS =
  "bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono cursor-pointer";
const INPUT_CLS =
  "bg-zinc-950 border border-zinc-700 text-white text-xs px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";

function SourceRow({ source, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const Icon = SOURCE_TYPE_ICONS[source.source_type] || FileText;

  async function handleDelete() {
    if (!window.confirm(`Delete "${source.title}"? This removes all ${source.chunks_count} chunks.`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/content-scripts/${source.source_id}`);
      toast.success("Deleted");
      onDelete(source.source_id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  }

  const date = source.created_at ? new Date(source.created_at).toLocaleDateString() : "—";

  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors align-top">
      <td className="py-2.5 pr-4">
        <div className="flex items-start gap-2">
          <Icon size={13} className="text-zinc-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-zinc-200 text-sm font-mono leading-snug">{source.title}</div>
            {source.source_url && (
              <a href={source.source_url} target="_blank" rel="noreferrer"
                className="text-[10px] text-zinc-600 hover:text-zinc-400 font-mono truncate block max-w-xs transition-colors">
                {source.source_url}
              </a>
            )}
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-4 text-[11px] font-mono text-zinc-400 whitespace-nowrap">
        {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
      </td>
      <td className="py-2.5 pr-4 text-sky-400 text-[11px] font-mono whitespace-nowrap">{source.niche_slug || "—"}</td>
      <td className="py-2.5 pr-4 text-violet-400 text-[11px] font-mono whitespace-nowrap">{source.platform || "—"}</td>
      <td className="py-2.5 pr-4 text-emerald-400 text-[11px] font-mono whitespace-nowrap">{source.chunks_count}</td>
      <td className="py-2.5 pr-4 text-zinc-600 text-[11px] font-mono whitespace-nowrap">{date}</td>
      <td className="py-2.5">
        <button onClick={handleDelete} disabled={deleting} aria-label="Delete source"
          className="text-zinc-600 hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </td>
    </tr>
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

      {/* Table */}
      {loading && sources.length === 0 ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm font-mono py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 font-mono text-sm">
          No scripts imported yet. Upload a doc or transcribe a reel to get started.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Title", "Type", "Niche", "Platform", "Chunks", "Added", ""].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-[9px] font-mono uppercase tracking-widest text-zinc-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <SourceRow key={s.source_id} source={s} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
