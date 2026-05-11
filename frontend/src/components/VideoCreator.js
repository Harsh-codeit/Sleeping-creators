import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Wand2, Film, Download, X, Upload, HardDrive, Play, Pause, Music2, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const ROLE_BADGE = {
  ai_text:     "text-blue-400  bg-blue-400/10  border border-blue-400/30",
  audio:       "text-purple-400 bg-purple-400/10 border border-purple-400/30",
  clip:        "text-amber-400 bg-amber-400/10 border border-amber-400/30",
  logo:        "text-zinc-400  bg-zinc-800     border border-zinc-700",
  brand_style: "text-zinc-400  bg-zinc-800     border border-zinc-700",
  static_text: "text-zinc-400  bg-zinc-800     border border-zinc-700",
  decorative:  "text-zinc-600  bg-zinc-900     border border-zinc-800",
};

export function VideoCreator({ clientId }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [clips, setClips] = useState([]);
  const [texts, setTexts] = useState({});
  const [musicUrl, setMusicUrl] = useState("");
  const [selectedClips, setSelectedClips] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [postId, setPostId] = useState(null);
  const [post, setPost] = useState(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showClipPicker, setShowClipPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState("drive");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);
  const [filterName, setFilterName] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  const FILTERS = ["greyscale", "boost", "contrast", "darken", "lighten", "muted", "negative", "blur"];

  useEffect(() => {
    axios.get(`${API}/shotstack-templates?status=active`)
      .then(r => setTemplates(r.data))
      .catch(() => toast.error("Failed to load templates"));
  }, []);

  // Poll when rendering
  useEffect(() => {
    if (!rendering || !postId) return;
    const DONE = ["succeeded", "pending_approval", "bundle_scheduled", "published"];
    const FAIL = ["failed_render", "failed", "cancelled"];
    const iv = setInterval(async () => {
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

  const handleSelectTemplate = async (t) => {
    setSelectedTemplate(t);
    setTexts({});
    setSelectedClips([]);
    setMusicUrl("");
    setFilterName(null);
    setPrompt("");
    setCaption("");
    setHashtags("");
    setPost(null);
    setPostId(null);
    setRendering(false);
    try {
      const r = await axios.get(`${API}/clients/${clientId}/drive-clips`);
      setClips(r.data);
    } catch { setClips([]); }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt first"); return; }
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/videos/generate-content`, {
        template_id: selectedTemplate.id,
        client_id: clientId,
        prompt: prompt.trim(),
      });
      setTexts(prev => ({ ...prev, ...r.data.merge_values }));
      setCaption(r.data.caption || "");
      setHashtags((r.data.hashtags || []).join(", "));
    } catch { toast.error("Failed to generate content"); }
    finally { setGenerating(false); }
  };

  const handleRender = async () => {
    if (!selectedTemplate || !clientId) return;
    setSubmitting(true);
    try {
      const filled = Object.fromEntries(Object.entries(texts).filter(([, v]) => v.trim()));
      const hashtagArr = hashtags.split(",").map(h => h.trim().replace(/^#/, "")).filter(Boolean);
      const body = {
        client_id: clientId,
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
      await axios.post(`${API}/posts/${postId}/schedule`, {
        scheduled_at: new Date(scheduleAt).toISOString(),
      });
      toast.success("Scheduled");
    } catch { toast.error("Failed to schedule"); }
    finally { setScheduling(false); }
  };

  const handleUploadClip = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await axios.post(`${API}/clients/${clientId}/clips/upload`, fd, {
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
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
    } else {
      audio.src = track.r2_url;
      audio.play().catch(() => {});
      setPlayingId(track.id);
    }
  };

  const handleSelectTrack = (track) => {
    if (audioRef.current) { audioRef.current.pause(); }
    setPlayingId(null);
    setSelectedTrack(track);
    setMusicUrl(track.r2_url);
    setShowMusicPicker(false);
  };

  const closeMusicPicker = () => {
    if (audioRef.current) { audioRef.current.pause(); }
    setPlayingId(null);
    setShowMusicPicker(false);
  };

  const isFailed = post && ["failed_render", "failed", "cancelled"].includes(post.status);
  const isSucceeded = post && !isFailed;

  const aiFields = selectedTemplate?.merge_fields?.filter(f => f.role === "ai_text") || [];
  const hasAudio = selectedTemplate?.merge_fields?.some(f => f.role === "audio") || false;
  const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
  const autoFields = selectedTemplate?.merge_fields?.filter(
    f => !["ai_text", "audio", "clip"].includes(f.role)
  ) || [];

  return (
    <div className="flex h-full bg-zinc-950 overflow-hidden">

      {/* ── LEFT SIDEBAR: Template list ─────────────────────── */}
      <div className="w-52 flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-zinc-800 flex-shrink-0">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Templates</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {templates.length === 0 ? (
            <div className="px-3 py-8 text-center font-mono text-[11px] text-zinc-600">
              No active templates.<br />Sync from Video Templates.
            </div>
          ) : templates.map(t => {
            const isSelected = selectedTemplate?.id === t.id;
            return (
              <button
                key={t.id}
                data-testid={`template-card-${t.id}`}
                onClick={() => handleSelectTemplate(t)}
                className={`w-full text-left px-3 py-2 transition-colors duration-200 border-l-2 ${
                  isSelected
                    ? "border-white bg-zinc-900 text-white"
                    : "border-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                {t.thumbnail_url ? (
                  <img src={t.thumbnail_url} alt={t.name} className="w-full h-20 object-cover mb-1.5" />
                ) : (
                  <div className="w-full h-20 bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-1.5">
                    <Film size={18} className="text-zinc-600" />
                  </div>
                )}
                <div className="text-[11px] font-semibold leading-tight truncate">{t.name}</div>
                <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                  {t.aspect_ratio} · {t.duration_seconds}s
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CENTER: Preview area ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-zinc-800">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Preview</span>
          {selectedTemplate && (
            <span className="text-[10px] font-mono text-zinc-600">{selectedTemplate.name}</span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center overflow-hidden p-6">
          {rendering && (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={28} className="text-zinc-500 animate-spin" />
              <span className="font-mono text-zinc-400 text-xs">Rendering…</span>
              <span className="text-[10px] font-mono text-zinc-600">This takes 20–60 seconds.</span>
            </div>
          )}

          {!rendering && isSucceeded && (
            <div className="w-full max-w-sm">
              {post.r2_video_url ? (
                <video
                  src={post.r2_video_url}
                  controls
                  className="w-full bg-zinc-900 border border-zinc-800"
                />
              ) : post.r2_snapshot_url ? (
                <img src={post.r2_snapshot_url} alt="Snapshot"
                  className="w-full object-contain border border-zinc-800" />
              ) : null}
              <div className={`font-mono text-[10px] uppercase tracking-widest mt-2 ${
                ["succeeded", "published"].includes(post.status) ? "text-emerald-400" :
                ["pending_approval", "bundle_scheduled"].includes(post.status) ? "text-amber-400" :
                "text-zinc-400"
              }`}>{post.status}</div>
            </div>
          )}

          {!rendering && isFailed && (
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-xs text-red-400">Render failed: {post.status}</span>
              <button
                onClick={() => { setPost(null); setPostId(null); }}
                className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
              >
                Try again
              </button>
            </div>
          )}

          {!rendering && !post && !selectedTemplate && (
            <div className="flex flex-col items-center gap-2 text-center">
              <Play size={32} className="text-zinc-700" />
              <span className="font-mono text-xs text-zinc-600">Select a template to begin</span>
            </div>
          )}

          {!rendering && !post && selectedTemplate && (
            <div className="flex flex-col items-center gap-2 text-center">
              {selectedTemplate.thumbnail_url ? (
                <img src={selectedTemplate.thumbnail_url} alt={selectedTemplate.name}
                  className="w-48 object-cover border border-zinc-800 opacity-40" />
              ) : (
                <Film size={32} className="text-zinc-700" />
              )}
              <span className="font-mono text-xs text-zinc-600">Configure and click Render</span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: Config + Actions ─────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Configure</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!selectedTemplate ? (
            <div className="px-4 py-8 font-mono text-[11px] text-zinc-600 text-center">
              Select a template from the left.
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-4">

              {/* Prompt + Generate */}
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Prompt</div>
                <textarea
                  data-testid="prompt-input"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200 mb-2"
                  placeholder="Describe the video — topic, angle, goal…"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />
                <button
                  data-testid="generate-content-btn"
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim() || !clientId}
                  className="w-full flex items-center justify-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5 disabled:opacity-40"
                >
                  <Wand2 size={11} />
                  {generating ? "Generating…" : "Generate content"}
                </button>
              </div>

              {/* AI text fields */}
              {aiFields.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Content</div>
                  {aiFields.map(f => (
                    <div key={f.find} className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-mono text-zinc-500">{f.find}</span>
                        <span className={`font-mono text-[9px] px-1 py-0.5 uppercase tracking-widest ${ROLE_BADGE.ai_text}`}>ai</span>
                      </div>
                      <textarea
                        data-testid={`field-${f.find}`}
                        rows={2}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                        placeholder={f.ai_hint || f.replace || "leave blank to auto-generate"}
                        value={texts[f.find] || ""}
                        onChange={e => setTexts(prev => ({ ...prev, [f.find]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Clip field */}
              {clipCount > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Clips</div>
                  <button
                    data-testid="choose-clips-btn"
                    onClick={() => { setPickerTab("drive"); setShowClipPicker(true); }}
                    className="w-full border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><Film size={11} /> Choose clips</span>
                    <span className="font-mono text-[10px] text-zinc-500">{selectedClips.length}/{clipCount}</span>
                  </button>
                  {selectedClips.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-1">
                      {selectedClips.map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-2 py-1">
                          <span className="font-mono text-[10px] text-zinc-300 truncate max-w-[200px]">
                            {c.name || c.drive_file_id}
                          </span>
                          <button onClick={() => toggleClip(c)} className="text-zinc-600 hover:text-white transition-colors duration-200 ml-2">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Audio field */}
              {hasAudio && (
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Music</div>
                  <button
                    data-testid="choose-music-btn"
                    onClick={openMusicPicker}
                    className="w-full border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><Music2 size={11} /> Choose music</span>
                    {selectedTrack && <span className="font-mono text-[10px] text-zinc-500">1 selected</span>}
                  </button>
                  {selectedTrack && (
                    <div className="mt-1.5 flex items-center justify-between bg-zinc-900 border border-zinc-800 px-2 py-1">
                      <span className="font-mono text-[10px] text-zinc-300 truncate max-w-[200px]">{selectedTrack.name}</span>
                      <button
                        onClick={() => { setSelectedTrack(null); setMusicUrl(""); }}
                        className="text-zinc-600 hover:text-white transition-colors duration-200 ml-2"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Filter picker */}
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Filter</div>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterName(prev => prev === f ? null : f)}
                      className={`font-mono text-[10px] px-2 py-0.5 border transition-colors duration-200 ${
                        filterName === f
                          ? "border-white text-white bg-zinc-800"
                          : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Caption</div>
                <textarea
                  data-testid="caption-input"
                  rows={4}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                  placeholder="Social media caption (auto-filled after Generate)"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                />
              </div>

              {/* Hashtags */}
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Hashtags</div>
                <input
                  data-testid="hashtags-input"
                  type="text"
                  className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                  placeholder="tag1, tag2, tag3 (auto-filled after Generate)"
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                />
              </div>

              {/* Auto fields */}
              {autoFields.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">Auto</div>
                  {autoFields.map(f => (
                    <div key={f.find} className="flex items-center justify-between py-1 border-b border-zinc-800/40">
                      <span className="font-mono text-[10px] text-zinc-600">{f.find}</span>
                      <span className={`font-mono text-[9px] px-1 py-0.5 uppercase tracking-widest ${ROLE_BADGE[f.role] || ROLE_BADGE.decorative}`}>{f.role}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        {/* ── Bottom action bar ── */}
        <div className="border-t border-zinc-800 flex-shrink-0">
          {/* Post-render actions */}
          {isSucceeded && (
            <div className="p-3 flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Actions</div>

              <button
                data-testid="download-btn"
                disabled={!post?.r2_video_url}
                onClick={() => window.open(post.r2_video_url, "_blank")}
                className="w-full border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Download size={11} /> Download
              </button>

              <button
                data-testid="post-now-btn"
                onClick={handlePostNow}
                disabled={posting}
                className="w-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-2 disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post now"}
              </button>

              <div className="flex gap-1.5">
                <input
                  type="datetime-local"
                  data-testid="schedule-input"
                  className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-white text-[11px] px-2 py-1.5 font-mono focus:outline-none focus:border-zinc-500"
                  value={scheduleAt}
                  onChange={e => setScheduleAt(e.target.value)}
                />
                <button
                  data-testid="schedule-btn"
                  onClick={handleSchedule}
                  disabled={scheduling || !scheduleAt}
                  className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-2.5 py-1.5 flex-shrink-0 disabled:opacity-40"
                >
                  {scheduling ? "…" : "Schedule"}
                </button>
              </div>

              <button
                data-testid="start-over-btn"
                onClick={() => { setPost(null); setPostId(null); setTexts({}); setSelectedClips([]); setMusicUrl(""); setCaption(""); setHashtags(""); setPrompt(""); }}
                className="w-full text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors duration-200 py-1"
              >
                Render again
              </button>
            </div>
          )}

          {/* Render button */}
          {!isSucceeded && (
            <div className="p-3">
              <button
                data-testid="render-btn"
                onClick={handleRender}
                disabled={!selectedTemplate || !clientId || submitting || rendering}
                className="w-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Queuing…" : rendering ? "Rendering…" : "Render"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Clip picker modal ── */}
      {showClipPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setShowClipPicker(false)}>
          <div className="bg-zinc-950 border border-zinc-800 w-[580px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
              <span className="text-xs font-semibold text-white">Choose Clip</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500">{selectedClips.length}/{clipCount} selected</span>
                <button onClick={() => setShowClipPicker(false)} className="text-zinc-500 hover:text-white transition-colors duration-200"><X size={14} /></button>
              </div>
            </div>

            <div className="flex border-b border-zinc-800 flex-shrink-0">
              {[["drive", HardDrive, "From Drive"], ["upload", Upload, "Upload"]].map(([tab, Icon, label]) => (
                <button key={tab} onClick={() => setPickerTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono transition-colors duration-200 border-b-2 ${pickerTab === tab ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                  <Icon size={11} />{label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {pickerTab === "drive" && (
                clips.length === 0 ? (
                  <div className="py-10 text-center font-mono text-xs text-zinc-600">No clips found for this client.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-8"></th>
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
                          <tr key={clip.id} data-testid={`clip-row-${clip.id}`}
                            onClick={() => !atMax && toggleClip(clip)}
                            className={`border-b border-zinc-800/50 transition-colors duration-200 ${atMax ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-zinc-900"} ${isSel ? "bg-zinc-900" : ""}`}>
                            <td className="px-4 py-2">
                              <input type="checkbox" data-testid={`clip-checkbox-${clip.id}`} checked={isSel} disabled={atMax} readOnly className="accent-white" />
                            </td>
                            <td className="px-2 py-2 font-mono text-zinc-300 max-w-[180px]">
                              <span className="truncate block">{clip.name || clip.drive_file_id}</span>
                            </td>
                            <td className="px-2 py-2">
                              <span className={`font-mono text-[9px] px-1 py-0.5 uppercase tracking-widest ${clip.source === "upload" ? "text-blue-400 bg-blue-400/10 border border-blue-400/30" : "text-zinc-400 bg-zinc-800 border border-zinc-700"}`}>
                                {clip.source || "drive"}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono text-zinc-500 text-right text-[10px]">
                              {clip.duration ? `${clip.duration.toFixed(0)}s` : "—"}
                            </td>
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
                    className={`w-full border border-dashed border-zinc-700 py-10 flex flex-col items-center gap-2 transition-colors duration-200 ${uploading ? "opacity-50 cursor-not-allowed" : "hover:border-zinc-500 cursor-pointer"}`}>
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
              <button onClick={() => setSelectedClips([])} className="border border-zinc-700 text-zinc-500 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5">Clear</button>
              <button onClick={() => setShowClipPicker(false)} className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-4 py-1.5">
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
              <button onClick={closeMusicPicker} className="text-zinc-500 hover:text-white transition-colors duration-200"><X size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {musicTracks.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-zinc-600">
                  No tracks in library.<br />Upload music from the Music page.
                </div>
              ) : (
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
                        <tr
                          key={track.id}
                          data-testid={`music-row-${track.id}`}
                          onClick={() => handleSelectTrack(track)}
                          className={`border-b border-zinc-800/50 cursor-pointer transition-colors duration-200 hover:bg-zinc-900 ${isSelected ? "bg-zinc-900" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <button
                              data-testid={`music-play-${track.id}`}
                              onClick={e => { e.stopPropagation(); handleTogglePlay(track); }}
                              className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors duration-200"
                            >
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
                          <td className="px-3 py-2">
                            {isSelected && <Check size={12} className="text-white" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-zinc-800 px-4 py-2.5 flex justify-between items-center flex-shrink-0">
              <button
                onClick={() => { setSelectedTrack(null); setMusicUrl(""); closeMusicPicker(); }}
                className="border border-zinc-700 text-zinc-500 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
              >
                Clear
              </button>
              <button
                onClick={closeMusicPicker}
                className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-4 py-1.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element for preview playback */}
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

    </div>
  );
}

export default VideoCreator;
