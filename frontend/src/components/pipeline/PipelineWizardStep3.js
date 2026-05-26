import { useState } from "react";
import { X } from "lucide-react";
import { ALL_PLATFORMS, localToUTC, utcToLocal, tzLabel } from "./constants";

const DAY_PRESETS = [1, 2, 3, 5, 7, 14, 30];

export default function PipelineWizardStep3({ form, onChange }) {
  const [newTime, setNewTime] = useState("");

  const togglePlatform = (p) => {
    onChange(
      "platforms",
      form.platforms.includes(p)
        ? form.platforms.filter(x => x !== p)
        : [...form.platforms, p]
    );
  };

  const addTime = () => {
    if (!newTime) return;
    const utc = localToUTC(newTime);
    if (!form.specific_times.includes(utc)) {
      onChange("specific_times", [...form.specific_times, utc].sort());
    }
    setNewTime("");
  };

  const removeTime = (t) => {
    onChange("specific_times", form.specific_times.filter(x => x !== t));
  };

  return (
    <div className="space-y-5">
      {/* Platforms — 6 toggle buttons in a single row */}
      <div>
        <label className="label-xs">Post to Platforms</label>
        <div className="flex gap-2 flex-wrap">
          {ALL_PLATFORMS.map(p => (
            <button
              key={p}
              type="button"
              data-testid={`platform-toggle-${p}`}
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1.5 text-[10px] font-mono border uppercase transition-colors duration-150 ${
                form.platforms.includes(p)
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {form.platforms.length === 0 && (
          <p className="text-xs text-red-400 mt-1">Select at least one platform</p>
        )}
      </div>

      {/* Posting Schedule */}
      {form.pipeline_type === "video" ? (
        /* Video: days-between-posts */
        <div className="space-y-4">
          <div>
            <label className="label-xs">Days Between Posts</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DAY_PRESETS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange("days_between_posts", d)}
                  className={`w-10 py-2 text-[11px] font-mono border transition-colors duration-150 ${
                    form.days_between_posts === d
                      ? "bg-white text-black border-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {d}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={365}
                value={DAY_PRESETS.includes(form.days_between_posts) ? "" : form.days_between_posts}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0) onChange("days_between_posts", v);
                }}
                placeholder="…"
                className="w-14 field font-mono text-center text-[11px]"
              />
            </div>
            <p className="text-[10px] font-mono text-zinc-600">
              Post once every {form.days_between_posts} day{form.days_between_posts === 1 ? "" : "s"}
            </p>
          </div>

          <div>
            <label className="label-xs">Post At</label>
            <input
              type="time"
              value={utcToLocal(form.post_time || "09:00")}
              onChange={e => onChange("post_time", localToUTC(e.target.value))}
              className="field font-mono text-xs [color-scheme:dark] w-40"
            />
            <p className="text-[10px] font-mono text-zinc-500 mt-1">
              Your timezone: {tzLabel()}
            </p>
          </div>
        </div>
      ) : (
        /* Non-video: existing interval / specific-times UI */
        <div>
          <label className="label-xs">Posting Schedule</label>
          <div className="flex gap-2 mb-3">
            {[["interval", "Interval"], ["specific_times", "Specific Times"]].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                data-testid={`schedule-type-${val}`}
                onClick={() => onChange("schedule_type", val)}
                className={`flex-1 py-2 text-[10px] font-mono border transition-colors duration-150 ${
                  form.schedule_type === val
                    ? "bg-white text-black border-white"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {form.schedule_type === "interval" ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-500">Every</span>
              <input
                data-testid="interval-hours-input"
                type="number" min={1} max={168}
                value={form.interval_hours}
                onChange={e => onChange("interval_hours", parseInt(e.target.value) || 6)}
                className="w-24 field font-mono text-center"
              />
              <span className="text-xs font-mono text-zinc-500">hours</span>
              <span className="text-[10px] font-mono text-zinc-600">
                (~{(24 / Math.max(form.interval_hours, 1)).toFixed(1)} posts/day)
              </span>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.specific_times.map(t => (
                  <div key={t} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2 py-1">
                    <span className="text-xs font-mono text-white">{utcToLocal(t)}</span>
                    <button
                      type="button"
                      onClick={() => removeTime(t)}
                      className="text-zinc-600 hover:text-red-400"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="field font-mono text-xs [color-scheme:dark] flex-1"
                />
                <button
                  type="button"
                  onClick={addTime}
                  disabled={!newTime}
                  className="px-3 py-1.5 bg-white text-black text-xs font-mono hover:bg-zinc-200 transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <p className="text-[10px] font-mono text-zinc-500 mt-1.5">
                Times in your timezone: {tzLabel()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Daily cap (non-video) + Require approval */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {form.pipeline_type !== "video" && (
          <div>
            <label className="label-xs">Daily Post Cap</label>
            <input
              type="number" min={1} max={20}
              value={form.max_posts_per_day}
              onChange={e => onChange("max_posts_per_day", parseInt(e.target.value) || 10)}
              className="w-24 field font-mono text-center"
            />
            <p className="text-[10px] font-mono text-zinc-600 mt-1">resets midnight UTC</p>
          </div>
        )}
        <div className={`flex items-center justify-between pt-1 ${form.pipeline_type === "video" ? "col-span-2" : ""}`}>
          <div>
            <div className="text-sm text-white">Require Approval</div>
            <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Goes to draft · Approve via Telegram</div>
          </div>
          <button
            type="button"
            data-testid="require-approval-toggle"
            onClick={() => onChange("require_approval", !form.require_approval)}
            className={`w-10 h-5 relative transition-colors duration-200 flex-shrink-0 ${
              form.require_approval ? "bg-amber-500" : "bg-zinc-700"
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white transition-transform duration-200 ${
              form.require_approval ? "translate-x-5" : "translate-x-0.5"
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
}
