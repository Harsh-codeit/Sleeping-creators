import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Video, Loader2, CheckCircle2 } from "lucide-react";
import NicheSelect from "../NicheSelect";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INPUT_CLS =
  "w-full bg-zinc-950 border border-zinc-700 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-400 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors";

export default function ScriptTranscribe({ onDone }) {
  const [reelUrl, setReelUrl] = useState("");
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!reelUrl.trim()) { toast.error("Enter an Instagram Reel URL"); return; }
    if (!reelUrl.includes("/reel/")) { toast.error("URL must be an Instagram Reel (instagram.com/reel/…)"); return; }

    setLoading(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/content-scripts/transcribe`, {
        reel_url: reelUrl.trim(),
        title: title.trim() || null,
        niche_slug: niche || null,
        platform: "instagram",
      });
      setResult(data);
      toast.success(`Transcribed — ${data.chunks_created} chunks stored`);
      setReelUrl("");
      setTitle("");
      onDone?.();
    } catch (err) {
      const detail = err.response?.data?.detail || "Transcription failed";
      if (err.response?.status === 409) {
        toast.error("Already imported: " + detail);
      } else {
        toast.error(detail);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-5">
      <div className="border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-[11px] font-mono text-zinc-500 space-y-1">
        <div className="text-zinc-300 font-semibold uppercase tracking-widest text-[10px]">How it works</div>
        <div>1. Paste a competitor or inspiration Instagram Reel URL</div>
        <div>2. The video is downloaded and audio is extracted via ffmpeg</div>
        <div>3. Audio is transcribed with Groq Whisper</div>
        <div>4. Transcript is chunked, embedded, and stored for RAG retrieval</div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Instagram Reel URL</label>
          <input
            className={INPUT_CLS}
            placeholder="https://www.instagram.com/reel/ABC123…"
            value={reelUrl}
            onChange={(e) => setReelUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Title (optional)</label>
          <input
            className={INPUT_CLS}
            placeholder="e.g. Competitor reel — fitness transformation"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Niche (optional)</label>
          <NicheSelect value={niche} onChange={setNiche} includeAll placeholder="Any niche" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-xs font-mono uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />}
          {loading ? "Transcribing… (may take 30–60s)" : "Transcribe Reel"}
        </button>

        {loading && (
          <div className="text-[11px] font-mono text-zinc-500 border border-zinc-800 px-4 py-3 space-y-1">
            <div>Downloading video and extracting audio…</div>
            <div>This usually takes 20–60 seconds depending on reel length.</div>
          </div>
        )}

        {result && (
          <div className="border border-emerald-900 bg-emerald-950/30 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono">
              <CheckCircle2 size={14} />
              Stored {result.chunks_created} chunks · source_id: {result.source_id?.slice(0, 8)}…
            </div>
            {result.transcript_preview && (
              <div className="text-[11px] font-mono text-zinc-400 border-t border-emerald-900 pt-2">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Transcript preview</div>
                {result.transcript_preview}…
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
