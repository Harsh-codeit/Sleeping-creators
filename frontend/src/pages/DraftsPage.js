import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowLeft, Calendar, ChevronLeft, ChevronRight,
  Clock, Send, Trash2, Sparkles, FileText, Layers,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function authHeaders() {
  const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Simple slide card that works without a template object
function SlideCard({ slide, total, idx }) {
  const bg = "linear-gradient(145deg, #1a1a3a, #0d0d0d)";
  return (
    <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: 24, boxSizing: "border-box", position: "relative" }}>
      <div style={{ width: 28, height: 3, background: "#5B5BD6", borderRadius: 99, marginBottom: 14 }} />
      <p style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.35 }}>
        {slide.heading}
      </p>
      {slide.body && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 10, lineHeight: 1.6 }}>
          {slide.body}
        </p>
      )}
      <span style={{ position: "absolute", top: 14, right: 14, fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 700 }}>
        {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
}

function DraftCard({ item, type, onScheduled, onDeleted, onNavigate }) {
  const [expanded, setExpanded]   = useState(false);
  const [slideIdx, setSlideIdx]   = useState(0);
  const [scheduledAt, setAt]      = useState("");
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);

  const slides = type === "carousel" ? (item.slides || []) : [];
  const allSlides = type === "carousel"
    ? [{ heading: slides[0]?.heading || item.topic, body: "Cover", slide_number: 0, isCover: true }, ...slides]
    : [];
  const hasImages = (item.slide_image_urls || []).length > 0;

  const schedule = async () => {
    if (!scheduledAt) return toast.error("Pick a date and time");
    setSaving(true);
    try {
      if (type === "carousel") {
        const { data: post } = await axios.post(`${API}/posts`, {
          content_type: "carousel",
          platform: "instagram",
          caption: item.caption || "",
          hashtags: item.hashtags || [],
          slides: item.slides || [],
          slide_image_urls: item.slide_image_urls || [],
          carousel_id: item.id,
          scheduled_at: new Date(scheduledAt).toISOString(),
          status: "draft",
        }, { headers: authHeaders() });
        await axios.post(`${API}/posts/${post.id}/approve`, {}, { headers: authHeaders() });
      } else {
        await axios.put(`${API}/posts/${item.id}`, { scheduled_at: new Date(scheduledAt).toISOString() }, { headers: authHeaders() });
        await axios.post(`${API}/posts/${item.id}/approve`, {}, { headers: authHeaders() });
      }
      const schedDate = new Date(scheduledAt);
      toast.success(`Scheduled for ${schedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${schedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
      onScheduled(item.id);
      onNavigate("/calendar");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Schedule failed");
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Delete this draft?")) return;
    setDeleting(true);
    try {
      if (type === "carousel") {
        await axios.delete(`${API}/carousels/${item.id}`, { headers: authHeaders() });
      } else {
        await axios.delete(`${API}/posts/${item.id}`, { headers: authHeaders() });
      }
      onDeleted(item.id);
    } catch {
      toast.error("Could not delete draft");
      setDeleting(false);
    }
  };

  const publishNow = async () => {
    setSaving(true);
    try {
      if (type === "carousel") {
        const { data: post } = await axios.post(`${API}/posts`, {
          content_type: "carousel",
          platform: "instagram",
          caption: item.caption || "",
          hashtags: item.hashtags || [],
          slides: item.slides || [],
          slide_image_urls: item.slide_image_urls || [],
          carousel_id: item.id,
          scheduled_at: new Date().toISOString(),
          status: "draft",
        }, { headers: authHeaders() });
        await axios.post(`${API}/posts/${post.id}/publish`, {}, { headers: authHeaders() });
      } else {
        await axios.post(`${API}/posts/${item.id}/publish`, {}, { headers: authHeaders() });
      }
      toast.success("Published!");
      onScheduled(item.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "#161616",
      border: `1.5px solid ${expanded ? "#3a3a6a" : "#2a2a2a"}`,
      borderRadius: 20,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* ── Collapsed header (always visible) ── */}
      <div
        onClick={() => { setExpanded(e => !e); setSlideIdx(0); }}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }}>

        {/* Thumbnail */}
        <div style={{ width: 52, height: 66, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#1e1e3a" }}>
          {hasImages
            ? <img src={item.slide_image_urls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1e1e3a,#0d0d0d)" }}>
                <div style={{ width: 16, height: 2, background: "#5B5BD6", borderRadius: 99 }} />
              </div>
            )
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.topic || item.caption?.slice(0, 50) || "Untitled draft"}
          </p>
          <p style={{ fontSize: 11, color: "#555", margin: "3px 0 0" }}>
            {type === "carousel"
              ? `${slides.length} slides · ${timeAgo(item.created_at)}`
              : `Post draft · ${timeAgo(item.created_at)}`
            }
          </p>
        </div>

        {/* Expand chevron */}
        <div style={{ color: "#444", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
          <ChevronRight size={16} />
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid #2a2a2a" }}>

          {/* Slide viewer — only for carousels */}
          {type === "carousel" && allSlides.length > 0 && (
            <div style={{ position: "relative", aspectRatio: "4/5", background: "#0d0d0d" }}>
              {hasImages ? (
                <img
                  src={item.slide_image_urls[slideIdx] || item.slide_image_urls[0]}
                  alt={`Slide ${slideIdx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <SlideCard
                  slide={allSlides[slideIdx]}
                  total={allSlides.length}
                  idx={slideIdx}
                />
              )}

              {/* Arrows */}
              {allSlides.length > 1 && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setSlideIdx(i => Math.max(0, i - 1)); }}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setSlideIdx(i => Math.min(allSlides.length - 1, i + 1)); }}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                    <ChevronRight size={18} />
                  </button>
                  {/* Dot indicators */}
                  <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                    {allSlides.map((_, i) => (
                      <div key={i} onClick={e => { e.stopPropagation(); setSlideIdx(i); }}
                        style={{ width: i === slideIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === slideIdx ? "#5B5BD6" : "rgba(255,255,255,0.25)", cursor: "pointer", transition: "width 0.2s" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Caption */}
          {item.caption && (
            <div style={{ padding: "14px 16px 0" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 6px" }}>Caption</p>
              <p style={{ fontSize: 13, color: "#ddd", lineHeight: 1.6, margin: 0 }}>{item.caption}</p>
              {item.hashtags?.length > 0 && (
                <p style={{ fontSize: 12, color: "#5B5BD6", marginTop: 6, lineHeight: 1.7 }}>
                  {(item.hashtags || []).map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Datetime picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", borderRadius: 12, padding: "10px 14px", border: "1px solid #2a2a2a" }}>
              <Clock size={14} style={{ color: "#555", flexShrink: 0 }} />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setAt(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, background: "none", border: "none", color: "#ccc", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button
                onClick={e => { e.stopPropagation(); discard(); }}
                disabled={deleting}
                style={{ padding: "11px 0", borderRadius: 12, border: "1.5px solid #3a1a1a", background: "transparent", color: "#f87171", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <Trash2 size={13} /> Discard
              </button>
              <button
                onClick={e => { e.stopPropagation(); schedule(); }}
                disabled={saving || !scheduledAt}
                style={{ padding: "11px 0", borderRadius: 12, border: `1.5px solid ${scheduledAt ? "#5B5BD6" : "#2a2a2a"}`, background: "transparent", color: scheduledAt ? "#5B5BD6" : "#444", fontWeight: 600, fontSize: 12, cursor: scheduledAt ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <Calendar size={13} /> {saving ? "Saving…" : "Schedule"}
              </button>
              <button
                onClick={e => { e.stopPropagation(); publishNow(); }}
                disabled={saving}
                style={{ padding: "11px 0", borderRadius: 12, border: "none", background: "#5B5BD6", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, boxShadow: "0 3px 10px rgba(91,91,214,0.28)" }}>
                <Send size={13} /> Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DraftsPage() {
  const navigate = useNavigate();
  const [carousels, setCarousels] = useState([]);
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("all"); // all | carousels | posts

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, pRes] = await Promise.allSettled([
          axios.get(`${API}/carousels?limit=50`, { headers: authHeaders() }),
          axios.get(`${API}/posts?limit=50`, { headers: authHeaders() }),
        ]);
        if (cRes.status === "fulfilled") {
          const data = cRes.value.data;
          setCarousels((data?.carousels || data || []).filter(c => c.status === "draft"));
        }
        if (pRes.status === "fulfilled") {
          const data = pRes.value.data;
          setPostsFiltered(Array.isArray(data) ? data : (data?.posts || []));
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  function setPostsFiltered(all) {
    setPosts(all.filter(p => p.status === "draft"));
  }

  const handleScheduled = (id) => {
    setCarousels(c => c.filter(x => x.id !== id));
    setPosts(p => p.filter(x => x.id !== id));
  };

  const handleDeleted = (id) => {
    setCarousels(c => c.filter(x => x.id !== id));
    setPosts(p => p.filter(x => x.id !== id));
  };

  const items =
    tab === "carousels" ? carousels.map(c => ({ ...c, _type: "carousel" })) :
    tab === "posts"     ? posts.map(p => ({ ...p, _type: "post" })) :
    [
      ...carousels.map(c => ({ ...c, _type: "carousel" })),
      ...posts.map(p => ({ ...p, _type: "post" })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalCount = carousels.length + posts.length;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0d0d0d" }}>
      {/* Header */}
      <div style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0 0" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: "4px 8px 4px 0", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontWeight: 700, fontSize: 18, color: "#fff", margin: 0 }}>Drafts</h1>
          </div>
          <span style={{ fontSize: 12, color: "#555" }}>{totalCount} {totalCount === 1 ? "item" : "items"}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: 14 }}>
          {[
            { key: "all",       label: `All (${totalCount})` },
            { key: "carousels", label: `Carousels (${carousels.length})` },
            { key: "posts",     label: `Posts (${posts.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 500, background: "none", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${tab === t.key ? "#5B5BD6" : "transparent"}`,
                color: tab === t.key ? "#5B5BD6" : "#666",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 80px" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 88, background: "#161616", borderRadius: 20, border: "1.5px solid #2a2a2a" }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Sparkles size={22} style={{ color: "#3a3a6a" }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, color: "#ccc", margin: 0 }}>No drafts yet</p>
            <p style={{ fontSize: 13, color: "#555", marginTop: 6 }}>Generate a carousel to start — it'll appear here</p>
            <button
              onClick={() => navigate("/create")}
              style={{ marginTop: 18, padding: "11px 24px", background: "#5B5BD6", color: "#fff", fontWeight: 600, fontSize: 13, borderRadius: 12, border: "none", cursor: "pointer" }}>
              Create Content
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Info tip */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#0d0d1a", borderRadius: 12, border: "1px solid #2a2a4a" }}>
              <FileText size={13} style={{ color: "#5B5BD6", flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: "#666", margin: 0 }}>
                Tap a card to preview slides, then schedule or publish directly.
              </p>
            </div>

            {items.map(item => (
              <DraftCard
                key={`${item._type}-${item.id}`}
                item={item}
                type={item._type}
                onScheduled={handleScheduled}
                onDeleted={handleDeleted}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
