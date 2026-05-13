import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X, FolderSearch, ExternalLink, CheckSquare, Square } from "lucide-react";
import { MoodTagPicker } from "./MoodTagPicker";
import { VideoField } from "./VideoField";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtSize(bytes) {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function MusicDriveImportModal({ open, onClose, onImported }) {
  const [folder, setFolder] = useState("");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [defaultTags, setDefaultTags] = useState([]);
  const [listing, setListing] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFolder("");
    setItems([]);
    setSelected(new Set());
    setDefaultTags([]);
  };

  const handleClose = () => {
    if (listing || importing) return;
    reset();
    onClose();
  };

  const listFolder = async () => {
    if (!folder.trim()) return toast.error("Paste a Drive folder URL");
    setListing(true);
    setItems([]);
    setSelected(new Set());
    try {
      const r = await axios.get(`${API}/music/drive/list`, { params: { folder: folder.trim() } });
      const result = r.data?.items || [];
      setItems(result);
      // Pre-select everything that isn't already imported
      setSelected(new Set(result.filter((it) => !it.already_imported).map((it) => it.drive_file_id)));
      if (result.length === 0) toast.message("No audio files found in that folder");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to list Drive folder");
    } finally {
      setListing(false);
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(items.filter((it) => !it.already_imported).map((it) => it.drive_file_id)));
  };

  const selectNone = () => setSelected(new Set());

  const doImport = async () => {
    if (selected.size === 0) return toast.error("Select at least one file");
    setImporting(true);
    try {
      const r = await axios.post(`${API}/music/drive/import`, {
        folder: folder.trim(),
        drive_file_ids: Array.from(selected),
        mood_tags: defaultTags,
      });
      const { imported = [], skipped = [], failed = [] } = r.data || {};
      const parts = [`Imported ${imported.length}`];
      if (skipped.length) parts.push(`${skipped.length} skipped`);
      if (failed.length) parts.push(`${failed.length} failed`);
      if (failed.length) toast.error(parts.join(" · "));
      else toast.success(parts.join(" · "));
      if (imported.length) onImported(imported);
      if (failed.length === 0) {
        reset();
        onClose();
      } else {
        // Mark imported/skipped as already_imported in the list so the user can see what's left
        const handled = new Set([
          ...imported.map((t) => t.drive_file_id),
          ...skipped.map((s) => s.drive_file_id),
        ]);
        setItems((prev) =>
          prev.map((it) => (handled.has(it.drive_file_id) ? { ...it, already_imported: true } : it)),
        );
        setSelected(new Set(failed.map((f) => f.drive_file_id)));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const eligibleCount = items.filter((it) => !it.already_imported).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Import Music from Google Drive</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={listing || importing}
            className="text-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <VideoField label="Drive Folder URL or ID">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                disabled={listing || importing}
              />
              <button
                type="button"
                onClick={listFolder}
                disabled={listing || importing || !folder.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                <FolderSearch size={12} />
                {listing ? "Listing…" : "List Files"}
              </button>
            </div>
          </VideoField>

          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>
                  {items.length} file{items.length === 1 ? "" : "s"} · {selected.size} selected
                  {eligibleCount < items.length && (
                    <> · {items.length - eligibleCount} already imported</>
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={importing}
                    className="text-zinc-400 hover:text-white"
                  >
                    Select all
                  </button>
                  <span className="text-zinc-700">|</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    disabled={importing}
                    className="text-zinc-400 hover:text-white"
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="border border-zinc-800 max-h-64 overflow-y-auto divide-y divide-zinc-800">
                {items.map((it) => {
                  const isSelected = selected.has(it.drive_file_id);
                  const disabled = it.already_imported || importing;
                  return (
                    <label
                      key={it.drive_file_id}
                      className={`flex items-center gap-3 px-3 py-2 ${
                        disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "cursor-pointer hover:bg-zinc-800/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => toggle(it.drive_file_id)}
                      />
                      {isSelected ? (
                        <CheckSquare size={14} className="text-white flex-shrink-0" />
                      ) : (
                        <Square size={14} className="text-zinc-600 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-white truncate">{it.name}</p>
                        <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          {it.mime_type} · {fmtSize(it.size)}
                          {it.already_imported && " · imported"}
                        </p>
                      </div>
                      <a
                        href={`https://drive.google.com/file/d/${it.drive_file_id}/view`}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="text-zinc-500 hover:text-white"
                        title="Preview on Drive"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </label>
                  );
                })}
              </div>

              <VideoField label="Apply these mood tags to every imported track">
                <MoodTagPicker value={defaultTags} onChange={setDefaultTags} />
              </VideoField>
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-zinc-800">
          <button
            type="button"
            onClick={doImport}
            disabled={importing || selected.size === 0}
            className="px-5 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {importing ? "Importing…" : `Import ${selected.size || ""}`.trim()}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={listing || importing}
            className="px-5 py-2 border border-zinc-700 text-zinc-400 text-xs font-mono hover:text-white hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
