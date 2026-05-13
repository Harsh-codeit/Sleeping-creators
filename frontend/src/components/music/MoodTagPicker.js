import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Check } from "lucide-react";
import { useMusicTags } from "../../hooks/useMusicTags";

export function MoodTagPicker({ value = [], onChange }) {
  const { tags, createTag, deleteTag } = useMusicTags();
  const [adding, setAdding] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const toggle = (tag) => {
    if (editingCatalog) return; // clicks in edit mode delete instead
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else onChange([...value, tag]);
  };

  const submitNew = async () => {
    const raw = draft;
    setDraft("");
    setAdding(false);
    const clean = (raw || "").trim().toLowerCase();
    if (!clean) return;
    try {
      const created = await createTag(clean);
      if (!value.includes(created)) onChange([...value, created]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create tag");
    }
  };

  const removeFromCatalog = async (tag) => {
    if (!window.confirm(`Remove "${tag}" from the catalog? Existing tracks tagged with it will keep the tag.`)) return;
    try {
      await deleteTag(tag);
      toast.success(`Removed "${tag}" from catalog`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete tag");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((tag) => {
          const active = value.includes(tag);
          return (
            <span key={tag} className="relative inline-flex">
              <button
                type="button"
                onClick={() => (editingCatalog ? removeFromCatalog(tag) : toggle(tag))}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  editingCatalog
                    ? "bg-red-950/30 text-red-300 border-red-900/60 hover:bg-red-900/40"
                    : active
                      ? "bg-white text-black border-white"
                      : "text-zinc-500 border-zinc-700 hover:text-white hover:border-zinc-500"
                }`}
              >
                {editingCatalog ? `× ${tag}` : tag}
              </button>
            </span>
          );
        })}

        {adding ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={submitNew}
            placeholder="new tag"
            maxLength={32}
            className="bg-zinc-950 border border-zinc-600 px-2 py-1 text-[10px] font-mono text-white w-24 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={editingCatalog}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-zinc-500 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-500 disabled:opacity-40 transition-colors"
            title="Create a new tag"
          >
            <Plus size={10} />
            New tag
          </button>
        )}

        {tags.length > 0 && (
          <button
            type="button"
            onClick={() => setEditingCatalog((v) => !v)}
            className={`ml-1 p-1 transition-colors ${
              editingCatalog ? "text-red-400" : "text-zinc-600 hover:text-zinc-300"
            }`}
            title={editingCatalog ? "Done editing catalog" : "Edit catalog (remove tags)"}
          >
            {editingCatalog ? <Check size={11} /> : <Pencil size={11} />}
          </button>
        )}
      </div>

      {editingCatalog && (
        <p className="text-[10px] font-mono text-zinc-600">
          Click a tag to remove it from the catalog. Existing tagged tracks keep the tag.
        </p>
      )}
    </div>
  );
}
