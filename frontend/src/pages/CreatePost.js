import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import SlidePreview from "../components/SlidePreview";
import {
  Sparkles, LayoutTemplate, Film, ChevronDown, Check,
  ChevronLeft, ChevronRight, Calendar, Send, Clock, X,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TONES = ["Educational", "Entertaining", "Inspirational", "Professional", "Casual"];
const SLIDE_COUNTS = ["3", "5", "7", "10"];
const HOOK_STYLES = ["Question", "Bold Claim", "Statistic", "Story / Anecdote", "Challenge"];
const DURATIONS = ["15 seconds", "30 seconds", "60 seconds", "90 seconds"];
const CTAS = ["Follow for more", "Link in bio", "Comment below", "Share this", "Save for later", "Send a DM"];

function authHeaders() {
  const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function CreatePost() {
  const [tab, setTab] = useState("carousel");

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0d0d0d" }}>
      <div style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "18px 20px 0" }}>
        <h1 style={{ fontWeight: 700, fontSize: 18, color: "#ffffff", marginBottom: 14 }}>Create Post</h1>
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "carousel", label: "Carousel", icon: LayoutTemplate },
            { key: "video",    label: "Video",    icon: Film },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 18px",
                fontSize: 13, fontWeight: 500, background: "none", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${tab === key ? "#5B5BD6" : "transparent"}`,
                color: tab === key ? "#5B5BD6" : "#888888",
              }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "20px 16px 80px" }}>
        {tab === "carousel" && <CarouselForm />}
        {tab === "video"    && <VideoForm />}
      </div>
    </div>
  );
}

// ─── Carousel Form ────────────────────────────────────────────────────────────

function CarouselForm() {
  const [templates, setTemplates]     = useState([]);
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [selectedTplObj, setSelectedTplObj] = useState(null);
  const [topic, setTopic]             = useState("");
  const [tone, setTone]               = useState("");
  const [slides, setSlides]           = useState("5");
  const [audience, setAudience]       = useState("");
  const [keyPoints, setKeyPoints]     = useState("");
  const [cta, setCta]                 = useState("");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [slideIdx, setSlideIdx]       = useState(0);
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing]   = useState(false);

  useEffect(() => {
    axios.get(`${API}/templates`).then(r => {
      const list = r.data?.templates || r.data || [];
      setTemplates(list);
      if (list.length > 0) {
        setSelectedTpl(list[0].id || list[0]._id);
        setSelectedTplObj(list[0]);
      }
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return toast.error("Enter a topic first");
    setLoading(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/carousel/generate`, {
        topic,
        tone,
        slide_count: parseInt(slides, 10),
        audience,
        key_points: keyPoints,
        cta_keyword: cta,
        template_id: selectedTpl,
        platform: "instagram",
      }, { headers: authHeaders() });
      setResult(data);
      setSlideIdx(0);
      toast.success("Carousel generated!");
    } catch (err) {
      const raw = err.response?.data?.detail;
      const msg = typeof raw === "string" ? raw : (Array.isArray(raw) ? raw.map(e => e.msg).join(", ") : (raw ? JSON.stringify(raw) : err.message));
      toast.error(`Generation failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (now = false) => {
    if (!result) return;
    setPublishing(true);
    try {
      // Save as post first
      const { data: post } = await axios.post(`${API}/posts`, {
        content_type: "carousel",
        platform: "instagram",
        caption: result.caption,
        hashtags: result.hashtags,
        slides: result.slides,
        slide_image_urls: result.slide_image_urls,
        carousel_id: result.carousel_id,
        scheduled_at: now ? new Date().toISOString() : (scheduledAt || new Date().toISOString()),
        status: "draft",
      }, { headers: authHeaders() });

      if (now) {
        await axios.post(`${API}/posts/${post.id}/publish`, {}, { headers: authHeaders() });
        toast.success("Published to Instagram!");
      } else {
        await axios.post(`${API}/posts/${post.id}/approve`, {}, { headers: authHeaders() });
        toast.success("Scheduled successfully!");
      }
      setResult(null);
      setTopic("");
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  const allSlides = result ? [
    { heading: result.slides[0]?.heading || topic, body: "Cover slide", isCover: true },
    ...result.slides,
  ] : [];
  const hasImages = result?.slide_image_urls?.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Choose a Template *">
        {templates.length === 0 ? (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse flex-shrink-0"
                style={{ width: 90, aspectRatio: "4/5", background: "#1e1e1e", borderRadius: 12, border: "1px solid #2a2a2a" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
            {templates.map(t => {
              const id = t.id || t._id;
              const on = selectedTpl === id;
              return (
                <button key={id}
                  onClick={() => { setSelectedTpl(id); setSelectedTplObj(t); }}
                  style={{
                    flexShrink: 0, width: 90, aspectRatio: "4/5", borderRadius: 12, overflow: "hidden",
                    border: `2px solid ${on ? "#5B5BD6" : "#2a2a2a"}`,
                    boxShadow: on ? "0 0 0 3px rgba(91,91,214,0.15)" : "none",
                    background: "#0d0d0d", cursor: "pointer", padding: 0, position: "relative",
                  }}>
                  {t.thumbnail_url
                    ? <img src={t.thumbnail_url} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <SlidePreview template={t} compact={true} />
                  }
                  {on && <div style={{ position: "absolute", inset: 0, border: "2px solid #5B5BD6", borderRadius: 10, pointerEvents: "none" }} />}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "rgba(0,0,0,0.55)" }}>
                    <p style={{ fontSize: 9, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Topic / Subject *">
        <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="e.g. 5 productivity tips for entrepreneurs" style={inputStyle} />
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Tone">
          <SelectField value={tone} onChange={setTone} options={TONES} placeholder="Choose tone" />
        </Section>
        <Section title="Number of Slides">
          <SelectField value={slides} onChange={setSlides} options={SLIDE_COUNTS} />
        </Section>
      </div>

      <Section title="Target Audience">
        <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
          placeholder="e.g. Small business owners, students" style={inputStyle} />
      </Section>

      <Section title="Key Points / Notes">
        <textarea value={keyPoints} onChange={e => setKeyPoints(e.target.value)}
          placeholder="Any specific points, statistics, or ideas to include…"
          rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
      </Section>

      <Section title="Call to Action">
        <SelectField value={cta} onChange={setCta} options={CTAS} placeholder="No CTA (optional)" />
      </Section>

      <GenerateBtn onClick={handleGenerate} label={loading ? "Generating…" : "Generate Carousel"} disabled={loading} />

      {/* ── Result Preview ─────────────────────────────────────────────────── */}
      {result && (
        <div style={{ marginTop: 8, background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 20, overflow: "hidden" }}>
          {/* Slide viewer */}
          <div style={{ position: "relative", aspectRatio: "4/5", overflow: "hidden" }}>
            {hasImages ? (
              <img
                src={result.slide_image_urls[slideIdx] || result.slide_image_urls[0]}
                alt={`Slide ${slideIdx + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <SlidePreview
                template={selectedTplObj}
                slide={allSlides[slideIdx]}
                compact={false}
              />
            )}
            {/* Slide navigation */}
            {allSlides.length > 1 && (
              <>
                <button onClick={() => setSlideIdx(i => Math.max(0, i - 1))}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => setSlideIdx(i => Math.min(allSlides.length - 1, i + 1))}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                  <ChevronRight size={18} />
                </button>
                <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
                  {allSlides.map((_, i) => (
                    <div key={i} onClick={() => setSlideIdx(i)}
                      style={{ width: i === slideIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === slideIdx ? "#5B5BD6" : "#555", cursor: "pointer", transition: "width 0.2s" }} />
                  ))}
                </div>
              </>
            )}
            {/* Dismiss */}
            <button onClick={() => setResult(null)}
              style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <X size={14} />
            </button>
          </div>

          {/* Caption + hashtags */}
          <div style={{ padding: "16px 16px 12px" }}>
            <p style={{ fontSize: 13, color: "#ddd", lineHeight: 1.6, margin: 0 }}>{result.caption}</p>
            {result.hashtags?.length > 0 && (
              <p style={{ fontSize: 12, color: "#5B5BD6", marginTop: 8, lineHeight: 1.6 }}>
                {result.hashtags.join(" ")}
              </p>
            )}
          </div>

          {/* Schedule + Publish */}
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", borderRadius: 12, padding: "10px 14px", border: "1px solid #2a2a2a" }}>
              <Clock size={14} style={{ color: "#888", flexShrink: 0 }} />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{ flex: 1, background: "none", border: "none", color: "#ccc", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => handlePublish(false)} disabled={publishing || !scheduledAt}
                style={{ padding: "12px 0", borderRadius: 12, border: "1.5px solid #5B5BD6", background: "transparent", color: "#5B5BD6", fontWeight: 600, fontSize: 13, cursor: scheduledAt ? "pointer" : "not-allowed", opacity: scheduledAt ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Calendar size={14} /> Schedule
              </button>
              <button onClick={() => handlePublish(true)} disabled={publishing}
                style={{ padding: "12px 0", borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(91,91,214,0.3)" }}>
                <Send size={14} /> {publishing ? "Publishing…" : "Publish Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Video Form ───────────────────────────────────────────────────────────────

function VideoForm() {
  const [topic, setTopic]             = useState("");
  const [hook, setHook]               = useState("");
  const [duration, setDuration]       = useState("");
  const [tone, setTone]               = useState("");
  const [cta, setCta]                 = useState("");
  const [audience, setAudience]       = useState("");
  const [notes, setNotes]             = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [videoTemplates, setVideoTemplates]     = useState([]);
  const [loadingTpls, setLoadingTpls]           = useState(true);
  const [loading, setLoading]         = useState(false);
  const [job, setJob]                 = useState(null); // {post_id, render_id, status, video_url}
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing]   = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/shotstack-templates`, { headers: authHeaders() })
      .then(r => {
        const all = r.data?.templates ?? [];
        setVideoTemplates(all);
      })
      .catch(() => {
        // Fallback: load from templates endpoint filtered by kind
        axios.get(`${API}/templates`).then(r => {
          const all = r.data?.templates ?? r.data ?? [];
          setVideoTemplates(all.filter(t => t.kind === "video"));
        }).catch(() => {});
      })
      .finally(() => setLoadingTpls(false));
  }, []);

  // Poll render status
  useEffect(() => {
    if (!job?.render_id || job.status === "done" || job.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API}/videos/job/${job.render_id}`, { headers: authHeaders() });
        setJob(prev => ({ ...prev, ...data }));
        if (data.status === "done" || data.status === "failed") {
          clearInterval(pollRef.current);
          if (data.status === "done") toast.success("Video ready!");
          else toast.error("Video render failed");
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 6000);
    return () => clearInterval(pollRef.current);
  }, [job?.render_id, job?.status]);

  const handleGenerate = async () => {
    if (!topic.trim()) return toast.error("Enter a topic first");
    setLoading(true);
    setJob(null);
    try {
      const { data } = await axios.post(`${API}/videos/generate`, {
        topic, hook_style: hook, duration, tone, cta, audience, notes,
        template_id: selectedTemplate?.id || null,
        platform: "instagram",
      }, { headers: authHeaders() });
      setJob({ ...data, video_url: null });
      toast.success("Video queued — rendering…");
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (now = false) => {
    if (!job?.post_id) return;
    setPublishing(true);
    try {
      if (now) {
        await axios.post(`${API}/posts/${job.post_id}/publish`, {}, { headers: authHeaders() });
        toast.success("Published to Instagram!");
      } else {
        await axios.put(`${API}/posts/${job.post_id}`, { scheduled_at: scheduledAt }, { headers: authHeaders() });
        await axios.post(`${API}/posts/${job.post_id}/approve`, {}, { headers: authHeaders() });
        toast.success("Scheduled!");
      }
      setJob(null);
      setTopic("");
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Video Template Selector */}
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cccccc", marginBottom: 8 }}>
          Select Video Template <span style={{ fontWeight: 400, color: "#666666" }}>(optional)</span>
        </label>
        {loadingTpls ? (
          <div style={{ height: 60, borderRadius: 14, background: "#161616", border: "1.5px solid #2a2a2a", display: "flex", alignItems: "center", paddingLeft: 16 }}>
            <span style={{ fontSize: 12, color: "#666666" }}>Loading templates…</span>
          </div>
        ) : videoTemplates.length === 0 ? (
          <div style={{ padding: "12px 16px", borderRadius: 14, background: "#161616", border: "1.5px dashed #2a2a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#666666" }}>No Shotstack templates configured</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => setSelectedTemplate(null)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12,
              border: `1.5px solid ${!selectedTemplate ? "#5B5BD6" : "#2a2a2a"}`,
              background: !selectedTemplate ? "#1e1e3a" : "#161616", cursor: "pointer", textAlign: "left",
            }}>
              <Radio active={!selectedTemplate} />
              <span style={{ fontSize: 12, fontWeight: 500, color: !selectedTemplate ? "#5B5BD6" : "#888888" }}>No template — AI generates from brief only</span>
            </button>
            {videoTemplates.map(t => {
              const sel = selectedTemplate?.id === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedTemplate(sel ? null : t)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                  border: `1.5px solid ${sel ? "#5B5BD6" : "#2a2a2a"}`,
                  background: sel ? "#1e1e3a" : "#161616", cursor: "pointer", textAlign: "left",
                }}>
                  <Radio active={sel} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? "#8080ff" : "#ffffff", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{t.name}</div>
                    {(t.category || t.number_of_scenes) && (
                      <div style={{ fontSize: 10, color: "#666666", marginTop: 1 }}>
                        {[t.category, t.number_of_scenes && `${t.number_of_scenes} scenes`].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <Film size={13} style={{ color: sel ? "#8080ff" : "#444444", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Section title="Topic / Subject *">
        <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="e.g. How I grew my Instagram in 30 days" style={inputStyle} />
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Hook Style">
          <SelectField value={hook} onChange={setHook} options={HOOK_STYLES} placeholder="Choose hook" />
        </Section>
        <Section title="Duration">
          <SelectField value={duration} onChange={setDuration} options={DURATIONS} placeholder="Choose length" />
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Section title="Tone">
          <SelectField value={tone} onChange={setTone} options={TONES} placeholder="Choose tone" />
        </Section>
        <Section title="Call to Action">
          <SelectField value={cta} onChange={setCta} options={CTAS} placeholder="Choose CTA" />
        </Section>
      </div>

      <Section title="Target Audience">
        <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
          placeholder="e.g. Fitness enthusiasts, 18–30" style={inputStyle} />
      </Section>

      <Section title="Additional Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any specific ideas, references, or style notes…"
          rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
      </Section>

      <GenerateBtn onClick={handleGenerate} label={loading ? "Generating…" : "Generate Video"} disabled={loading} />

      {/* ── Video job status ─────────────────────────────────────────────── */}
      {job && (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: "#fff", margin: 0 }}>
                {job.status === "done" ? "Video Ready" : job.status === "failed" ? "Render Failed" : "Rendering…"}
              </p>
              <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0" }}>ID: {job.render_id}</p>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {job.status === "rendering" && (
            <div style={{ height: 6, borderRadius: 3, background: "#1e1e2e", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "60%", background: "#5B5BD6", borderRadius: 3, animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
          )}

          {job.video_url && (
            <video controls style={{ width: "100%", borderRadius: 12, background: "#000" }} src={job.video_url} />
          )}

          {job.status === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", borderRadius: 12, padding: "10px 14px", border: "1px solid #2a2a2a" }}>
                <Clock size={14} style={{ color: "#888", flexShrink: 0 }} />
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  style={{ flex: 1, background: "none", border: "none", color: "#ccc", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => handlePublish(false)} disabled={publishing || !scheduledAt}
                  style={{ padding: "12px 0", borderRadius: 12, border: "1.5px solid #5B5BD6", background: "transparent", color: "#5B5BD6", fontWeight: 600, fontSize: 13, cursor: scheduledAt ? "pointer" : "not-allowed", opacity: scheduledAt ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Calendar size={14} /> Schedule
                </button>
                <button onClick={() => handlePublish(true)} disabled={publishing}
                  style={{ padding: "12px 0", borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(91,91,214,0.3)" }}>
                  <Send size={14} /> {publishing ? "Publishing…" : "Publish Now"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 14,
  color: "#ffffff", background: "transparent", outline: "none", border: "none",
  fontFamily: "inherit",
};

function Section({ title, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cccccc", marginBottom: 6 }}>{title}</label>
      <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 14, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer", color: value ? "#ffffff" : "#666666" }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#666666", pointerEvents: "none" }} />
    </div>
  );
}

function GenerateBtn({ onClick, label, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: "15px 0", fontWeight: 700, fontSize: 15, borderRadius: 16,
        color: "#fff", background: disabled ? "#3a3a6a" : "#5B5BD6", border: "none", cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: disabled ? "none" : "0 4px 16px rgba(91,91,214,0.3)", marginTop: 4,
        transition: "background 0.2s",
      }}>
      <Sparkles size={16} /> {label}
    </button>
  );
}

function Radio({ active }) {
  return (
    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${active ? "#5B5BD6" : "#444444"}`, background: active ? "#5B5BD6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {active && <Check size={9} style={{ color: "#fff" }} />}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    rendering: { bg: "#1e1e3a", color: "#8080ff", label: "Rendering" },
    done:      { bg: "#0f2a1a", color: "#4ade80", label: "Done" },
    failed:    { bg: "#2a0f0f", color: "#f87171", label: "Failed" },
    ready:     { bg: "#0f2a1a", color: "#4ade80", label: "Ready" },
  };
  const s = map[status] || map.rendering;
  return (
    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
