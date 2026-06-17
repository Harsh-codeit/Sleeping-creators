// frontend/src/components/DriveImageGrid.js
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL || "";

export default function DriveImageGrid({ clientId, selectedFileId, onSelect }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchImages = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/clients/${clientId}/drive-images`);
      setImages(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load Drive images");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  if (!clientId) return <p className="text-zinc-500 text-sm">Select a client first.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500 font-mono">{images.length} images in Drive folder</p>
        <button
          type="button"
          onClick={fetchImages}
          disabled={loading}
          className="px-2 py-1 text-[11px] font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading images…</p>
      ) : images.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center">
          <p className="text-zinc-500 text-sm">No images found in the client's Drive folder.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
          {images.map(img => (
            <button
              type="button"
              key={img.drive_file_id}
              onClick={() => onSelect(img)}
              className={`rounded-lg overflow-hidden border transition-all ${
                selectedFileId === img.drive_file_id
                  ? "border-violet-500"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <div className="bg-zinc-900 aspect-square flex items-center justify-center overflow-hidden">
                <img
                  src={img.thumbnail_url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = "none"; }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
