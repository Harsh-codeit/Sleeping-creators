import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Play, Pause } from "lucide-react";
import ClipPickerModal from "./ClipPickerModal";
import VideoCanvasPreview from "./VideoCanvasPreview";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PLATFORMS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "twitter"];

function buildClipPreviewUrl(clip, clientId) {
  if (clip.r2_url) return clip.r2_url;
  const token = localStorage.getItem("sc_token");
  const baseUrl = `${API}/clients/${clientId}/clips/${clip.drive_file_id}/stream`;
  return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function TimelineBar({ currentTime, duration, trimStart, trimEnd, onSeek, onTrimChange, disabled }) {
  const barRef = useRef(null);
  const clipDuration = duration || 1;
  const toPercent = (t) => `${Math.min(Math.max((t / clipDuration) * 100, 0), 100)}%`;

  const posFromEvent = useCallback((e) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * clipDuration;
  }, [clipDuration]);

  const startDrag = useCallback((e, type) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (ev) => {
      const t = posFromEvent(ev);
      if (type === "in") onTrimChange({ trimStart: Math.min(t, (trimEnd ?? clipDuration) - 0.1) });
      else if (type === "out") onTrimChange({ trimEnd: Math.max(t, trimStart + 0.1) });
      else onSeek(t);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [posFromEvent, trimStart, trimEnd, clipDuration, onSeek, onTrimChange]);

  const handleBarClick = (e) => {
    if (disabled) return;
    onSeek(posFromEvent(e));
  };

  const trimEndVal = trimEnd ?? clipDuration;

  return (
    <div
      ref={barRef}
      className={`relative h-8 flex items-center ${disabled ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
      onClick={handleBarClick}
    >
      {/* Track */}
      <div className="absolute inset-0 flex items-center pointer-events-none">
        <div className="w-full h-1 bg-zinc-800 rounded-full" />
      </div>
      {/* Trim region highlight */}
      <div
        className="absolute h-1 bg-zinc-600 rounded-full pointer-events-none"
        style={{ left: toPercent(trimStart), width: toPercent(trimEndVal - trimStart) }}
      />
      {/* In-handle */}
      <div
        className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
        style={{ left: toPercent(trimStart), transform: "translateX(-50%)" }}
        onMouseDown={(e) => startDrag(e, "in")}
        onClick={(e) => e.stopPropagation()}
        title="Trim start"
      />
      {/* Out-handle */}
      <div
        className="absolute w-2.5 h-5 bg-amber-400 rounded-sm cursor-ew-resize z-20"
        style={{ left: toPercent(trimEndVal), transform: "translateX(-50%)" }}
        onMouseDown={(e) => startDrag(e, "out")}
        onClick={(e) => e.stopPropagation()}
        title="Trim end"
      />
      {/* Playhead */}
      <div
        className="absolute w-3 h-3 rounded-full bg-white border-2 border-zinc-400 shadow cursor-grab z-30"
        style={{ left: toPercent(currentTime), transform: "translateX(-50%)" }}
        onMouseDown={(e) => startDrag(e, "playhead")}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function VideoEditor({ clientId, onPublished }) {
  const [clip, setClip] = useState(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [scheduleAt, setScheduleAt] = useState("");

  const [publishing, setPublishing] = useState(false);

  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    axios.get(`${API}/video-templates?client_id=${clientId}`)
      .then((r) => setTemplates(r.data || []))
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    if (!templateId) { setActiveTemplate(null); return; }
    const t = templates.find((t) => t.id === templateId);
    setActiveTemplate(t || null);
  }, [templateId, templates]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [clip]);

  const togglePlatform = (p) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const handlePublish = async () => {
    if (!clip) return toast.error("Select a clip first");
    if (!platforms.length) return toast.error("Select at least one platform");
    setPublishing(true);
    try {
      const payload = {
        client_id: clientId,
        clip_id: clip.drive_file_id || clip.id,
        template_id: templateId || null,
        clip_trim_start: trimStart,
        clip_trim_end: trimEnd,
        caption,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        platforms,
        scheduled_at: scheduleAt || null,
      };
      const r = await axios.post(`${API}/videos/create`, payload);
      toast.success(r.data.message || `Video queued (${r.data.status || "processing"})`);
      onPublished?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const clipDuration = duration || clip?.duration || 0;

  const handlePlaybackChange = useCallback(({ currentTime: t, duration: d, playing: p }) => {
    setCurrentTime(t);
    if (d) setDuration(d);
    setPlaying(p);
  }, []);

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
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6 items-start">

      {/* ── Left: template sidebar ─────────────────────────────── */}
      <aside className="space-y-2">
        <span className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Templates</span>
        {templates.length === 0 ? (
          <p className="text-xs font-mono text-zinc-600">No templates yet — create one in the Templates tab.</p>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={() => setTemplateId(null)}
              className={`w-full text-left px-3 py-2 text-xs font-mono border transition-colors ${
                templateId === null
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              None
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                aria-label={t.name}
                onClick={() => setTemplateId(t.id)}
                className={`w-full text-left px-3 py-2.5 border transition-colors ${
                  templateId === t.id
                    ? "bg-white text-black border-white"
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className={`text-xs font-mono font-semibold ${templateId === t.id ? "text-black" : "text-zinc-300"}`}>
                  {t.name}
                </div>
                <div
                  className={`text-[10px] font-mono mt-0.5 ${templateId === t.id ? "text-zinc-600" : "text-zinc-600"}`}
                  aria-hidden="true"
                >
                  {t.aspect_ratio || "9:16"}
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ── Middle: preview + transport ───────────────────────── */}
      <main className="space-y-3 min-w-0">
        {/* Clip trigger */}
        <button
          onClick={() => setClipOpen(true)}
          className="w-full border border-zinc-800 px-3 py-2 text-sm text-left font-mono text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
        >
          {clip ? clip.filename || clip.name || clip.id : "Choose clip…"}
        </button>

        {/* Video preview */}
        <VideoCanvasPreview
          clip={clip}
          template={activeTemplate}
          aspectRatio={activeTemplate?.aspect_ratio || "9:16"}
          videoRef={videoRef}
          hideBuiltInControls
          onPlaybackChange={handlePlaybackChange}
        />

        {/* Transport bar */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={!clip}
              className="w-8 h-8 flex items-center justify-center border border-zinc-700 text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors flex-shrink-0"
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
            <span className="font-mono text-xs text-zinc-500 tabular-nums flex-shrink-0 min-w-[64px] text-right">
              {fmt(currentTime)} / {fmt(clipDuration)}
            </span>
          </div>
          {clip && (
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 px-0.5">
              <span>In: {trimStart.toFixed(1)}s</span>
              <span className="text-zinc-700">drag amber handles to trim</span>
              <span>Out: {(trimEnd ?? clipDuration).toFixed(1)}s</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Right: publish settings ────────────────────────────── */}
      <aside className="space-y-5 lg:sticky lg:top-6">
        {/* Caption */}
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Caption</label>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
            placeholder="Write your caption…"
          />
        </div>

        {/* Hashtags */}
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Hashtags</label>
          <input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            placeholder="#marketing #business"
          />
        </div>

        {/* Platforms */}
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
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
            Schedule (optional — leave blank to publish now)
          </label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
          />
        </div>

        <button
          onClick={handlePublish}
          disabled={publishing}
          className="w-full py-2.5 bg-white text-black text-sm font-mono font-bold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          {publishing ? "Publishing…" : scheduleAt ? "Schedule Video" : "Publish Now"}
        </button>
      </aside>

      {clipOpen && (
        <ClipPickerModal
          clientId={clientId}
          onClose={() => setClipOpen(false)}
          onSelect={(c) => {
            setClip({ ...c, url: buildClipPreviewUrl(c, clientId) });
            setTrimEnd(c.duration || null);
            setTrimStart(0);
            setClipOpen(false);
          }}
        />
      )}
    </div>
  );
}
