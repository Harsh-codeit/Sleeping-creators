import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Play, Pause } from "lucide-react";
import ClipPickerModal from "./ClipPickerModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PLATFORMS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "twitter"];

function buildClipUrl(clip, clientId) {
  if (clip.r2_url) return clip.r2_url;
  const token = localStorage.getItem("sc_token");
  const base = `${API}/clients/${clientId}/clips/${clip.drive_file_id}/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function TimelineBar({ currentTime, duration, trimStart, trimEnd, onSeek, onTrimChange, disabled }) {
  const barRef = useRef(null);
  const dur = duration || 1;
  const pct = (t) => `${Math.min(Math.max((t / dur) * 100, 0), 100)}%`;

  const posFromEvent = useCallback((e) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * dur;
  }, [dur]);

  const startDrag = useCallback((e, type) => {
    e.preventDefault();
    e.stopPropagation();
    const trimEndVal = trimEnd ?? dur;
    const onMove = (ev) => {
      const t = posFromEvent(ev);
      if (type === "in") onTrimChange({ trimStart: Math.min(t, trimEndVal - 0.1) });
      else if (type === "out") onTrimChange({ trimEnd: Math.max(t, trimStart + 0.1) });
      else onSeek(t);
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [posFromEvent, trimStart, trimEnd, dur, onSeek, onTrimChange]);

  const trimEndVal = trimEnd ?? dur;

  return (
    <div ref={barRef} className={`relative h-8 flex items-center ${disabled ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
      onClick={e => { if (!disabled) onSeek(posFromEvent(e)); }}>
      <div className="absolute inset-0 flex items-center pointer-events-none">
        <div className="w-full h-1 bg-zinc-800 rounded-full" />
      </div>
      <div className="absolute h-1 bg-zinc-600 rounded-full pointer-events-none"
        style={{ left: pct(trimStart), width: pct(trimEndVal - trimStart) }} />
      <div className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
        style={{ left: pct(trimStart), transform: "translateX(-50%)" }}
        onMouseDown={e => startDrag(e, "in")} onClick={e => e.stopPropagation()} />
      <div className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
        style={{ left: pct(trimEndVal), transform: "translateX(-50%)" }}
        onMouseDown={e => startDrag(e, "out")} onClick={e => e.stopPropagation()} />
      <div className="absolute w-3 h-3 rounded-full bg-white border-2 border-zinc-400 shadow cursor-grab z-30"
        style={{ left: pct(currentTime), transform: "translateX(-50%)" }}
        onMouseDown={e => startDrag(e, "playhead")} onClick={e => e.stopPropagation()} />
    </div>
  );
}

export default function VideoStudio({ clientId }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const [clip, setClip] = useState(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null);

  const [overrides, setOverrides] = useState({});
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [rendering, setRendering] = useState(false);

  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    axios.get(`${API}/video-templates?client_id=${clientId}`)
      .then(r => setTemplates(r.data || []))
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    const t = templates.find(t => t.id === templateId) || null;
    setActiveTemplate(t);
  }, [templateId, templates]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [clip]);

  useEffect(() => { setOverrides({}); }, [templateId]);

  const togglePlatform = (p) =>
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleRender = async () => {
    if (!clip && !(activeTemplate && activeTemplate.video_overridable === false)) {
      return toast.error("Select a clip first");
    }
    setRendering(true);
    try {
      const r = await axios.post(`${API}/videos/render`, {
        client_id: clientId,
        clip_id: clip ? (clip.drive_file_id || clip.id) : null,
        template_id: templateId || null,
        clip_trim_start: trimStart,
        clip_trim_end: trimEnd,
        platforms: ["_preview"],
        overrides,
      });
      const url = r.data.video_url;
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "preview.mp4";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Render complete — downloading…");
      } else {
        toast.error("Render succeeded but no URL returned");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Render failed");
    } finally {
      setRendering(false);
    }
  };

  const handlePublish = async () => {
    if (!clip && !(activeTemplate && activeTemplate.video_overridable === false)) {
      return toast.error("Select a clip first");
    }
    if (!platforms.length) return toast.error("Select at least one platform");
    setPublishing(true);
    try {
      const r = await axios.post(`${API}/videos/create`, {
        client_id: clientId,
        clip_id: clip ? (clip.drive_file_id || clip.id) : null,
        template_id: templateId || null,
        clip_trim_start: trimStart,
        clip_trim_end: trimEnd,
        caption,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        platforms,
        scheduled_at: scheduleAt || null,
        overrides,
      });
      toast.success(r.data.message || `Video queued (${r.data.status || "processing"})`);
      setClip(null);
      setOverrides({});
      setCaption("");
      setHashtags("");
      setPlatforms([]);
      setScheduleAt("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const clipDuration = duration || clip?.duration || 0;

  const handleSeek = useCallback((t) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const handleTrimChange = useCallback(({ trimStart: s, trimEnd: e }) => {
    if (s !== undefined) setTrimStart(s);
    if (e !== undefined) setTrimEnd(e);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Left: template + clip ────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-zinc-800 overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <p className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Template</p>
          {templates.length === 0 ? (
            <p className="text-[10px] font-mono text-zinc-600">
              No templates yet — create one in Templates → Video.
            </p>
          ) : (
            <div className="space-y-1.5">
              <button
                onClick={() => setTemplateId(null)}
                className={`w-full text-left px-3 py-2 text-[10px] font-mono border transition-colors ${
                  templateId === null
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}
              >
                None
              </button>
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`w-full text-left border transition-colors overflow-hidden ${
                    templateId === t.id
                      ? "border-white"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Mini CSS preview */}
                  <div className="relative bg-gradient-to-br from-zinc-800 to-zinc-950 overflow-hidden"
                    style={{ aspectRatio: (t.aspect_ratio || "9:16").replace(":", " / ") }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-40">
                      <span className="text-[10px] font-mono text-white">
                        {(t.elements || []).length} elements
                      </span>
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className={`text-[10px] font-mono truncate ${templateId === t.id ? "text-white" : "text-zinc-400"}`}>
                      {t.name}
                    </p>
                    <p className="text-[9px] font-mono text-zinc-600">{t.aspect_ratio || "9:16"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          <p className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Clip</p>
          {activeTemplate && activeTemplate.video_overridable === false ? (
            <p className="text-[10px] font-mono text-zinc-600">Clip locked to template</p>
          ) : (
            <>
              <button
                onClick={() => setClipOpen(true)}
                className="w-full border border-zinc-800 px-3 py-2 text-[10px] font-mono text-left text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                {clip ? (clip.name || clip.filename || clip.id) : "Choose clip…"}
              </button>
              {clip && (
                <button
                  onClick={() => setClip(null)}
                  className="mt-1 text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Center: preview + transport ──────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col p-4 gap-3 overflow-hidden">
        <div
          className="relative bg-black flex-1 min-h-0 overflow-hidden"
          style={{ aspectRatio: (activeTemplate?.aspect_ratio || "9:16").replace(":", " / ") }}
        >
          {clip?.url ? (
            <video
              ref={videoRef}
              src={clip.url}
              className="absolute inset-0 w-full h-full object-cover"
              onTimeUpdate={e => {
                const t = e.target.currentTime;
                setCurrentTime(t);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onLoadedMetadata={e => {
                if (videoRef.current) videoRef.current.currentTime = 0.01;
                setDuration(e.target.duration || 0);
              }}
              playsInline
              muted
              preload="metadata"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="20" rx="2.5" />
                <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
              </svg>
              <span className="text-xs text-white font-mono tracking-widest uppercase">No clip</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={!clip}
              className="w-8 h-8 flex items-center justify-center border border-zinc-700 text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors shrink-0"
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <TimelineBar
              currentTime={currentTime}
              duration={clipDuration}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onSeek={handleSeek}
              onTrimChange={handleTrimChange}
              disabled={!clip}
            />
            <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0 min-w-[64px] text-right">
              {fmt(currentTime)} / {fmt(clipDuration)}
            </span>
          </div>
          {clip && (
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 px-0.5">
              <span>In: {trimStart.toFixed(1)}s</span>
              <span>drag amber handles to trim</span>
              <span>Out: {(trimEnd ?? clipDuration).toFixed(1)}s</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Right: content + publish ─────────────────────────────── */}
      <aside className="w-72 shrink-0 border-l border-zinc-800 overflow-y-auto">
        <div className="p-4 space-y-5">

          {/* Dynamic overrides */}
          {(() => {
            const overridableEls = activeTemplate?.elements?.filter(e => e.overridable && e.override_key) || [];
            if (!overridableEls.length) return null;
            return (
              <div className="space-y-3">
                {overridableEls.map(el => (
                  <div key={el.id}>
                    <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">
                      {el.override_key.replace(/_/g, " ")}
                    </label>
                    <input
                      value={overrides[el.override_key] ?? ""}
                      onChange={e => setOverrides(prev => ({ ...prev, [el.override_key]: e.target.value }))}
                      placeholder={el.props?.text || el.override_key}
                      className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                ))}
              </div>
            );
          })()}

          {activeTemplate?.elements?.some(e => e.overridable && e.override_key) && (
            <div className="border-t border-zinc-800" />
          )}

          {/* Caption */}
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Caption</label>
            <textarea
              rows={3}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption…"
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Hashtags</label>
            <input
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#marketing #business"
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Platforms */}
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Platforms</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                    platforms.includes(p)
                      ? "bg-white text-black border-white"
                      : "border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">
              Schedule <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={e => setScheduleAt(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <button
            onClick={handleRender}
            disabled={rendering || (!clip && !(activeTemplate && activeTemplate.video_overridable === false))}
            className="w-full py-2.5 bg-zinc-800 text-white text-sm font-mono font-semibold border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {rendering ? "Rendering…" : "Render & Download"}
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing}
            className="w-full py-2.5 bg-white text-black text-sm font-mono font-bold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {publishing ? "Publishing…" : scheduleAt ? "Schedule Video" : "Publish Now"}
          </button>
        </div>
      </aside>

      {clipOpen && (
        <ClipPickerModal
          clientId={clientId}
          onClose={() => setClipOpen(false)}
          onSelect={c => {
            setClip({ ...c, url: buildClipUrl(c, clientId) });
            setTrimStart(0);
            setTrimEnd(c.duration || null);
            setClipOpen(false);
          }}
        />
      )}
    </div>
  );
}
