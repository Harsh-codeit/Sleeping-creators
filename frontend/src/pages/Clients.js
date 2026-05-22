import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Plus, Pause, Play, Trash2, Circle, ExternalLink, RefreshCw, Sparkles, Search, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ALL_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "twitter", "threads"];

const STATUS_DOT = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  error: "text-red-400",
};

function AddClientDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "", industry: "", brand_voice: "professional and insightful",
    target_audience: "", bio: "", platforms: []
  });
  const [saving, setSaving] = useState(false);

  const togglePlatform = (p) => {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p]
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Client name is required");
    if (form.platforms.length === 0) return toast.error("Select at least one platform");
    setSaving(true);
    try {
      const resp = await axios.post(`${API}/clients`, form);
      toast.success(`Client "${resp.data.name}" added`);
      onCreated(resp.data);
      onClose();
      setForm({ name: "", industry: "", brand_voice: "professional and insightful", target_audience: "", bio: "", platforms: [] });
    } catch (e) {
      toast.error("Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border border-zinc-800 text-white max-w-md rounded-none p-0">
        <DialogHeader className="px-6 py-4 border-b border-zinc-800">
          <DialogTitle className="text-base font-bold">Add New Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Client Name *</label>
            <input
              data-testid="client-name-input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Acme Corp"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Industry</label>
            <input
              data-testid="client-industry-input"
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              placeholder="SaaS / Technology"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Brand Voice</label>
            <input
              data-testid="client-brand-voice-input"
              value={form.brand_voice}
              onChange={e => setForm(f => ({ ...f, brand_voice: e.target.value }))}
              placeholder="professional, inspiring, data-driven"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Target Audience</label>
            <input
              data-testid="client-audience-input"
              value={form.target_audience}
              onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
              placeholder="B2B decision-makers, 30-50"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">About the Client</label>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Tell us about yourself — your brand story, what makes you unique, your goals..."
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase">Platforms *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map(p => (
                <button
                  key={p}
                  type="button"
                  data-testid={`platform-toggle-${p}`}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs font-mono border transition-colors duration-150 ${
                    form.platforms.includes(p)
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="submit-client-btn"
              disabled={saving}
              className="flex-1 py-2 text-sm bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const { role, permissions } = useUser();
  const cp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.clients ?? { view: true, create: true, edit: true, delete: true });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterIG,       setFilterIG]       = useState("");
  const [filterToday,    setFilterToday]    = useState(false);
  const [filterFailed,   setFilterFailed]   = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  const fetchClients = async () => {
    try {
      const resp = await axios.get(`${API}/clients`);
      setClients(resp.data);
    } catch { toast.error("Failed to load clients"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClients(); }, []);

  const auditInstagram = async () => {
    if (!window.confirm("Audit all connected Instagram accounts? This will check each account's type and flag any that can't publish carousels (Personal accounts, expired tokens). Takes ~1s per client.")) return;
    setAuditing(true);
    setAuditResult(null);
    try {
      const resp = await axios.post(`${API}/instagram/audit`);
      setAuditResult(resp.data);
      const { checked, ok, blocked, errors } = resp.data;
      if (blocked === 0 && errors === 0) {
        toast.success(`Audit complete: all ${ok} of ${checked} accounts can publish`);
      } else {
        toast.warning(`Audit found ${blocked} blocked + ${errors} errored out of ${checked} accounts`);
      }
      await fetchClients();
    } catch (e) {
      toast.error(`Audit failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setAuditing(false);
    }
  };

  const togglePause = async (client, e) => {
    e.stopPropagation();
    try {
      if (client.status === "active") {
        await axios.post(`${API}/clients/${client.id}/pause`);
        setClients(c => c.map(x => x.id === client.id ? { ...x, status: "paused" } : x));
        toast.warning(`${client.name} paused`);
      } else {
        await axios.post(`${API}/clients/${client.id}/resume`);
        setClients(c => c.map(x => x.id === client.id ? { ...x, status: "active" } : x));
        toast.success(`${client.name} resumed`);
      }
    } catch { toast.error("Failed to update status"); }
  };

  const filteredClients = clients.filter(c => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !(c.industry || "").toLowerCase().includes(q)
      ) return false;
    }
    if (filterStatus   && c.status !== filterStatus) return false;
    if (filterPlatform && !(c.platforms || []).includes(filterPlatform)) return false;
    if (filterIG === "connected"     && !c.instagram_connected) return false;
    if (filterIG === "not_connected" &&  c.instagram_connected) return false;
    if (filterToday  && !(c.posts_today  > 0)) return false;
    if (filterFailed && !(c.posts_failed > 0)) return false;
    return true;
  });

  const hasActiveFilters =
    !!search.trim() || !!filterStatus || !!filterPlatform ||
    !!filterIG || filterToday || filterFailed;

  const clearAllFilters = () => {
    setSearch("");
    setFilterStatus("");
    setFilterPlatform("");
    setFilterIG("");
    setFilterToday(false);
    setFilterFailed(false);
  };

  const deleteClient = async (client, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${client.name}" and all their posts?`)) return;
    try {
      await axios.delete(`${API}/clients/${client.id}`);
      setClients(c => c.filter(x => x.id !== client.id));
      toast.success("Client deleted");
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div className="p-6" data-testid="clients-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{clients.length} clients configured</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={auditInstagram}
            disabled={auditing}
            data-testid="audit-instagram-btn"
            title="Check every connected Instagram account for publish capability"
            className="flex items-center gap-2 px-3 py-2 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={14} className={auditing ? "animate-pulse" : ""} />
            {auditing ? "Auditing..." : "Audit IG"}
          </button>
          <button
            onClick={fetchClients}
            data-testid="refresh-clients-btn"
            className="p-2 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <RefreshCw size={14} />
          </button>
          {cp.create && (
            <button
              onClick={() => navigate("/onboarding")}
              data-testid="onboard-client-btn"
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150"
            >
              <Sparkles size={14} />
              Onboard Client
            </button>
          )}
          {cp.create && (
            <button
              onClick={() => setShowAdd(true)}
              data-testid="add-client-btn"
              className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors duration-150"
            >
              <Plus size={14} />
              Quick Add
            </button>
          )}
        </div>
      </div>

      {/* Audit result panel */}
      {auditResult && (auditResult.blocked > 0 || auditResult.errors > 0) && (
        <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="text-sm text-amber-200 font-semibold">
                Instagram audit found issues
              </div>
              <div className="text-xs font-mono text-zinc-400">
                {auditResult.checked} checked · <span className="text-emerald-400">{auditResult.ok} OK</span> ·{" "}
                <span className="text-amber-400">{auditResult.blocked} blocked</span> ·{" "}
                <span className="text-red-400">{auditResult.errors} errors</span>
              </div>
              <div className="space-y-1 mt-2">
                {auditResult.details?.map((d) => (
                  <div key={d.client_id} className="text-xs font-mono flex items-center gap-2">
                    <span className={d.status === "personal_account" ? "text-amber-400" : "text-red-400"}>
                      {d.status === "personal_account" ? "PERSONAL" : "ERROR"}
                    </span>
                    <span className="text-zinc-300">@{d.username || "(no username)"}</span>
                    <span className="text-zinc-500">— {d.account_type || d.detail || ""}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pt-2">
                Fix: have these clients switch to a Business or Creator account in the Instagram app, then reconnect.
              </div>
            </div>
            <button
              onClick={() => setAuditResult(null)}
              className="text-zinc-500 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total", value: clients.length },
          { label: "Active", value: clients.filter(c => c.status === "active").length },
          { label: "Paused", value: clients.filter(c => c.status === "paused").length },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-xs font-mono text-zinc-500 uppercase">{s.label}</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or industry..."
          className="w-full bg-zinc-900 border border-zinc-800 pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Status — tab buttons */}
        <div className="flex items-center border border-zinc-800">
          {[["", "All"], ["active", "Active"], ["paused", "Paused"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors duration-150 border-r border-zinc-800 last:border-0 ${
                filterStatus === val
                  ? "bg-white text-black font-semibold"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Platform — dropdown */}
        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none"
        >
          <option value="">All Platforms</option>
          {ALL_PLATFORMS.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        {/* Instagram — dropdown */}
        <select
          value={filterIG}
          onChange={e => setFilterIG(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none"
        >
          <option value="">All Instagram</option>
          <option value="connected">IG Connected</option>
          <option value="not_connected">IG Not Connected</option>
        </select>

        {/* Posts today — toggle chip */}
        <button
          onClick={() => setFilterToday(v => !v)}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors duration-150 ${
            filterToday
              ? "bg-emerald-900/40 border-emerald-700 text-emerald-400"
              : "border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800"
          }`}
        >
          Posts Today
        </button>

        {/* Failed posts — toggle chip */}
        <button
          onClick={() => setFilterFailed(v => !v)}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors duration-150 ${
            filterFailed
              ? "bg-red-900/40 border-red-700 text-red-400"
              : "border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800"
          }`}
        >
          Has Failures
        </button>

        {/* Count + clear */}
        <span className="text-xs font-mono text-zinc-600 ml-1">
          {filteredClients.length} of {clients.length}
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-white transition-colors"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800">
        <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-zinc-800 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          <div className="col-span-3">Client</div>
          <div className="col-span-2">Industry</div>
          <div className="col-span-3">Platforms</div>
          <div className="col-span-1 text-center">Today</div>
          <div className="col-span-1 text-center">Total</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">Loading clients...</div>
        ) : clients.length === 0 && !search ? (
          <div className="px-4 py-12 text-center">
            <div className="text-zinc-600 font-mono text-sm mb-3">No clients yet</div>
            <button onClick={() => setShowAdd(true)} className="text-xs text-white underline">Add your first client</button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">No clients match "{search}"</div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              className="grid grid-cols-12 gap-4 px-4 py-3 data-row cursor-pointer"
              onClick={() => navigate(`/clients/${client.id}`)}
              data-testid={`client-table-row-${client.id}`}
            >
              <div className="col-span-3 flex items-center gap-2.5">
                {client.profile_photo_url ? (
                  <img
                    src={client.profile_photo_url}
                    alt={client.name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-zinc-700"
                    onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                  />
                ) : null}
                <div
                  className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ display: client.profile_photo_url ? "none" : "flex" }}
                >
                  {client.avatar}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{client.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Circle size={5} className={`fill-current ${STATUS_DOT[client.status] || "text-zinc-500"}`} />
                    <span className="text-[10px] font-mono text-zinc-500 capitalize">{client.status}</span>
                  </div>
                </div>
              </div>
              <div className="col-span-2 flex items-center text-xs text-zinc-400 font-mono"><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{client.industry || "—"}</span></div>
              <div className="col-span-3 flex items-center flex-wrap gap-1">
                {(client.platforms || []).slice(0, 4).map(p => (
                  <span key={p} className="text-[9px] font-mono px-1 py-0.5 border border-zinc-700 text-zinc-500">
                    {p.slice(0, 2).toUpperCase()}
                  </span>
                ))}
                {(client.platforms || []).length > 4 && (
                  <span className="text-[9px] text-zinc-600 font-mono">+{client.platforms.length - 4}</span>
                )}
              </div>
              <div className="col-span-1 flex items-center justify-center text-sm font-mono text-white">{client.posts_today ?? 0}</div>
              <div className="col-span-1 flex items-center justify-center text-sm font-mono text-zinc-400">{client.posts_total ?? 0}</div>
              <div className="col-span-2 flex items-center justify-end gap-1">
                <button
                  data-testid={`client-pause-btn-${client.id}`}
                  onClick={e => togglePause(client, e)}
                  title={client.status === "active" ? "Pause" : "Resume"}
                  className="p-1.5 text-zinc-500 hover:text-white border border-transparent hover:border-zinc-700 transition-colors duration-150"
                >
                  {client.status === "active" ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <button
                  data-testid={`client-view-btn-${client.id}`}
                  onClick={e => { e.stopPropagation(); navigate(`/clients/${client.id}`); }}
                  className="p-1.5 text-zinc-500 hover:text-white border border-transparent hover:border-zinc-700 transition-colors duration-150"
                >
                  <ExternalLink size={13} />
                </button>
                {cp.delete && (
                  <button
                    data-testid={`client-delete-btn-${client.id}`}
                    onClick={e => deleteClient(client, e)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-900 transition-colors duration-150"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <AddClientDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(c) => setClients(prev => [...prev, c])}
      />
    </div>
  );
}
