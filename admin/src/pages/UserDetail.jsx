import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Star, CheckCircle2, XCircle, ChevronDown, X, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import api from "../api.js";

const SPICE_LABELS = { 1: "Conservative", 2: "Mild", 3: "Balanced", 4: "Bold", 5: "Very Bold" };
const NICHES = ["fitness", "food", "travel", "fashion", "tech", "business", "beauty", "lifestyle", "education", "entertainment", "other"];
const HOOK_TYPES = ["question", "myth_bust", "story", "statistic", "challenge", "tip", "relatable", "controversial", "listicle", "family_relationship", "emotional_state", "relatable_scene", "shocking_number", "credibility_borrow", "direct_confront", "other"];
const TABS = ["AI Profile", "Questionnaire", "Content DNA", "Generation History", "Hooks"];

export default function UserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  // Competitor chip input state
  const [competitorInput, setCompetitorInput] = useState("");
  const competitorRef = useRef(null);

  // Hooks tab state
  const [userHooks, setUserHooks] = useState([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksFetched, setHooksFetched] = useState(false);
  const [showAddHook, setShowAddHook] = useState(false);
  const [addingHook, setAddingHook] = useState(false);
  const [hookForm, setHookForm] = useState({ hook_text: "", hook_type: "", niche: "" });

  const load = () => {
    api.get(`/api/admin/users/${userId}`).then(r => {
      setData(r.data);
      const u = r.data.user;
      setForm({
        brand_voice:               u.brand_voice || "",
        target_audience:           u.target_audience || "",
        spice_level:               u.spice_level || 3,
        niche:                     u.niche || "",
        interests:                 (u.interests || []).join(", "),
        competitors:               u.competitors || [],
        // questionnaire fields editable in right panel
        niche_statement:           u.niche_statement || "",
        business_description:      u.business_description || "",
        content_language:          u.content_language || "",
        primary_goal:              u.primary_goal || "",
        content_cta:               u.content_cta || "",
      });
    }).catch(() => toast.error("Failed to load user")).finally(() => setLoading(false));
  };

  useEffect(load, [userId]);

  // Load hooks when Hooks tab is activated (now tab 4)
  useEffect(() => {
    if (tab === 4 && !hooksFetched) {
      setHooksLoading(true);
      api.get(`/api/admin/hooks?creator_id=${userId}`)
        .then(r => setUserHooks(Array.isArray(r.data) ? r.data : []))
        .catch(() => toast.error("Failed to load hooks"))
        .finally(() => { setHooksLoading(false); setHooksFetched(true); });
    }
  }, [tab, hooksFetched, userId]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const interests = form.interests ? form.interests.split(",").map(s => s.trim()).filter(Boolean) : [];
      await api.put(`/api/admin/users/${userId}/ai-settings`, {
        ...form,
        interests,
        spice_level: parseInt(form.spice_level) || 3,
      });
      toast.success("AI settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleWinner = async (dnaId, current) => {
    try {
      await api.post(`/api/admin/users/${userId}/dna/${dnaId}/winner`);
      setData(d => ({
        ...d,
        recent_dna: d.recent_dna.map(r => r._id === dnaId ? { ...r, is_winner: !current } : r),
      }));
    } catch {
      toast.error("Failed to toggle winner");
    }
  };

  // Competitor helpers
  const addCompetitor = () => {
    const val = competitorInput.trim().replace(/^@/, "");
    if (!val || form.competitors.includes(val) || form.competitors.length >= 10) return;
    setForm(f => ({ ...f, competitors: [...f.competitors, val] }));
    setCompetitorInput("");
    competitorRef.current?.focus();
  };

  const removeCompetitor = (handle) => {
    setForm(f => ({ ...f, competitors: f.competitors.filter(c => c !== handle) }));
  };

  // Hook management
  const addHook = async e => {
    e.preventDefault();
    if (!hookForm.hook_text.trim()) return;
    setAddingHook(true);
    try {
      const doc = await api.post("/api/admin/hooks", { ...hookForm, creator_id: userId });
      setUserHooks(h => [doc.data, ...h]);
      setHookForm({ hook_text: "", hook_type: "", niche: "" });
      setShowAddHook(false);
      toast.success("Hook added");
    } catch {
      toast.error("Failed to add hook");
    } finally {
      setAddingHook(false);
    }
  };

  const deleteHook = async (id) => {
    if (!confirm("Delete this hook?")) return;
    try {
      await api.delete(`/api/admin/hooks/${id}`);
      setUserHooks(h => h.filter(x => x.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const toggleHookActive = async (hook) => {
    try {
      await api.patch(`/api/admin/hooks/${hook.id}`, { is_active: !hook.is_active });
      setUserHooks(h => h.map(x => x.id === hook.id ? { ...x, is_active: !x.is_active } : x));
    } catch {
      toast.error("Failed to update");
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#555", fontSize: 14 }}>Loading…</div>;
  if (!data) return <div style={{ padding: 40, color: "#f87171", fontSize: 14 }}>User not found</div>;

  const u = data.user;
  const stats = data.stats || {};

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Back + header */}
      <button onClick={() => navigate("/users")} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Users
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        {u.avatar_url ? (
          <img src={u.avatar_url} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#8080ff" }}>
            {(u.name || u.email || "?")[0].toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{u.name || "—"}</div>
          <div style={{ fontSize: 12, color: "#555" }}>{u.email || u.phone || "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
          {[["Generations", stats.total_generations || 0], ["Published", stats.published || 0], ["Wins", stats.wins || 0]].map(([l, v]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{v}</div>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", fontWeight: 700 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 12, padding: 4, width: "fit-content", marginBottom: 24 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: tab === i ? "#2a2a4a" : "transparent", color: tab === i ? "#8080ff" : "#666", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab 0: AI Profile ─────────────────────────────────────────────── */}
      {tab === 0 && (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 28, maxWidth: 620 }}>
          <Field label="Brand Voice">
            <textarea rows={3} value={form.brand_voice}
              onChange={e => setForm(f => ({ ...f, brand_voice: e.target.value }))}
              placeholder="e.g. Friendly, conversational, slightly witty…"
              style={textareaStyle} />
          </Field>

          <Field label="Target Audience">
            <textarea rows={2} value={form.target_audience}
              onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
              placeholder="e.g. Women 25-35 interested in fitness…"
              style={textareaStyle} />
          </Field>

          <Field label={`Spice Level — ${SPICE_LABELS[form.spice_level] || ""}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={1} max={5} step={1} value={form.spice_level}
                onChange={e => setForm(f => ({ ...f, spice_level: parseInt(e.target.value) }))}
                style={{ flex: 1, accentColor: "#5B5BD6" }} />
              <span style={{ minWidth: 16, textAlign: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>{form.spice_level}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 10, color: "#444" }}>{n}</span>)}
            </div>
          </Field>

          <Field label="Niche">
            <div style={{ position: "relative" }}>
              <select value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}
                style={{ ...inputStyle, width: "100%", appearance: "none", paddingRight: 32 }}>
                <option value="">Select niche…</option>
                {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#555", pointerEvents: "none" }} />
            </div>
          </Field>

          <Field label="Interests (comma-separated)">
            <input value={form.interests}
              onChange={e => setForm(f => ({ ...f, interests: e.target.value }))}
              placeholder="e.g. yoga, nutrition, mindfulness"
              style={inputStyle} />
          </Field>

          {/* Competitors chip input */}
          <Field label={`Competitors (${form.competitors.length}/10) — AI references these accounts for style and angles`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {form.competitors.map(handle => (
                <span key={handle} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#34d399", background: "#0a2a1a", border: "1px solid #1a4a2a", borderRadius: 20, padding: "4px 10px" }}>
                  @{handle}
                  <button onClick={() => removeCompetitor(handle)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#34d399", padding: 0, display: "flex", lineHeight: 1 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={competitorRef}
                value={competitorInput}
                onChange={e => setCompetitorInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
                placeholder="@username — press Enter to add"
                disabled={form.competitors.length >= 10}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addCompetitor} disabled={!competitorInput.trim() || form.competitors.length >= 10}
                style={{ padding: "10px 16px", background: "#1a3a2a", border: "1px solid #1a4a2a", borderRadius: 10, color: "#34d399", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                Add
              </button>
            </div>
            {form.competitors.length === 0 && (
              <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>Add up to 10 Instagram accounts. The AI will use their content style as reference.</div>
            )}
          </Field>

          <button onClick={saveProfile} disabled={saving}
            style={{ marginTop: 4, padding: "12px 28px", background: saving ? "#3a3a6a" : "#5B5BD6", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save AI Settings"}
          </button>
        </div>
      )}

      {/* ── Tab 1: Questionnaire (read-only + editable AI settings) ─────── */}
      {tab === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 900 }}>

          {/* Left col: read-only view */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <QSection title="Basic Info">
              <QRow label="Profile Name" value={u.profile_name} />
              <QRow label="WhatsApp" value={u.whatsapp_number} />
              <QRow label="City / Country" value={u.city_country} />
              <QRow label="Instagram" value={u.instagram_username ? `@${u.instagram_username}` : null} />
              <QRow label="IG Profile URL" value={u.instagram_profile_url} link />
              <QRow label="Website" value={u.website_url} link />
              <QRow label="LinkedIn" value={u.linkedin_url} link />
              <QRow label="YouTube" value={u.youtube_url} link />
              <QRow label="Twitter / X" value={u.twitter_url} link />
            </QSection>

            <QSection title="Brand & Audience">
              <QRow label="Niche Statement" value={u.niche_statement} />
              <QRow label="Business Description" value={u.business_description} multiline />
              <QRow label="Target Audience" value={u.target_audience} />
              <QRow label="Age Range" value={u.audience_age_min && u.audience_age_max ? `${u.audience_age_min} – ${u.audience_age_max}` : null} />
              <QRow label="Emotional States" value={(u.audience_emotional_states || []).join(", ")} />
              <QRow label="Has Case Studies" value={u.has_case_studies != null ? (u.has_case_studies ? "Yes" : "No") : null} />
              <QChips label="Topics Love" values={u.topics_love} />
              <QChips label="Solutions Provided" values={u.solutions_provided} color="#34d399" bg="#0a2a1a" />
              <QChips label="Unique Selling Points" values={u.unique_selling_points} color="#a78bfa" bg="#1e1e3a" />
              <QChips label="FAQs" values={u.faqs} color="#f59e0b" bg="#1a1200" />
            </QSection>

            <QSection title="Content Strategy">
              <QRow label="Language" value={u.content_language} />
              <QChips label="Content Dislikes" values={u.content_dislikes} color="#ef4444" bg="#2a0a0a" />
              <QListField label="Topics to Avoid" values={u.topics_to_avoid} />
              <QListField label="Underserved Topics" values={u.underserved_topics} />
              <QChips label="Competitor Accounts" values={(u.competitors || []).map(c => `@${c}`)} color="#34d399" bg="#0a2a1a" />
            </QSection>

            <QSection title="Goals & CTA">
              <QRow label="Primary Goal" value={u.primary_goal} />
              <QRow label="Preferred CTA" value={u.content_cta} />
              <QRow label="Landing Page" value={u.landing_page_url} link />
            </QSection>
          </div>

          {/* Right col: editable AI settings (same as tab 0 but all fields) */}
          <div>
            <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5B5BD6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 18 }}>Edit AI Settings</div>

              <Field label="Niche Statement">
                <input value={form.niche_statement || ""} onChange={e => setForm(f => ({ ...f, niche_statement: e.target.value }))} placeholder="I help [audience] [outcome]" style={inputStyle} />
              </Field>
              <Field label="Business Description">
                <textarea rows={4} value={form.business_description || ""} onChange={e => setForm(f => ({ ...f, business_description: e.target.value }))} placeholder="What they do…" style={{ ...textareaStyle }} />
              </Field>
              <Field label="Target Audience">
                <textarea rows={2} value={form.target_audience || ""} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} placeholder="e.g. Freelancers, 25-35…" style={textareaStyle} />
              </Field>
              <Field label="Brand Voice">
                <textarea rows={2} value={form.brand_voice || ""} onChange={e => setForm(f => ({ ...f, brand_voice: e.target.value }))} placeholder="e.g. Blunt, no-nonsense, witty…" style={textareaStyle} />
              </Field>
              <Field label={`Spice Level — ${SPICE_LABELS[form.spice_level] || ""}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min={1} max={5} step={1} value={form.spice_level || 3} onChange={e => setForm(f => ({ ...f, spice_level: parseInt(e.target.value) }))} style={{ flex: 1, accentColor: "#5B5BD6" }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{form.spice_level}</span>
                </div>
              </Field>
              <Field label="Content Language">
                <input value={form.content_language || ""} onChange={e => setForm(f => ({ ...f, content_language: e.target.value }))} placeholder="e.g. English, Hindi, Hinglish" style={inputStyle} />
              </Field>
              <Field label="Primary Goal">
                <input value={form.primary_goal || ""} onChange={e => setForm(f => ({ ...f, primary_goal: e.target.value }))} placeholder="e.g. leads, followers, reach" style={inputStyle} />
              </Field>
              <Field label="Preferred CTA">
                <input value={form.content_cta || ""} onChange={e => setForm(f => ({ ...f, content_cta: e.target.value }))} placeholder="e.g. dm, link, book" style={inputStyle} />
              </Field>
              <Field label="Interests (comma-separated)">
                <input value={form.interests || ""} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="yoga, nutrition, mindset" style={inputStyle} />
              </Field>

              {/* Competitors */}
              <Field label={`Competitors (${form.competitors.length}/10)`}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {form.competitors.map(handle => (
                    <span key={handle} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#34d399", background: "#0a2a1a", border: "1px solid #1a4a2a", borderRadius: 20, padding: "4px 10px" }}>
                      @{handle}
                      <button onClick={() => setForm(f => ({ ...f, competitors: f.competitors.filter(c => c !== handle) }))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#34d399", padding: 0, display: "flex" }}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input ref={competitorRef} value={competitorInput} onChange={e => setCompetitorInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
                    placeholder="@username — press Enter"
                    disabled={form.competitors.length >= 10}
                    style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={addCompetitor} disabled={!competitorInput.trim() || form.competitors.length >= 10}
                    style={{ padding: "10px 14px", background: "#1a3a2a", border: "1px solid #1a4a2a", borderRadius: 10, color: "#34d399", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Add
                  </button>
                </div>
              </Field>

              <button onClick={saveProfile} disabled={saving}
                style={{ width: "100%", padding: "12px 0", background: saving ? "#3a3a6a" : "#5B5BD6", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {saving ? "Saving…" : "Save AI Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Content DNA ────────────────────────────────────────────── */}
      {tab === 2 && (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
          {!data.recent_dna?.length ? (
            <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No DNA records yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                  {["Hook Type", "Emotion", "Format", "Winner", "Published", "Date"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_dna.map(d => (
                  <tr key={d._id || d.id} style={{ borderBottom: "1px solid #1e1e1e" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", background: "#1e1e3a", borderRadius: 6, padding: "3px 8px" }}>{d.hook_type || "—"}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#ccc" }}>{d.emotion || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#ccc" }}>{d.format || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => toggleWinner(d._id || d.id, d.is_winner)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        title={d.is_winner ? "Remove winner" : "Mark as winner"}>
                        <Star size={16} fill={d.is_winner ? "#f59e0b" : "none"} style={{ color: d.is_winner ? "#f59e0b" : "#444" }} />
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {d.published ? <CheckCircle2 size={14} style={{ color: "#34d399" }} /> : <XCircle size={14} style={{ color: "#444" }} />}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 11, color: "#555" }}>
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab 3: Generation History ─────────────────────────────────────── */}
      {tab === 3 && (
        <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
          {!data.recent_generations?.length ? (
            <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>No generations yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                  {["Model", "Tokens", "Latency", "Status", "Retries", "Error", "Date"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_generations.map((g, i) => (
                  <tr key={g._id || g.id || i} style={{ borderBottom: "1px solid #1e1e1e" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: g.model?.includes("haiku") ? "#34d399" : "#5B5BD6", background: g.model?.includes("haiku") ? "#0a2a1a" : "#1e1e3a", borderRadius: 6, padding: "3px 8px" }}>
                        {g.model?.includes("haiku") ? "haiku" : "sonnet"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#ccc" }}>{(g.total_tokens || g.tokens_used || 0).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#ccc" }}>{g.latency_ms ? `${(g.latency_ms / 1000).toFixed(1)}s` : "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: g.gate_result === "pass" ? "#34d399" : "#f87171", background: g.gate_result === "pass" ? "#0a2a1a" : "#2a0a0a", borderRadius: 6, padding: "3px 8px" }}>
                        {g.gate_result || (g.error ? "fail" : "pass")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: g.retry_count > 0 ? "#f59e0b" : "#555" }}>{g.retry_count ?? 0}</td>
                    <td style={{ padding: "12px 16px", fontSize: 11, color: "#f87171", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.error ? <span title={g.error}>{g.error}</span> : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 11, color: "#555" }}>
                      {g.created_at ? new Date(g.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab 4: Hooks ─────────────────────────────────────────────────── */}
      {tab === 4 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#555" }}>
              Custom hooks for <span style={{ color: "#ccc", fontWeight: 600 }}>{u.name || "this user"}</span> — these are fed to the AI before generating content.
            </div>
            <button onClick={() => setShowAddHook(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: showAddHook ? "#2a2a2a" : "#5B5BD6", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              <Plus size={13} /> {showAddHook ? "Cancel" : "Add Hook"}
            </button>
          </div>

          {/* Add hook inline form */}
          {showAddHook && (
            <form onSubmit={addHook} style={{ background: "#161616", border: "1.5px solid #2a2a4a", borderRadius: 14, padding: 20, marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Hook Text</label>
                <textarea rows={3} value={hookForm.hook_text}
                  onChange={e => setHookForm(f => ({ ...f, hook_text: e.target.value }))}
                  placeholder="Write the hook text…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Hook Type</label>
                  <select value={hookForm.hook_type} onChange={e => setHookForm(f => ({ ...f, hook_type: e.target.value }))}
                    style={{ ...inputStyle, width: "100%" }}>
                    <option value="">Select type…</option>
                    {HOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Niche</label>
                  <select value={hookForm.niche} onChange={e => setHookForm(f => ({ ...f, niche: e.target.value }))}
                    style={{ ...inputStyle, width: "100%" }}>
                    <option value="">Select niche…</option>
                    {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setShowAddHook(false)}
                  style={{ padding: "9px 18px", background: "none", border: "1px solid #2a2a2a", borderRadius: 10, color: "#555", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button type="submit" disabled={addingHook}
                  style={{ padding: "9px 20px", background: addingHook ? "#3a3a6a" : "#5B5BD6", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: addingHook ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {addingHook ? "Adding…" : "Add Hook"}
                </button>
              </div>
            </form>
          )}

          {hooksLoading ? (
            <div style={{ color: "#555", fontSize: 13, padding: 20 }}>Loading hooks…</div>
          ) : !userHooks.length ? (
            <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 14, padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
              No custom hooks for this user yet.<br />
              <span style={{ color: "#555", fontSize: 12 }}>Add hooks to guide the AI for this specific creator.</span>
            </div>
          ) : (
            <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                    {["Hook Text", "Type", "Niche", "Usage", "Active", ""].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userHooks.map(h => (
                    <tr key={h.id} style={{ borderBottom: "1px solid #1e1e1e" }}>
                      <td style={{ padding: "12px 14px", maxWidth: 380 }}>
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
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => toggleHookActive(h)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          {h.is_active !== false
                            ? <ToggleRight size={20} style={{ color: "#34d399" }} />
                            : <ToggleLeft size={20} style={{ color: "#444" }} />}
                        </button>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => deleteHook(h.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
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
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Questionnaire read-only helpers ─────────────────────────────────────────

function QSection({ title, children }) {
  return (
    <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5B5BD6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function QRow({ label, value, multiline, link }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#8080ff", wordBreak: "break-all" }}>{value}</a>
      ) : multiline ? (
        <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{value}</div>
      ) : (
        <div style={{ fontSize: 12, color: "#ccc" }}>{value}</div>
      )}
    </div>
  );
}

function QChips({ label, values, color = "#a78bfa", bg = "#1e1e3a" }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {values.map(v => (
          <span key={v} style={{ fontSize: 10, fontWeight: 600, color, background: bg, borderRadius: 6, padding: "3px 8px" }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

function QListField({ label, values }) {
  const filtered = (values || []).filter(v => v && v.trim());
  if (!filtered.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.map((v, i) => <li key={i} style={{ fontSize: 12, color: "#ccc" }}>{v}</li>)}
      </ul>
    </div>
  );
}

function Tag({ children, color = "#a78bfa", bg = "#1e1e3a" }) {
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: "3px 7px" }}>{children}</span>;
}

const labelStyle = { display: "block", fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 };
const inputStyle = {
  width: "100%", background: "#0d0d0d", border: "1.5px solid #2a2a2a", borderRadius: 10,
  padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const textareaStyle = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };
