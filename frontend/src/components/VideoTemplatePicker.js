import { useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function VideoTemplatePicker({ value, onChange }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    axios.get(`${API}/creatomate-templates?status=active`).then(r => setRows(r.data));
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map(r => (
        <button
          type="button"
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`border rounded p-2 text-left ${value === r.id ? "ring-2 ring-blue-500" : ""}`}
        >
          {r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="w-full h-32 object-cover rounded mb-1" />}
          <div className="text-sm font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.aspect_ratio} • {r.duration_seconds}s</div>
        </button>
      ))}
    </div>
  );
}
