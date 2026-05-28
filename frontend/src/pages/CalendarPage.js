import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, X, Send, Trash2, CheckCircle,
  Clock, GripVertical, Plus, Wand2, RefreshCw, Copy
} from "lucide-react";
import GeneratePostModal from "../components/GeneratePostModal";
import { useUser } from "../context/UserContext";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  setHours, setMinutes, getHours, parseISO, startOfDay, endOfDay
} from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CLIENT_COLORS = [
  "#E1306C", "#1877F2", "#0A66C2", "#1DA1F2",
  "#FF4500", "#6B5CE7", "#F59E0B", "#10B981",
  "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6",
];

const PLATFORM_SHORT = {
  instagram: "IG", facebook: "FB", linkedin: "LI",
  twitter: "TW", youtube: "YT", threads: "TH",
  tiktok: "TK", pinterest: "PI",
};

const PLATFORMS = [
  "instagram", "facebook", "twitter", "linkedin",
  "tiktok", "youtube", "threads", "pinterest",
];

const STATUS_BADGE = {
  draft:      "border-zinc-700 text-zinc-400",
  scheduled:  "border-amber-700 text-amber-400",
  publishing: "border-blue-700 text-blue-400",
  published:  "border-emerald-700 text-emerald-400",
  failed:     "border-red-900 text-red-400",
};

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6AM to 11PM

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientColor(clientId, clientColorMap) {
  return clientColorMap[clientId] || "#6B7280";
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function groupPostsByDate(posts) {
  const map = {};
  for (const p of posts) {
    const dateKey = p.scheduled_at
      ? format(parseISO(p.scheduled_at), "yyyy-MM-dd")
      : format(parseISO(p.created_at), "yyyy-MM-dd");
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push(p);
  }
  return map;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { role, permissions } = useUser();
  const calp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.calendar ?? { view: true, create: true, edit: true, delete: true });
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [showGenModal, setShowGenModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month"); // month | week | day
  const [filterClient, setFilterClient] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const [clientColorMap, setClientColorMap] = useState({});

  // Build client color map
  useEffect(() => {
    if (clients.length) {
      const map = {};
      clients.forEach((c, i) => { map[c.id] = CLIENT_COLORS[i % CLIENT_COLORS.length]; });
      setClientColorMap(map);
    }
  }, [clients]);

  // Compute date range for current view
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
        end: end.toISOString(),
      };
      if (filterClient) params.client_id = filterClient;
      if (filterPlatform) params.platform = filterPlatform;

      const [calResp, clientsResp] = await Promise.all([
        axios.get(`${API}/calendar`, { params }),
        axios.get(`${API}/clients`),
      ]);
      setPosts(calResp.data.posts);
      setClients(clientsResp.data);
    } catch {
      toast.error("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [getRange, filterClient, filterPlatform]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 60s to pick up webhook-driven status changes
  useEffect(() => {
    const id = setInterval(() => { fetchData(); }, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  const navigate = (dir) => {
    if (view === "month") setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    else if (view === "week") setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1));
  };

  const goToday = () => setCurrentDate(new Date());

  const goToDay = (date) => {
    setCurrentDate(date);
    setView("day");
  };

  const handleDrop = async (postId, newDate, newHour) => {
    const post = posts.find(p => p.id === postId);
    if (!post || (post.status !== "draft" && post.status !== "scheduled")) return;

    let newScheduled = newDate;
    if (newHour !== undefined) {
      newScheduled = setMinutes(setHours(newDate, newHour), 0);
    } else {
      // Monthly: keep original time, change date
      const orig = post.scheduled_at ? parseISO(post.scheduled_at) : new Date();
      newScheduled = setMinutes(setHours(newDate, getHours(orig)), orig.getMinutes());
    }

    try {
      await axios.put(`${API}/posts/${postId}`, { scheduled_at: newScheduled.toISOString() });
      toast.success(`Post rescheduled to ${format(newScheduled, "MMM d, h:mm a")}`);
      fetchData();
    } catch {
      toast.error("Failed to reschedule");
    }
  };

  const filteredPosts = filterKind
    ? posts.filter(p => {
        if (filterKind === "video") return p.kind === "video";
        if (filterKind === "carousel") return p.kind === "carousel" || p.content_type === "carousel";
        return true;
      })
    : posts;

  const postsByDate = groupPostsByDate(filteredPosts);

  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy")
    : view === "week"
      ? `${format(getRange().start, "MMM d")} — ${format(getRange().end, "MMM d, yyyy")}`
      : format(currentDate, "EEEE, MMMM d, yyyy");

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{filteredPosts.length} posts in view</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={goToday} className="px-3 py-2 text-xs font-mono border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-2 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronRight size={14} />
          </button>
          <div className="ml-3 flex border border-zinc-800">
            {["month", "week", "day"].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-xs font-mono capitalize transition-colors ${
                  view === v ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {calp.create && (
            <button
              onClick={() => setShowGenModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-150"
            >
              <Wand2 size={13} />
              Generate Post
            </button>
          )}
        </div>
      </div>

      {/* Period label + filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-zinc-300">{headerLabel}</div>
        <div className="flex gap-3">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none"
          >
            <option value="">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none"
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <select
            value={filterKind}
            onChange={e => setFilterKind(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="video">Video</option>
            <option value="carousel">Carousel</option>
          </select>
        </div>
      </div>

      {/* Calendar grid + sidebar */}
      <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
        <div className={`flex-1 min-w-0 overflow-auto transition-all duration-200 ${selectedPost ? "mr-0" : ""}`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING CALENDAR...</div>
          ) : view === "month" ? (
            <MonthView
              currentDate={currentDate}
              postsByDate={postsByDate}
              clientColorMap={clientColorMap}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
              onDayClick={goToDay}
            />
          ) : view === "week" ? (
            <WeekView
              currentDate={currentDate}
              posts={filteredPosts}
              clientColorMap={clientColorMap}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
            />
          ) : (
            <DayView
              currentDate={currentDate}
              posts={filteredPosts}
              clientColorMap={clientColorMap}
              onSelectPost={setSelectedPost}
              onDrop={handleDrop}
            />
          )}
        </div>

        {/* Right sidebar */}
        {selectedPost && (
          <PostSidebar
            post={selectedPost}
            clientColor={getClientColor(selectedPost.client_id, clientColorMap)}
            onClose={() => setSelectedPost(null)}
            onUpdate={() => { setSelectedPost(null); fetchData(); }}
          />
        )}
      </div>
      <GeneratePostModal
        open={showGenModal}
        onClose={() => setShowGenModal(false)}
        clients={clients}
        onGenerated={() => {
          fetchData();
          setShowGenModal(false);
        }}
      />
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ currentDate, postsByDate, clientColorMap, onSelectPost, onDrop, onDayClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add("border-zinc-600", "border-dashed"); };
  const handleDragLeave = (e) => { e.currentTarget.classList.remove("border-zinc-600", "border-dashed"); };
  const handleDropOnDay = (e, day) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-zinc-600", "border-dashed");
    const postId = e.dataTransfer.getData("text/plain");
    if (postId) onDrop(postId, day);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-zinc-800">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const dayPosts = postsByDate[key] || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const maxShow = 2;
          const overflow = dayPosts.length - maxShow;

          return (
            <div
              key={key}
              className={`border border-zinc-800/50 p-1.5 min-h-[100px] transition-colors ${
                !inMonth ? "opacity-30" : ""
              } ${today ? "bg-zinc-900/60" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnDay(e, day)}
            >
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => onDayClick(day)}
                  className={`text-xs font-mono w-6 h-6 flex items-center justify-center hover:bg-zinc-800 transition-colors ${
                    today ? "bg-white text-black font-bold" : "text-zinc-400"
                  }`}
                >
                  {format(day, "d")}
                </button>
                {dayPosts.length === 0 && inMonth && (
                  <a
                    href={`/queue?schedule_date=${key}`}
                    className="opacity-0 hover:opacity-100 p-0.5 text-zinc-600 hover:text-zinc-400 transition-all"
                    title={`Create post for ${format(day, "MMM d")}`}
                  >
                    <Plus size={10} />
                  </a>
                )}
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, maxShow).map(post => (
                  <MiniCard
                    key={post.id}
                    post={post}
                    color={getClientColor(post.client_id, clientColorMap)}
                    onClick={() => onSelectPost(post)}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayClick(day)}
                    className="text-[9px] font-mono text-zinc-500 hover:text-white pl-1 transition-colors"
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

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ currentDate, posts, clientColorMap, onSelectPost, onDrop }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { weekStartsOn: 1 }) });
  const scrollRef = useRef(null);

  useEffect(() => {
    // Scroll to 8AM on mount
    if (scrollRef.current) scrollRef.current.scrollTop = 2 * 60; // 2 rows * 60px = 8AM
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add("bg-zinc-800/40"); };
  const handleDragLeave = (e) => { e.currentTarget.classList.remove("bg-zinc-800/40"); };
  const handleDropOnSlot = (e, day, hour) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-zinc-800/40");
    const postId = e.dataTransfer.getData("text/plain");
    if (postId) onDrop(postId, day, hour);
  };

  // Map posts to their hour slot
  const getPostsForSlot = (day, hour) => {
    return posts.filter(p => {
      if (!p.scheduled_at) return false;
      const d = parseISO(p.scheduled_at);
      return isSameDay(d, day) && getHours(d) === hour;
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-zinc-800">
        <div />
        {days.map(day => (
          <div key={day.toISOString()} className={`py-2 text-center border-l border-zinc-800/50 ${isToday(day) ? "bg-zinc-900/60" : ""}`}>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">{format(day, "EEE")}</div>
            <div className={`text-sm font-mono ${isToday(day) ? "text-white font-bold" : "text-zinc-400"}`}>{format(day, "d")}</div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] min-h-[60px]">
            <div className="py-1 pr-2 text-right text-[10px] font-mono text-zinc-600 border-r border-zinc-800/50">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>
            {days.map(day => {
              const slotPosts = getPostsForSlot(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="border-l border-b border-zinc-800/30 px-1 py-0.5 transition-colors"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnSlot(e, day, hour)}
                >
                  {slotPosts.map(post => (
                    <TimeCard
                      key={post.id}
                      post={post}
                      color={getClientColor(post.client_id, clientColorMap)}
                      onClick={() => onSelectPost(post)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ currentDate, posts, clientColorMap, onSelectPost, onDrop }) {
  const scrollRef = useRef(null);
  const dayPosts = posts.filter(p => {
    const d = p.scheduled_at ? parseISO(p.scheduled_at) : parseISO(p.created_at);
    return isSameDay(d, currentDate);
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 2 * 80;
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add("bg-zinc-800/40"); };
  const handleDragLeave = (e) => { e.currentTarget.classList.remove("bg-zinc-800/40"); };
  const handleDropOnSlot = (e, hour) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-zinc-800/40");
    const postId = e.dataTransfer.getData("text/plain");
    if (postId) onDrop(postId, currentDate, hour);
  };

  const getPostsForHour = (hour) => {
    return dayPosts.filter(p => {
      if (!p.scheduled_at) return false;
      return getHours(parseISO(p.scheduled_at)) === hour;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="py-3 px-4 border-b border-zinc-800">
        <div className={`text-sm font-mono ${isToday(currentDate) ? "text-white font-bold" : "text-zinc-300"}`}>
          {format(currentDate, "EEEE, MMMM d")}
        </div>
        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{dayPosts.length} posts</div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {HOURS.map(hour => {
          const hourPosts = getPostsForHour(hour);
          return (
            <div
              key={hour}
              className="grid grid-cols-[80px_1fr] min-h-[80px] border-b border-zinc-800/30 transition-colors"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnSlot(e, hour)}
            >
              <div className="py-2 pr-3 text-right text-xs font-mono text-zinc-600 border-r border-zinc-800/50">
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
              <div className="p-2 space-y-1.5">
                {hourPosts.map(post => (
                  <DayCard
                    key={post.id}
                    post={post}
                    color={getClientColor(post.client_id, clientColorMap)}
                    onClick={() => onSelectPost(post)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Post Cards ───────────────────────────────────────────────────────────────

function slideCount(post) {
  return (
    post?.carousel_data?.slides?.length ||
    post?.carousel_data?.exported_images?.length ||
    0
  );
}

function MiniCard({ post, color, onClick }) {
  const draggable = post.status === "draft" || post.status === "scheduled";
  const onDragStart = (e) => {
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const slides = slideCount(post);

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`flex items-start gap-1.5 px-1.5 py-1 rounded-sm cursor-pointer hover:bg-zinc-800 transition-colors text-left ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-zinc-300 font-mono truncate leading-tight">
          {truncate(post.text, 22)}
        </div>
        <div className="text-[9px] text-zinc-500 font-mono truncate flex items-center gap-1">
          {post.client_name} · {PLATFORM_SHORT[post.platform] || post.platform}
          {(post.kind === "video" || post.content_type === "video") && (
            <span className="text-[7px] font-mono px-1 py-0 border border-cyan-700 text-cyan-400 leading-tight">
              VIDEO
            </span>
          )}
          {slides > 0 && (
            <span className="text-[7px] font-mono px-1 py-0 border border-zinc-600 text-zinc-400 leading-tight">
              {slides}sl
            </span>
          )}
          <span className={`text-[7px] font-mono px-1 py-0 border leading-tight ${STATUS_BADGE[post.status] || "border-zinc-700 text-zinc-500"}`}>
            {post.status?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

function TimeCard({ post, color, onClick }) {
  const draggable = post.status === "draft" || post.status === "scheduled";
  const onDragStart = (e) => {
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const slides = slideCount(post);

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-zinc-300 font-mono truncate">{post.client_name}</div>
        <div className="text-[9px] text-zinc-500 font-mono truncate flex items-center gap-1">
          {PLATFORM_SHORT[post.platform] || post.platform} · {post.content_type === "carousel" ? "Carousel" : "Post"}
          {(post.kind === "video" || post.content_type === "video") && (
            <span className="text-[7px] font-mono px-1 py-0 border border-cyan-700 text-cyan-400 leading-tight">
              VIDEO
            </span>
          )}
          {slides > 0 && (
            <span className="text-[7px] font-mono px-1 py-0 border border-zinc-600 text-zinc-400 leading-tight">
              {slides} slides
            </span>
          )}
          <span className={`text-[7px] font-mono px-1 py-0 border leading-tight ${STATUS_BADGE[post.status] || "border-zinc-700 text-zinc-500"}`}>
            {post.status?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

function DayCard({ post, color, onClick }) {
  const draggable = post.status === "draft" || post.status === "scheduled";
  const onDragStart = (e) => {
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const slides = slideCount(post);

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {draggable && <GripVertical size={12} className="text-zinc-700 flex-shrink-0 mt-0.5" />}
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-white font-mono truncate">{post.client_name}</span>
          <span className="text-[9px] font-mono text-zinc-500">{PLATFORM_SHORT[post.platform] || post.platform}</span>
          {slides > 0 && (
            <span className="text-[8px] font-mono px-1 py-0.5 border border-zinc-600 text-zinc-400">
              {slides} slides
            </span>
          )}
          <span className={`text-[8px] font-mono px-1 py-0.5 border ${STATUS_BADGE[post.status] || "border-zinc-700 text-zinc-500"}`}>
            {post.status?.toUpperCase()}
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 leading-relaxed">{post.text}</p>
        {post.scheduled_at && (
          <div className="flex items-center gap-1 mt-1">
            <Clock size={9} className="text-zinc-600" />
            <span className="text-[9px] font-mono text-zinc-600">{format(parseISO(post.scheduled_at), "h:mm a")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Sidebar ─────────────────────────────────────────────────────────────

function PostSidebar({ post, clientColor, onClose, onUpdate }) {
  const { role, permissions } = useUser();
  const calp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.calendar ?? { view: true, create: true, edit: true, delete: true });
  const totalSlides = slideCount(post);
  const isVideo = post.kind === "video";
  const [form, setForm] = useState({
    text: post.caption || post.text || "",
    platform: post.platform || "instagram",
    scheduled_at: post.scheduled_at ? format(parseISO(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
    slideCount: totalSlides,
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const publishingRef = useRef(false);

  // Sync form when post changes
  useEffect(() => {
    const sc = slideCount(post);
    setForm({
      text: post.caption || post.text || "",
      platform: post.platform || "instagram",
      scheduled_at: post.scheduled_at ? format(parseISO(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
      slideCount: sc,
    });
  }, [post]);

  const isViewOnly = post.status === "published";

  const savePost = async () => {
    setSaving(true);
    try {
      const update = {
        text: form.text,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
      };
      // Trim slides if count changed
      if (totalSlides > 0 && form.slideCount !== totalSlides) {
        const n = form.slideCount;
        const cd = post.carousel_data || {};
        update.carousel_data = {
          ...cd,
          slides: (cd.slides || []).slice(0, n),
          ...(cd.exported_images ? { exported_images: cd.exported_images.slice(0, n) } : {}),
        };
      }
      await axios.put(`${API}/posts/${post.id}`, update);
      toast.success("Post updated");
      onUpdate();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const approvePost = async () => {
    try {
      await axios.post(`${API}/posts/${post.id}/approve`);
      toast.success("Post approved and scheduled");
      onUpdate();
    } catch { toast.error("Failed to approve"); }
  };

  const publishPost = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      const resp = await axios.post(`${API}/posts/${post.id}/publish`, {}, { timeout: 60000 });
      if (resp.data.status === "published") {
        toast.success("Post published!");
      } else {
        toast.error(`Publish failed: ${resp.data.error_message || "Unknown error"}`);
      }
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
      await axios.delete(`${API}/posts/${post.id}`);
      toast.success("Post deleted");
      onUpdate();
    } catch { toast.error("Failed to delete"); }
  };

  const syncStatus = async () => {
    if (!post.platform_post_id) return;
    setSyncing(true);
    try {
      await axios.get(`${API}/bundle/post/${post.platform_post_id}/sync`);
      toast.success("Status synced");
      onUpdate();
    } catch { toast.error("Sync failed"); }
    finally { setSyncing(false); }
  };

  return (
    <div className="w-[350px] flex-shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: clientColor }} />
            <span className="text-sm font-semibold text-white truncate">{post.client_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">{post.platform}</span>
            <span className="text-[10px] font-mono text-zinc-600">·</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">{post.content_type === "carousel" ? "Carousel" : "Post"}</span>
            <span className={`text-[8px] font-mono px-1 py-0.5 border ml-1 ${STATUS_BADGE[post.status] || "border-zinc-700 text-zinc-500"}`}>
              {post.status?.toUpperCase()}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {/* Content */}
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Content</label>
          {/* Video player */}
          {isVideo && (
            post.r2_video_url ? (
              <video
                src={post.r2_video_url}
                controls
                className="w-full bg-black border border-zinc-700 mb-2 max-h-64 object-contain"
              />
            ) : (
              <div className="w-full h-36 bg-zinc-950 border border-zinc-700 flex flex-col items-center justify-center gap-2 mb-2">
                <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                <span className="text-[10px] font-mono text-zinc-500">Rendering video…</span>
              </div>
            )
          )}
          {/* Caption / text */}
          <textarea
            value={form.text}
            onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
            disabled={isViewOnly}
            rows={isVideo ? 3 : 6}
            placeholder={isVideo ? "Caption" : ""}
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none disabled:opacity-50"
          />
        </div>

        {/* Hashtags */}
        {post.hashtags?.length > 0 && (
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Hashtags</label>
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map((tag, i) => (
                <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400">
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Slide count — carousel posts only */}
        {totalSlides > 0 && (
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
              Slides <span className="text-zinc-600 normal-case">(2–{totalSlides})</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                disabled={isViewOnly || form.slideCount <= 2}
                onClick={() => setForm(f => ({ ...f, slideCount: Math.max(2, f.slideCount - 1) }))}
                className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-mono"
              >−</button>
              <span className="text-sm font-mono text-white w-6 text-center">{form.slideCount}</span>
              <button
                disabled={isViewOnly || form.slideCount >= totalSlides}
                onClick={() => setForm(f => ({ ...f, slideCount: Math.min(totalSlides, f.slideCount + 1) }))}
                className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-mono"
              >+</button>
              {form.slideCount !== totalSlides && (
                <span className="text-[10px] font-mono text-amber-500">
                  will trim to {form.slideCount} on save
                </span>
              )}
            </div>
          </div>
        )}

        {/* Platform */}
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Platform</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            disabled={isViewOnly}
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Scheduled At</label>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
            disabled={isViewOnly}
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-500 [color-scheme:dark] disabled:opacity-50"
          />
        </div>

        {/* Image thumbnail */}
        {post.image_url && (
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Preview</label>
            <img
              src={post.image_url}
              alt="Post preview"
              className="w-full max-h-48 object-cover border border-zinc-800"
            />
          </div>
        )}

        {/* Meta info */}
        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
          {post.ai_generated && (
            <div className="text-[10px] font-mono text-zinc-600">AI GENERATED</div>
          )}
          {post.pipeline_name && (
            <div className="text-[10px] font-mono text-zinc-600">Pipeline: {post.pipeline_name}</div>
          )}
          {post.published_at && (
            <div className="text-[10px] font-mono text-zinc-600">Published: {format(parseISO(post.published_at), "MMM d, h:mm a")}</div>
          )}
          {post.error_message && (
            <div className="text-[10px] font-mono text-red-500 mt-1 p-2 bg-red-950/20 border border-red-900/40">{post.error_message}</div>
          )}

          {/* Bundle post ID */}
          {post.platform_post_id && (
            <div className="pt-2 space-y-1.5">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Bundle Post ID</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 px-2 py-1 text-[9px] font-mono text-zinc-400 truncate select-all">
                  {post.platform_post_id}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(post.platform_post_id); toast.success("Copied!"); }}
                  className="p-1.5 border border-zinc-700 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <Copy size={9} />
                </button>
              </div>
              <button
                onClick={syncStatus}
                disabled={syncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={9} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing..." : "Sync Status"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-zinc-800 space-y-2">
        {!isViewOnly && (
          <div className="flex gap-2">
            <button
              onClick={savePost}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-white text-black font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {post.status === "draft" && (
              <button
                onClick={approvePost}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border border-emerald-800 text-emerald-400 hover:bg-emerald-950 transition-colors"
              >
                <CheckCircle size={11} />
                Approve
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {post.status !== "publishing" && (
            <button
              onClick={publishPost}
              disabled={publishing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border border-blue-800 text-blue-400 hover:bg-blue-950 transition-colors disabled:opacity-50"
            >
              <Send size={11} className={publishing ? "animate-pulse" : ""} />
              {publishing ? "Publishing..." : post.status === "failed" ? "Retry" : post.status === "published" ? "Re-publish" : "Publish"}
            </button>
          )}
          {calp.delete && (
            <button
              onClick={deletePost}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs border border-red-900 text-red-400 hover:bg-red-950 transition-colors"
            >
              <Trash2 size={11} />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
