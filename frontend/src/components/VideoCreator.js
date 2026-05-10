import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { RefreshCw, Wand2, Film, Download } from "lucide-react";

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
        <div className="grid grid-cols-2 gap-3">
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

  const renderFormStep = () => (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Content section */}
        {aiFields.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Content
              </span>
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
            {aiFields.map(f => (
              <div key={f.key} className="mb-3">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  {f.key}
                </label>
                <textarea
                  data-testid={`field-${f.key}`}
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono resize-none focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                  placeholder={f.ai_hint || "leave blank to auto-generate"}
                  value={texts[f.key] || ""}
                  onChange={e => setTexts(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {/* Music section */}
        {hasAudio && (
          <div className="mb-4">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
              Music URL
            </label>
            <input
              data-testid="music-url-input"
              type="text"
              className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200"
              placeholder="leave blank for template default"
              value={musicUrl}
              onChange={e => setMusicUrl(e.target.value)}
            />
          </div>
        )}

        {/* Clips section */}
        {clipCount > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Clips
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                (select up to {clipCount})
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {clips.map(clip => {
                const isChecked = selectedClips.some(c => c.id === clip.id);
                const atMax = selectedClips.length >= clipCount && !isChecked;
                return (
                  <label
                    key={clip.id}
                    className="flex items-center gap-2 text-xs font-mono text-zinc-400 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      data-testid={`clip-checkbox-${clip.id}`}
                      checked={isChecked}
                      disabled={atMax}
                      className="accent-white"
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedClips(prev => [...prev, clip]);
                        } else {
                          setSelectedClips(prev => prev.filter(c => c.id !== clip.id));
                        }
                      }}
                    />
                    <span className="truncate max-w-[160px]">
                      {clip.name || clip.drive_file_id}
                    </span>
                    <span className="text-zinc-600 text-[10px]">seq: {clip.sequence_number}</span>
                  </label>
                );
              })}
            </div>
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
