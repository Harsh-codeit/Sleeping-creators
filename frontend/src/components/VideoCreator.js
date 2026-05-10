import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Wand2, Film, Download, X, Upload, HardDrive } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export function VideoCreator({ clientId }) {
  const [step, setStep] = useState("template");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [clips, setClips] = useState([]);
  const [texts, setTexts] = useState({});
  const [musicUrl, setMusicUrl] = useState("");
  const [selectedClips, setSelectedClips] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const fetchTemplates = async () => {
    try {
      const r = await axios.get(`${API}/creatomate-templates?status=active`);
      setTemplates(r.data);
    } catch (e) {
      toast.error("Failed to load templates");
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Polling for rendering step
  useEffect(() => {
    if (step !== "rendering" || !postId) return;
    const DONE_STATUSES = ["succeeded", "pending_approval", "bundle_scheduled", "published"];
    const FAIL_STATUSES = ["failed_render", "failed", "cancelled"];
    const interval = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/posts/${postId}`);
        if (DONE_STATUSES.includes(r.data.status)) {
          setPost(r.data);
          setStep("done");
          clearInterval(interval);
        } else if (FAIL_STATUSES.includes(r.data.status)) {
          setPost(r.data);
          setStep("done");
          clearInterval(interval);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [step, postId]);

  const handleSelectTemplate = async (t) => {
    setSelectedTemplate(t);
    setTexts({});
    setSelectedClips([]);
    setMusicUrl("");
    try {
      const r = await axios.get(`${API}/clients/${clientId}/drive-clips`);
      setClips(r.data);
    } catch (e) {
      setClips([]);
    }
    setStep("form");
  };

  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/videos/generate-text`, {
        template_id: selectedTemplate.id,
        client_id: clientId,
      });
      setTexts(prev => ({ ...prev, ...r.data }));
    } catch (e) {
      toast.error("Failed to generate text");
    } finally {
      setGenerating(false);
    }
  };

  const handleRender = async () => {
    setSubmitting(true);
    try {
      const filled = Object.fromEntries(
        Object.entries(texts).filter(([, v]) => v.trim())
      );
      const body = {
        client_id: clientId,
        template_id: selectedTemplate.id,
        clip_drive_ids: selectedClips.map(c => c.drive_file_id),
        music_url: musicUrl.trim() || undefined,
      };
      if (Object.keys(filled).length) body.ai_text_overrides = filled;
      const r = await axios.post(`${API}/videos/create`, body);
      setPostId(r.data.post_id);
      setStep("rendering");
    } catch (e) {
      toast.error("Failed to start render");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostNow = async () => {
    setPosting(true);
    try {
      await axios.post(`${API}/posts/${postId}/schedule`, {});
      toast.success("Scheduled for posting!");
    } catch (e) {
      toast.error("Failed to schedule post");
    } finally {
      setPosting(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) return;
    setScheduling(true);
    try {
      await axios.post(`${API}/posts/${postId}/schedule`, {
        scheduled_at: new Date(scheduleAt).toISOString(),
      });
      toast.success("Scheduled");
    } catch (e) {
      toast.error("Failed to schedule");
    } finally {
      setScheduling(false);
    }
  };

  const handleStartOver = () => {
    setStep("template");
    setSelectedTemplate(null);
    setPost(null);
    setPostId(null);
    setTexts({});
    setClips([]);
    setSelectedClips([]);
    setMusicUrl("");
    setScheduleAt("");
  };

  const aiFields = selectedTemplate
    ? selectedTemplate.field_schema.filter(f => f.role === "ai_text")
    : [];
  const hasAudio = selectedTemplate
    ? selectedTemplate.field_schema.some(f => f.role === "audio")
    : false;
  const clipCount = selectedTemplate
    ? selectedTemplate.field_schema.filter(f => f.role === "clip").length
    : 0;

  const renderTemplateStep = () => (
    <div>
      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
        Select a template
      </p>
      {templates.length === 0 ? (
        <div className="font-mono text-xs text-zinc-600 py-10 text-center">
          No active templates. Go to Video Templates and sync.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {templates.map(t => {
            const aiFieldCount = t.field_schema
              ? t.field_schema.filter(f => f.role === "ai_text").length
              : 0;
            return (
              <div
                key={t.id}
                data-testid={`template-card-${t.id}`}
                className="border border-zinc-800 hover:border-zinc-600 transition-colors duration-200 cursor-pointer p-3"
                onClick={() => handleSelectTemplate(t)}
              >
                {t.thumbnail_url ? (
                  <img
                    src={t.thumbnail_url}
                    alt={t.name}
                    className="w-full h-24 object-cover mb-2"
                  />
                ) : (
                  <div className="w-full h-24 bg-zinc-800 mb-2 flex items-center justify-center">
                    <Film size={24} className="text-zinc-600" />
                  </div>
                )}
                <div className="text-xs font-semibold text-white">{t.name}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                  {t.aspect_ratio} · {t.duration_seconds}s · {aiFieldCount} text fields
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

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
      const newClip = r.data;
      setClips(prev => [newClip, ...prev]);
      if (selectedClips.length < clipCount) {
        setSelectedClips(prev => [...prev, newClip]);
      }
      toast.success("Clip uploaded");
      setPickerTab("drive");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleClip = (clip) => {
    const isSelected = selectedClips.some(c => c.id === clip.id);
    if (isSelected) {
      setSelectedClips(prev => prev.filter(c => c.id !== clip.id));
    } else if (selectedClips.length < clipCount) {
      setSelectedClips(prev => [...prev, clip]);
    }
  };

  const renderClipPicker = () => (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setShowClipPicker(false)}>
      <div
        className="bg-zinc-950 border border-zinc-800 w-[600px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
          <span className="text-xs font-semibold text-white">Choose Clip</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-500">
              {selectedClips.length} / {clipCount} selected
            </span>
            <button onClick={() => setShowClipPicker(false)} className="text-zinc-500 hover:text-white transition-colors duration-200">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 flex-shrink-0">
          {[["drive", HardDrive, "From Drive"], ["upload", Upload, "Upload"]].map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setPickerTab(tab)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-mono transition-colors duration-200 border-b-2 ${
                pickerTab === tab
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {pickerTab === "drive" && (
            <div>
              {clips.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-zinc-600">
                  No clips found for this client.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-5 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-8"></th>
                      <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Name</th>
                      <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-20">Source</th>
                      <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-16">Duration</th>
                      <th className="text-right px-5 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-8">Seq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clips.map(clip => {
                      const isSelected = selectedClips.some(c => c.id === clip.id);
                      const atMax = !isSelected && selectedClips.length >= clipCount;
                      return (
                        <tr
                          key={clip.id}
                          data-testid={`clip-row-${clip.id}`}
                          onClick={() => !atMax && toggleClip(clip)}
                          className={`border-b border-zinc-800/50 transition-colors duration-200 ${atMax ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-zinc-900"} ${isSelected ? "bg-zinc-900" : ""}`}
                        >
                          <td className="px-5 py-2.5">
                            <input
                              type="checkbox"
                              data-testid={`clip-checkbox-${clip.id}`}
                              checked={isSelected}
                              disabled={atMax}
                              readOnly
                              className="accent-white"
                            />
                          </td>
                          <td className="px-2 py-2.5 font-mono text-zinc-300 max-w-[200px]">
                            <span className="truncate block">{clip.name || clip.drive_file_id}</span>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-widest ${clip.source === "upload" ? "text-blue-400 bg-blue-400/10 border border-blue-400/30" : "text-zinc-400 bg-zinc-800 border border-zinc-700"}`}>
                              {clip.source || "drive"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 font-mono text-zinc-500 text-[11px]">
                            {clip.duration ? `${clip.duration.toFixed(1)}s` : "—"}
                          </td>
                          <td className="px-5 py-2.5 font-mono text-zinc-600 text-[11px] text-right">#{clip.sequence_number}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {pickerTab === "upload" && (
            <div className="p-6 flex flex-col items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => handleUploadClip(e.target.files?.[0])}
              />
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`w-full border border-dashed border-zinc-700 py-12 flex flex-col items-center gap-3 transition-colors duration-200 ${uploading ? "opacity-50 cursor-not-allowed" : "hover:border-zinc-500 cursor-pointer"}`}
              >
                <Upload size={28} className="text-zinc-600" />
                <span className="text-xs font-mono text-zinc-400">Click to choose a video file</span>
                <span className="text-[10px] font-mono text-zinc-600">MP4, MOV, AVI · max 100 MB · max 60s</span>
              </div>
              {uploading && (
                <div className="w-full">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-mono text-zinc-500">Uploading…</span>
                    <span className="text-[10px] font-mono text-zinc-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1">
                    <div className="bg-white h-1 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-3 flex justify-between items-center flex-shrink-0">
          <button onClick={() => setSelectedClips([])} className="border border-zinc-700 text-zinc-400 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5">
            Clear
          </button>
          <button
            onClick={() => setShowClipPicker(false)}
            className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-4 py-1.5"
          >
            Done ({selectedClips.length} selected)
          </button>
        </div>
      </div>
    </div>
  );

  const ROLE_BADGE = {
    ai_text:     "text-blue-400  bg-blue-400/10  border border-blue-400/30",
    audio:       "text-purple-400 bg-purple-400/10 border border-purple-400/30",
    clip:        "text-amber-400 bg-amber-400/10 border border-amber-400/30",
    logo:        "text-zinc-400  bg-zinc-800     border border-zinc-700",
    brand_style: "text-zinc-400  bg-zinc-800     border border-zinc-700",
    static_text: "text-zinc-400  bg-zinc-800     border border-zinc-700",
    decorative:  "text-zinc-600  bg-zinc-900     border border-zinc-800",
  };

  const renderFormStep = () => {
    const schema = selectedTemplate?.field_schema || [];
    const editableRoles = ["ai_text", "audio", "clip"];
    const editableFields = schema.filter(f => editableRoles.includes(f.role));
    const autoFields = schema.filter(f => !editableRoles.includes(f.role));

    return (
      <div className="flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">

          {/* AI generate row */}
          {aiFields.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Fields</span>
              <button
                data-testid="generate-ai-btn"
                onClick={handleGenerateAI}
                disabled={generating}
                className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-2 py-1 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 size={12} />
                {generating ? "Generating…" : "Generate with AI"}
              </button>
            </div>
          )}

          {/* 3-column field table */}
          {editableFields.length > 0 && (
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-1/4">Key</th>
                  <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-1/6 pl-2">Role</th>
                  <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Content</th>
                </tr>
              </thead>
              <tbody>
                {editableFields.map(f => (
                  <tr key={f.key} className="border-b border-zinc-800/50 align-top">
                    <td className="py-2 pr-2 font-mono text-zinc-300 text-[11px]">{f.key}</td>
                    <td className="py-2 pl-2 pr-2">
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-widest ${ROLE_BADGE[f.role] || ROLE_BADGE.decorative}`}>
                        {f.role}
                      </span>
                    </td>
                    <td className="py-2 pl-2">
                      {f.role === "ai_text" && (
                        <textarea
                          data-testid={`field-${f.key}`}
                          rows={2}
                          className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                          placeholder={f.ai_hint || "leave blank to auto-generate"}
                          value={texts[f.key] || ""}
                          onChange={e => setTexts(prev => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      )}
                      {f.role === "audio" && (
                        <input
                          data-testid="music-url-input"
                          type="text"
                          className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                          placeholder="music URL — leave blank for template default"
                          value={musicUrl}
                          onChange={e => setMusicUrl(e.target.value)}
                        />
                      )}
                      {f.role === "clip" && (
                        <div className="flex items-center gap-3">
                          <button
                            data-testid="choose-clips-btn"
                            onClick={() => { setPickerTab("drive"); setShowClipPicker(true); }}
                            className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5 flex items-center gap-1.5"
                          >
                            <Film size={11} />
                            Choose clips
                          </button>
                          {selectedClips.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {selectedClips.map(c => (
                                <span key={c.id} className="font-mono text-[10px] text-zinc-300 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 flex items-center gap-1">
                                  {(c.name || c.drive_file_id).slice(0, 20)}
                                  <button onClick={() => toggleClip(c)} className="text-zinc-500 hover:text-white transition-colors duration-200">
                                    <X size={9} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-600">none selected (up to {clipCount})</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Auto fields (decorative, logo, etc.) */}
          {autoFields.length > 0 && (
            <div>
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Auto fields</span>
              <table className="w-full text-xs mt-1 mb-4">
                <tbody>
                  {autoFields.map(f => (
                    <tr key={f.key} className="border-b border-zinc-800/30">
                      <td className="py-1.5 pr-2 font-mono text-zinc-600 text-[11px] w-1/4">{f.key}</td>
                      <td className="py-1.5 pl-2 pr-2 w-1/6">
                        <span className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-widest ${ROLE_BADGE[f.role] || ROLE_BADGE.decorative}`}>
                          {f.role}
                        </span>
                      </td>
                      <td className="py-1.5 pl-2 font-mono text-zinc-600 text-[10px]">auto</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-3 flex justify-between -mx-6">
          <button
            data-testid="back-to-templates-btn"
            onClick={() => setStep("template")}
            className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
          >
            Back
          </button>
          <button
            data-testid="render-btn"
            onClick={handleRender}
            disabled={submitting}
            className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Rendering…" : "Render"}
          </button>
        </div>
      </div>
    );
  };

  const renderRenderingStep = () => (
    <div className="flex flex-col items-center">
      <RefreshCw size={24} className="text-zinc-500 animate-spin" />
      <p className="font-mono text-zinc-400 text-xs mt-3">Rendering…</p>
      <p className="text-[10px] font-mono text-zinc-600 mt-1">This takes 20–60 seconds.</p>
    </div>
  );

  const renderDoneStep = () => {
    const isFailed = post && ["failed_render", "failed", "cancelled"].includes(post.status);

    if (isFailed) {
      return (
        <div className="max-w-lg mx-auto py-6 px-6 flex flex-col items-center">
          <p className="font-mono text-xs text-red-400 mb-4">
            Render failed — status: {post.status}
          </p>
          <div className="flex gap-2">
            <button
              data-testid="try-again-btn"
              onClick={() => setStep("form")}
              className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
            >
              Try again
            </button>
            <button
              onClick={handleStartOver}
              className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5"
            >
              Start over
            </button>
          </div>
        </div>
      );
    }

    const isSuccess = post && ["succeeded", "published"].includes(post.status);
    const isPending = post && ["pending_approval", "bundle_scheduled"].includes(post.status);
    const statusColor = isSuccess || isPending
      ? (isSuccess ? "text-emerald-400" : "text-amber-400")
      : "text-zinc-400";

    return (
      <div className="max-w-lg mx-auto py-6 px-6 w-full">
        {post?.r2_video_url ? (
          <video
            src={post.r2_video_url}
            controls
            className="w-full max-h-72 bg-zinc-900 border border-zinc-800"
          />
        ) : post?.r2_snapshot_url ? (
          <img
            src={post.r2_snapshot_url}
            alt="Video snapshot"
            className="w-full max-h-72 object-contain border border-zinc-800"
          />
        ) : null}

        {post && (
          <p className={`font-mono text-[10px] uppercase tracking-widest mt-3 ${statusColor}`}>
            {post.status}
          </p>
        )}

        <div className="flex gap-2 mt-4 flex-wrap items-center">
          <button
            data-testid="download-btn"
            disabled={!post?.r2_video_url}
            onClick={() => window.open(post.r2_video_url, "_blank")}
            className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            Download
          </button>
          <button
            data-testid="post-now-btn"
            onClick={handlePostNow}
            disabled={posting}
            className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? "Posting…" : "Post now"}
          </button>
          <input
            type="datetime-local"
            data-testid="schedule-input"
            className="bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1 font-mono focus:outline-none focus:border-zinc-500"
            value={scheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
          />
          <button
            data-testid="schedule-btn"
            onClick={handleSchedule}
            disabled={scheduling || !scheduleAt}
            className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scheduling ? "Scheduling…" : "Schedule"}
          </button>
        </div>

        <span
          data-testid="start-over-btn"
          onClick={handleStartOver}
          className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200 mt-6 block text-center cursor-pointer"
        >
          Start over
        </span>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      {showClipPicker && renderClipPicker()}
      {/* Step header */}
      <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          {step === "template"
            ? "1 / 4 — CHOOSE TEMPLATE"
            : step === "form"
            ? "2 / 4 — CONFIGURE"
            : step === "rendering"
            ? "3 / 4 — RENDERING"
            : "4 / 4 — DONE"}
        </span>
        {selectedTemplate && step !== "template" && (
          <span className="text-[10px] font-mono text-zinc-600">· {selectedTemplate.name}</span>
        )}
      </div>

      {/* Step content */}
      <div
        className={
          step === "rendering" || step === "done"
            ? "flex flex-col items-center justify-center min-h-[60vh]"
            : "px-6 py-4"
        }
      >
        {step === "template" && renderTemplateStep()}
        {step === "form" && renderFormStep()}
        {step === "rendering" && renderRenderingStep()}
        {step === "done" && renderDoneStep()}
      </div>
    </div>
  );
}

export default VideoCreator;
