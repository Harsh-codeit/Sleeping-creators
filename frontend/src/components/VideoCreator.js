import { useState, useEffect, useRef, Fragment } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Wand2, Film, Download, X, Upload, HardDrive,
  Play, Pause, Music2, Check, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const FILTERS = ["greyscale", "boost", "contrast", "darken", "lighten", "muted", "negative", "blur"];

function isVideo(url) {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(url);
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const STEPS = ["Client", "Template", "Style", "Content", "Render"];
  return (
    <div className="flex items-center justify-center py-4 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <Fragment key={n}>
            {i > 0 && <div className={`w-10 h-px mx-1 transition-colors ${done ? "bg-zinc-500" : "bg-zinc-800"}`} />}
            <div className="flex flex-col items-center gap-1 w-14">
              <div className={`w-7 h-7 flex items-center justify-center text-[11px] font-mono font-bold transition-colors ${
                active ? "bg-white text-black" : done ? "bg-zinc-600 text-white" : "border border-zinc-700 text-zinc-600"
              }`}>
                {done ? "✓" : n}
              </div>
              <span className={`text-[9px] font-mono uppercase tracking-widest transition-colors ${active ? "text-white" : "text-zinc-600"}`}>
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Template card with hover video ───────────────────────────────────────────
function TemplateCard({ template, selected, onClick }) {
  const videoRef = useRef(null);
  const hoverVideoUrl = template.preview_url || (isVideo(template.thumbnail_url) ? template.thumbnail_url : null);

  const handleMouseEnter = () => {
    if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}); }
  };
  const handleMouseLeave = () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`cursor-pointer bg-zinc-900 border transition-all duration-200 flex flex-col ${
        selected ? "border-white ring-1 ring-white" : "border-zinc-800 hover:border-zinc-600"
      }`}
    >
      <div className="relative w-full aspect-[9/16] bg-zinc-800 overflow-hidden">
        {hoverVideoUrl && (
          <video ref={videoRef} src={hoverVideoUrl} muted loop playsInline preload="metadata"
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        {!hoverVideoUrl && template.thumbnail_url && (
          <img src={template.thumbnail_url} alt={template.name}
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        {!hoverVideoUrl && !template.thumbnail_url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={24} className="text-zinc-700" />
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
            <Check size={28} className="text-white drop-shadow" />
          </div>
        )}
      </div>
      <div className="px-2 py-2">
        <div className="text-xs font-semibold text-white truncate leading-tight">{template.name}</div>
        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{template.merge_fields?.length ?? 0} fields</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function VideoCreator() {
  const [step, setStep] = useState(1);

  // Step 1
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  // Step 2
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Step 3
  const [filterName, setFilterName] = useState(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  // Step 4
  const [prompt, setPrompt] = useState("");
  const [texts, setTexts] = useState({});
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [generating, setGenerating] = useState(false);
  const [clips, setClips] = useState([]);
  const [selectedClips, setSelectedClips] = useState([]);
  const [showClipPicker, setShowClipPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState("drive");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Step 5
  const [submitting, setSubmitting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [postId, setPostId] = useState(null);
  const [post, setPost] = useState(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [scheduleAt, setScheduleAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/clients`)
      .then(r => setClients(r.data))
      .catch(() => toast.error("Failed to load clients"));
  }, []);

  useEffect(() => {
    if (step === 2) {
      axios.get(`${API}/shotstack-templates?status=active`)
        .then(r => setTemplates(r.data))
        .catch(() => toast.error("Failed to load templates"));
    }
  }, [step]);

  // ── Render polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rendering || !postId) return;
    setPollAttempt(0);
    const DONE = ["succeeded", "pending_approval", "bundle_scheduled", "published"];
    const FAIL = ["failed_render", "failed", "cancelled"];
    const iv = setInterval(async () => {
      setPollAttempt(p => p + 1);
      try {
        const r = await axios.get(`${API}/posts/${postId}`);
        if (DONE.includes(r.data.status) || FAIL.includes(r.data.status)) {
          setPost(r.data);
          setRendering(false);
          clearInterval(iv);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, [rendering, postId]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    try {
      const r = await axios.get(`${API}/clients/${client.id}/drive-clips`);
      setClips(r.data);
    } catch { setClips([]); }
  };

  const handleSelectTemplate = (t) => {
    if (selectedTemplate?.id === t.id) return;
    setSelectedTemplate(t);
    setTexts({});
    setSelectedClips([]);
    setMusicUrl("");
    setSelectedTrack(null);
    setFilterName(null);
    setPrompt("");
    setCaption("");
    setHashtags("");
    setPost(null);
    setPostId(null);
    setRendering(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt first"); return; }
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/videos/generate-content`, {
        template_id: selectedTemplate.id,
        client_id: selectedClient.id,
        prompt: prompt.trim(),
      });
      setTexts(prev => ({ ...prev, ...r.data.merge_values }));
      setCaption(r.data.caption || "");
      setHashtags((r.data.hashtags || []).join(", "));
    } catch { toast.error("Failed to generate content"); }
    finally { setGenerating(false); }
  };

  const handleRender = async () => {
    if (!selectedTemplate || !selectedClient) return;
    setSubmitting(true);
    try {
      const filled = Object.fromEntries(Object.entries(texts).filter(([, v]) => v.trim()));
      const hashtagArr = hashtags.split(",").map(h => h.trim().replace(/^#/, "")).filter(Boolean);
      const body = {
        client_id: selectedClient.id,
        template_id: selectedTemplate.id,
        clip_drive_ids: selectedClips.map(c => c.drive_file_id),
        music_url: musicUrl.trim() || undefined,
        filter_name: filterName || undefined,
        prompt: prompt.trim() || undefined,
        caption: caption.trim() || undefined,
        hashtags: hashtagArr.length ? hashtagArr : undefined,
        generated_merge_values: Object.keys(filled).length ? filled : undefined,
      };
      const r = await axios.post(`${API}/videos/create`, body);
      setPostId(r.data.post_id);
      setPost(null);
      setRendering(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to start render");
    } finally { setSubmitting(false); }
  };

  const handlePostNow = async () => {
    setPosting(true);
    try {
      await axios.post(`${API}/posts/${postId}/schedule`, {});
      toast.success("Scheduled for posting!");
    } catch { toast.error("Failed to schedule"); }
    finally { setPosting(false); }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) return;
    setScheduling(true);
    try {
      await axios.post(`${API}/posts/${postId}/schedule`, { scheduled_at: new Date(scheduleAt).toISOString() });
      toast.success("Scheduled");
    } catch { toast.error("Failed to schedule"); }
    finally { setScheduling(false); }
  };

  const handleUploadClip = async (file) => {
    if (!file) return;
    setUploading(true); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await axios.post(`${API}/clients/${selectedClient.id}/clips/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
      });
      setClips(prev => [r.data, ...prev]);
      const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
      if (selectedClips.length < clipCount) setSelectedClips(prev => [...prev, r.data]);
      toast.success("Clip uploaded");
      setPickerTab("drive");
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const toggleClip = (clip) => {
    const isSelected = selectedClips.some(c => c.id === clip.id);
    const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
    if (isSelected) setSelectedClips(prev => prev.filter(c => c.id !== clip.id));
    else if (selectedClips.length < clipCount) setSelectedClips(prev => [...prev, clip]);
  };

  const openMusicPicker = async () => {
    setShowMusicPicker(true);
    try {
      const r = await axios.get(`${API}/music`);
      setMusicTracks(r.data);
    } catch { toast.error("Failed to load music library"); }
  };

  const handleTogglePlay = (track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) { audio.pause(); setPlayingId(null); }
    else { audio.src = track.r2_url; audio.play().catch(() => {}); setPlayingId(track.id); }
  };

  const handleSelectTrack = (track) => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(null); setSelectedTrack(track); setMusicUrl(track.r2_url); setShowMusicPicker(false);
  };

  const closeMusicPicker = () => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(null); setShowMusicPicker(false);
  };

  const handleStartOver = () => {
    setStep(1);
    setSelectedClient(null); setSelectedTemplate(null);
    setTexts({}); setSelectedClips([]); setMusicUrl(""); setSelectedTrack(null);
    setFilterName(null); setPrompt(""); setCaption(""); setHashtags("");
    setPost(null); setPostId(null); setRendering(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isFailed = post && ["failed_render", "failed", "cancelled"].includes(post.status);
  const isSucceeded = post && !isFailed;
  const aiFields = selectedTemplate?.merge_fields?.filter(f => f.role === "ai_text") || [];
  const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
  const hasAudio = selectedTemplate?.merge_fields?.some(f => f.role === "audio") || false;
  const progress = !rendering ? 0
    : pollAttempt === 0 ? 20
    : 30 + Math.min((pollAttempt / 70) * 60, 60);

  const canNext = { 1: !!selectedClient, 2: !!selectedTemplate, 3: true, 4: true };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      <StepBar step={step} />

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Step 1: Client */}
        {step === 1 && (
          <div className="p-6">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-5">Select a client</div>
            {clients.length === 0 ? (
              <div className="py-16 text-center font-mono text-xs text-zinc-600">No clients found.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {clients.map(c => {
                  const initials = (c.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const isSelected = selectedClient?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className={`p-4 text-left border transition-all duration-200 ${
                        isSelected ? "border-white bg-zinc-900" : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                      }`}
                    >
                      <div className={`w-10 h-10 flex items-center justify-center font-bold text-sm mb-3 ${
                        isSelected ? "bg-white text-black" : "bg-zinc-800 text-zinc-300"
                      }`}>
                        {initials}
                      </div>
                      <div className="text-xs font-semibold text-white truncate">{c.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                        {c.niche || c.industry || "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Template */}
        {step === 2 && (
          <div className="p-6">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-5">Choose a template</div>
            {templates.length === 0 ? (
              <div className="py-16 text-center font-mono text-xs text-zinc-600">
                No active templates. Go to Video Templates and sync from Shotstack.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {templates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={selectedTemplate?.id === t.id}
                    onClick={() => handleSelectTemplate(t)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Style */}
        {step === 3 && (
          <div className="p-6 max-w-xl">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-5">Choose a style</div>

            <div className="mb-8">
              <div className="text-xs font-semibold text-white mb-3">Filter</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterName(prev => prev === f ? null : f)}
                    className={`font-mono text-[11px] px-3 py-1.5 border transition-colors duration-200 ${
                      filterName === f
                        ? "border-white text-white bg-zinc-800"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {filterName
                ? <span className="text-[10px] font-mono text-zinc-500">Active: <span className="text-white">{filterName}</span></span>
                : <span className="text-[10px] font-mono text-zinc-600">No filter selected (optional)</span>
              }
            </div>

            {hasAudio ? (
              <div>
                <div className="text-xs font-semibold text-white mb-3">Background Music</div>
                <button
                  onClick={openMusicPicker}
                  className="w-full border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-3 flex items-center gap-2"
                >
                  <Music2 size={13} />
                  {selectedTrack ? selectedTrack.name : "Choose a music track…"}
                </button>
                {selectedTrack && (
                  <button
                    onClick={() => { setSelectedTrack(null); setMusicUrl(""); }}
                    className="mt-1.5 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    × Clear selection
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[10px] font-mono text-zinc-700">This template has no audio field — music unavailable.</p>
            )}
          </div>
        )}

        {/* Step 4: Content */}
        {step === 4 && (
          <div className="p-6 max-w-2xl flex flex-col gap-7">

            {/* Prompt + Generate */}
            <div>
              <div className="text-xs font-semibold text-white mb-2">AI Prompt</div>
              <textarea
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200 mb-2"
                placeholder="Describe what this video is about — topic, angle, audience…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
              />
              <button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="flex items-center gap-2 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2 disabled:opacity-40"
              >
                {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                {generating ? "Generating…" : "Generate with AI"}
              </button>
            </div>

            {/* AI text fields */}
            {aiFields.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-white mb-3">Video Text Fields</div>
                <div className="flex flex-col gap-3">
                  {aiFields.map(f => (
                    <div key={f.find}>
                      <div className="text-[10px] font-mono text-zinc-500 mb-1 uppercase tracking-widest">{f.find}</div>
                      <textarea
                        rows={2}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                        placeholder={f.ai_hint || f.replace || "Auto-generated"}
                        value={texts[f.find] || ""}
                        onChange={e => setTexts(prev => ({ ...prev, [f.find]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clips */}
            {clipCount > 0 && (
              <div>
                <div className="text-xs font-semibold text-white mb-2">Video Clips</div>
                <button
                  onClick={() => { setPickerTab("drive"); setShowClipPicker(true); }}
                  className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2.5 flex items-center gap-2"
                >
                  <Film size={12} />
                  Choose clips
                  <span className="font-mono text-[10px] text-zinc-500 ml-1">{selectedClips.length}/{clipCount}</span>
                </button>
                {selectedClips.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {selectedClips.map(c => (
                      <div key={c.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-3 py-1.5">
                        <span className="font-mono text-[10px] text-zinc-300 truncate">{c.name || c.drive_file_id}</span>
                        <button onClick={() => toggleClip(c)} className="text-zinc-600 hover:text-white ml-2 transition-colors">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Caption */}
            <div>
              <div className="text-xs font-semibold text-white mb-2">Caption</div>
              <textarea
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                placeholder="Social media caption — auto-filled by AI after Generate"
                value={caption}
                onChange={e => setCaption(e.target.value)}
              />
            </div>

            {/* Hashtags */}
            <div>
              <div className="text-xs font-semibold text-white mb-2">Hashtags</div>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                placeholder="tag1, tag2, tag3 — auto-filled by AI after Generate"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 5: Render & Post */}
        {step === 5 && (
          <div className="p-6 max-w-lg">

            {/* Phase A: pre-render */}
            {!rendering && !post && (
              <div className="flex flex-col gap-6">
                <div className="border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
                  <div className="px-4 py-2.5">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Summary</div>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center text-xs">
                    <span className="font-mono text-zinc-500">Client</span>
                    <span className="text-white font-semibold">{selectedClient?.name}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center text-xs">
                    <span className="font-mono text-zinc-500">Template</span>
                    <span className="text-white font-semibold truncate max-w-[220px]">{selectedTemplate?.name}</span>
                  </div>
                  {filterName && (
                    <div className="px-4 py-3 flex justify-between items-center text-xs">
                      <span className="font-mono text-zinc-500">Filter</span>
                      <span className="text-white font-mono">{filterName}</span>
                    </div>
                  )}
                  {selectedTrack && (
                    <div className="px-4 py-3 flex justify-between items-center text-xs">
                      <span className="font-mono text-zinc-500">Music</span>
                      <span className="text-white truncate max-w-[220px]">{selectedTrack.name}</span>
                    </div>
                  )}
                  {caption && (
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-mono text-zinc-500 mb-1.5">Caption preview</div>
                      <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">{caption}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleRender}
                  disabled={submitting}
                  className="w-full bg-white text-black text-sm font-bold py-3.5 hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
                >
                  {submitting ? "Queuing…" : "Render Video"}
                </button>
              </div>
            )}

            {/* Phase B: rendering */}
            {rendering && (
              <div className="flex flex-col gap-5">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                  {pollAttempt === 0 ? "Queued…"
                    : pollAttempt < 5 ? "Fetching assets…"
                    : pollAttempt < 15 ? "Rendering…"
                    : "Saving…"}
                </div>
                <div className="w-full bg-zinc-800 h-1">
                  <div
                    className="bg-white h-1 transition-all duration-1000 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-zinc-600">{Math.round(progress)}% — typically 20–90 seconds</div>
              </div>
            )}

            {/* Phase C: success */}
            {isSucceeded && (
              <div className="flex flex-col gap-5">
                {post.r2_video_url && (
                  <video src={post.r2_video_url} controls className="w-full bg-zinc-900 border border-zinc-800" />
                )}
                {!post.r2_video_url && post.r2_snapshot_url && (
                  <img src={post.r2_snapshot_url} alt="Snapshot" className="w-full border border-zinc-800" />
                )}

                {/* Post actions */}
                <div className="flex gap-2">
                  <button
                    disabled={!post?.r2_video_url}
                    onClick={() => window.open(post.r2_video_url, "_blank")}
                    className="flex-1 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Download size={13} /> Download
                  </button>
                  <button
                    onClick={handlePostNow}
                    disabled={posting}
                    className="flex-1 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Play size={13} fill="currentColor" />
                    {posting ? "Posting…" : "Post now"}
                  </button>
                </div>

                {/* Schedule */}
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Schedule</div>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors"
                      value={scheduleAt}
                      onChange={e => setScheduleAt(e.target.value)}
                    />
                    <button
                      onClick={handleSchedule}
                      disabled={scheduling || !scheduleAt}
                      className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2 disabled:opacity-40 flex-shrink-0"
                    >
                      {scheduling ? "…" : "Schedule"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleStartOver}
                  className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors duration-200 text-left"
                >
                  ← Start over
                </button>
              </div>
            )}

            {/* Phase D: failed */}
            {isFailed && (
              <div className="flex flex-col gap-4">
                <div className="border border-red-900/40 bg-red-900/10 px-4 py-3 text-xs font-mono text-red-400">
                  Render failed: {post.error_message || post.status}
                </div>
                <button
                  onClick={() => { setPost(null); setPostId(null); setRendering(false); }}
                  className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Step navigation ── */}
      {(step < 5 || (!rendering && !post && step === 5)) && (
        <div className="border-t border-zinc-800 bg-zinc-950 flex-shrink-0 px-6 py-3 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2"
            >
              <ChevronLeft size={13} /> Back
            </button>
          ) : <div />}

          {step < 5 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext[step]}
              className="flex items-center gap-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 4 ? "Review" : "Next"} <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* ── Clip picker modal ── */}
      {showClipPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setShowClipPicker(false)}>
          <div className="bg-zinc-950 border border-zinc-800 w-[580px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
              <span className="text-xs font-semibold text-white">Choose Clips</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500">{selectedClips.length}/{clipCount} selected</span>
                <button onClick={() => setShowClipPicker(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
              </div>
            </div>
            <div className="flex border-b border-zinc-800 flex-shrink-0">
              {[["drive", HardDrive, "From Drive"], ["upload", Upload, "Upload"]].map(([tab, Icon, label]) => (
                <button key={tab} onClick={() => setPickerTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono transition-colors border-b-2 ${pickerTab === tab ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                  <Icon size={11} />{label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {pickerTab === "drive" && (
                clips.length === 0
                  ? <div className="py-10 text-center font-mono text-xs text-zinc-600">No clips found for this client.</div>
                  : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="w-8 px-4 py-2" />
                          <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Name</th>
                          <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-16">Source</th>
                          <th className="text-right px-4 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-12">Dur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clips.map(clip => {
                          const isSel = selectedClips.some(c => c.id === clip.id);
                          const atMax = !isSel && selectedClips.length >= clipCount;
                          return (
                            <tr key={clip.id}
                              onClick={() => !atMax && toggleClip(clip)}
                              className={`border-b border-zinc-800/50 transition-colors ${atMax ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-zinc-900"} ${isSel ? "bg-zinc-900" : ""}`}>
                              <td className="px-4 py-2"><input type="checkbox" checked={isSel} disabled={atMax} readOnly className="accent-white" /></td>
                              <td className="px-2 py-2 font-mono text-zinc-300 max-w-[180px]"><span className="truncate block">{clip.name || clip.drive_file_id}</span></td>
                              <td className="px-2 py-2">
                                <span className={`font-mono text-[9px] px-1 py-0.5 uppercase tracking-widest ${clip.source === "upload" ? "text-blue-400 bg-blue-400/10 border border-blue-400/30" : "text-zinc-400 bg-zinc-800 border border-zinc-700"}`}>
                                  {clip.source || "drive"}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-mono text-zinc-500 text-right text-[10px]">{clip.duration ? `${clip.duration.toFixed(0)}s` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
              )}
              {pickerTab === "upload" && (
                <div className="p-5 flex flex-col items-center gap-4">
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                    onChange={e => handleUploadClip(e.target.files?.[0])} />
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`w-full border border-dashed border-zinc-700 py-10 flex flex-col items-center gap-2 transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : "hover:border-zinc-500 cursor-pointer"}`}>
                    <Upload size={24} className="text-zinc-600" />
                    <span className="text-xs font-mono text-zinc-400">Click to choose a video file</span>
                    <span className="text-[10px] font-mono text-zinc-600">MP4, MOV · max 100 MB · max 60s</span>
                  </div>
                  {uploading && (
                    <div className="w-full">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-mono text-zinc-500">Uploading…</span>
                        <span className="text-[10px] font-mono text-zinc-400">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-0.5">
                        <div className="bg-white h-0.5 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-zinc-800 px-4 py-2.5 flex justify-between items-center flex-shrink-0">
              <button onClick={() => setSelectedClips([])} className="border border-zinc-700 text-zinc-500 text-xs hover:bg-zinc-800 transition-colors px-3 py-1.5">Clear</button>
              <button onClick={() => setShowClipPicker(false)} className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors px-4 py-1.5">
                Done ({selectedClips.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Music picker modal ── */}
      {showMusicPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={closeMusicPicker}>
          <div className="bg-zinc-950 border border-zinc-800 w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
              <span className="text-xs font-semibold text-white">Music Library</span>
              <button onClick={closeMusicPicker} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {musicTracks.length === 0
                ? <div className="py-12 text-center font-mono text-xs text-zinc-600">No tracks in library.<br />Upload music from the Music page.</div>
                : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="w-10 px-3 py-2" />
                        <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Track</th>
                        <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-16">Dur</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {musicTracks.map(track => {
                        const isPlaying = playingId === track.id;
                        const isSelected = selectedTrack?.id === track.id;
                        return (
                          <tr key={track.id} onClick={() => handleSelectTrack(track)}
                            className={`border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900 ${isSelected ? "bg-zinc-900" : ""}`}>
                            <td className="px-3 py-2">
                              <button
                                onClick={e => { e.stopPropagation(); handleTogglePlay(track); }}
                                className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
                                {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                              </button>
                            </td>
                            <td className="px-2 py-2">
                              <div className="font-mono text-zinc-300 text-[11px] truncate max-w-[220px]">{track.name}</div>
                              {track.mood_tags?.length > 0 && (
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {track.mood_tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="font-mono text-[9px] text-zinc-600 bg-zinc-800 px-1 py-0.5">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 font-mono text-zinc-500 text-[10px]">
                              {track.duration ? `${Math.round(track.duration)}s` : "—"}
                            </td>
                            <td className="px-3 py-2">{isSelected && <Check size={12} className="text-white" />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
            </div>
            <div className="border-t border-zinc-800 px-4 py-2.5 flex justify-between items-center flex-shrink-0">
              <button onClick={() => { setSelectedTrack(null); setMusicUrl(""); closeMusicPicker(); }}
                className="border border-zinc-700 text-zinc-500 text-xs hover:bg-zinc-800 transition-colors px-3 py-1.5">Clear</button>
              <button onClick={closeMusicPicker}
                className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors px-4 py-1.5">Done</button>
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
    </div>
  );
}

export default VideoCreator;
