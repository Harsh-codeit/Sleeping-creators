import { formatDistanceToNowStrict, parseISO } from "date-fns";

const STATUS_META = {
  error:  { label: "ERROR",  color: "text-red-400",     dot: "bg-red-500" },
  active: { label: "ACTIVE", color: "text-emerald-400", dot: "bg-emerald-500" },
  paused: { label: "PAUSED", color: "text-zinc-400",    dot: "bg-zinc-600" },
  none:   { label: "—",      color: "text-zinc-600",    dot: "bg-zinc-700" },
};

/**
 * Map a client's rolled-up pipeline status + next run into display props.
 * Pure — safe to unit test. `nextRun` is an ISO string or null/undefined.
 */
export function pipelineBadge(status, nextRun) {
  const meta = STATUS_META[status] || STATUS_META.none;
  let sub = "—";
  if (status === "active" && nextRun) {
    try {
      sub = `in ${formatDistanceToNowStrict(parseISO(nextRun))}`;
    } catch {
      sub = "—";
    }
  }
  return { label: meta.label, color: meta.color, dot: meta.dot, sub };
}
