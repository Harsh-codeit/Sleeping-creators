import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "./constants";
import VideoTemplatePicker from "../VideoTemplatePicker";

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
  const strategy = form.video_clip_strategy || "random";

  const toggleClip = (clipId) => {
    onChange(
      "video_clip_ids",
      selectedIds.includes(clipId)
        ? selectedIds.filter(id => id !== clipId)
        : [...selectedIds, clipId]
    );
  };

  return (
    <div className="space-y-5">
      {/* Template */}
      <div>
        <label className="label-xs">Video Template</label>
        <VideoTemplatePicker
          value={form.video_template_id}
          onChange={(id) => onChange("video_template_id", id)}
        />
      </div>

      {/* Clips */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="label-xs mb-0">Clips</label>
          <span className="text-[10px] font-mono text-zinc-600">
            {loading ? "Loading…" : `${allClips.length} available`}
          </span>
        </div>

        {/* Use-all toggle */}
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={useAllClips}
            onChange={() => onChange("video_clip_ids", useAllClips ? allClips.map(c => c.drive_file_id || c.id) : [])}
            className="accent-white"
          />
          <span className="text-xs text-white font-semibold">Use all clips</span>
          {!useAllClips && selectedIds.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500">({selectedIds.length} selected)</span>
          )}
        </label>

        {/* Clip chips */}
        {!useAllClips && (
          allClips.length === 0 ? (
            <div className="text-[11px] font-mono text-zinc-500 border border-dashed border-zinc-700 px-3 py-2">
              No clips synced yet.{" "}
              {clientId && (
                <Link to={`/clients/${clientId}`} className="text-zinc-300 underline hover:text-white">
                  Sync from Drive →
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allClips.map(c => {
                const cid = c.drive_file_id || c.id;
                const selected = selectedIds.includes(cid);
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => toggleClip(cid)}
                    title={c.name || cid}
                    className={`font-mono text-[10px] px-2.5 py-1.5 border transition-colors duration-150 max-w-[200px] truncate ${
                      selected
                        ? "bg-white text-black border-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {c.name || cid}
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* Strategy — only when subset selected */}
        {!useAllClips && selectedIds.length > 0 && (
          <div className="flex gap-1.5 mt-3">
            {[
              { value: "random",     label: "Random" },
              { value: "sequential", label: "In Order" },
            ].map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange("video_clip_strategy", s.value)}
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
        )}
      </div>
    </div>
  );
}
