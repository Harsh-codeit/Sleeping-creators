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

function MiniElement({ el }) {
  const p = el.props || {};
  const base = {
    position: "absolute",
    left: `${(el.x_ratio ?? 0.5) * 100}%`,
    top: `${(el.y_ratio ?? 0.5) * 100}%`,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  };

  if (el.type === "cta_button") {
    return (
      <div style={{
        ...base,
        background: p.bg_color || "#fff",
        color: p.text_color || "#000",
        borderRadius: p.border_radius ?? 999,
        padding: "1px 5px",
        fontSize: 5.5,
        fontWeight: "bold",
        whiteSpace: "nowrap",
        maxWidth: "75%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {p.text || "CTA"}{p.arrow ? " →" : ""}
      </div>
    );
  }

  if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
    const hasBg = p.bg_shape && p.bg_shape !== "none";
    return (
      <div style={{
        ...base,
        color: p.color || "#fff",
        fontSize: 5.5,
        fontWeight: "700",
        textAlign: "center",
        whiteSpace: "nowrap",
        maxWidth: "80%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        background: hasBg ? `${p.bg_color || "#000"}99` : "transparent",
        borderRadius: hasBg ? (p.bg_shape === "pill" ? 999 : 1) : 0,
        padding: hasBg ? "1px 3px" : 0,
      }}>
        {p.text || el.type}
      </div>
    );
  }

  if (el.type === "link_in_bio") {
    return (
      <div style={{
        ...base,
        background: p.bg_color || "#000",
        color: p.text_color || "#fff",
        borderRadius: 2,
        padding: "1px 4px",
        fontSize: 5,
        fontWeight: "bold",
        whiteSpace: "nowrap",
      }}>
        {p.text || "link in bio"} ↗
      </div>
    );
  }

  if (el.type === "countdown") {
    return <div style={{ ...base, color: p.color || "#fff", fontSize: 9, fontWeight: "bold" }}>00:10</div>;
  }

  if (el.type === "rectangle") {
    return (
      <div style={{
        ...base,
        width: `${(p.width_ratio || 0.8) * 100}%`,
        height: `${(p.height_ratio || 0.1) * 100}%`,
        background: `${p.fill_color || "#000"}80`,
      }} />
    );
  }

  if (el.type === "circle") {
    const pct = `${(p.width_ratio || 0.1) * 100}%`;
    return <div style={{ ...base, width: pct, height: pct, borderRadius: "50%", background: `${p.fill_color || "#fff"}60` }} />;
  }

  if (el.type === "line") {
    return <div style={{ ...base, width: `${(p.width_ratio || 0.8) * 100}%`, height: 1, background: p.color || "rgba(255,255,255,0.5)" }} />;
  }

  if (["logo", "watermark"].includes(el.type)) {
    return (
      <div style={{
        ...base,
        width: `${(p.width_ratio || 0.15) * 100}%`,
        height: `${(p.height_ratio || 0.08) * 100}%`,
        border: "1px dashed rgba(255,255,255,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 4.5, color: "rgba(255,255,255,0.3)" }}>
          {el.type === "logo" ? "LOGO" : "WM"}
        </span>
      </div>
    );
  }

  return null;
}

function TemplateOverlay({ elements }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[...elements]
        .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
        .map((el, i) => {
          const p = el.props || {};
          const base = {
            position: "absolute",
            left: `${(el.x_ratio ?? 0.5) * 100}%`,
            top: `${(el.y_ratio ?? 0.5) * 100}%`,
            transform: "translate(-50%, -50%)",
          };

          if (el.type === "cta_button") {
            return (
              <div key={el.id ?? i} style={{
                ...base,
                background: p.bg_color || "#fff",
                color: p.text_color || "#000",
                borderRadius: p.border_radius ?? 999,
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}>
                {p.text || "CTA"}{p.arrow ? " →" : ""}
              </div>
            );
          }

          if (["text_overlay", "lower_third", "cta_text"].includes(el.type)) {
            const hasBg = p.bg_shape && p.bg_shape !== "none";
            const width = p.width_ratio ? `${p.width_ratio * 100}%` : "70%";
            return (
              <div key={el.id ?? i} style={{
                ...base,
                color: p.color || "#fff",
                fontSize: p.size_px ? p.size_px * 0.45 : 12,
                fontWeight: "700",
                textAlign: p.align || "center",
                width,
                wordBreak: "break-word",
                background: hasBg ? `${p.bg_color || "#000"}99` : "transparent",
                borderRadius: hasBg ? (p.bg_shape === "pill" ? 999 : 3) : 0,
                padding: hasBg ? "2px 8px" : 0,
                opacity: p.opacity ?? 1,
              }}>
                {p.text || el.type}
              </div>
            );
          }

          if (el.type === "link_in_bio") {
            return (
              <div key={el.id ?? i} style={{
                ...base,
                background: p.bg_color || "#000",
                color: p.text_color || "#fff",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 9,
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}>
                {p.text || "link in bio"} ↗ {p.handle || ""}
              </div>
            );
          }

          if (el.type === "countdown") {
            return (
              <div key={el.id ?? i} style={{ ...base, color: p.color || "#fff", fontSize: p.size_px ? p.size_px * 0.45 : 20, fontWeight: "bold" }}>
                00:10
              </div>
            );
          }

          if (el.type === "rectangle") {
            return (
              <div key={el.id ?? i} style={{
                ...base,
                width: `${(p.width_ratio || 0.8) * 100}%`,
                height: `${(p.height_ratio || 0.1) * 100}%`,
                background: `${p.fill_color || "#000"}80`,
                border: p.border_width ? `${p.border_width * 0.5}px solid ${p.border_color || "#fff"}` : "none",
              }} />
            );
          }

          if (el.type === "line") {
            return (
              <div key={el.id ?? i} style={{
                ...base,
                width: `${(p.width_ratio || 0.8) * 100}%`,
                height: Math.max((p.thickness || 2) * 0.5, 1),
                background: p.color || "#fff",
              }} />
            );
          }

          if (el.type === "circle") {
            const pct = `${(p.width_ratio || 0.1) * 100}%`;
            return (
              <div key={el.id ?? i} style={{
                ...base,
                width: pct,
                height: pct,
                borderRadius: "50%",
                background: `${p.fill_color || "#fff"}60`,
              }} />
            );
          }

          if (["logo", "watermark"].includes(el.type)) {
            return (
              <div key={el.id ?? i} style={{
                ...base,
                width: `${(p.width_ratio || 0.15) * 100}%`,
                height: `${(p.height_ratio || 0.08) * 100}%`,
                border: "1px dashed rgba(255,255,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
                  {el.type === "logo" ? "LOGO" : "WM"}
                </span>
              </div>
            );
          }

          return null;
        })}
    </div>
  );
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
        <div className="w-full h-px bg-zinc-800" />
      </div>
      <div className="absolute h-px bg-zinc-400 pointer-events-none"
        style={{ left: pct(trimStart), width: pct(trimEndVal - trimStart) }} />
      <div className="absolute w-2 h-6 bg-white cursor-ew-resize z-20"
        style={{ left: pct(trimStart), transform: "translateX(-50%)" }}
        onMouseDown={e => startDrag(e, "in")} onClick={e => e.stopPropagation()} />
      <div className="absolute w-2 h-6 bg-white cursor-ew-resize z-20"
        style={{ left: pct(trimEndVal), transform: "translateX(-50%)" }}
        onMouseDown={e => startDrag(e, "out")} onClick={e => e.stopPropagation()} />
      <div className="absolute w-2 h-4 bg-white cursor-grab z-30"
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
        <div className="border-b border-zinc-800">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Template</p>
          </div>

          {templates.length === 0 ? (
            <p className="text-[10px] font-mono text-zinc-600 px-4 pb-4">
              No templates — create one in Templates → Video.
            </p>
          ) : (
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              <button
                onClick={() => setTemplateId(null)}
                className={`w-full text-left px-3 py-2 text-[10px] font-mono border transition-colors ${
                  templateId === null
                    ? "bg-white text-black border-white"
                    : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}
              >
                No template
              </button>

              {templates.map(t => {
                const els = t.elements || [];
                const ar = t.aspect_ratio || "9:16";
                const isSelected = templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`w-full text-left border transition-colors duration-150 overflow-hidden group ${
                      isSelected ? "border-white" : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {/* Mini element map */}
                    <div
                      className="relative overflow-hidden"
                      style={{
                        height: 72,
                        background: "#09090B",
                        backgroundImage:
                          "linear-gradient(rgba(39,39,42,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.6) 1px, transparent 1px)",
                        backgroundSize: "25% 25%",
                      }}
                    >
                      {els.length === 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-zinc-700">empty</span>
                      ) : (
                        <div className="absolute inset-0">
                          {[...els]
                            .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
                            .map((el, i) => <MiniElement key={el.id ?? i} el={el} />)}
                        </div>
                      )}
                      <div className="absolute top-1 right-1 text-[8px] font-mono text-zinc-600 bg-black/60 px-1 py-0.5 border border-zinc-800">
                        {ar}
                      </div>
                    </div>

                    {/* Info row */}
                    <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-900 border-t border-zinc-800">
                      <p className={`text-[10px] font-mono truncate ${isSelected ? "text-white" : "text-zinc-400"}`}>
                        {t.name}
                      </p>
                      <p className="text-[9px] font-mono text-zinc-600 shrink-0 ml-2">
                        {els.length}el
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 py-3">
          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-1 mb-2">Clip</p>
          {activeTemplate && activeTemplate.video_overridable === false ? (
            <p className="text-[10px] font-mono text-zinc-700 px-1">Locked to template</p>
          ) : clip ? (
            <div className="border border-zinc-700 overflow-hidden">
              {clip.thumbnail_url && (
                <img src={clip.thumbnail_url} alt={clip.name} className="w-full aspect-video object-cover" />
              )}
              <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-900">
                <p className="text-[10px] font-mono text-zinc-300 truncate flex-1 min-w-0">
                  {clip.name || clip.filename || clip.id}
                </p>
                <button
                  onClick={() => setClip(null)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors ml-2 shrink-0 text-[10px] font-mono"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setClipOpen(true)}
              className="w-full border border-zinc-800 px-3 py-2.5 text-[10px] font-mono text-left text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
            >
              Choose clip…
            </button>
          )}
        </div>
      </aside>

      {/* ── Center: preview + transport ──────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col p-4 gap-3 overflow-hidden">
        <div
          className="relative bg-black flex-1 min-h-0 overflow-hidden"
          style={{ aspectRatio: (activeTemplate?.aspect_ratio || "9:16").replace(":", " / ") }}
        >
          {/* Blueprint grid shown when no clip */}
          {!clip?.url && (
            <div
              className="absolute inset-0"
              style={{
                background: "#09090B",
                backgroundImage:
                  "linear-gradient(rgba(39,39,42,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,0.5) 1px, transparent 1px)",
                backgroundSize: "10% 10%",
              }}
            />
          )}

          {/* Video player */}
          {clip?.url && (
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
          )}

          {/* Template element overlay — shown when template selected */}
          {activeTemplate?.elements?.length > 0 && (
            <TemplateOverlay elements={activeTemplate.elements} />
          )}

          {/* No template + no clip empty state */}
          {!clip?.url && !activeTemplate && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="20" rx="2.5" />
                <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
              </svg>
              <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">Select a template</span>
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
              <span>drag handles to trim</span>
              <span>Out: {(trimEnd ?? clipDuration).toFixed(1)}s</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Right: content + publish ─────────────────────────────── */}
      <aside className="w-72 shrink-0 border-l border-zinc-800 overflow-y-auto">
        <div className="flex flex-col gap-0 divide-y divide-zinc-800">

          {/* Overrides */}
          {(() => {
            const overridableEls = activeTemplate?.elements?.filter(e => e.overridable && e.override_key) || [];
            if (!overridableEls.length) return null;
            return (
              <div className="p-4 flex flex-col gap-3">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Overrides</p>
                {overridableEls.map(el => (
                  <div key={el.id} className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
                      <span className="text-[8px] font-mono text-zinc-700 border border-zinc-800 px-1 py-0.5">
                        {el.type.replace(/_/g, " ")}
                      </span>
                      {el.override_key.replace(/_/g, " ")}
                    </label>
                    <input
                      value={overrides[el.override_key] ?? ""}
                      onChange={e => setOverrides(prev => ({ ...prev, [el.override_key]: e.target.value }))}
                      placeholder={el.props?.text || el.override_key}
                      className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Caption */}
          <div className="p-4 flex flex-col gap-2">
            <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Caption</label>
            <textarea
              rows={4}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption…"
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Hashtags */}
          <div className="p-4 flex flex-col gap-2">
            <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Hashtags</label>
            <input
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#marketing #brand"
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Platforms */}
          <div className="p-4 flex flex-col gap-2">
            <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Platforms</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                    platforms.includes(p)
                      ? "bg-white text-black border-white"
                      : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="p-4 flex flex-col gap-2">
            <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
              Schedule <span className="normal-case text-zinc-700">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={e => setScheduleAt(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Actions */}
          <div className="p-4 flex flex-col gap-2">
            <button
              onClick={handleRender}
              disabled={rendering || (!clip && !(activeTemplate && activeTemplate.video_overridable === false))}
              data-testid="studio-render-btn"
              className="w-full py-2 border border-zinc-700 text-white text-xs font-mono font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-colors"
            >
              {rendering ? "Rendering…" : "Render & Download"}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              data-testid="studio-publish-btn"
              className="w-full py-2.5 bg-white text-black text-xs font-mono font-bold hover:bg-zinc-200 disabled:opacity-30 transition-colors"
            >
              {publishing ? "Publishing…" : scheduleAt ? "Schedule Video" : "Publish Now"}
            </button>
          </div>

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
