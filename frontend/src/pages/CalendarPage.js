import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, X, Send, Trash2, CheckCircle,
  Clock, Instagram, Save,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  setHours, setMinutes, getHours, parseISO, startOfDay, endOfDay,
} from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM → 11 PM

const STATUS_CFG = {
  draft:      { label: "Draft",      color: "#888888", bg: "#1e1e1e", border: "#2a2a2a" },
  scheduled:  { label: "Scheduled",  color: "#8080ff", bg: "#0d0d25", border: "#2a2a5a" },
  publishing: { label: "Publishing", color: "#2563eb", bg: "#0a1a2e", border: "#1a3a5a" },
  published:  { label: "Published",  color: "#34d399", bg: "#0a2016", border: "#14532d" },
  failed:     { label: "Failed",     color: "#f87171", bg: "#2a0a0a", border: "#7f1d1d" },
};

function statusCfg(status) { return STATUS_CFG[status] || STATUS_CFG.draft; }

function groupByDate(posts) {
  const map = {};
  for (const p of posts) {
    const key = p.scheduled_at
      ? format(parseISO(p.scheduled_at), "yyyy-MM-dd")
      : format(parseISO(p.created_at), "yyyy-MM-dd");
    if (!map[key]) map[key] = [];
    map[key].push(p);
  }
  return map;
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function formatHour(h) {
  if (h === 0)  return "12 AM";
  if (h < 12)   return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const user = useUser();
  const [posts, setPosts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [view, setView]                 = useState("month");
  const [selectedPost, setSelectedPost] = useState(null);

  const getRange = useCallback(() => {
    if (view === "month") {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return { start: startOfWeek(ms, { weekStartsOn: 1 }), end: endOfWeek(me, { weekStartsOn: 1 }) };
    }
    if (view === "week") {
      return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
    }
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }, [currentDate, view]);

  const fetchData = useCallback(async () => {
    try {
      const { start, end } = getRange();
      const params = {
        start: start.toISOString(),
        end:   end.toISOString(),
        ...(user?.client_id ? { client_id: user.client_id } : {}),
      };
      const resp = await axios.get(`${API}/calendar`, { params });
      setPosts(resp.data.posts || []);
    } catch {
      toast.error("Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [getRange, user?.client_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const id = setInterval(fetchData, 60000);
    const onVisibility = () => { if (document.visibilityState === "visible") fetchData(); };
    window.addEventListener("sc:refresh", fetchData);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("sc:refresh", fetchData);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchData]);

  const nav = (dir) => {
    if (view === "month") setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    else if (view === "week") setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1));
  };

  const handleDrop = async (postId, date, hour) => {
    const post = posts.find(p => p.id === postId);
    if (!post || (post.status !== "draft" && post.status !== "scheduled")) return;
    let dt = date;
    if (hour !== undefined) {
      dt = setMinutes(setHours(date, hour), 0);
    } else {
      const orig = post.scheduled_at ? parseISO(post.scheduled_at) : new Date();
      dt = setMinutes(setHours(date, getHours(orig)), orig.getMinutes());
    }
    try {
      const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.put(`${API}/posts/${postId}`, { scheduled_at: dt.toISOString() }, { headers });
      toast.success(`Rescheduled to ${format(dt, "MMM d, h:mm a")}`);
      fetchData();
    } catch { toast.error("Failed to reschedule"); }
  };

  const postsByDate = groupByDate(posts);

  const { start: rangeStart, end: rangeEnd } = getRange();
  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy")
    : view === "week"
      ? `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`
      : format(currentDate, "EEEE, MMMM d, yyyy");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0d0d0d" }}>

      {/* Header */}
      <div style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#ffffff", flex: 1 }}>Calendar</h1>

        {/* Nav controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => nav(-1)} style={navBtn}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} style={todayBtn}>Today</button>
          <button onClick={() => nav(1)} style={navBtn}>
            <ChevronRight size={15} />
          </button>
        </div>

        <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", minWidth: 180, textAlign: "center" }}>
          {headerLabel}
        </span>

        {/* View switcher */}
        <div style={{ display: "flex", background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}>
          {["month", "week", "day"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              background: view === v ? "#5B5BD6" : "transparent",
              color: view === v ? "#fff" : "#888888",
              border: "none", cursor: "pointer", textTransform: "capitalize",
              transition: "all 0.15s",
            }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", background: "#0d0d0d" }}>
        {/* Calendar area */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666666", fontSize: 13 }}>
              Loading calendar…
            </div>
          ) : view === "month" ? (
            <MonthView
              currentDate={currentDate}
              postsByDate={postsByDate}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
              onDayClick={d => { setCurrentDate(d); setView("day"); }}
            />
          ) : view === "week" ? (
            <WeekView
              currentDate={currentDate}
              posts={posts}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
            />
          ) : (
            <DayView
              currentDate={currentDate}
              posts={posts}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
            />
          )}
        </div>

        {/* Post detail panel */}
        {selectedPost && (
          <PostPanel
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            onUpdate={() => { setSelectedPost(null); fetchData(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ currentDate, postsByDate, onSelectPost, onDrop, onDayClick }) {
  const monthStart = startOfMonth(currentDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd     = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  const onDragOver  = e => { e.preventDefault(); e.currentTarget.style.background = "#1e1e3a"; };
  const onDragLeave = e => { e.currentTarget.style.background = ""; };
  const onDropDay   = (e, day) => {
    e.preventDefault();
    e.currentTarget.style.background = "";
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDrop(id, day);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #2a2a2a", background: "#161616" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#666666", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(90px, 1fr)" }}>
        {days.map(day => {
          const key      = format(day, "yyyy-MM-dd");
          const dayPosts = postsByDate[key] || [];
          const inMonth  = isSameMonth(day, currentDate);
          const today    = isToday(day);
          const maxShow  = 3;
          const overflow = dayPosts.length - maxShow;

          return (
            <div
              key={key}
              style={{
                border: "1px solid #2a2a2a",
                padding: "6px",
                background: today ? "#1a1a2e" : "#161616",
                opacity: inMonth ? 1 : 0.4,
                transition: "background 0.15s",
                cursor: "default",
              }}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={e => onDropDay(e, day)}
            >
              {/* Date number */}
              <button
                onClick={() => onDayClick(day)}
                style={{
                  width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: today ? 700 : 500,
                  background: today ? "#5B5BD6" : "transparent",
                  color: today ? "#fff" : "#cccccc",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 4, flexShrink: 0,
                }}
              >
                {format(day, "d")}
              </button>

              {/* Post pills */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {dayPosts.slice(0, maxShow).map(post => (
                  <MonthPostPill key={post.id} post={post} onClick={() => onSelectPost(post)} />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayClick(day)}
                    style={{ fontSize: 10, color: "#5B5BD6", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "1px 4px" }}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthPostPill({ post, onClick }) {
  const cfg = statusCfg(post.status);
  const time = post.scheduled_at ? format(parseISO(post.scheduled_at), "h:mm a") : null;
  const draggable = post.status === "draft" || post.status === "scheduled";

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData("text/plain", post.id); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "2px 5px",
        borderRadius: 5, cursor: "pointer", background: cfg.bg,
        border: `1px solid ${cfg.border}`, minWidth: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 500, color: cfg.color, flexShrink: 0, whiteSpace: "nowrap" }}>
        {time || cfg.label}
      </span>
      <span style={{ fontSize: 10, color: "#cccccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {truncate(post.caption || post.text, 18)}
      </span>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ currentDate, posts, onSelectPost, onDrop }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { weekStartsOn: 1 }) });
  const scrollRef = useRef(null);

  useEffect(() => {
    // Scroll to 8 AM on mount
    if (scrollRef.current) scrollRef.current.scrollTop = 2 * 64;
  }, []);

  const onDragOver  = e => { e.preventDefault(); e.currentTarget.style.background = "rgba(91,91,214,0.12)"; };
  const onDragLeave = e => { e.currentTarget.style.background = ""; };
  const onDropSlot  = (e, day, hour) => {
    e.preventDefault();
    e.currentTarget.style.background = "";
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDrop(id, day, hour);
  };

  const getPostsForSlot = (day, hour) =>
    posts.filter(p => {
      if (!p.scheduled_at) return false;
      const d = parseISO(p.scheduled_at);
      return isSameDay(d, day) && getHours(d) === hour;
    });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid #2a2a2a", background: "#161616", flexShrink: 0 }}>
        <div />
        {days.map(day => (
          <div key={day.toISOString()} style={{
            padding: "8px 4px", textAlign: "center",
            borderLeft: "1px solid #2a2a2a",
            background: isToday(day) ? "#1a1a2e" : "#161616",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#666666", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {format(day, "EEE")}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "50%", fontSize: 13, fontWeight: isToday(day) ? 700 : 500,
              background: isToday(day) ? "#5B5BD6" : "transparent",
              color: isToday(day) ? "#fff" : "#cccccc",
              margin: "2px auto 0",
            }}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {HOURS.map(hour => (
          <div key={hour} style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", minHeight: 64 }}>
            {/* Time label */}
            <div style={{ padding: "4px 8px 0 0", textAlign: "right", fontSize: 10, color: "#666666", fontWeight: 500, flexShrink: 0, borderRight: "1px solid #2a2a2a" }}>
              {formatHour(hour)}
            </div>
            {days.map(day => {
              const slotPosts = getPostsForSlot(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  style={{ borderLeft: "1px solid #2a2a2a", borderBottom: "1px solid #1e1e1e", padding: "2px 3px", background: isToday(day) ? "#1a1a2e" : "#161616", transition: "background 0.1s" }}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDropSlot(e, day, hour)}
                >
                  {slotPosts.map(post => <WeekPostCard key={post.id} post={post} onClick={() => onSelectPost(post)} />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekPostCard({ post, onClick }) {
  const cfg = statusCfg(post.status);
  const draggable = post.status === "draft" || post.status === "scheduled";
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData("text/plain", post.id); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        padding: "3px 6px", borderRadius: 6, marginBottom: 2, cursor: "pointer",
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        borderLeft: `3px solid ${cfg.color}`,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: cfg.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {post.scheduled_at ? format(parseISO(post.scheduled_at), "h:mm a") : cfg.label}
      </div>
      <div style={{ fontSize: 10, color: "#cccccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {truncate(post.caption || post.text, 22)}
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ currentDate, posts, onSelectPost, onDrop }) {
  const scrollRef = useRef(null);
  const dayPosts  = posts.filter(p => {
    const d = p.scheduled_at ? parseISO(p.scheduled_at) : parseISO(p.created_at);
    return isSameDay(d, currentDate);
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 2 * 80;
  }, [currentDate]);

  const onDragOver  = e => { e.preventDefault(); e.currentTarget.style.background = "rgba(91,91,214,0.12)"; };
  const onDragLeave = e => { e.currentTarget.style.background = ""; };
  const onDropSlot  = (e, hour) => {
    e.preventDefault();
    e.currentTarget.style.background = "";
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDrop(id, currentDate, hour);
  };

  const getPostsForHour = hour =>
    dayPosts.filter(p => p.scheduled_at && getHours(parseISO(p.scheduled_at)) === hour);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Day header */}
      <div style={{ background: "#161616", borderBottom: "1px solid #2a2a2a", padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>{format(currentDate, "EEEE, MMMM d, yyyy")}</div>
        <div style={{ fontSize: 12, color: "#666666", marginTop: 2 }}>
          {dayPosts.length === 0 ? "No posts scheduled" : `${dayPosts.length} post${dayPosts.length > 1 ? "s" : ""} scheduled`}
        </div>
      </div>

      {/* Time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {HOURS.map(hour => {
          const hourPosts = getPostsForHour(hour);
          return (
            <div
              key={hour}
              style={{ display: "grid", gridTemplateColumns: "80px 1fr", minHeight: 80, borderBottom: "1px solid #1e1e1e", transition: "background 0.1s" }}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={e => onDropSlot(e, hour)}
            >
              <div style={{ padding: "10px 12px 0 16px", textAlign: "right", fontSize: 11, color: "#666666", fontWeight: 500, borderRight: "1px solid #2a2a2a" }}>
                {formatHour(hour)}
              </div>
              <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {hourPosts.map(post => <DayPostCard key={post.id} post={post} onClick={() => onSelectPost(post)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayPostCard({ post, onClick }) {
  const cfg = statusCfg(post.status);
  const draggable = post.status === "draft" || post.status === "scheduled";
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData("text/plain", post.id); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        padding: "10px 14px", borderRadius: 12, cursor: "pointer",
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {post.scheduled_at && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: cfg.color }}>
              <Clock size={11} /> {format(parseISO(post.scheduled_at), "h:mm a")}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#161616", border: `1px solid ${cfg.border}`, color: cfg.color }}>
            {cfg.label}
          </span>
          {(post.kind === "video" || post.content_type === "video") && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#eff6ff", color: "#2563eb" }}>Video</span>
          )}
          {post.content_type === "carousel" && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#f0fdf4", color: "#059669" }}>Carousel</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#cccccc", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {post.caption || post.text || "No caption"}
        </p>
        {post.platform && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
            <Instagram size={11} style={{ color: "#666666" }} />
            <span style={{ fontSize: 11, color: "#666666", textTransform: "capitalize" }}>{post.platform}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Detail Panel ────────────────────────────────────────────────────────

function PostPanel({ post, onClose, onUpdate }) {
  const { role, permissions } = useUser();
  const calp = role === "owner"
    ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.calendar ?? { view: true, create: true, edit: true, delete: true });

  const cfg = statusCfg(post.status);
  const isVideo    = post.kind === "video" || post.content_type === "video";
  const isViewOnly = post.status === "published";

  const [form, setForm]         = useState({
    text: post.caption || post.text || "",
    scheduled_at: post.scheduled_at ? format(parseISO(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
  });
  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishingRef               = useRef(false);

  useEffect(() => {
    setForm({
      text: post.caption || post.text || "",
      scheduled_at: post.scheduled_at ? format(parseISO(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
    });
  }, [post]);

  const authHeaders = () => {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const savePost = async () => {
    setSaving(true);
    try {
      const update = {
        caption: form.text,
        ...(form.scheduled_at ? { scheduled_at: new Date(form.scheduled_at).toISOString() } : {}),
      };
      await axios.put(`${API}/posts/${post.id}`, update, { headers: authHeaders() });
      toast.success("Post updated");
      onUpdate();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const approvePost = async () => {
    try {
      await axios.post(`${API}/posts/${post.id}/approve`, {}, { headers: authHeaders() });
      toast.success("Post approved and scheduled");
      onUpdate();
    } catch { toast.error("Failed to approve"); }
  };

  const publishPost = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      const resp = await axios.post(`${API}/posts/${post.id}/publish`, {}, { headers: authHeaders(), timeout: 60000 });
      if (resp.data.status === "published") toast.success("Post published!");
      else toast.error(resp.data.error_message || "Publish failed");
      onUpdate();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to publish");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  const deletePost = async () => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axios.delete(`${API}/posts/${post.id}`, { headers: authHeaders() });
      toast.success("Post deleted");
      onUpdate();
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div style={{
      width: 340, flexShrink: 0,
      background: "#161616", borderLeft: "1px solid #2a2a2a",
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
            {post.platform && (
              <span style={{ fontSize: 11, color: "#666666", textTransform: "capitalize" }}>{post.platform}</span>
            )}
          </div>
          {post.scheduled_at && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#888888" }}>
              <Clock size={12} />
              {format(parseISO(post.scheduled_at), "MMM d, yyyy · h:mm a")}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ color: "#666666", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#161616" }}>

        {/* Video player */}
        {isVideo && post.r2_video_url && (
          <video src={post.r2_video_url} controls style={{ width: "100%", borderRadius: 10, marginBottom: 12, maxHeight: 200, background: "#000" }} />
        )}

        {/* Image preview */}
        {post.image_url && !isVideo && (
          <div style={{ marginBottom: 12 }}>
            <img src={post.image_url} alt="Post" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 180 }} />
          </div>
        )}

        {/* Caption / text */}
        <FormLabel>Caption</FormLabel>
        <textarea
          value={form.text}
          onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
          disabled={isViewOnly}
          rows={5}
          placeholder="Post caption…"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13, lineHeight: 1.5,
            color: "#ffffff", background: isViewOnly ? "#1e1e1e" : "#1a1a1a",
            border: "1.5px solid #2a2a2a", borderRadius: 10, outline: "none", resize: "vertical",
            fontFamily: "inherit", marginBottom: 12, opacity: isViewOnly ? 0.7 : 1,
          }}
          onFocus={e => e.target.style.borderColor = "#5B5BD6"}
          onBlur={e => e.target.style.borderColor = "#2a2a2a"}
        />

        {/* Hashtags */}
        {post.hashtags?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <FormLabel>Hashtags</FormLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {post.hashtags.map((tag, i) => (
                <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#1e1e3a", color: "#8080ff", border: "1px solid #3a3a6a" }}>
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Schedule time */}
        <FormLabel>Scheduled At</FormLabel>
        <input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
          disabled={isViewOnly}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13,
            color: "#ffffff", background: isViewOnly ? "#1e1e1e" : "#1a1a1a",
            border: "1.5px solid #2a2a2a", borderRadius: 10, outline: "none",
            fontFamily: "inherit", marginBottom: 12, colorScheme: "dark",
            opacity: isViewOnly ? 0.7 : 1,
          }}
          onFocus={e => e.target.style.borderColor = "#5B5BD6"}
          onBlur={e => e.target.style.borderColor = "#2a2a2a"}
        />

        {/* Error */}
        {post.error_message && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fca5a5", fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
            {post.error_message}
          </div>
        )}

        {/* Meta */}
        {(post.published_at || post.ai_generated) && (
          <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10, marginTop: 4 }}>
            {post.ai_generated && (
              <div style={{ fontSize: 11, color: "#666666", marginBottom: 3 }}>AI Generated</div>
            )}
            {post.published_at && (
              <div style={{ fontSize: 11, color: "#666666" }}>
                Published {format(parseISO(post.published_at), "MMM d, h:mm a")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2a2a", display: "flex", flexDirection: "column", gap: 8 }}>
        {!isViewOnly && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={savePost} disabled={saving} style={actionBtn("#5B5BD6", "#fff", "#4848C0")}>
              <Save size={12} /> {saving ? "Saving…" : "Save"}
            </button>
            {post.status === "draft" && (
              <button onClick={approvePost} style={actionBtn("#ecfdf5", "#059669", "#dcfce7", "1px solid #6ee7b7")}>
                <CheckCircle size={12} /> Approve
              </button>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {post.status !== "publishing" && (
            <button onClick={publishPost} disabled={publishing} style={actionBtn("#eff6ff", "#2563eb", "#dbeafe", "1px solid #bfdbfe")}>
              <Send size={12} style={publishing ? { animation: "pulse 1s infinite" } : {}} />
              {publishing ? "Publishing…" : post.status === "published" ? "Re-publish" : post.status === "failed" ? "Retry" : "Publish Now"}
            </button>
          )}
          {calp.delete && (
            <button onClick={deletePost} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 14px", fontSize: 12, fontWeight: 600, borderRadius: 10, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", cursor: "pointer", flexShrink: 0 }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FormLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#cccccc", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function actionBtn(bg, color, hoverBg, border) {
  return {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: "9px 12px", fontSize: 12, fontWeight: 600, borderRadius: 10,
    border: border || "none", background: bg, color, cursor: "pointer",
  };
}

const navBtn = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid #2a2a2a",
  background: "#161616", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "#888888",
};

const todayBtn = {
  padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8,
  border: "1.5px solid #2a2a2a", background: "#161616", color: "#cccccc", cursor: "pointer",
};
