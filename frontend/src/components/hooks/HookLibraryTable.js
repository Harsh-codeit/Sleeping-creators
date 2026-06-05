import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Search, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, Library, Loader2 } from "lucide-react";
import NicheSelect from "../NicheSelect";
import { API, HookTypeSelect, HOOK_TYPE_LABEL } from "./hookConstants";
import HookEditForm from "./HookEditForm";

const PAGE_SIZE = 25;
const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";

function score(v) {
  return v != null ? Number(v).toFixed(2) : "—";
}

function Row({ hook, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this hook permanently?")) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/viral-hooks/${hook.id}`);
      toast.success("Deleted");
      onDelete(hook.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/60 transition-colors align-top" data-testid="library-row">
      <td className="py-2.5 pr-4 text-zinc-200 max-w-md">{hook.hook_text}</td>
      <td className="py-2.5 pr-4 text-sky-400 whitespace-nowrap">{hook.niche_slug || "—"}</td>
      <td className="py-2.5 pr-4 text-violet-400 whitespace-nowrap">{HOOK_TYPE_LABEL[hook.hook_type] || hook.hook_type || "—"}</td>
      <td className="py-2.5 pr-4 text-zinc-500 whitespace-nowrap">{hook.trigger || "—"}</td>
      <td className="py-2.5 pr-4 text-emerald-400 whitespace-nowrap">{score(hook.virality_score)}</td>
      <td className="py-2.5 pr-2 whitespace-nowrap">
        <div className="flex gap-2">
          <button onClick={() => onEdit(hook)} aria-label="Edit hook" className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
            <Pencil size={13} />
          </button>
          <button onClick={handleDelete} disabled={deleting} aria-label="Delete hook" className="text-zinc-600 hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Live-hooks browser: filterable + paginated table with inline edit + delete. */
export default function HookLibraryTable() {
  const [niche, setNiche] = useState("");
  const [hookType, setHookType] = useState("");
  const [text, setText] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); // committed text query
  const [offset, setOffset] = useState(0);
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // hook row being edited

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: "live", limit: PAGE_SIZE, offset };
      if (niche) params.niche_slug = niche;
      if (hookType) params.hook_type = hookType;
      if (searchTerm) params.text = searchTerm;
      const { data } = await axios.get(`${API}/viral-hooks`, { params });
      setHooks(data.hooks || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [niche, hookType, searchTerm, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter changes reset to page 1.
  function changeNiche(v) {
    setOffset(0);
    setNiche(v);
  }
  function changeType(v) {
    setOffset(0);
    setHookType(v);
  }
  function submitSearch(e) {
    e.preventDefault();
    setOffset(0);
    setSearchTerm(text.trim());
  }

  function handleDeleted(id) {
    setHooks((prev) => prev.filter((h) => h.id !== id));
  }

  function handleSaved(updated) {
    setHooks((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    setEditing(null);
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const canPrev = offset > 0;
  const canNext = hooks.length === PAGE_SIZE; // full page → likely more

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Niche</label>
          <NicheSelect value={niche} onChange={changeNiche} placeholder="All niches" testid="library-niche" />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Hook Type</label>
          <HookTypeSelect value={hookType} onChange={changeType} includeAll placeholder="All types" testid="library-type" />
        </div>
        <form onSubmit={submitSearch} className="lg:col-span-2 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Search Text</label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Full-text search hooks…"
              className={INPUT_CLS}
              data-testid="library-search"
            />
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-3 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 transition-colors cursor-pointer">
            <Search size={13} /> Search
          </button>
        </form>
      </div>

      {(niche || hookType || searchTerm) && (
        <button
          onClick={() => {
            setNiche("");
            setHookType("");
            setText("");
            setSearchTerm("");
            setOffset(0);
          }}
          className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          Clear filters
        </button>
      )}

      {/* Inline editor (when active) */}
      {editing && (
        <HookEditForm hook={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      )}

      {/* Table */}
      <div className="border border-zinc-800">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Live Hooks — page {page}</span>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-white disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loading && hooks.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-600 py-10 text-center">Loading…</p>
        ) : hooks.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-3">
            <Library size={24} className="text-zinc-700" />
            <p className="text-sm font-mono text-zinc-600">No live hooks match.</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-600 border-b border-zinc-800">
                  <th className="text-left py-2 px-4 font-normal">Hook</th>
                  <th className="text-left py-2 pr-4 font-normal">Niche</th>
                  <th className="text-left py-2 pr-4 font-normal">Type</th>
                  <th className="text-left py-2 pr-4 font-normal">Trigger</th>
                  <th className="text-left py-2 pr-4 font-normal">Virality</th>
                  <th className="text-left py-2 pr-2 font-normal w-16" />
                </tr>
              </thead>
              <tbody>
                {hooks.map((h) => (
                  <Row key={h.id} hook={h} onEdit={setEditing} onDelete={handleDeleted} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={!canPrev || loading}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={12} /> Prev
        </button>
        <span className="text-[11px] font-mono text-zinc-600">Page {page}</span>
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={!canNext || loading}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
