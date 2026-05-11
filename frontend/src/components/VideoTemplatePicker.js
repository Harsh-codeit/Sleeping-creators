import { useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export function VideoTemplatePicker({ value, onChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/shotstack-templates?status=active`)
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="font-mono text-xs text-zinc-500 py-4">Loading templates…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="font-mono text-xs text-zinc-600 py-4 border border-zinc-800 text-center">
        No active templates. Go to Video → Sync from Shotstack.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(r => {
        const isSelected = value === r.id;
        return (
          <button
            type="button"
            key={r.id}
            data-testid={`template-card-${r.id}`}
            onClick={() => onChange(r.id)}
            className={`text-left border transition-colors duration-200 ${
              isSelected
                ? "border-white bg-zinc-900"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
            }`}
          >
            {r.thumbnail_url
              ? <img src={r.thumbnail_url} alt="" className="w-full h-28 object-cover" />
              : <div className="w-full h-28 bg-zinc-800 border-b border-zinc-700" />
            }
            <div className="px-2 py-1.5">
              <div className="text-xs font-semibold text-white truncate">{r.name}</div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                {r.merge_fields?.length ?? 0} fields
              </div>
            </div>
            {isSelected && (
              <div className="px-2 pb-1.5">
                <div className="text-[9px] font-mono text-white uppercase tracking-widest">Selected</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default VideoTemplatePicker;
