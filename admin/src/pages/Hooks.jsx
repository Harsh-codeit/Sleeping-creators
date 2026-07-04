import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import api from "../api.js";

const HOOK_TYPES = ["question", "myth_bust", "story", "statistic", "challenge", "tip", "relatable", "controversial", "listicle", "other"];
const NICHES = ["fitness", "food", "travel", "fashion", "tech", "business", "beauty", "lifestyle", "education", "entertainment", "other"];

const EMPTY_FORM = { hook_text: "", hook_type: "", niche: "", creator_id: "" };

export default function Hooks() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [filterNiche, setFilterNiche] = useState("");
  const [filterType, setFilterType] = useState("");

  const load = () => {
    api.get("/api/admin/hooks").then(r => setHooks(r.data)).catch(() => toast.error("Failed to load hooks")).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addHook = async e => {
    e.preventDefault();
    if (!form.hook_text.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/admin/hooks", form);
      toast.success("Hook added");
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error("Failed to add hook");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteHook = async (id) => {
    if (!confirm("Delete this hook?")) return;
    try {
      await api.delete(`/api/admin/hooks/${id}`);
      setHooks(h => h.filter(x => x.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const toggleActive = async (hook) => {
    try {
      await api.patch(`/api/admin/hooks/${hook._id}`, { is_active: !hook.is_active });
      setHooks(h => h.map(x => x._id === hook._id ? { ...x, is_active: !x.is_active } : x));
    } catch {
      toast.error("Failed to update");
    }
  };

  const globalHooks = hooks.filter(h => !h.creator_id);
  const userHooks = hooks.filter(h => h.creator_id);

  const filterFn = h => (!filterNiche || h.niche === filterNiche) && (!filterType || h.hook_type === filterType);

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Hook Library</h1>
          <p style={{ fontSize: 13, color: "#555" }}>{globalHooks.length} global · {userHooks.length} user-specific</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#5B5BD6", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Plus size={14} /> Add Hook
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, margin: "20px 0" }}>
        <Select value={filterNiche} onChange={e => setFilterNiche(e.target.value)} placeholder="All niches">
          {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} placeholder="All types">
          {HOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      {loading ? <div style={{ color: "#555", fontSize: 14, padding: 20 }}>Loading…</div> : (
        <>
          <Section title="Global Hooks" hooks={globalHooks.filter(filterFn)} onDelete={deleteHook} onToggle={toggleActive} />
          <Section title="User Hooks" hooks={userHooks.filter(filterFn)} onDelete={deleteHook} onToggle={toggleActive} showUser />
        </>
      )}

      {/* Add Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowModal(false)}>
          <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 20, padding: 32, width: 500, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Add Hook</div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555" }}><X size={16} /></button>
            </div>

            <form onSubmit={addHook} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Hook Text</label>
                <textarea
                  rows={4}
                  value={form.hook_text}
                  onChange={e => setForm(f => ({ ...f, hook_text: e.target.value }))}
                  placeholder="Write the hook content…"
                  style={{ ...inputStyle, resize: "vertical" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Hook Type</label>
                  <select value={form.hook_type} onChange={e => setForm(f => ({ ...f, hook_type: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>
                    <option value="">Select type…</option>
                    {HOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Niche</label>
                  <select value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>
                    <option value="">Select niche…</option>
                    {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Creator ID <span style={{ color: "#444", fontWeight: 400, textTransform: "none" }}>(leave blank for global)</span></label>
                <input
                  value={form.creator_id}
                  onChange={e => setForm(f => ({ ...f, creator_id: e.target.value }))}
                  placeholder="Optional — paste user _id for user-specific hook"
                  style={inputStyle}
                />
              </div>

              <button type="submit" disabled={submitting} style={{ padding: "12px", background: submitting ? "#3a3a6a" : "#5B5BD6", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {submitting ? "Adding…" : "Add Hook"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, hooks, onDelete, onToggle, showUser = false }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>{title} ({hooks.length})</div>
      {!hooks.length ? (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: 20, textAlign: "center", color: "#444", fontSize: 13 }}>No hooks found</div>
      ) : (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                {["Hook", "Type", "Niche", "Usage", ...(showUser ? ["User"] : []), "Active", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hooks.map(h => (
                <tr key={h._id} style={{ borderBottom: "1px solid #1e1e1e" }}>
                  <td style={{ padding: "12px 14px", maxWidth: 320 }}>
                    <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {h.hook_text}
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {h.hook_type ? <Tag>{h.hook_type}</Tag> : <span style={{ color: "#444", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {h.niche ? <Tag color="#34d399" bg="#0a2a1a">{h.niche}</Tag> : <span style={{ color: "#444", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#888" }}>{h.usage_count || 0}</td>
                  {showUser && (
                    <td style={{ padding: "12px 14px", fontSize: 10, color: "#555", fontFamily: "monospace" }}>
                      {h.creator_id?.slice(-8) || "—"}
                    </td>
                  )}
                  <td style={{ padding: "12px 14px" }}>
                    <button onClick={() => onToggle(h)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {h.is_active !== false
                        ? <ToggleRight size={20} style={{ color: "#34d399" }} />
                        : <ToggleLeft size={20} style={{ color: "#444" }} />}
                    </button>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <button onClick={() => onDelete(h.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <Trash2 size={13} style={{ color: "#555" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tag({ children, color = "#a78bfa", bg = "#1e1e3a" }) {
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: "3px 7px" }}>{children}</span>;
}

function Select({ value, onChange, placeholder, children }) {
  return (
    <select value={value} onChange={onChange} style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "9px 13px", color: value ? "#fff" : "#555", fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

const labelStyle = { display: "block", fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 };
const inputStyle = { background: "#0d0d0d", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "10px 13px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };
