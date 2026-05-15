import { useState, useEffect, useRef, Fragment } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Wand2, Film, Download, X, Upload, HardDrive,
  Play, Pause, Music2, Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Loader2,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const FILTERS = ["greyscale", "boost", "contrast", "darken", "lighten", "muted", "negative", "blur"];
const FILTER_CSS = {
  greyscale: "grayscale(1)",
  boost: "saturate(1.5) contrast(1.1)",
  contrast: "contrast(1.4)",
  darken: "brightness(0.7)",
  lighten: "brightness(1.3)",
  muted: "saturate(0.4)",
  negative: "invert(1)",
  blur: "blur(2px)",
};

function isVideo(url) {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(url);
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, onStepClick, canGoTo }) {
  const STEPS = ["Client", "Template", "Style", "Content", "Render"];
  return (
    <div className="flex items-center justify-center py-4 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        const clickable = canGoTo(n) && n !== step;
        return (
          <Fragment key={n}>
            {i > 0 && <div className={`w-10 h-px mx-1 transition-colors ${done ? "bg-zinc-500" : "bg-zinc-800"}`} />}
            <button
              type="button"
              onClick={clickable ? () => onStepClick(n) : undefined}
              disabled={!clickable}
              className={`flex flex-col items-center gap-1 w-14 bg-transparent border-0 p-0 transition-opacity ${
                clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
              }`}
            >
              <div className={`w-7 h-7 flex items-center justify-center text-[11px] font-mono font-bold transition-colors ${
                active ? "bg-white text-black" : done ? "bg-zinc-600 text-white" : "border border-zinc-700 text-zinc-600"
              }`}>
                {done ? "✓" : n}
              </div>
              <span className={`text-[9px] font-mono uppercase tracking-widest transition-colors ${active ? "text-white" : "text-zinc-600"}`}>
                {label}
              </span>
            </button>
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

// ── Caption mock card (IG-style social feed preview) ─────────────────────────
function CaptionMockCard({ client, caption, hashtags }) {
  if (!caption && !hashtags) return null;
  const allTags = (hashtags || "").split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
  const tags = allTags.slice(0, 5);
  const initials = (client?.avatar || (client?.name || "?").slice(0, 2)).toUpperCase();

  return (
    <div className="bg-zinc-900 border border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        {client?.profile_photo_url ? (
          <img src={client.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
        )}
        <span className="text-xs font-semibold text-white truncate">{client?.name || "your_client"}</span>
      </div>
      <div className="px-3 py-2 text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed line-clamp-5">
        {caption || <span className="text-zinc-600 italic">Caption will appear here…</span>}
      </div>
      {tags.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-x-1.5 gap-y-1">
          {tags.map(t => <span key={t} className="text-[10px] text-sky-400">#{t}</span>)}
          {allTags.length > 5 && <span className="text-[10px] text-zinc-600">+{allTags.length - 5} more</span>}
        </div>
      )}
    </div>
  );
}

// ── Preview pane — persistent video preview across steps 3-5 ─────────────────
function PreviewPane({ step, selectedClient, selectedTemplate, filterName, caption, hashtags, rendering, pollAttempt, post, isSucceeded, isFailed }) {
  const cssFilter = filterName ? FILTER_CSS[filterName] : "none";

  // Step 5 — succeeded: real rendered MP4
  if (step === 5 && isSucceeded && post?.r2_video_url) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <video src={post.r2_video_url} controls className="w-full bg-zinc-900 border border-zinc-800" />
        <CaptionMockCard client={selectedClient} caption={caption} hashtags={hashtags} />
      </div>
    );
  }

  // Step 5 — rendering: shimmer skeleton with stage label
  if (step === 5 && rendering) {
    const stage = pollAttempt === 0 ? "Queued"
      : pollAttempt < 5 ? "Fetching assets"
      : pollAttempt < 15 ? "Rendering"
      : "Saving";
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="w-full aspect-[9/16] bg-zinc-900 border border-zinc-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 animate-pulse" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 size={24} className="text-zinc-500 animate-spin" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{stage}…</span>
          </div>
        </div>
        <CaptionMockCard client={selectedClient} caption={caption} hashtags={hashtags} />
      </div>
    );
  }

  // Step 5 — failed
  if (step === 5 && isFailed) {
    return (
      <div className="p-6">
        <div className="w-full aspect-[9/16] bg-zinc-900 border border-red-900/40 flex items-center justify-center p-6">
          <div className="text-center text-xs font-mono text-red-400">
            Render failed
            <div className="text-[10px] text-zinc-500 mt-2 normal-case">{post?.error_message || post?.status}</div>
          </div>
        </div>
      </div>
    );
  }

  // No template yet
  if (!selectedTemplate) {
    return (
      <div className="p-6">
        <div className="w-full aspect-[9/16] bg-zinc-900 border border-zinc-800 border-dashed flex flex-col items-center justify-center gap-3 text-zinc-600">
          <Film size={32} />
          <span className="text-[10px] font-mono uppercase tracking-widest">Pick a template →</span>
        </div>
      </div>
    );
  }

  // Default: template preview with live filter
  const videoUrl = selectedTemplate.preview_url || (isVideo(selectedTemplate.thumbnail_url) ? selectedTemplate.thumbnail_url : null);
  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="w-full aspect-[9/16] bg-zinc-900 border border-zinc-800 overflow-hidden">
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay muted loop playsInline
            className="w-full h-full object-cover"
            style={{ filter: cssFilter }}
          />
        ) : selectedTemplate.thumbnail_url ? (
          <img
            src={selectedTemplate.thumbnail_url}
            alt={selectedTemplate.name}
            className="w-full h-full object-cover"
            style={{ filter: cssFilter }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={32} className="text-zinc-700" />
          </div>
        )}
      </div>
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">
        {selectedTemplate.name}
        {filterName && <span className="text-zinc-300"> · {filterName}</span>}
      </div>
      {step >= 4 && <CaptionMockCard client={selectedClient} caption={caption} hashtags={hashtags} />}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function VideoCreator() {
  const [step, setStep] = useState(1);

  // Step 1
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearch, setClientSearch] = useState("");
  const [globalVideoPrompt, setGlobalVideoPrompt] = useState("");

  // Step 2
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [recentTemplateIds, setRecentTemplateIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("video_creator_recent_templates_v1") || "[]"); }
    catch { return []; }
  });

  // Step 3
  const [filterName, setFilterName] = useState(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioRef = useRef(null);
  const audioFileRef = useRef(null);

  // Step 4
  const [step4Tab, setStep4Tab] = useState("generate");
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

  // Draft autosave
  const [draft, setDraft] = useState(null);             // saved draft found in localStorage (banner offer)
  const [draftLoaded, setDraftLoaded] = useState(false); // prevents autosave from clobbering during restore

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/clients`)
      .then(r => setClients(r.data))
      .catch(() => toast.error("Failed to load clients"));
    axios.get(`${API}/settings`)
      .then(r => setGlobalVideoPrompt(r.data.global_video_prompt || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClient) return;
    const clientPrompt = selectedClient.strategy?.video_prompt || "";
    setPrompt(clientPrompt || globalVideoPrompt);
  }, [selectedClient, globalVideoPrompt]); // re-fire when global prompt loads (settings/clients race)

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
          if (DONE.includes(r.data.status)) {
            try { localStorage.removeItem("video_creator_draft_v1"); } catch {}
            if (selectedTemplate?.id) {
              setRecentTemplateIds(prev => {
                const next = [selectedTemplate.id, ...prev.filter(id => id !== selectedTemplate.id)].slice(0, 5);
                try { localStorage.setItem("video_creator_recent_templates_v1", JSON.stringify(next)); } catch {}
                return next;
              });
            }
          }
        }
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendering, postId]);

  // ── Draft autosave ─────────────────────────────────────────────────────────
  const DRAFT_KEY = "video_creator_draft_v1";

  // Load draft on mount — only offer if there's meaningful state to restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      // Don't offer to restore if it's just a step-1 stub
      if (d?.selectedClientId && (d.selectedTemplateId || d.caption || d.prompt || Object.keys(d.texts || {}).length)) {
        setDraft(d);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch { /* ignore parse errors */ }
  }, []);

  // Autosave on state change (debounced 400ms). Skip while rendering/posted.
  useEffect(() => {
    if (!selectedClient && !selectedTemplate) return;  // nothing to save
    if (post || rendering) return;                     // don't save during/after render
    const t = setTimeout(() => {
      const payload = {
        savedAt: new Date().toISOString(),
        step,
        selectedClientId: selectedClient?.id,
        selectedTemplateId: selectedTemplate?.id,
        filterName, musicUrl,
        selectedTrack,
        prompt, texts, caption, hashtags,
        selectedClips,
      };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [step, selectedClient, selectedTemplate, filterName, musicUrl, selectedTrack,
      prompt, texts, caption, hashtags, selectedClips, post, rendering]);

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setDraft(null);
  };

  const handleResumeDraft = async () => {
    if (!draft) return;
    try {
      const client = clients.find(c => c.id === draft.selectedClientId);
      if (!client) { toast.error("Client from draft no longer exists"); clearDraft(); return; }

      // Restore client (also fetches drive clips)
      await handleSelectClient(client);

      // Fetch templates + find saved one
      let template = null;
      if (draft.selectedTemplateId) {
        try {
          const r = await axios.get(`${API}/shotstack-templates?status=active`);
          setTemplates(r.data);
          template = r.data.find(t => t.id === draft.selectedTemplateId) || null;
          if (!template) toast.error("Template from draft no longer active");
        } catch { toast.error("Failed to load template from draft"); }
      }

      setSelectedTemplate(template);
      setFilterName(draft.filterName || null);
      setMusicUrl(draft.musicUrl || "");
      setSelectedTrack(draft.selectedTrack || null);
      setPrompt(draft.prompt || "");
      setTexts(draft.texts || {});
      setCaption(draft.caption || "");
      setHashtags(draft.hashtags || "");
      setSelectedClips(draft.selectedClips || []);
      setStep(Math.min(draft.step || 1, template ? 5 : 2));
      setDraft(null);  // hide banner
      toast.success("Draft restored");
    } catch {
      toast.error("Failed to restore draft");
    }
  };

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
    // Reset prompt to the client/global default, not blank — otherwise the
    // user hits step 4 with an empty AI Prompt even though a global prompt
    // is configured. The useEffect on selectedClient won't re-fire here.
    const clientPrompt = selectedClient?.strategy?.video_prompt || "";
    setPrompt(clientPrompt || globalVideoPrompt || "");
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
    const requiredClips = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
    if (requiredClips > 0 && selectedClips.length < requiredClips) {
      toast.error(`This template needs ${requiredClips} clip${requiredClips === 1 ? "" : "s"}; you've added ${selectedClips.length}. Go to Content → Clips.`);
      return;
    }
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

  const clipKey = (c) => c.drive_file_id || c.id || c.name;

  const toggleClip = (clip) => {
    const key = clipKey(clip);
    const isSelected = selectedClips.some(c => clipKey(c) === key);
    const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
    if (isSelected) setSelectedClips(prev => prev.filter(c => clipKey(c) !== key));
    else if (selectedClips.length < clipCount) setSelectedClips(prev => [...prev, clip]);
  };

  const reorderClip = (index, direction) => {
    setSelectedClips(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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

  const handleUploadAudio = async (file) => {
    if (!file) return;
    setUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await axios.post(`${API}/shotstack-templates/upload-audio`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const track = { id: `upload-${Date.now()}`, name: file.name, r2_url: r.data.audio_url };
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      setSelectedTrack(track);
      setMusicUrl(track.r2_url);
      setShowMusicPicker(false);
      toast.success("Audio uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingAudio(false);
      if (audioFileRef.current) audioFileRef.current.value = "";
    }
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
    clearDraft();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isFailed = post && ["failed_render", "failed", "cancelled"].includes(post.status);
  const isSucceeded = post && !isFailed;
  const aiFields = selectedTemplate?.merge_fields?.filter(f => f.role === "ai_text") || [];
  const clipCount = selectedTemplate?.merge_fields?.filter(f => f.role === "clip").length || 0;
  // A template can be overridden if it has audio anywhere: soundtrack (audio_url),
  // an audio merge field, OR none at all (we'll introduce a soundtrack on render).
  const hasAudioMergeField = selectedTemplate?.merge_fields?.some(f => f.role === "audio") || false;
  const hasTemplateAudio = !!selectedTemplate?.audio_url || hasAudioMergeField;

  const canNext = { 1: !!selectedClient, 2: !!selectedTemplate, 3: true, 4: true };
  const canGoTo = (n) => {
    if (n === 1) return true;
    if (n === 2) return !!selectedClient;
    return !!selectedClient && !!selectedTemplate;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      <StepBar step={step} canGoTo={canGoTo} onStepClick={setStep} />

      {/* ── Main content (split: preview left, controls right for steps 3-5) ── */}
      <div className="flex-1 flex overflow-hidden">
        {step >= 3 && (
          <div className="w-[400px] xl:w-[440px] flex-shrink-0 border-r border-zinc-800 overflow-y-auto bg-zinc-950">
            <PreviewPane
              step={step}
              selectedClient={selectedClient}
              selectedTemplate={selectedTemplate}
              filterName={filterName}
              caption={caption}
              hashtags={hashtags}
              rendering={rendering}
              pollAttempt={pollAttempt}
              post={post}
              isSucceeded={isSucceeded}
              isFailed={isFailed}
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">

        {/* Step 1: Client */}
        {step === 1 && (
          <div className="p-6">
            {/* Draft restore banner */}
            {draft && !selectedClient && (
              <div className="mb-5 border border-amber-400/30 bg-amber-400/5 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-200">Unsaved draft from earlier</div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    Saved {new Date(draft.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={clearDraft}
                    className="border border-zinc-700 text-zinc-400 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleResumeDraft}
                    className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-1.5"
                  >
                    Resume
                  </button>
                </div>
              </div>
            )}

            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full max-w-sm bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200 mb-5"
            />
            {clients.length === 0 ? (
              <div className="py-16 text-center font-mono text-xs text-zinc-600">No clients found.</div>
            ) : (() => {
              const q = clientSearch.trim().toLowerCase();
              const filtered = q ? clients.filter(c => (c.name || "").toLowerCase().includes(q) || (c.niche || c.industry || "").toLowerCase().includes(q)) : clients;
              return filtered.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-zinc-600">No clients match "{clientSearch}"</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map(c => {
                    const initials = (c.avatar || (c.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)).toUpperCase();
                    const isSelected = selectedClient?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectClient(c)}
                        className={`p-3 text-left border transition-all duration-200 flex items-center gap-3 ${
                          isSelected ? "border-white bg-zinc-900" : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                        }`}
                      >
                        {c.profile_photo_url ? (
                          <img
                            src={c.profile_photo_url}
                            alt={c.name}
                            className={`w-11 h-11 flex-shrink-0 object-cover ${isSelected ? "ring-2 ring-white" : ""}`}
                          />
                        ) : (
                          <div className={`w-11 h-11 flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                            isSelected ? "bg-white text-black" : "bg-zinc-800 text-zinc-300"
                          }`}>
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate leading-tight">{c.name}</div>
                          <div className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                            {c.niche || c.industry || "—"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 2: Template */}
        {step === 2 && (
          <div className="p-6">
            {templates.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-4">
                <Film size={40} className="text-zinc-700" />
                <p className="font-mono text-xs text-zinc-500">No active templates yet.</p>
                <Link
                  to="/video-templates"
                  className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-4 py-2"
                >
                  Open Video Templates →
                </Link>
              </div>
            ) : (() => {
              const q = templateSearch.trim().toLowerCase();
              const filtered = q ? templates.filter(t => (t.name || "").toLowerCase().includes(q)) : templates;
              const recents = recentTemplateIds
                .map(id => templates.find(t => t.id === id))
                .filter(Boolean);
              const showRecents = !q && recents.length > 0;

              return (
                <>
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                    placeholder="Search templates…"
                    className="w-full max-w-sm bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200 mb-5"
                  />

                  {showRecents && (
                    <div className="mb-6">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Recent</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-4">
                        {recents.map(t => (
                          <TemplateCard
                            key={t.id}
                            template={t}
                            selected={selectedTemplate?.id === t.id}
                            onClick={() => handleSelectTemplate(t)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
                    {showRecents ? "All templates" : "Templates"}
                    <span className="ml-2 text-zinc-600">({filtered.length})</span>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="py-8 text-center font-mono text-xs text-zinc-600">No templates match "{templateSearch}"</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {filtered.map(t => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          selected={selectedTemplate?.id === t.id}
                          onClick={() => handleSelectTemplate(t)}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Step 3: Style */}
        {step === 3 && (
          <div className="p-6 max-w-xl">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-5">Choose a style</div>

            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-xs font-semibold text-white">Filter</div>
                <span className="text-[10px] font-mono text-zinc-600">Optional</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterName(null)}
                  className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 border transition-colors duration-200 ${
                    !filterName
                      ? "border-white text-white bg-zinc-900"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  none
                </button>
                {FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterName(prev => prev === f ? null : f)}
                    className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 border transition-colors duration-200 ${
                      filterName === f
                        ? "border-white text-white bg-zinc-900"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {filterName && (
                <p className="text-[10px] font-mono text-zinc-500 mt-2">
                  Live preview applied to the video on the left.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-xs font-semibold text-white">Background Music</div>
                <span className="text-[10px] font-mono text-zinc-600">
                  {hasTemplateAudio ? "Override template default" : "Optional — adds music"}
                </span>
              </div>
              <button
                onClick={openMusicPicker}
                className="w-full border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-3 flex items-center gap-2"
              >
                <Music2 size={13} />
                {selectedTrack ? selectedTrack.name : (hasTemplateAudio ? "Use template default · Pick to override…" : "Pick a music track…")}
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
          </div>
        )}

        {/* Step 4: Content (tabbed) */}
        {step === 4 && (() => {
          const captionLen = caption.length;
          const hashtagList = hashtags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
          const TABS = [
            { id: "generate", label: "Generate", count: aiFields.length },
            { id: "clips", label: "Clips", count: clipCount > 0 ? `${selectedClips.length}/${clipCount}` : null },
            { id: "copy", label: "Copy", count: null },
          ];
          return (
            <div className="flex flex-col h-full">
              {/* Tab strip */}
              <div className="flex border-b border-zinc-800 px-6 flex-shrink-0">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setStep4Tab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-px ${
                      step4Tab === t.id ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t.label}
                    {t.count !== null && t.count !== 0 && (
                      <span className={`text-[10px] ${step4Tab === t.id ? "text-zinc-400" : "text-zinc-600"}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab body */}
              <div className="p-6 max-w-2xl flex-1 overflow-y-auto">

                {/* Generate tab */}
                {step4Tab === "generate" && (
                  <div className="flex flex-col gap-6">
                    {/* Saved hooks — chip strip; clicking a chip fills the AI Prompt textarea */}
                    {(selectedClient?.strategy?.video_hooks?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                          Saved hooks
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedClient.strategy.video_hooks.map(h => {
                            const isActive = prompt.trim() === (h.prompt || "").trim();
                            return (
                              <button
                                key={h.id}
                                onClick={() => setPrompt(h.prompt)}
                                title={h.prompt}
                                className={`font-mono text-[11px] px-2.5 py-1 border transition-colors duration-200 max-w-[240px] truncate ${
                                  isActive
                                    ? "border-white text-white bg-zinc-900"
                                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                                }`}
                              >
                                {h.title || (h.prompt ? h.prompt.slice(0, 40) + "…" : "Untitled")}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

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

                    {aiFields.length > 0 ? (
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
                    ) : (
                      <p className="text-[10px] font-mono text-zinc-700">This template has no editable text fields.</p>
                    )}
                  </div>
                )}

                {/* Clips tab */}
                {step4Tab === "clips" && (
                  <div className="flex flex-col gap-3">
                    {clipCount === 0 ? (
                      <p className="text-[10px] font-mono text-zinc-700">This template has no video clip slots.</p>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between">
                          <div className="text-xs font-semibold text-white">Video Clips</div>
                          <span className="text-[10px] font-mono text-zinc-500">{selectedClips.length} / {clipCount}</span>
                        </div>
                        <button
                          onClick={() => { setPickerTab("drive"); setShowClipPicker(true); }}
                          className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-4 py-2.5 flex items-center gap-2 self-start"
                        >
                          <Film size={12} />
                          Choose clips
                        </button>
                        {selectedClips.length > 0 && (
                          <div className="mt-1 flex flex-col gap-1">
                            {selectedClips.map((c, i) => (
                              <div key={clipKey(c)} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest flex-shrink-0">
                                    MEDIA_{i + 1}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-300 truncate">{c.name || c.drive_file_id}</span>
                                </div>
                                <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                                  <button
                                    onClick={() => reorderClip(i, -1)}
                                    disabled={i === 0}
                                    title="Move up"
                                    className="p-1 text-zinc-600 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-600 transition-colors"
                                  >
                                    <ChevronUp size={11} />
                                  </button>
                                  <button
                                    onClick={() => reorderClip(i, 1)}
                                    disabled={i === selectedClips.length - 1}
                                    title="Move down"
                                    className="p-1 text-zinc-600 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-600 transition-colors"
                                  >
                                    <ChevronDown size={11} />
                                  </button>
                                  <button
                                    onClick={() => toggleClip(c)}
                                    title="Remove"
                                    className="p-1 text-zinc-600 hover:text-white transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Copy tab */}
                {step4Tab === "copy" && (
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="text-xs font-semibold text-white">Caption</div>
                        <span className={`text-[10px] font-mono ${captionLen > 2200 ? "text-red-400" : captionLen > 2000 ? "text-amber-400" : "text-zinc-600"}`}>
                          {captionLen} / 2200
                        </span>
                      </div>
                      <textarea
                        rows={6}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                        placeholder="Social media caption — auto-filled by AI after Generate"
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                      />
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="text-xs font-semibold text-white">Hashtags</div>
                        <span className={`text-[10px] font-mono ${hashtagList.length > 30 ? "text-red-400" : "text-zinc-600"}`}>
                          {hashtagList.length} / 30
                        </span>
                      </div>
                      <input
                        type="text"
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                        placeholder="tag1, tag2, tag3 — auto-filled by AI after Generate"
                        value={hashtags}
                        onChange={e => setHashtags(e.target.value)}
                      />
                      {hashtagList.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {hashtagList.slice(0, 30).map((t, i) => (
                            <span key={i} className="text-[10px] font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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

                {clipCount > 0 && selectedClips.length < clipCount && (
                  <div className="border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] font-mono text-amber-200">
                    This template needs {clipCount} clip{clipCount === 1 ? "" : "s"}; you have {selectedClips.length}. Go back to Content → Clips.
                  </div>
                )}
                <button
                  onClick={handleRender}
                  disabled={submitting || (clipCount > 0 && selectedClips.length < clipCount)}
                  className="w-full bg-white text-black text-sm font-bold py-3.5 hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Queuing…" : "Render Video"}
                </button>
              </div>
            )}

            {/* Phase B: rendering — preview pane shows shimmer + stage; right pane shows just info */}
            {rendering && (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-white">Generating your video…</div>
                <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
                  Typical render takes 20–90 seconds. You can close this and come back — the video will be saved to this post.
                </p>
              </div>
            )}

            {/* Phase C: success */}
            {isSucceeded && (
              <div className="flex flex-col gap-5">
                <div className="text-xs font-semibold text-white">Video ready</div>

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

                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setPost(null); setPostId(null); setRendering(false); setStep(4); }}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors duration-200 text-left"
                  >
                    ← Make changes &amp; re-render
                  </button>
                  <button
                    onClick={handleStartOver}
                    className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors duration-200 text-left"
                  >
                    ← Start over
                  </button>
                </div>
              </div>
            )}

            {/* Phase D: failed */}
            {isFailed && (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => { setPost(null); setPostId(null); setRendering(false); handleRender(); }}
                  className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-4 py-2"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
        </div>
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
                          const isSel = selectedClips.some(c => clipKey(c) === clipKey(clip));
                          const atMax = !isSel && selectedClips.length >= clipCount;
                          return (
                            <tr key={clipKey(clip)}
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
              <div className="flex items-center gap-3">
                <input
                  ref={audioFileRef}
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3,audio/ogg"
                  className="hidden"
                  onChange={e => handleUploadAudio(e.target.files?.[0])}
                />
                <button
                  onClick={() => !uploadingAudio && audioFileRef.current?.click()}
                  disabled={uploadingAudio}
                  className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-[11px] font-mono hover:bg-zinc-800 transition-colors duration-200 px-2.5 py-1 disabled:opacity-40"
                >
                  {uploadingAudio ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  {uploadingAudio ? "Uploading…" : "Upload"}
                </button>
                <button onClick={closeMusicPicker} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {musicTracks.length === 0
                ? <div className="py-12 text-center font-mono text-xs text-zinc-600">No tracks in library.<br />Use the Upload button above or add tracks from the Music page.</div>
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
