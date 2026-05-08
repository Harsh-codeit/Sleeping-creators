// frontend/src/components/CompetitorTab.js
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, CheckCircle, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORM_OPTIONS = ["instagram", "linkedin"];

// ─── Ranking Helpers ──────────────────────────────────────────────────────────

function getRankTier(rank) {
  if (rank <= 3)  return "text-amber-400 border-amber-700 bg-amber-950/40";
  if (rank <= 10) return "text-zinc-300 border-zinc-500 bg-zinc-800";
  if (rank <= 25) return "text-orange-400 border-orange-800 bg-orange-950/40";
  return "text-zinc-600 border-zinc-800 bg-zinc-950";
}

function getRankBorderColor(rank) {
  if (rank <= 3)  return "border-amber-800";
  if (rank <= 10) return "border-zinc-600";
  if (rank <= 25) return "border-orange-900";
  return "border-zinc-800";
}

function getPercentile(rank, total) {
  if (!total) return "";
  return `Top ${Math.ceil((1 - (rank - 1) / total) * 100)}%`;
}

function rankPosts(posts) {
  return [...posts]
    .sort((a, b) => b.engagement_score - a.engagement_score)
    .map((p, i) => ({
      ...p,
      _rank: i + 1,
      _percentile: getPercentile(i + 1, posts.length),
    }));
}

// ─── AddCompetitorModal ───────────────────────────────────────────────────────

function AddCompetitorModal({ onClose, onAdded, clientId }) {
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/clients/${clientId}/competitors`,
        { handle: handle.trim(), platform }
      );
      onAdded(data);
      onClose();
    } catch {
      toast.error("Failed to add competitor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 p-6 w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Add Competitor</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Handle</label>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="@competitor"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-400"
            >
              {PLATFORM_OPTIONS.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-xs font-mono py-2.5 hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {loading ? "ADDING..." : "ADD COMPETITOR"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── CompetitorList ───────────────────────────────────────────────────────────

function CompetitorList({ competitors, clientId, onUpdate, onScanAll }) {
  const [scanning, setScanning] = useState({});
  const [showModal, setShowModal] = useState(false);

  const handleDelete = async (compId) => {
    try {
      await axios.delete(`${API}/clients/${clientId}/competitors/${compId}`);
      onUpdate(competitors.filter(c => c.id !== compId));
      toast.success("Competitor removed");
    } catch {
      toast.error("Failed to remove competitor");
    }
  };

  const handleToggle = async (comp) => {
    try {
      await axios.patch(`${API}/clients/${clientId}/competitors/${comp.id}`, {
        is_active: !comp.is_active
      });
      onUpdate(competitors.map(c => c.id === comp.id ? { ...c, is_active: !c.is_active } : c));
    } catch {
      toast.error("Failed to update competitor");
    }
  };

  const handleScanOne = async (compId) => {
    setScanning(s => ({ ...s, [compId]: true }));
    try {
      await axios.post(`${API}/clients/${clientId}/competitors/scan`);
      toast.success("Scan started — results will appear shortly");
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanning(s => ({ ...s, [compId]: false }));
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Competitors</div>
        <div className="flex gap-2">
          <button
            onClick={onScanAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw size={10} /> SCAN ALL
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono text-black bg-white hover:bg-zinc-200 transition-colors"
          >
            <Plus size={10} /> ADD
          </button>
        </div>
      </div>

      {competitors.length === 0 ? (
        <div className="text-xs text-zinc-600 py-4 text-center">No competitors added yet.</div>
      ) : (
        <div className="space-y-2">
          {competitors.map(comp => (
            <div key={comp.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-3 py-2.5">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${comp.is_active ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  <span className="text-sm text-white font-mono truncate">{comp.handle}</span>
                  <span className="text-[10px] text-zinc-500 uppercase border border-zinc-700 px-1.5 py-0.5 flex-shrink-0">{comp.platform}</span>
                  {comp.last_scraped_at && (
                    <span className="text-[10px] text-zinc-600 flex-shrink-0">
                      scraped {new Date(comp.last_scraped_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {comp.last_scan_status === "ok" && (
                  <div className="flex items-center gap-1 pl-4">
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-emerald-400" />
                    <span className="text-[9px] font-mono text-zinc-500">scraped {comp.last_scan_scraped ?? 0} posts</span>
                  </div>
                )}
                {comp.last_scan_status === "partial" && (
                  <div className="flex items-center gap-1 pl-4">
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-yellow-400" />
                    <span className="text-[9px] font-mono text-zinc-500">scraped {comp.last_scan_scraped ?? 0}, recreated {comp.last_scan_recreated ?? 0}</span>
                  </div>
                )}
                {comp.last_scan_status === "failed" && (
                  <div className="flex items-center gap-1 pl-4" title={comp.last_scan_error || "Scan failed"}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-red-500" />
                    <span className="text-[9px] font-mono text-zinc-500">scan failed</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <button
                  onClick={() => handleScanOne(comp.id)}
                  disabled={scanning[comp.id]}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white px-2 py-1 border border-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-40"
                >
                  {scanning[comp.id] ? "..." : "SCAN"}
                </button>
                <button
                  onClick={() => handleToggle(comp)}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white px-2 py-1 border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  {comp.is_active ? "PAUSE" : "RESUME"}
                </button>
                <button onClick={() => handleDelete(comp.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddCompetitorModal
          clientId={clientId}
          onClose={() => setShowModal(false)}
          onAdded={c => onUpdate([...competitors, c])}
        />
      )}
    </div>
  );
}

// ─── PostLibrary ──────────────────────────────────────────────────────────────

function PostLibrary({ rankedPosts, loading, filter, setFilter, competitors, onRefresh }) {
  const [recreating, setRecreating] = useState({});

  const handleRecreate = async (postId) => {
    setRecreating(r => ({ ...r, [postId]: true }));
    try {
      await axios.post(`${API}/competitor-posts/${postId}/recreate`);
      toast.success("Recreation draft added to queue");
      onRefresh();
    } catch {
      toast.error("Recreation failed");
    } finally {
      setRecreating(r => ({ ...r, [postId]: false }));
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          Scraped Post Library
        </div>
        <div className="flex gap-2">
          <select
            value={filter.competitor_id}
            onChange={e => setFilter(f => ({ ...f, competitor_id: e.target.value }))}
            className="bg-zinc-950 border border-zinc-700 text-[10px] font-mono text-zinc-400 px-2 py-1 focus:outline-none"
          >
            <option value="">All Competitors</option>
            {competitors.map(c => <option key={c.id} value={c.id}>{c.handle}</option>)}
          </select>
          <select
            value={filter.post_type}
            onChange={e => setFilter(f => ({ ...f, post_type: e.target.value }))}
            className="bg-zinc-950 border border-zinc-700 text-[10px] font-mono text-zinc-400 px-2 py-1 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="carousel">Carousel</option>
            <option value="single">Single</option>
            <option value="reel">Reel</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-600 py-4 text-center">Loading...</div>
      ) : rankedPosts.length === 0 ? (
        <div className="text-xs text-zinc-600 py-4 text-center">No scraped posts yet. Run a scan to populate.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rankedPosts.map(post => (
            <div key={post.id} className={`bg-zinc-950 border ${getRankBorderColor(post._rank)} p-3 flex flex-col gap-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono px-1 py-0.5 border ${getRankTier(post._rank)}`}>
                    #{post._rank}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase border border-zinc-800 px-1.5 py-0.5">
                    {post.post_type}
                  </span>
                </div>
                {post.recreated && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500">
                    <CheckCircle size={10} /> recreated
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 line-clamp-3">{post.caption || "(no caption)"}</p>
              <div className="flex items-center gap-3 text-[10px] text-zinc-600 font-mono">
                <span>♥ {post.likes}</span>
                <span>💬 {post.comments}</span>
                <span>↗ {post.shares}</span>
                <div className="ml-auto text-right">
                  <div className="text-zinc-500">score: {post.engagement_score}</div>
                  {post._percentile && (
                    <div className="text-zinc-600">{post._percentile}</div>
                  )}
                </div>
              </div>
              {!post.recreated && (
                <button
                  onClick={() => handleRecreate(post.id)}
                  disabled={recreating[post.id]}
                  className="w-full text-[10px] font-mono py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-40"
                >
                  {recreating[post.id] ? "RECREATING..." : "RECREATE"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AnalysisPanel ────────────────────────────────────────────────────────────

function AnalysisPanel({ rankedPosts, competitors, loading }) {
  const competitorMap = useMemo(() => {
    const m = {};
    competitors.forEach(c => { m[c.id] = c.handle; });
    return m;
  }, [competitors]);

  const byType = useMemo(() => {
    const counts = {};
    rankedPosts.forEach(p => {
      counts[p.post_type] = (counts[p.post_type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rankedPosts]);

  const topHashtags = useMemo(() => {
    const freq = {};
    rankedPosts.forEach(p => (p.hashtags || []).forEach(h => {
      freq[h] = (freq[h] || 0) + 1;
    }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rankedPosts]);

  const byCompetitor = useMemo(() => {
    const map = {};
    rankedPosts.forEach(p => {
      if (!map[p.competitor_id]) map[p.competitor_id] = { totalScore: 0, postCount: 0 };
      map[p.competitor_id].totalScore += p.engagement_score;
      map[p.competitor_id].postCount += 1;
    });
    return Object.entries(map)
      .map(([id, data]) => ({ handle: competitorMap[id] || id, ...data }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [rankedPosts, competitorMap]);

  const maxScore = byCompetitor[0]?.totalScore || 1;
  const top10 = rankedPosts.slice(0, 10);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-600 py-4 text-center">Loading analysis...</div>
      </div>
    );
  }

  if (rankedPosts.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Analysis</div>
        <div className="text-xs text-zinc-600 py-4 text-center">No data yet. Run a scan first.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Leaderboard */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Top 10 Posts</div>
        <div className="space-y-1.5">
          {top10.map(post => (
            <div key={post.id} className="flex items-center gap-2 py-1 border-b border-zinc-800/60 last:border-0">
              <span className={`text-[10px] font-mono px-1 py-0.5 border flex-shrink-0 ${getRankTier(post._rank)}`}>
                #{post._rank}
              </span>
              <p className="text-[10px] text-zinc-400 flex-1 truncate min-w-0">
                {(post.caption || "(no caption)").slice(0, 45)}
              </p>
              <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">
                {competitorMap[post.competitor_id] || "—"}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 flex-shrink-0 w-10 text-right">
                {post.engagement_score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content Type Breakdown */}
      {byType.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Content Mix</div>
          <div className="space-y-2.5">
            {byType.map(([type, count]) => {
              const pct = Math.round((count / rankedPosts.length) * 100);
              return (
                <div key={type}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">{type}</span>
                    <span className="text-[10px] font-mono text-zinc-600">{count} · {pct}%</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full">
                    <div style={{ width: `${pct}%` }} className="h-full bg-zinc-400 rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competitor Comparison */}
      {byCompetitor.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Competitor Comparison</div>
          <div className="space-y-2.5">
            {byCompetitor.map(({ handle, totalScore, postCount }) => (
              <div key={handle}>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-mono text-zinc-400">{handle}</span>
                  <span className="text-[10px] font-mono text-zinc-600">{postCount} posts · {totalScore.toLocaleString()}</span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full">
                  <div
                    style={{ width: `${Math.round((totalScore / maxScore) * 100)}%` }}
                    className="h-full bg-zinc-300 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hashtag Cloud */}
      {topHashtags.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Top Hashtags</div>
          <div className="flex flex-wrap gap-1.5">
            {topHashtags.map(([tag, count]) => (
              <span
                key={tag}
                className="text-[10px] font-mono text-zinc-400 border border-zinc-700 px-1.5 py-0.5"
                title={`${count} posts`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RecreationQueue ──────────────────────────────────────────────────────────

function RecreationQueue({ clientId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState({});
  const publishingInFlight = useRef(new Set());

  useEffect(() => {
    axios.get(`${API}/posts`, { params: { client_id: clientId } })
      .then(({ data }) => {
        const recreations = data.filter(p => p.source?.type === "competitor_recreation");
        setPosts(recreations);
      })
      .catch(() => toast.error("Failed to load recreation queue"))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handlePublish = async (postId) => {
    if (publishingInFlight.current.has(postId)) return;
    publishingInFlight.current.add(postId);
    setPublishing(p => ({ ...p, [postId]: true }));
    try {
      await axios.post(`${API}/posts/${postId}/publish`);
      toast.success("Post published");
      setPosts(p => p.map(x => x.id === postId ? { ...x, status: "published" } : x));
    } catch {
      toast.error("Publish failed");
    } finally {
      publishingInFlight.current.delete(postId);
      setPublishing(p => ({ ...p, [postId]: false }));
    }
  };

  const STATUS_BADGE = {
    draft: "border-zinc-700 text-zinc-400",
    scheduled: "border-amber-700 text-amber-400",
    published: "border-emerald-700 text-emerald-400",
    failed: "border-red-900 text-red-400",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
        Recreation Queue
      </div>
      {loading ? (
        <div className="text-xs text-zinc-600 py-2 text-center">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="text-xs text-zinc-600 py-2 text-center">No recreated posts yet.</div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => (
            <div key={post.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-3 py-2.5 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 truncate">{post.text || "(carousel)"}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {post.platform} · {new Date(post.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-mono border px-2 py-0.5 ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}>
                  {post.status?.toUpperCase()}
                </span>
                {(post.status === "draft" || post.status === "scheduled") && (
                  <button
                    onClick={() => handlePublish(post.id)}
                    disabled={publishing[post.id]}
                    className="text-[10px] font-mono px-2 py-0.5 border border-zinc-700 text-zinc-400 hover:border-emerald-700 hover:text-emerald-400 transition-colors disabled:opacity-40"
                  >
                    {publishing[post.id] ? "..." : "PUBLISH NOW"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StrategyPanel ────────────────────────────────────────────────────────────

function StrategyPanel({ clientId, strategy, onStrategyUpdate }) {
  const [loading, setLoading] = useState(false);

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/clients/${clientId}/competitor-strategy/refresh`
      );
      onStrategyUpdate(data.competitor_strategy ?? data);
    } catch {
      toast.error("Failed to generate strategy");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const themes = strategy?.themes ?? [];
  const formats = strategy?.formats ?? [];
  const frequency = strategy?.frequency ?? null;
  const hashtags = strategy?.top_hashtags ?? [];
  const insight = strategy?.insight ?? null;
  const generatedAt = formatDate(strategy?.generated_at);

  return (
    <div className="border border-zinc-800 bg-zinc-900 p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          Competitor Strategy
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="text-[10px] font-mono text-zinc-600">{generatedAt}</span>
          )}
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="flex items-center gap-1.5 text-[10px] font-mono border border-zinc-700 px-2 py-1 hover:border-zinc-500 text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
            {loading ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        /* Skeleton */
        <div className="space-y-3 animate-pulse">
          <div className="h-3 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-2/3" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
          <div className="flex gap-8 mt-4">
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-3 bg-zinc-800 rounded w-24" />
          </div>
        </div>
      ) : !strategy ? (
        /* Empty state */
        <p className="text-xs font-mono text-zinc-500">
          No strategy generated yet. Run a competitor scan first, or click Regenerate.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Insight */}
          {insight && (
            <div>
              <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Insight</div>
              <p className="text-xs font-mono text-zinc-300 leading-relaxed">{insight}</p>
            </div>
          )}

          {/* Grid row: Themes / Formats / Frequency / Hashtags */}
          <div className="grid grid-cols-4 gap-4">
            {/* Themes */}
            <div>
              <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Themes</div>
              <div className="flex flex-wrap gap-1">
                {themes.length > 0 ? themes.map((t, i) => (
                  <span
                    key={i}
                    className="text-[9px] font-mono border border-zinc-700 px-1.5 py-0.5 text-zinc-400"
                  >
                    {t}
                  </span>
                )) : (
                  <span className="text-[9px] font-mono text-zinc-600">—</span>
                )}
              </div>
            </div>

            {/* Formats */}
            <div>
              <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Formats</div>
              <div className="space-y-0.5">
                {formats.length > 0 ? formats.map((f, i) => (
                  <div key={i} className="text-[9px] font-mono text-zinc-400">
                    {typeof f === "object" ? `${f.type} ${f.pct ?? ""}`.trim() : f}
                  </div>
                )) : (
                  <span className="text-[9px] font-mono text-zinc-600">—</span>
                )}
              </div>
            </div>

            {/* Frequency */}
            <div>
              <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Frequency</div>
              <div className="text-[9px] font-mono text-zinc-400">
                {frequency ?? <span className="text-zinc-600">—</span>}
              </div>
            </div>

            {/* Top Hashtags */}
            <div>
              <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Top Hashtags</div>
              <div className="flex flex-wrap gap-1">
                {hashtags.length > 0 ? hashtags.map((h, i) => (
                  <span
                    key={i}
                    className="text-[9px] font-mono border border-zinc-800 px-1.5 py-0.5 text-zinc-500"
                  >
                    {h.startsWith("#") ? h : `#${h}`}
                  </span>
                )) : (
                  <span className="text-[9px] font-mono text-zinc-600">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CompetitorTab (root) ─────────────────────────────────────────────────────

export default function CompetitorTab({ clientId }) {
  const [competitors, setCompetitors] = useState([]);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postFilter, setPostFilter] = useState({ competitor_id: "", platform: "", post_type: "" });
  const [strategy, setStrategy] = useState(null);

  // Fetch competitors
  useEffect(() => {
    axios.get(`${API}/clients/${clientId}/competitors`)
      .then(({ data }) => setCompetitors(data))
      .catch(() => toast.error("Failed to load competitors"));
  }, [clientId]);

  // Fetch client to get competitor_strategy
  useEffect(() => {
    axios.get(`${API}/clients/${clientId}`)
      .then(({ data }) => {
        if (data.competitor_strategy) setStrategy(data.competitor_strategy);
      })
      .catch(() => {
        // Non-fatal — strategy panel will show empty state
      });
  }, [clientId]);

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(postFilter).filter(([, v]) => v)
      );
      const { data } = await axios.get(`${API}/clients/${clientId}/competitor-posts`, { params });
      setPosts(data);
    } catch {
      toast.error("Failed to load competitor posts");
    } finally {
      setPostsLoading(false);
    }
  }, [clientId, postFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const rankedPosts = useMemo(() => rankPosts(posts), [posts]);

  const handleScanAll = async () => {
    try {
      await axios.post(`${API}/clients/${clientId}/competitors/scan`);
      toast.success("Full scan started");
    } catch {
      toast.error("Scan failed");
    }
  };

  return (
    <div className="space-y-4">
      {/* Strategy panel — full width above the two-column layout */}
      <StrategyPanel
        clientId={clientId}
        strategy={strategy}
        onStrategyUpdate={setStrategy}
      />

      <div className="flex gap-4 items-start">
        {/* Left column — 60% */}
        <div className="flex-[3] min-w-0 space-y-4">
          <CompetitorList
            competitors={competitors}
            clientId={clientId}
            onUpdate={setCompetitors}
            onScanAll={handleScanAll}
          />
          <PostLibrary
            rankedPosts={rankedPosts}
            loading={postsLoading}
            filter={postFilter}
            setFilter={setPostFilter}
            competitors={competitors}
            onRefresh={fetchPosts}
          />
        </div>

        {/* Right column — 40% */}
        <div className="flex-[2] min-w-0 space-y-4">
          <AnalysisPanel
            rankedPosts={rankedPosts}
            competitors={competitors}
            loading={postsLoading}
          />
          <RecreationQueue clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
