import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, Play, Pause, Trash2 } from "lucide-react";
import { MoodTagPicker } from "./MoodTagPicker";
import { VideoField } from "./VideoField";

const SEG_COLOR = "rgba(255,255,255,0.15)";

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function WaveformEditor({ audioUrl, initialSegments = [], onChange }) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [segments, setSegments] = useState(initialSegments);
  const [editingSegId, setEditingSegId] = useState(null);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;
    let destroyed = false;

    async function init() {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      const RegionsPlugin = (await import("wavesurfer.js/dist/plugins/regions.esm.js")).default;

      const wsRegions = RegionsPlugin.create();
      regionsRef.current = wsRegions;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#52525b",
        progressColor: "#ffffff",
        height: 64,
        barWidth: 2,
        barGap: 1,
        plugins: [wsRegions],
      });

      wsRef.current = ws;

      ws.on("ready", () => {
        if (destroyed) return;
        setReady(true);
        initialSegments.forEach((seg) => {
          wsRegions.addRegion({
            id: seg.id,
            start: seg.start,
            end: seg.end,
            color: SEG_COLOR,
            drag: true,
            resize: true,
          });
        });
      });

      ws.on("error", () => {
        if (destroyed) return;
        setLoadError(true);
      });

      // WaveSurfer v7: region events fire on the plugin instance, not ws
      wsRegions.on("region-updated", (region) => {
        setSegments((prev) =>
          prev.map((s) =>
            s.id === region.id ? { ...s, start: region.start, end: region.end } : s
          )
        );
      });

      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));

      ws.load(audioUrl);
    }

    init();

    return () => {
      destroyed = true;
      setReady(false);
      setLoadError(false);
      setPlaying(false);
      setEditingSegId(null);
      setSegments(initialSegments);
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
        regionsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    onChange?.(segments);
  }, [segments, onChange]);

  const addSegment = useCallback(() => {
    if (!regionsRef.current || !wsRef.current) return;
    const currentTime = wsRef.current.getCurrentTime();
    const newSeg = {
      id: `seg-${Date.now()}`,
      start: currentTime,
      end: Math.min(currentTime + 10, wsRef.current.getDuration()),
      mood_tags: [],
    };
    regionsRef.current.addRegion({
      id: newSeg.id,
      start: newSeg.start,
      end: newSeg.end,
      color: SEG_COLOR,
      drag: true,
      resize: true,
    });
    setSegments((prev) => [...prev, newSeg]);
    setEditingSegId(newSeg.id);
  }, []);

  const updateSegmentTags = useCallback((segId, tags) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, mood_tags: tags } : s))
    );
  }, []);

  const removeSegment = useCallback((segId) => {
    if (regionsRef.current) {
      const regions = regionsRef.current.getRegions();
      const region = regions.find((r) => r.id === segId);
      if (region) region.remove();
    }
    setSegments((prev) => prev.filter((s) => s.id !== segId));
    setEditingSegId((id) => (id === segId ? null : id));
  }, []);

  return (
    <div className="space-y-3">
      <div className="bg-zinc-950 border border-zinc-800 p-3">
        <div ref={containerRef} />
        {!ready && !loadError && (
          <div className="flex items-center justify-center h-16 text-zinc-600 text-xs font-mono">
            Loading waveform…
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-center h-16 text-red-500 text-xs font-mono">
            Failed to load audio — check the file URL or CORS settings.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => wsRef.current?.playPause()}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
          {playing ? "Pause" : "Play"}
        </button>

        <button
          type="button"
          disabled={!ready}
          onClick={addSegment}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          <Plus size={11} />
          Add Segment at Playhead
        </button>
      </div>

      {segments.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">Segments</p>
          {segments.map((seg) => (
            <div key={seg.id} className="border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-300">
                  {fmtTime(seg.start)} – {fmtTime(seg.end)}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingSegId(editingSegId === seg.id ? null : seg.id)}
                    className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-0.5 transition-colors"
                  >
                    {editingSegId === seg.id ? "Done" : "Tags"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(seg.id)}
                    className="text-[10px] font-mono text-red-500 hover:text-red-300 border border-red-900/40 px-2 py-0.5 transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>

              {editingSegId === seg.id && (
                <VideoField label="Segment Mood Tags">
                  <MoodTagPicker
                    value={seg.mood_tags || []}
                    onChange={(tags) => updateSegmentTags(seg.id, tags)}
                  />
                </VideoField>
              )}

              {seg.mood_tags?.length > 0 && editingSegId !== seg.id && (
                <div className="flex flex-wrap gap-1">
                  {seg.mood_tags.map((t) => (
                    <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
