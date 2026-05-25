import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ChevronUp, ChevronDown, Film, Plus } from "lucide-react";
import { API } from "./constants";
import VideoTemplatePicker from "../VideoTemplatePicker";

const CLIP_STRATEGIES = [
  { value: "random",     label: "Random",     desc: "Pick N random clips from the pool each run" },
  { value: "sequential", label: "Sequential", desc: "Cycle through clips in order — MEDIA_1 = first, MEDIA_2 = second, …" },
];

export default function PipelineWizardStepSource({ form, onChange, clientId }) {
  const [allClips, setAllClips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    axios.get(`${API}/clients/${clientId}/drive-clips`)
      .then(r => setAllClips(r.data || []))
      .catch(() => setAllClips([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const selectedIds = form.video_clip_ids || [];
  const useAllClips = selectedIds.length === 0;
  const clipById = Object.fromEntries(allClips.map(c => [c.drive_file_id || c.id, c]));

  const toggleClip = (clipId) => {
    if (selectedIds.includes(clipId)) {
      onChange("video_clip_ids", selectedIds.filter(id => id !== clipId));
    } else {
      onChange("video_clip_ids", [...selectedIds, clipId]);
    }
  };

  const reorderClip = (index, direction) => {
    const next = [...selectedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange("video_clip_ids", next);
  };

  const useAllToggle = () => {
    if (useAllClips) {
      // Switching to "subset": pre-populate with all clip ids preserving sort order
      onChange("video_clip_ids", allClips.map(c => c.drive_file_id || c.id));
    } else {
      onChange("video_clip_ids", []);
    }
  };

  const strategy = form.video_clip_strategy || "random";

  return (
    <div className="space-y-5">
      {/* Video Template */}
      <div>
        <label className="label-xs">Video Template</label>
        <VideoTemplatePicker
          value={form.video_template_id}
          onChange={(id) => onChange("video_template_id", id)}
        />
        <div className="text-[10px] font-mono text-zinc-600 mt-1">
          The pipeline counts this template's clip slots and picks that many clips per run.
        </div>
      </div>

      {/* Clip pool */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="label-xs mb-0">Drive Clips</label>
          <span className="text-[10px] font-mono text-zinc-600">
            {loading ? "Loading…" : `${allClips.length} clip${allClips.length === 1 ? "" : "s"} in client's pool`}
          </span>
        </div>

        {/* Use-all toggle */}
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={useAllClips}
            onChange={useAllToggle}
            className="mt-0.5 accent-white"
          />
          <span>
            <span className="text-xs text-white font-semibold">Use all client clips</span>
            <span className="block text-[10px] font-mono text-zinc-500 mt-0.5">
              When on, the pipeline draws from every clip in the client's Drive folder. Turn off to pick a subset and/or define an order.
            </span>
          </span>
        </label>

        {!useAllClips && (
          <>
            {/* Selected order */}
            {selectedIds.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
                  Selected order ({selectedIds.length})
                </div>
                <div className="space-y-1">
                  {selectedIds.map((cid, i) => {
                    const clip = clipById[cid];
                    return (
                      <div key={cid} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest flex-shrink-0">
                            #{i + 1}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-300 truncate">
                            {clip ? (clip.name || cid) : `(missing — ${cid.slice(0, 8)})`}
                          </span>
                          {!clip && (
                            <span className="text-[9px] font-mono text-amber-500">missing</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => reorderClip(i, -1)}
                            disabled={i === 0}
                            title="Move up"
                            className="p-1 text-zinc-600 hover:text-white disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => reorderClip(i, 1)}
                            disabled={i === selectedIds.length - 1}
                            title="Move down"
                            className="p-1 text-zinc-600 hover:text-white disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleClip(cid)}
                            title="Remove from pool"
                            className="p-1 text-zinc-600 hover:text-rose-400 transition-colors text-[11px] font-mono"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available (unselected) */}
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
                Available
              </div>
              {allClips.length === 0 ? (
                <div className="border border-zinc-800 bg-zinc-900 px-3 py-3 text-[11px] font-mono text-zinc-500">
                  No clips synced yet.{" "}
                  {clientId && (
                    <Link to={`/clients/${clientId}`} className="text-zinc-300 underline hover:text-white">
                      Sync from Drive on the client Overview tab →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {allClips
                    .filter(c => !selectedIds.includes(c.drive_file_id || c.id))
                    .map(c => {
                      const cid = c.drive_file_id || c.id;
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => toggleClip(cid)}
                          title={c.name || cid}
                          className="font-mono text-[10px] px-2 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 flex items-center gap-1 transition-colors duration-150 max-w-[220px]"
                        >
                          <Plus size={9} />
                          <span className="truncate">{c.name || cid}</span>
                        </button>
                      );
                    })
                  }
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Strategy */}
      <div>
        <label className="label-xs">Selection Strategy</label>
        <div className="flex gap-1.5 flex-wrap">
          {CLIP_STRATEGIES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange("video_clip_strategy", s.value)}
              title={s.desc}
              className={`py-1.5 px-3 text-[11px] font-mono border transition-colors duration-150 ${
                strategy === s.value
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-mono text-zinc-600 mt-1.5 flex items-center gap-1">
          <Film size={9} />
          {CLIP_STRATEGIES.find(s => s.value === strategy)?.desc}
          {strategy === "sequential" && useAllClips && (
            <span className="ml-1 text-amber-400">
              · Sequential needs an explicit clip list — turn off "Use all client clips" first.
            </span>
          )}
        </div>
      </div>

      {/* Instagram Reel cover offset */}
      <div>
        <label className="label-xs">Instagram Reel Cover Offset (ms)</label>
        <input
          type="number"
          min={0}
          step={1}
          value={form.instagram_thumbnail_offset_ms ?? 2000}
          onChange={e => {
            const v = e.target.value;
            onChange("instagram_thumbnail_offset_ms", v === "" ? 0 : Math.max(0, parseInt(v, 10) || 0));
          }}
          className="w-32 bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-xs font-mono text-white focus:border-zinc-600 focus:outline-none"
        />
        <div className="text-[10px] font-mono text-zinc-600 mt-1">
          Timestamp of the frame used as the Reel cover photo. e.g. 2000 = 2 seconds into the video.
        </div>
      </div>
    </div>
  );
}
