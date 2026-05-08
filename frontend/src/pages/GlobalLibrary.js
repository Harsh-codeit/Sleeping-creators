import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Star, Filter } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "twitter", "threads"];
const CONTENT_TYPES = ["single", "carousel", "reel", "story", "video", "text"];

export default function GlobalLibrary() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("");
  const [contentType, setContentType] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (contentType) params.set("content_type", contentType);
    const qs = params.toString() ? `?${params.toString()}` : "";
    axios.get(`${API}/dropbox/global${qs}`, { signal: controller.signal })
      .then(r => setPosts(r.data))
      .catch(err => { if (!axios.isCancel(err)) { setPosts([]); toast.error("Failed to load Global Library"); } })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [platform, contentType]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Star size={14} className="text-amber-400 fill-current" />
            <h1 className="text-sm font-mono font-bold text-white">Global Library</h1>
          </div>
          <p className="text-[11px] font-mono text-zinc-500">
            Top-performing posts promoted from client Dropboxes · browse for inspiration
          </p>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2 py-1">
          {posts.length} posts
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
        <Filter size={11} className="text-zinc-600" />
        <select
          value={platform}
          onChange={e => { setLoading(true); setPlatform(e.target.value); }}
          className="text-[11px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1 focus:outline-none focus:border-zinc-500"
        >
          <option value="">All Platforms</option>
          {PLATFORMS.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
        <select
          value={contentType}
          onChange={e => { setLoading(true); setContentType(e.target.value); }}
          className="text-[11px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1 focus:outline-none focus:border-zinc-500"
        >
          <option value="">All Types</option>
          {CONTENT_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        {(platform || contentType) && (
          <button
            onClick={() => { setPlatform(""); setContentType(""); }}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors duration-150"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-xs font-mono text-zinc-500 animate-pulse">Loading Global Library...</div>
        </div>
      ) : posts.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-900 p-16 text-center">
          <Star size={20} className="text-zinc-700 mx-auto mb-3" />
          <div className="text-xs font-mono text-zinc-500 mb-1">No posts in the Global Library yet</div>
          <div className="text-[10px] font-mono text-zinc-700">
            Go to a client's Dropbox tab and click "Promote Global" on a winning post.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map(post => {
            const score = post.engagement_score || 0;
            const perf = post.performance || {};
            return (
              <div key={post.id} className="border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
                {/* Caption */}
                <p className="text-xs font-mono text-zinc-300 line-clamp-3 flex-1">{post.text}</p>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {post.platform && (
                    <span className="text-[9px] font-mono text-zinc-600 uppercase border border-zinc-800 px-1.5 py-0.5">
                      {post.platform}
                    </span>
                  )}
                  {post.content_type && (
                    <span className="text-[9px] font-mono text-zinc-600 uppercase border border-zinc-800 px-1.5 py-0.5">
                      {post.content_type}
                    </span>
                  )}
                  <span className="text-[9px] font-mono px-1.5 py-0.5 border border-amber-800 text-amber-400">
                    ★ {score.toLocaleString()}
                  </span>
                </div>

                {/* Footer: client name + raw stats */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className="text-[9px] font-mono text-zinc-600 truncate">
                    {post.client_name || post.client_id || "—"}
                  </span>
                  {perf.likes > 0 && (
                    <span className="text-[9px] font-mono text-zinc-700 flex-shrink-0">
                      {perf.likes}L · {perf.comments}C · {perf.shares}S
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
