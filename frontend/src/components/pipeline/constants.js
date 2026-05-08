import { Zap, TrendingUp, Eye, Target, Layers } from "lucide-react";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ALL_PLATFORMS = [
  "instagram", "facebook", "twitter", "linkedin",
  "tiktok", "youtube", "threads", "pinterest",
];

export const PIPELINE_TYPES = [
  {
    value: "standard",
    label: "Standard",
    desc: "AI picks from your topics & themes",
    icon: Layers,
    color: "zinc",
    badgeClass: "border-zinc-700 text-zinc-400 bg-zinc-900",
  },
  {
    value: "trend",
    label: "Trend",
    desc: "Drives content from live trending topics",
    icon: TrendingUp,
    color: "blue",
    badgeClass: "border-blue-800 text-blue-400 bg-blue-950/40",
  },
  {
    value: "competitor",
    label: "Competitor",
    desc: "Recreates top competitor posts in your voice",
    icon: Eye,
    color: "purple",
    badgeClass: "border-purple-800 text-purple-400 bg-purple-950/40",
  },
  {
    value: "strategy",
    label: "Strategy",
    desc: "Rotates through your content pillars evenly",
    icon: Target,
    color: "green",
    badgeClass: "border-emerald-800 text-emerald-400 bg-emerald-950/40",
  },
  {
    value: "experimental",
    label: "Experimental",
    desc: "Random formats, bold angles, contrarian hooks",
    icon: Zap,
    color: "amber",
    badgeClass: "border-amber-700 text-amber-400 bg-amber-950/40",
  },
];

export const PIPELINE_TYPE_MAP = Object.fromEntries(PIPELINE_TYPES.map(t => [t.value, t]));

export const STATUS_BORDER = {
  active: "border-l-emerald-500",
  paused: "border-l-amber-500",
  error: "border-l-red-500",
};

export const BUILT_IN_TEMPLATES = [
  { value: "dark_card",          label: "Dark Card" },
  { value: "full_white",         label: "Quote White" },
  { value: "floating_card",      label: "Floating" },
  { value: "dark_card_rich",     label: "Dark Card (Rich)" },
  { value: "full_white_rich",    label: "Quote White (Rich)" },
  { value: "floating_card_rich", label: "Floating (Rich)" },
];

export const TEMPLATE_LABELS = Object.fromEntries(
  BUILT_IN_TEMPLATES.map(t => [t.value, t.label])
);

export const EMPTY_FORM = {
  name: "",
  pipeline_type: "standard",
  content_type: "carousel",
  carousel_template: "full_white",
  carousel_slide_count: 5,
  carousel_topics: "",
  carousel_slide_format: "",
  platforms: [],
  cta_keyword: "",
  cta_offer: "",
  global_instructions: "",
  max_posts_per_day: 10,
  schedule_type: "interval",
  interval_hours: 6,
  specific_times: ["09:00"],
  require_approval: false,
};

// Which content fields are shown per pipeline type
export const TYPE_SETTINGS = {
  standard:     { showTemplate: true, showSlideCount: true,  showFormat: true,  showTopics: true  },
  trend:        { showTemplate: true, showSlideCount: true,  showFormat: false, showTopics: false },
  competitor:   { showTemplate: true, showSlideCount: false, showFormat: false, showTopics: false },
  strategy:     { showTemplate: true, showSlideCount: true,  showFormat: true,  showTopics: false },
  experimental: { showTemplate: true, showSlideCount: false, showFormat: false, showTopics: false },
};


export const TYPE_HINTS = {
  trend:        "Picks topics from your live trending data each run. Format alternates tips/step-by-step automatically.",
  competitor:   "Grabs your highest-engagement unrecreated competitor post and rewrites it in your brand voice. Slide count matches the original.",
  strategy:     "Cycles through your content pillars in order — each run uses the next one. Never repeats until all pillars are covered.",
  experimental: "Randomly picks a format (story, myth-bust, case study, etc.) and writes a bold, contrarian take. Good for testing what resonates.",
};

export const SLIDE_FORMATS = [
  ["",            "Auto (rotate)"],
  ["tips",       "Tips"],
  ["story",      "Story"],
  ["myth_bust",  "Myth-Bust"],
  ["case_study", "Case Study"],
  ["step_by_step", "Step-by-Step"],
];

export const SLIDE_FORMAT_LABELS = Object.fromEntries(SLIDE_FORMATS);

export const PRESETS = [
  {
    label: "Morning Thought Leadership",
    desc: "Strategy · 9AM daily",
    config: { pipeline_type: "strategy", schedule_type: "specific_times", specific_times: ["09:00"], carousel_slide_count: 6 },
  },
  {
    label: "Trending Now",
    desc: "Trend · Every 6h",
    config: { pipeline_type: "trend", schedule_type: "interval", interval_hours: 6, carousel_slide_count: 5 },
  },
  {
    label: "Competitor Watch",
    desc: "Competitor · Every 48h",
    config: { pipeline_type: "competitor", schedule_type: "interval", interval_hours: 48 },
  },
  {
    label: "Weekend Experiment",
    desc: "Experimental · Saturdays 10AM",
    config: { pipeline_type: "experimental", schedule_type: "specific_times", specific_times: ["10:00"] },
  },
];

// ── Timezone helpers ─────────────────────────────────────────────────────────
// Times are stored in the DB as UTC "HH:MM" strings.
// These helpers convert between the user's browser-local time and UTC.

export function localToUTC(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function utcToLocal(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function tzLabel() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const short = new Date().toLocaleTimeString("en", { timeZoneName: "short" }).split(" ").pop();
  return `${short} · ${zone}`;
}

export function formatRelative(isoStr) {
  if (!isoStr) return "Never";
  const d = new Date(isoStr);
  const now = new Date();
  const diff = Math.round((d - now) / 60000);
  if (diff > 0) return diff < 60 ? `in ${diff}m` : `in ${Math.round(diff / 60)}h`;
  const abs = Math.abs(diff);
  if (abs < 60) return `${abs}m ago`;
  if (abs < 1440) return `${Math.round(abs / 60)}h ago`;
  return `${Math.round(abs / 1440)}d ago`;
}

function to12h(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function scheduleLabel(p) {
  if (p.schedule_type === "specific_times") {
    const localTimes = (p.specific_times || []).map(t => to12h(utcToLocal(t))).join(", ");
    const short = new Date().toLocaleTimeString("en", { timeZoneName: "short" }).split(" ").pop();
    return `Daily at ${localTimes} (${short})`;
  }
  return `Every ${p.interval_hours}h`;
}

export function buildCtaButtonText(keyword, offer) {
  const k = (keyword || "").trim();
  const o = (offer || "").trim();
  if (k && o) return `Type "${k}" for ${o}`;
  if (k) return `Type "${k}"`;
  if (o) return `Get ${o}`;
  return "";
}
