import { useState, useEffect, useRef } from "react";
import api from "../api";

const S = {
  page:    { padding: "28px 32px", maxWidth: 960, margin: "0 auto" },
  h1:      { fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 4 },
  sub:     { fontSize: 13, color: "#666", marginBottom: 28 },
  card:    { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "20px 24px", marginBottom: 20 },
  label:   { fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" },
  input:   { width: "100%", background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" },
  btn:     { padding: "10px 20px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  stat:    { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 140 },
  chip:    { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#1e1e3a", color: "#8080ff", marginRight: 6, marginBottom: 6 },
  row:     { display: "flex", gap: 12, marginBottom: 8 },
  badge:   { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
};

const STATUS_COLORS = {
  done:    { background: "#0a2016", color: "#22c55e" },
  running: { background: "#1a1200", color: "#f59e0b" },
  pending: { background: "#1a1a1a", color: "#888" },
  failed:  { background: "#2a0a0a", color: "#ef4444" },
};

function StatCard({ label, value, sub }) {
  return (
    <div style={S.stat}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "6px 0 2px" }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: "#555" }}>{sub}</div>}
    </div>
  );
}

function DistributionSection({ title, data }) {
  if (!data || Object.keys(data).length === 0) return null;
  const max = Math.max(...Object.values(data));
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "#aaa", width: 160, flexShrink: 0 }}>{key}</div>
            <div style={{ flex: 1, background: "#1a1a1a", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((count / max) * 100)}%`, background: "#5B5BD6", height: "100%", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 12, color: "#666", width: 36, textAlign: "right" }}>{count}</div>
          </div>
        ))}
    </div>
  );
}

export default function PerformanceLibrary() {
  const [driveUrl, setDriveUrl]       = useState("");
  const [sourceLabel, setSourceLabel] = useState("performance_dataset_v1");
  const [ingesting, setIngesting]     = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobs, setJobs]               = useState([]);
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError]             = useState("");
  const [deleteSource, setDeleteSource] = useState("");
  const [deleting, setDeleting]       = useState(false);
  const pollRef                       = useRef(null);

  const loadJobs = async () => {
    try {
      const { data } = await api.get("/api/admin/performance-library/jobs?limit=20");
      setJobs(data.jobs || []);
    } catch { /* silent */ }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const { data } = await api.get("/api/admin/performance-library/stats");
      setStats(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    loadStats();
  }, []);

  // Poll active job every 4s
  useEffect(() => {
    if (!activeJobId) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      await loadJobs();
      const updatedJobs = (await api.get("/api/admin/performance-library/jobs?limit=20")).data.jobs || [];
      const job = updatedJobs.find(j => j.id === activeJobId);
      if (job && (job.status === "done" || job.status === "failed")) {
        clearInterval(pollRef.current);
        setActiveJobId(null);
        setIngesting(false);
        loadStats();
      }
      setJobs(updatedJobs);
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [activeJobId]);

  const handleIngest = async () => {
    if (!driveUrl.trim()) { setError("Enter a Google Drive folder URL"); return; }
    setError("");
    setIngesting(true);
    try {
      const { data } = await api.post("/api/admin/performance-library/ingest", {
        drive_folder_url: driveUrl.trim(),
        source_label: sourceLabel.trim() || "performance_dataset_v1",
      });
      setActiveJobId(data.job_id);
      loadJobs();
    } catch (e) {
      setError(e.response?.data?.detail || "Ingestion start failed");
      setIngesting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteSource.trim()) { setError("Enter the source label to delete"); return; }
    if (!window.confirm(`Delete ALL entries with source="${deleteSource}"?`)) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/api/admin/performance-library/${encodeURIComponent(deleteSource.trim())}`);
      setDeleteSource("");
      loadStats();
      alert(`Deleted ${data.deleted} entries.`);
    } catch (e) {
      setError(e.response?.data?.detail || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const activeJob = jobs.find(j => j.id === activeJobId) || jobs.find(j => j.status === "running");

  return (
    <div style={S.page}>
      <div style={S.h1}>Performance Library</div>
      <div style={S.sub}>
        Ingest viral Instagram carousel screenshots from Google Drive. Claude Vision analyzes each image,
        extracts hook patterns and engagement numbers, and stores them as RAG references for AI generation.
      </div>

      {error && (
        <div style={{ background: "#2a0a0a", border: "1px solid #ef4444", borderRadius: 10, padding: "10px 16px", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>Loading stats…</div>
      ) : stats ? (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa", marginBottom: 16 }}>Library Overview</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Total Images" value={stats.total} sub="analyzed by Claude Vision" />
            <StatCard label="Niches Covered" value={Object.keys(stats.by_niche || {}).length} />
            <StatCard label="Hook Types" value={Object.keys(stats.by_hook_type || {}).length} />
            <StatCard label="Formats" value={Object.keys(stats.by_format || {}).length} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
            <DistributionSection title="By Niche" data={stats.by_niche} />
            <DistributionSection title="By Hook Type" data={stats.by_hook_type} />
            <DistributionSection title="By Format" data={stats.by_format} />
          </div>
          {stats.top_by_engagement?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Top by Engagement Score</div>
              {stats.top_by_engagement.map((ex, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e1e3a", color: "#8080ff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#ddd" }}>{ex.headline_text || "(no headline)"}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      {(ex.niches || []).map(n => <span key={n} style={S.chip}>{n}</span>)}
                      <span style={{ color: "#666" }}>{ex.hook_type}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>
                    {(ex.likes_count / 1000).toFixed(1)}K likes
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Ingest panel ──────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa", marginBottom: 16 }}>Ingest from Google Drive</div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Google Drive Folder URL</label>
          <input
            style={S.input}
            placeholder="https://drive.google.com/drive/folders/..."
            value={driveUrl}
            onChange={e => setDriveUrl(e.target.value)}
            disabled={ingesting}
          />
          <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>
            Folder must be set to "Anyone with the link can view". Requires GOOGLE_DRIVE_API_KEY on the server.
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>Dataset / Source Label</label>
          <input
            style={{ ...S.input, maxWidth: 320 }}
            placeholder="performance_dataset_v1"
            value={sourceLabel}
            onChange={e => setSourceLabel(e.target.value)}
            disabled={ingesting}
          />
          <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>
            Used to identify and delete this batch later. Use a descriptive version label.
          </div>
        </div>

        <button
          style={{ ...S.btn, background: ingesting ? "#2a2a2a" : "#5B5BD6", color: ingesting ? "#555" : "#fff" }}
          onClick={handleIngest}
          disabled={ingesting}
        >
          {ingesting ? "Ingestion Running…" : "Start Ingestion"}
        </button>

        {/* Active job progress */}
        {activeJob && (
          <div style={{ marginTop: 16, background: "#0d0d0d", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa" }}>Job: {activeJob.id?.slice(0, 8)}…</div>
              <span style={{ ...S.badge, ...(STATUS_COLORS[activeJob.status] || {}) }}>{activeJob.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              {activeJob.processed_count} / {activeJob.total_count || "?"} images processed
              {activeJob.failed_count > 0 && ` · ${activeJob.failed_count} failed`}
            </div>
            {activeJob.total_count > 0 && (
              <div style={{ background: "#1a1a1a", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round(((activeJob.processed_count + activeJob.failed_count) / activeJob.total_count) * 100)}%`,
                  background: activeJob.status === "failed" ? "#ef4444" : "#5B5BD6",
                  height: "100%", borderRadius: 4, transition: "width 0.5s ease"
                }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Job history ───────────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa", marginBottom: 14 }}>Ingestion History</div>
          {jobs.map(job => (
            <div key={job.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #1e1e1e" }}>
              <span style={{ ...S.badge, ...(STATUS_COLORS[job.status] || {}), marginTop: 2, flexShrink: 0 }}>
                {job.status}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#ddd", wordBreak: "break-all" }}>{job.source_url}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                  {job.processed_count || 0} processed · {job.failed_count || 0} failed · {job.total_count || "?"} total
                  <span style={{ marginLeft: 10 }}>{job.started_at ? new Date(job.started_at).toLocaleString() : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Danger zone ───────────────────────────────────────────── */}
      <div style={{ ...S.card, border: "1px solid #3a1a1a" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 12 }}>Danger Zone — Delete Dataset</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Source Label to Delete</label>
            <input
              style={S.input}
              placeholder="performance_dataset_v1"
              value={deleteSource}
              onChange={e => setDeleteSource(e.target.value)}
              disabled={deleting}
            />
          </div>
          <button
            style={{ ...S.btn, background: "#2a0a0a", color: "#ef4444", border: "1px solid #3a1a1a", flexShrink: 0 }}
            onClick={handleDelete}
            disabled={deleting || !deleteSource.trim()}
          >
            {deleting ? "Deleting…" : "Delete Batch"}
          </button>
        </div>
      </div>
    </div>
  );
}
