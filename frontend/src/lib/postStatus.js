import { Clock, CheckCircle, AlertTriangle, Loader2, Eye, Send } from "lucide-react";

/**
 * Single source of truth for post-status display across the app.
 * Used by the Calendar (CalendarPage.js) and the client Posts tab (ClientDetail.js).
 *
 * Statuses live in MongoDB on the posts collection. Carousel posts use
 * draft / scheduled / publishing / published / failed. Video posts go through
 * rendering → succeeded (or pending_approval) → bundle_scheduled → published,
 * with failed_render as the recoverable failure mode.
 */
export const POST_STATUS = {
  // Pre-render — carousel flow
  draft:            { label: "Draft",          icon: Clock,         tone: "zinc",    desc: "Saved, not scheduled" },
  scheduled:        { label: "Scheduled",      icon: Clock,         tone: "amber",   desc: "Will publish at scheduled time" },

  // Render lifecycle — video flow
  rendering:        { label: "Rendering",      icon: Loader2,       tone: "blue",    desc: "Shotstack render in flight", spin: true },
  succeeded:        { label: "Ready",          icon: CheckCircle,   tone: "cyan",    desc: "Video rendered, awaiting publish" },
  pending_approval: { label: "Needs Approval", icon: Eye,           tone: "purple",  desc: "Render done, awaiting admin OK" },
  bundle_scheduled: { label: "Queued",         icon: Clock,         tone: "amber",   desc: "Queued for platform publish" },

  // Publish lifecycle
  publishing:       { label: "Publishing",     icon: Send,          tone: "blue",    desc: "Posting to platform", spin: true },
  published:        { label: "Published",      icon: CheckCircle,   tone: "emerald", desc: "Live on platform" },

  // Failures
  failed_render:    { label: "Render Failed",  icon: AlertTriangle, tone: "red",     desc: "Shotstack render failed — retry available" },
  failed:           { label: "Failed",         icon: AlertTriangle, tone: "red",     desc: "Publish failed" },
  cancelled:        { label: "Cancelled",      icon: AlertTriangle, tone: "zinc",    desc: "Cancelled" },
};

const TONE_CLASSES = {
  zinc:    "border-zinc-700 text-zinc-400 bg-zinc-900",
  amber:   "border-amber-700 text-amber-400 bg-amber-950/40",
  blue:    "border-blue-700 text-blue-400 bg-blue-950/40",
  cyan:    "border-cyan-700 text-cyan-400 bg-cyan-950/40",
  purple:  "border-purple-700 text-purple-400 bg-purple-950/40",
  emerald: "border-emerald-700 text-emerald-400 bg-emerald-950/40",
  red:     "border-red-900 text-red-400 bg-red-950/40",
};

export function getStatusConfig(status) {
  return POST_STATUS[status] || {
    label: (status || "—").toUpperCase(),
    icon: Clock,
    tone: "zinc",
    desc: "",
  };
}

/** Small/Large status pill — sm is for table rows & calendar chips, lg for drawers/headers. */
export function StatusBadge({ status, size = "sm", className = "" }) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  const sizing = size === "lg"
    ? "px-2 py-1 text-[10px] gap-1.5"
    : "px-1.5 py-0.5 text-[9px] gap-1";
  return (
    <span
      title={cfg.desc}
      className={`inline-flex items-center font-mono uppercase tracking-widest border ${sizing} ${TONE_CLASSES[cfg.tone]} ${className}`}
    >
      <Icon size={size === "lg" ? 10 : 8} className={cfg.spin ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

/**
 * Returns the set of actions appropriate for this post state.
 * UI surfaces can use this to gate buttons without duplicating logic.
 */
export function getPostActions(post) {
  const kind = post?.kind;
  const status = post?.status;
  if (kind === "video") {
    // Allow force-retry on stuck 'rendering' posts (worker may have died silently)
    if (status === "rendering")        return { retry: true, delete: true };
    if (status === "failed_render")    return { retry: true, delete: true };
    if (status === "succeeded")        return { postNow: true, schedule: true, rerender: true, delete: true };
    if (status === "pending_approval") return { approve: true, reject: true, rerender: true, delete: true };
    if (status === "bundle_scheduled") return { delete: true };
    if (status === "published")        return { delete: true };
    return { delete: true };
  }
  // Carousel / text — existing logic
  if (status === "draft" || status === "scheduled" || status === "failed") {
    return { publish: true, delete: true };
  }
  return { delete: true };
}
