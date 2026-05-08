import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function VideoScheduleForm({ clientId, current, onSaved }) {
  const [cron, setCron]               = useState(current?.cron || "0 9 * * *");
  const [platforms, setPlatforms]     = useState(current?.platforms || []);
  const [textSource, setTextSource]   = useState(current?.text_source || "ai");
  const [textTemplate, setTextTemplate] = useState(current?.text_template || "");
  const [priority, setPriority]       = useState(current?.priority || "normal");
  const [enabled, setEnabled]         = useState(!!current?.cron);
  const [slots, setSlots]             = useState({});
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    axios.get(`${API}/video-schedule/slots`).then(r => setSlots(r.data || {})).catch(() => {});
  }, []);

  const suggestedHour = (() => {
    const counts = Array.from({ length: 24 }, (_, h) => ({ h, c: slots[String(h)] || 0 }));
    return counts.sort((a, b) => a.c - b.c)[0]?.h;
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!enabled) {
        await axios.delete(`${API}/clients/${clientId}/video-schedule`);
        toast.success("Schedule removed");
        onSaved?.();
      } else {
        if (!platforms.length) return toast.error("Select at least one platform");
        await axios.post(`${API}/clients/${clientId}/video-schedule`, {
          cron, platforms, text_source: textSource,
          text_template: textTemplate || null, priority,
        });
        toast.success("Schedule saved");
        onSaved?.();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
          className="w-4 h-4 accent-white" />
        <span className="text-sm text-zinc-300">Enable recurring schedule</span>
      </label>

      {enabled && (
        <>
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Cron Expression</label>
            <input
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 9 * * *"
            />
            {suggestedHour !== undefined && (
              <p className="text-[10px] font-mono text-zinc-600 mt-1">
                Least-busy hour: <button
                  className="text-zinc-400 underline"
                  onClick={() => setCron(`0 ${suggestedHour} * * *`)}
                >{suggestedHour}:00</button>
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {["instagram","facebook","youtube","tiktok","linkedin","twitter"].map(p => (
                <button
                  key={p}
                  onClick={() => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                  className={`px-3 py-1.5 text-xs font-mono capitalize border transition-colors ${
                    platforms.includes(p) ? "bg-white text-black border-white" : "border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Text Source</label>
            <div className="flex border border-zinc-800">
              {[["ai", "AI"], ["manual", "Manual"], ["template", "Template"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTextSource(val)}
                  className={`flex-1 py-1.5 text-xs font-mono border-r border-zinc-800 last:border-0 transition-colors ${
                    textSource === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {textSource !== "ai" && (
              <input
                className="w-full mt-2 bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                value={textTemplate}
                onChange={e => setTextTemplate(e.target.value)}
                placeholder={textSource === "template" ? "e.g. {client_name} tip of the day!" : "Fixed text for every video"}
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Priority</label>
            <div className="flex border border-zinc-800">
              {["high", "normal", "low"].map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 text-xs font-mono capitalize border-r border-zinc-800 last:border-0 transition-colors ${
                    priority === p ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
      >
        {saving ? "Saving…" : enabled ? "Save Schedule" : "Remove Schedule"}
      </button>
    </div>
  );
}

export default function VideoSettingsCard({ client, onClientUpdate }) {
  if (!client) return null;
  return (
    <div className="space-y-4 mb-6">
      <div className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Video Settings</h3>

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Clip Order</label>
          <div className="flex border border-zinc-800">
            {[["sequential", "Sequential"], ["random", "Random"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => onClientUpdate({ video_sequence_mode: val })}
                className={`flex-1 py-1.5 text-xs font-mono border-r border-zinc-800 last:border-0 transition-colors ${
                  (client.video_sequence_mode || "sequential") === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase mb-1.5 block">Default Job Priority</label>
          <div className="flex border border-zinc-800">
            {["high", "normal", "low"].map(p => (
              <button
                key={p}
                onClick={() => onClientUpdate({ video_default_priority: p })}
                className={`flex-1 py-1.5 text-xs font-mono capitalize border-r border-zinc-800 last:border-0 transition-colors ${
                  (client.video_default_priority || "normal") === p ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Recurring Video Schedule</h3>
        <VideoScheduleForm
          clientId={client.id}
          current={client.video_recurring_schedule}
          onSaved={() => onClientUpdate({})}
        />
      </div>
    </div>
  );
}
