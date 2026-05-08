import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { MOOD_TAGS } from "../constants/videoStyles";

function generateId() { return Math.random().toString(36).slice(2, 9); }
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function WaveformEditor({ url, segments: initialSegments, onSave }) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const [segments, setSegments] = useState(initialSegments || []);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [editingSegId, setEditingSegId] = useState(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const wsRegions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#3f3f46",
      progressColor: "#6366f1",
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [wsRegions],
    });
    wsRef.current = ws;
    regionsRef.current = wsRegions;
    ws.load(url);
    ws.on("ready", (dur) => {
      setReady(true);
      setDuration(dur || ws.getDuration());
      (initialSegments || []).forEach(seg => {
        wsRegions.addRegion({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          color: "rgba(99, 102, 241, 0.25)",
          drag: true,
          resize: true,
        });
      });
    });
    wsRegions.on("region-updated", region => {
      setSegments(prev =>
        prev.map(s => s.id === region.id ? { ...s, start: region.start, end: region.end } : s)
      );
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    return () => ws.destroy();
  }, [url]);

  function addSegment() {
    if (!wsRef.current) return;
    const dur = duration || wsRef.current.getDuration();
    const id = generateId();
    const start = parseFloat((dur * 0.25).toFixed(1));
    const end = parseFloat((dur * 0.5).toFixed(1));
    regionsRef.current.addRegion({
      id, start, end,
      color: "rgba(99,102,241,0.25)",
      drag: true,
      resize: true,
    });
    setSegments(prev => [...prev, { id, start, end, label: "", mood_tags: [] }]);
    setEditingSegId(id);
  }

  function removeSegment(id) {
    const region = regionsRef.current?.getRegions().find(r => r.id === id);
    region?.remove();
    setSegments(prev => prev.filter(s => s.id !== id));
    if (editingSegId === id) setEditingSegId(null);
  }

  function updateSegment(id, patch) {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function toggleSegTag(segId, tag) {
    setSegments(prev => prev.map(s => {
      if (s.id !== segId) return s;
      const tags = s.mood_tags.includes(tag)
        ? s.mood_tags.filter(t => t !== tag)
        : [...s.mood_tags, tag];
      return { ...s, mood_tags: tags };
    }));
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Waveform container */}
      <div ref={containerRef} className="w-full rounded bg-zinc-950 p-2" />

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs rounded transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={addSegment}
          disabled={!ready}
          className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs rounded transition-colors"
        >
          + Add Marker
        </button>
        <button
          onClick={() => onSave(segments)}
          className="ml-auto px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded transition-colors"
        >
          Save Markers
        </button>
      </div>

      {/* Segment list */}
      {segments.length > 0 && (
        <div className="space-y-2">
          {segments.map(seg => (
            <div key={seg.id} className="bg-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs font-mono text-zinc-400">
                  <input
                    type="number" min="0" max={duration} step="0.1"
                    value={seg.start}
                    onChange={e => updateSegment(seg.id, { start: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-xs text-white outline-none"
                  />
                  <span>&ndash;</span>
                  <input
                    type="number" min="0" max={duration} step="0.1"
                    value={seg.end}
                    onChange={e => updateSegment(seg.id, { end: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-xs text-white outline-none"
                  />
                  <span className="text-zinc-600">({fmt(seg.start)}&ndash;{fmt(seg.end)})</span>
                </div>
                <input
                  value={seg.label}
                  onChange={e => updateSegment(seg.id, { label: e.target.value })}
                  className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-indigo-500"
                  placeholder="Label (e.g. build-up)"
                />
                <button
                  onClick={() => setEditingSegId(editingSegId === seg.id ? null : seg.id)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  {editingSegId === seg.id ? "Hide Tags" : "Tags"}
                </button>
                <button
                  onClick={() => removeSegment(seg.id)}
                  className="text-xs text-red-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
              {editingSegId === seg.id && (
                <div className="flex flex-wrap gap-1">
                  {MOOD_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleSegTag(seg.id, tag)}
                      className={`px-2 py-0.5 rounded-full text-xs capitalize border transition-colors ${
                        seg.mood_tags.includes(tag)
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {tag}
                    </button>
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
