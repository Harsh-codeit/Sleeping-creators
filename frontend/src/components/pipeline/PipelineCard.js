import { Play, Zap, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  PIPELINE_TYPE_MAP, STATUS_BORDER, SLIDE_FORMAT_LABELS,
  formatRelative, scheduleLabel,
} from "./constants";

export default function PipelineCard({
  pipeline,
  templateLabels,
  onPause,
  onResume,
  onDelete,
  onRunNow,
  onEdit,
  running,
}) {
  const typeConfig = PIPELINE_TYPE_MAP[pipeline.pipeline_type || "standard"] || PIPELINE_TYPE_MAP.standard;
  const TypeIcon = typeConfig.icon;
  const borderClass = STATUS_BORDER[pipeline.status] || STATUS_BORDER.active;

  const successRate = pipeline.total_runs > 0
    ? Math.round((pipeline.successful_runs / pipeline.total_runs) * 100)
    : null;

  const allLabels = templateLabels || {};

  // Metadata line: "Dark Card · Story · 6 slides"
  let metaLine = "";
  if (pipeline.pipeline_type === "competitor") {
    metaLine = "Competitor-matched slides";
  } else if (pipeline.pipeline_type === "experimental") {
    metaLine = "Random format each run";
  } else {
    const parts = [];
    if (pipeline.carousel_template) parts.push(allLabels[pipeline.carousel_template] || pipeline.carousel_template);
    if (pipeline.carousel_slide_format) {
      parts.push(SLIDE_FORMAT_LABELS[pipeline.carousel_slide_format] || pipeline.carousel_slide_format);
    }
    if (pipeline.carousel_slide_count) parts.push(`${pipeline.carousel_slide_count} slides`);
    metaLine = parts.join(" · ");
  }

  const isPaused = pipeline.status === "paused";
  const isError = pipeline.status === "error";

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 border-l-4 ${borderClass} p-4`}
      data-testid={`pipeline-card-${pipeline.id}`}
    >
      {/* Row 1: Name + Run + ⋯ */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-white truncate flex-1 min-w-0">
          {pipeline.name}
        </span>
        <button
          data-testid={`run-now-btn-${pipeline.id}`}
          onClick={() => onRunNow(pipeline)}
          disabled={running[pipeline.id]}
          className="flex items-center gap-1 px-2 py-1 bg-white text-black text-[10px] font-mono font-bold hover:bg-zinc-200 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {running[pipeline.id]
            ? <Zap size={9} className="animate-pulse" />
            : <Play size={9} />}
          {running[pipeline.id] ? "Running" : "Run"}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
              aria-label="Pipeline actions"
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700 text-white min-w-[140px]">
            <DropdownMenuItem
              onClick={() => onEdit(pipeline)}
              className="text-xs font-mono cursor-pointer focus:bg-zinc-800"
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => isPaused ? onResume(pipeline.id) : onPause(pipeline.id)}
              className="text-xs font-mono cursor-pointer focus:bg-zinc-800"
            >
              {isPaused ? "Resume" : "Pause"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              onClick={() => onDelete(pipeline.id)}
              className="text-xs font-mono cursor-pointer text-red-400 focus:bg-zinc-800 focus:text-red-400"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 2: Type badge + platform codes */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 border uppercase ${typeConfig.badgeClass}`}>
          <TypeIcon size={8} />
          {typeConfig.label}
        </span>
        {(pipeline.platforms || []).map(p => (
          <span key={p} className="text-[10px] font-mono text-zinc-500">
            {p.slice(0, 3).toUpperCase()}
          </span>
        ))}
      </div>

      {/* Divider + metadata */}
      <div className="border-t border-zinc-800 pt-2 mb-2">
        <div className="text-[11px] font-mono text-zinc-500">{metaLine}</div>
        {isError && pipeline.last_error ? (
          <div className="text-[11px] font-mono text-red-400 mt-1">
            ⚠ {pipeline.last_error.slice(0, 80)}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
            {scheduleLabel(pipeline)}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="border-t border-zinc-800 pt-2 grid grid-cols-4 gap-2">
        {[
          { label: "Runs",    value: pipeline.total_runs ?? 0 },
          { label: "Success", value: successRate !== null ? `${successRate}%` : "—" },
          { label: "Last",    value: formatRelative(pipeline.last_run_at) },
          { label: "Next",    value: isPaused ? "—" : formatRelative(pipeline.next_run_at) },
        ].map(s => (
          <div key={s.label}>
            <div className="text-[9px] font-mono text-zinc-600 uppercase">{s.label}</div>
            <div className="text-xs font-mono text-zinc-300">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
