import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Play, Film, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { ChipGroup } from "./video/ChipGroup";
import { VideoField } from "./video/VideoField";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORMS = ["instagram", "facebook", "linkedin", "twitter", "threads"];
const PRIORITIES = ["low", "normal", "high"];

const STATUS_CONFIG = {
  queued:     { color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: Loader2, label: "Queued" },
  processing: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   icon: Loader2, label: "Processing" },
  success:    { color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2, label: "Done" },
  failure:    { color: "bg-red-500/10  text-red-400   border-red-500/20",   icon: XCircle, label: "Failed" },
};

export default function VideoStudio({ clientId }) {
  const [clips, setClips] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [platforms, setPlatforms] = useState(["instagram"]);
  const [caption, setCaption] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [hashtags, setHashtags] = useState([]);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/clients/${clientId}/drive-clips`)
      .then(r => setClips(r.data || []))
      .catch(() => {});
    axios.get(`${API}/video-templates`, { params: { client_id: clientId } })
      .then(r => setTemplates(r.data || []))
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    if (!job?.taskId) return;
    if (job.status === "success" || job.status === "failure") return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/videos/job/${job.taskId}`);
        const { status, result, error } = r.data;
        setJob((j) => ({ ...j, status, result, error }));
        if (status === "success" || status === "failure") {
          clearInterval(pollRef.current);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [job?.taskId, job?.status]);

  const togglePlatform = (p) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const addHashtag = (e) => {
    if (e.key === "Enter" && hashtag.trim()) {
      e.preventDefault();
      const tag = hashtag.trim().replace(/^#?/, "#");
      if (!hashtags.includes(tag)) setHashtags((h) => [...h, tag]);
      setHashtag("");
    }
  };

  const submit = async () => {
    if (platforms.length === 0) return toast.error("Select at least one platform");
    setSubmitting(true);
    try {
      const body = {
        client_id: clientId,
        clip_id: selectedClip?.drive_file_id || null,
        template_id: selectedTemplate?.id || null,
        platforms,
        caption,
        hashtags,
        priority,
        clip_trim_start: parseFloat(trimStart) || 0,
        clip_trim_end: trimEnd !== "" ? parseFloat(trimEnd) : null,
      };
      const r = await axios.post(`${API}/videos/create`, body);
      const taskId = r.data.task_id;
      setJob({ taskId, status: "queued", result: null, error: null });
      toast.success("Video job queued");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const statusCfg = job ? STATUS_CONFIG[job.status] || STATUS_CONFIG.queued : null;
  const StatusIcon = statusCfg?.icon;

  return (
    <div className="space-y-6">
      {/* Template picker */}
      <div>
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide mb-3">
          Template <span className="text-zinc-700">— optional</span>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setSelectedTemplate(null)}
            className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 border transition-colors w-20 ${
              !selectedTemplate ? "border-white" : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <div
              className="w-full bg-zinc-800 flex items-center justify-center text-zinc-600 text-[9px] font-mono"
              style={{ aspectRatio: "9 / 16" }}
            >
              Auto
            </div>
            <span className="text-[9px] font-mono text-zinc-500">None</span>
          </button>

          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelectedTemplate(tpl)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 border transition-colors w-20 ${
                selectedTemplate?.id === tpl.id ? "border-white" : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <div
                className="w-full bg-gradient-to-br from-zinc-700 to-zinc-900 relative overflow-hidden"
                style={{ aspectRatio: "9 / 16" }}
              >
                {tpl.cta_button_text && (
                  <div
                    className="absolute font-bold"
                    style={{
                      left: `${(tpl.cta_button_x_ratio ?? 0.5) * 100}%`,
                      top: `${(tpl.cta_button_y_ratio ?? 0.88) * 100}%`,
                      transform: "translate(-50%, -50%)",
                      fontSize: 6,
                      background: tpl.cta_button_bg_color || "#fff",
                      color: tpl.cta_button_text_color || "#000",
                      borderRadius: 999,
                      padding: "2px 6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tpl.cta_button_text}
                  </div>
                )}
              </div>
              <span className="text-[9px] font-mono text-zinc-400 truncate w-full text-center">
                {tpl.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Clip picker */}
      <div>
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide mb-3">
          Clip <span className="text-zinc-700">— optional, auto-picks if not set</span>
        </p>
        {clips.length === 0 ? (
          <p className="text-xs font-mono text-zinc-600">No clips found. Sync Drive clips from the Profile tab.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setSelectedClip(null)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-mono border transition-colors ${
                !selectedClip ? "border-white text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
              }`}
            >
              Auto-pick
            </button>
            {clips.map((clip) => (
              <button
                key={clip.drive_file_id}
                type="button"
                onClick={() => setSelectedClip(clip)}
                className={`flex-shrink-0 px-3 py-1.5 text-xs font-mono border truncate max-w-[140px] transition-colors ${
                  selectedClip?.drive_file_id === clip.drive_file_id
                    ? "border-white text-white"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Film size={11} className="inline mr-1" />
                {clip.name || clip.drive_file_id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Post settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <VideoField label="Caption">
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption…"
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500 resize-none"
          />
        </VideoField>

        <VideoField label="Hashtags — press Enter to add">
          <input
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
            onKeyDown={addHashtag}
            placeholder="#brand"
          />
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {hashtags.map((h) => (
                <span
                  key={h}
                  className="text-[10px] font-mono px-2 py-0.5 border border-zinc-700 text-zinc-400 cursor-pointer hover:border-red-700 hover:text-red-400 transition-colors"
                  onClick={() => setHashtags((hs) => hs.filter((x) => x !== h))}
                >
                  {h} ×
                </span>
              ))}
            </div>
          )}
        </VideoField>

        <VideoField label="Platforms">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                  platforms.includes(p)
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </VideoField>

        <VideoField label="Priority">
          <ChipGroup options={PRIORITIES} value={priority} onChange={setPriority} />
        </VideoField>

        <VideoField label="Trim Start (seconds)">
          <input
            type="number"
            min={0}
            step={0.5}
            value={trimStart}
            onChange={(e) => setTrimStart(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
          />
        </VideoField>

        <VideoField label="Trim End (seconds, optional)">
          <input
            type="number"
            min={0}
            step={0.5}
            value={trimEnd}
            onChange={(e) => setTrimEnd(e.target.value)}
            placeholder="Leave blank = full clip"
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500 placeholder-zinc-700"
          />
        </VideoField>
      </div>

      {/* Submit + status */}
      <div className="flex items-center gap-4 pt-2 border-t border-zinc-800">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || platforms.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Create Video
        </button>

        {job && statusCfg && (
          <div className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-mono ${statusCfg.color}`}>
            <StatusIcon
              size={13}
              className={job.status === "queued" || job.status === "processing" ? "animate-spin" : ""}
            />
            {statusCfg.label}
            {job.result?.video_url && (
              <a
                href={job.result.video_url}
                target="_blank"
                rel="noreferrer"
                className="underline ml-2 text-green-400"
              >
                View
              </a>
            )}
            {job.error && (
              <span className="ml-2 text-red-400 truncate max-w-xs" title={job.error}>
                {job.error}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
