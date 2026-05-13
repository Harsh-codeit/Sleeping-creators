import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { X, Music2, Play, Pause, Check, Loader2, RefreshCw, Upload, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const ROLES = ["ai_text", "static_text", "clip", "logo", "audio"];

export function VideoTemplateDetail({ template, onClose, onChanged }) {
  const [fields, setFields] = useState(template.merge_fields || []);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(template.preview_url || null);

  // Audio override state
  const [audioOverride, setAudioOverride] = useState("");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioRef = useRef(null);
  const audioFileRef = useRef(null);

  const hasAudioInTemplate = !!template.audio_url
    || (template.merge_fields || []).some(f => f.role === "audio");

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/shotstack-templates/${template.id}`, { merge_fields: fields });
      toast.success("Fields saved");
      onChanged?.();
    } catch (e) {
      toast.error(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status) => {
    try {
      await axios.patch(`${API}/shotstack-templates/${template.id}`, { status });
      toast.success(`Status → ${status}`);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const deleteTemplate = async () => {
    if (!window.confirm(`Remove template "${template.name}" from the local registry?\n\nIt will re-appear on the next Sync (fresh, with no preview).`)) return;
    try {
      await axios.delete(`${API}/shotstack-templates/${template.id}`);
      toast.success("Template removed");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const updateRole = (find, role) => {
    setFields(fs => fs.map(f => f.find === find ? { ...f, role, inferred: false } : f));
  };

  const openMusicPicker = async () => {
    setShowMusicPicker(true);
    try {
      const r = await axios.get(`${API}/music`);
      setMusicTracks(r.data);
    } catch { toast.error("Failed to load music library"); }
  };

  const closeMusicPicker = () => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(null);
    setShowMusicPicker(false);
  };

  const togglePlay = (track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) { audio.pause(); setPlayingId(null); }
    else { audio.src = track.r2_url; audio.play().catch(() => {}); setPlayingId(track.id); }
  };

  const pickTrack = (track) => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingId(null);
    setSelectedTrack(track);
    setAudioOverride(track.r2_url);
    setShowMusicPicker(false);
  };

  const clearAudioOverride = () => {
    setAudioOverride("");
    setSelectedTrack(null);
  };

  const handleUploadAudio = async (file) => {
    if (!file) return;
    setUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await axios.post(`${API}/shotstack-templates/upload-audio`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAudioOverride(r.data.audio_url);
      setSelectedTrack({ id: "upload", name: file.name, r2_url: r.data.audio_url });
      toast.success("Audio uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingAudio(false);
      if (audioFileRef.current) audioFileRef.current.value = "";
    }
  };

  const regeneratePreview = async () => {
    setRegenerating(true);
    try {
      const r = await axios.post(
        `${API}/shotstack-templates/${template.id}/generate-preview`,
        audioOverride ? { audio_url: audioOverride } : {},
      );
      setPreviewUrl(r.data.preview_url);
      toast.success("Preview regenerated");
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Preview generation failed");
    } finally {
      setRegenerating(false);
    }
  };

  // Pause preview audio if drawer closes
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex" onClick={onClose}>
      <div
        className="ml-auto w-[680px] bg-zinc-950 border-l border-zinc-800 h-full overflow-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-white">{template.name}</div>
            <div className="text-[10px] font-mono text-zinc-500">
              {template.status?.toUpperCase()} · {fields.length} fields
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(template.status === "draft" || template.status === "inactive") && (
              <button
                data-testid="publish-template-btn"
                onClick={() => setStatus("active")}
                className="px-3 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200"
              >
                Publish
              </button>
            )}
            {template.status === "active" && (
              <button
                data-testid="unpublish-template-btn"
                onClick={() => setStatus("inactive")}
                className="px-3 py-1.5 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200"
              >
                Unpublish
              </button>
            )}
            <button
              data-testid="close-template-detail-btn"
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Preview — rendered MP4 preferred, falls back to timeline thumbnail */}
        {(previewUrl || template.thumbnail_url) && (
          <div className="border-b border-zinc-800 flex-shrink-0">
            {previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                autoPlay
                muted
                loop
                playsInline
                className="w-full object-cover max-h-48"
              />
            ) : (
              <img src={template.thumbnail_url} alt={template.name} className="w-full object-cover max-h-48" />
            )}
          </div>
        )}

        {/* Audio override — per SHOTSTACK_TEMPLATE_FEATURE.md "Merge Field Form":
            "If the template has an audio URL, show an optional Audio URL input pre-filled with that URL." */}
        {hasAudioInTemplate && (
          <div className="border-b border-zinc-800 px-5 py-4 flex-shrink-0">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Audio override</div>
              <span className="text-[10px] font-mono text-zinc-600">Optional</span>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={openMusicPicker}
                className="flex-1 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2 flex items-center gap-2 min-w-0"
              >
                <Music2 size={12} className="flex-shrink-0" />
                <span className="truncate">
                  {selectedTrack ? selectedTrack.name : "Pick from library…"}
                </span>
              </button>
              <input
                ref={audioFileRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3,audio/ogg"
                className="hidden"
                onChange={e => handleUploadAudio(e.target.files?.[0])}
              />
              <button
                onClick={() => !uploadingAudio && audioFileRef.current?.click()}
                disabled={uploadingAudio}
                className="border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-200 px-3 py-2 flex items-center gap-1.5 flex-shrink-0 disabled:opacity-40"
              >
                {uploadingAudio ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploadingAudio ? "Uploading…" : "Upload"}
              </button>
            </div>

            <input
              type="text"
              value={audioOverride}
              onChange={e => { setAudioOverride(e.target.value); setSelectedTrack(null); }}
              placeholder={template.audio_url || "Or paste an audio URL…"}
              className="w-full bg-zinc-900 border border-zinc-700 text-white text-[11px] px-3 py-2 font-mono focus:outline-none focus:border-zinc-500 transition-colors duration-200 mb-2"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={regeneratePreview}
                disabled={regenerating}
                className="bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
              >
                {regenerating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {regenerating ? "Rendering…" : "Regenerate preview"}
              </button>
              {(audioOverride || selectedTrack) && (
                <button
                  onClick={clearAudioOverride}
                  className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  × Clear
                </button>
              )}
            </div>
            <p className="text-[10px] font-mono text-zinc-600 mt-2">
              Each regenerate costs a render credit.
            </p>
          </div>
        )}

        {/* Merge fields */}
        <div className="p-5 flex-1 overflow-auto">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Merge Fields</div>
            {fields.some(f => f.inferred) && (
              <span
                title="Roles tagged 'auto' were guessed from field names. Review & change them if needed — picking the wrong role (e.g. ai_text for a clip slot) will skip the substitution at render time."
                className="text-[9px] font-mono text-amber-400 uppercase tracking-widest"
              >
                {fields.filter(f => f.inferred).length} auto-inferred role{fields.filter(f => f.inferred).length === 1 ? "" : "s"} — review below
              </span>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Field</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Default</th>
                <th className="text-left pb-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest pl-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 font-mono text-zinc-600 text-center">No merge fields detected</td>
                </tr>
              )}
              {fields.map((f) => (
                <tr key={f.find} className="border-b border-zinc-800/50">
                  <td className="py-1.5 font-mono text-zinc-300">
                    {f.find}
                    {f.inferred && (
                      <span className="ml-1.5 text-[9px] font-mono text-amber-400 uppercase tracking-widest">auto</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 font-mono text-zinc-500 max-w-[160px] truncate">
                    {f.replace || "—"}
                  </td>
                  <td className="py-1.5 pl-2">
                    <select
                      data-testid={`role-select-${f.find}`}
                      value={f.role || ""}
                      onChange={e => updateRole(f.find, e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-white text-xs px-1.5 py-0.5 focus:ring-1 focus:ring-zinc-500 focus:outline-none transition-colors duration-200"
                    >
                      <option value="">—</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              data-testid="save-schema-btn"
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save fields"}
            </button>
            <button
              onClick={deleteTemplate}
              title="Remove from local registry (re-appears on next Sync)"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-900/40 text-red-400 text-xs font-mono hover:bg-red-900/10 transition-colors duration-200"
            >
              <Trash2 size={11} />
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* Music picker modal */}
      {showMusicPicker && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center" onClick={closeMusicPicker}>
          <div className="bg-zinc-950 border border-zinc-800 w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-11 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
              <span className="text-xs font-semibold text-white">Music Library</span>
              <button onClick={closeMusicPicker} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {musicTracks.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-zinc-600">
                  No tracks in library.<br />Upload music from the Music page.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="w-10 px-3 py-2" />
                      <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest">Track</th>
                      <th className="text-left px-2 py-2 font-mono text-zinc-500 uppercase text-[10px] tracking-widest w-16">Dur</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {musicTracks.map(track => {
                      const isPlaying = playingId === track.id;
                      const isSelected = selectedTrack?.id === track.id;
                      return (
                        <tr key={track.id} onClick={() => pickTrack(track)}
                          className={`border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900 ${isSelected ? "bg-zinc-900" : ""}`}>
                          <td className="px-3 py-2">
                            <button
                              onClick={e => { e.stopPropagation(); togglePlay(track); }}
                              className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                            >
                              {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-mono text-zinc-300 text-[11px] truncate max-w-[220px]">{track.name}</div>
                          </td>
                          <td className="px-2 py-2 font-mono text-zinc-500 text-[10px]">
                            {track.duration ? `${Math.round(track.duration)}s` : "—"}
                          </td>
                          <td className="px-3 py-2">{isSelected && <Check size={12} className="text-white" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
    </div>
  );
}

export default VideoTemplateDetail;
