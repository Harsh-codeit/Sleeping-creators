import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Star, CheckCircle2, XCircle, ChevronDown, X, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import api from "../api.js";

const SPICE_LABELS = { 1: "Conservative", 2: "Mild", 3: "Balanced", 4: "Bold", 5: "Very Bold" };
const NICHES = ["fitness", "food", "travel", "fashion", "tech", "business", "beauty", "lifestyle", "education", "entertainment", "other"];
const HOOK_TYPES = ["question", "myth_bust", "story", "statistic", "challenge", "tip", "relatable", "controversial", "listicle", "family_relationship", "emotional_state", "relatable_scene", "shocking_number", "credibility_borrow", "direct_confront", "other"];
const TABS = ["AI Profile", "Questionnaire", "Content DNA", "Generation History", "Hooks"];

// ── Onboarding questionnaire option lists (mirror frontend/UserOnboarding.js) ──
const EMOTIONAL_STATES = ["Ambitious","Overwhelmed","Confused","Motivated","Stuck","Frustrated","Burned Out","Anxious"];
const TOPICS_LOVE = ["Mindset & Psychology","Business Strategy","Social Media Growth","Sales & Marketing","Personal Finance","Health & Wellness","Relationships","Productivity & Habits","Leadership","Content Creation","Brand Building","Entrepreneurship","Investing","Fitness","Spiritual Growth"];
const SOLUTIONS = ["Social Media Growth","Personal Branding","Content Creation","Financial Freedom","Passive Income","Confidence & Mindset","Business Scaling","Productivity","Public Speaking","Sales & Marketing","Leadership Skills","Community Building"];
const USPS = ["Proven Track Record","Simplified Approach","No Fluff, Just Results","Step-by-Step System","Personal Attention","From the Same Background","Affordable Pricing","Holistic Method","Cultural Understanding","Fast Results","Done-With-You Model","Real-Life Experience","Industry Insider","24/7 Support","Unique Framework"];
const FAQ_OPTIONS = ["How do I get started?","How much does it cost?","How long will it take?","Do I need experience?","What results can I expect?","Is this right for me?","What makes you different?","Do you offer refunds?","How much time do I need?","Can I do this part-time?","Will you work with me 1-on-1?","Do you have testimonials?"];
const LANGUAGES = ["English","हिन्दी","Hinglish","தமிழ்","తెలుగు","ಕನ್ನಡ","മലയാളം","मराठी","ગુજરાતી","বাংলা","ਪੰਜਾਬੀ","اردو","العربية","Español","Français","Português","Deutsch","Bahasa Indonesia","Bahasa Melayu","Other"];
const GOALS = [{ key: "leads", label: "Get More Leads", icon: "🎯" }, { key: "reach", label: "Grow Reach & Awareness", icon: "📡" }, { key: "followers", label: "Grow Followers", icon: "👥" }, { key: "visibility", label: "Visibility and Influence", icon: "✨" }];
const CTAS = [{ key: "dm", label: "DM Me" }, { key: "link", label: "Visit Link" }, { key: "book", label: "Book Call" }, { key: "enrol", label: "Enrol Now" }, { key: "other", label: "Other" }];
const BRAND_VOICES = [{ key: "blunt", label: "Blunt & Raw", desc: "Direct, no fluff, tells it like it is" }, { key: "motivational", label: "Motivational", desc: "Inspiring, energetic, pushes forward" }, { key: "educational", label: "Educational", desc: "Breaks things down, teaches clearly" }, { key: "storytelling", label: "Storytelling", desc: "Narrative-first, personal journeys" }, { key: "humorous", label: "Humorous", desc: "Wit and relatability over everything" }];
const SPICE_SCALE = ["", "Safe", "Balanced", "Honest", "Bold", "Controversial"];

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
        // AI Profile
        brand_voice:               u.brand_voice || "",
        target_audience:           u.target_audience || "",
        spice_level:               u.spice_level || 3,
        niche:                     u.niche || "",
        interests:                 (u.interests || []).join(", "),
        competitors:               u.competitors || [],
        // S1 — Basic Info & Access
        profile_name:              u.profile_name || "",
        whatsapp_number:           u.whatsapp_number || "",
        city_country:              u.city_country || "",
        instagram_username:        u.instagram_username || "",
        instagram_profile_url:     u.instagram_profile_url || "",
        website_url:               u.website_url || "",
        linkedin_url:              u.linkedin_url || "",
        youtube_url:               u.youtube_url || "",
        twitter_url:               u.twitter_url || "",
        // S2 — Story, Brand & Audience
        business_description:      u.business_description || "",
        niche_statement:           u.niche_statement || "",
        audience_age_min:          u.audience_age_min ?? 18,
        audience_age_max:          u.audience_age_max ?? 45,
        audience_emotional_states: u.audience_emotional_states || [],
        has_case_studies:          u.has_case_studies || false,
        topics_love:               u.topics_love || [],
        solutions_provided:        u.solutions_provided || [],
        unique_selling_points:     u.unique_selling_points || [],
        faqs:                      u.faqs || [],
        // S3 — Content Strategy
        content_language:          u.content_language || "",
        content_dislikes:          u.content_dislikes || [],
        topics_to_avoid:           u.topics_to_avoid || [],
        underserved_topics:        u.underserved_topics || [],
        // S4 — Goals & CTA
        primary_goal:              u.primary_goal || "",
        content_cta:               u.content_cta || "",
        landing_page_url:          u.landing_page_url || "",
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
      const payload = {
        ...form,
        interests,
        spice_level:        parseInt(form.spice_level) || 3,
        audience_age_min:   parseInt(form.audience_age_min) || null,
        audience_age_max:   parseInt(form.audience_age_max) || null,
        has_case_studies:   !!form.has_case_studies,
        competitors:        (form.competitors || []).map(c => c.replace(/^@/, "")).filter(Boolean),
        content_dislikes:   (form.content_dislikes || []).filter(x => x && x.trim()),
        topics_to_avoid:    (form.topics_to_avoid || []).filter(x => x && x.trim()),
        underserved_topics: (form.underserved_topics || []).filter(x => x && x.trim()),
      };
      await api.put(`/api/admin/users/${userId}/ai-settings`, payload);
      // reflect saved values in the header / read-only surfaces immediately
      setData(d => (d ? { ...d, user: { ...d.user, ...payload, interests } } : d));
      toast.success("Saved");
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

      {/* ── Tab 1: Questionnaire (fully editable — mirrors mobile onboarding) ─── */}
      {tab === 1 && (
        <div style={{ maxWidth: 760, paddingBottom: 90 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>
            The complete onboarding questionnaire, exactly as the user answers it in the app. Edit any answer on their behalf — everything here feeds the AI when generating their content.
          </div>

          {/* Section 1 */}
          <ESection title="1 · Basic Info & Access">
            <Field label="Profile Name">
              <input style={inputStyle} value={form.profile_name} onChange={e => setForm(f => ({ ...f, profile_name: e.target.value }))} placeholder="How they want to be known" />
            </Field>
            <Field label="WhatsApp Number">
              <input style={inputStyle} value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+91 98765 43210" />
            </Field>
            <Field label="City & Country">
              <input style={inputStyle} value={form.city_country} onChange={e => setForm(f => ({ ...f, city_country: e.target.value }))} placeholder="e.g. Mumbai, India" />
            </Field>
            <Field label="Instagram Username">
              <input style={inputStyle} value={form.instagram_username} onChange={e => setForm(f => ({ ...f, instagram_username: e.target.value.replace(/^@/, "") }))} placeholder="handle (without @)" />
            </Field>
            <Field label="Instagram Profile URL">
              <input style={inputStyle} value={form.instagram_profile_url} onChange={e => setForm(f => ({ ...f, instagram_profile_url: e.target.value }))} placeholder="https://www.instagram.com/handle/" />
            </Field>
            <Field label="Website URL">
              <input style={inputStyle} value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://…" />
            </Field>
            <Field label="LinkedIn">
              <input style={inputStyle} value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} />
            </Field>
            <Field label="YouTube">
              <input style={inputStyle} value={form.youtube_url} onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))} />
            </Field>
            <Field label="Twitter / X">
              <input style={inputStyle} value={form.twitter_url} onChange={e => setForm(f => ({ ...f, twitter_url: e.target.value }))} />
            </Field>
          </ESection>

          {/* Section 2 */}
          <ESection title="2 · Story, Brand & Audience">
            <Field label="About Your Business">
              <textarea rows={4} style={textareaStyle} value={form.business_description} onChange={e => setForm(f => ({ ...f, business_description: e.target.value }))} placeholder="What they do, how they help, their process…" />
            </Field>
            <Field label="One-Line Niche Statement">
              <input style={inputStyle} value={form.niche_statement} onChange={e => setForm(f => ({ ...f, niche_statement: e.target.value }))} placeholder="I help [audience] [achieve outcome]" />
            </Field>
            <Field label="Target Audience">
              <textarea rows={2} style={textareaStyle} value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} placeholder="e.g. Corporate employees, freelancers, coaches" />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Audience Age (min)">
                  <input type="number" min={13} max={65} style={inputStyle} value={form.audience_age_min} onChange={e => setForm(f => ({ ...f, audience_age_min: e.target.value }))} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Audience Age (max)">
                  <input type="number" min={13} max={65} style={inputStyle} value={form.audience_age_max} onChange={e => setForm(f => ({ ...f, audience_age_max: e.target.value }))} />
                </Field>
              </div>
            </div>
            <ChipMulti label="Audience Emotional States" max={2} allowCustom={false} options={EMOTIONAL_STATES}
              value={form.audience_emotional_states} onChange={v => setForm(f => ({ ...f, audience_emotional_states: v }))} />
            <AdminToggle label="Has Client Case Studies / Results?" value={form.has_case_studies} onChange={v => setForm(f => ({ ...f, has_case_studies: v }))} />
            <ChipMulti label="Topics They Love to Talk About" options={TOPICS_LOVE}
              value={form.topics_love} onChange={v => setForm(f => ({ ...f, topics_love: v }))} />
            <ChipMulti label="Solutions They Provide" options={SOLUTIONS}
              value={form.solutions_provided} onChange={v => setForm(f => ({ ...f, solutions_provided: v }))} />
            <ChipMulti label="Unique Selling Points" options={USPS}
              value={form.unique_selling_points} onChange={v => setForm(f => ({ ...f, unique_selling_points: v }))} />
            <ChipMulti label="Frequently Asked Questions" options={FAQ_OPTIONS}
              value={form.faqs} onChange={v => setForm(f => ({ ...f, faqs: v }))} />
            <SingleSelect label="Brand Voice" options={BRAND_VOICES} value={form.brand_voice}
              onChange={v => setForm(f => ({ ...f, brand_voice: v }))} />
            <Field label={`Content Boldness — ${SPICE_SCALE[form.spice_level] || ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input type="range" min={1} max={5} step={1} value={form.spice_level || 3} onChange={e => setForm(f => ({ ...f, spice_level: parseInt(e.target.value) }))} style={{ flex: 1, accentColor: "#5B5BD6" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", minWidth: 16, textAlign: "center" }}>{form.spice_level}</span>
              </div>
            </Field>
          </ESection>

          {/* Section 3 */}
          <ESection title="3 · Content Strategy & Direction">
            <SingleChip label="Content Language" options={LANGUAGES} value={form.content_language}
              onChange={v => setForm(f => ({ ...f, content_language: v }))} />
            <AdminTags label="Content They Personally Dislike" placeholder="e.g. Aggressive selling, clickbait hooks…"
              value={form.content_dislikes} onChange={v => setForm(f => ({ ...f, content_dislikes: v }))} />
            <AdminTags label="Topics to AVOID" placeholder="Add a topic to avoid"
              value={form.topics_to_avoid} onChange={v => setForm(f => ({ ...f, topics_to_avoid: v }))} />
            <AdminTags label="Underserved Topics in Their Niche" placeholder="Add an underserved topic"
              value={form.underserved_topics} onChange={v => setForm(f => ({ ...f, underserved_topics: v }))} />

            {/* Competitors */}
            <Field label={`Competitor Accounts (${form.competitors.length}/10)`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {form.competitors.map(handle => (
                  <span key={handle} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#34d399", background: "#0a2a1a", border: "1px solid #1a4a2a", borderRadius: 20, padding: "4px 10px" }}>
                    @{handle}
                    <button onClick={() => removeCompetitor(handle)}
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

            <Field label="Interests (comma-separated)">
              <input style={inputStyle} value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="yoga, nutrition, mindset" />
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
          </ESection>

          {/* Section 4 */}
          <ESection title="4 · Goals, CTA & Lead Generation">
            <SingleSelect label="Primary Goal from Instagram" options={GOALS} value={form.primary_goal}
              onChange={v => setForm(f => ({ ...f, primary_goal: v }))} />
            <SingleSelect label="Preferred CTA" options={CTAS} value={form.content_cta}
              onChange={v => setForm(f => ({ ...f, content_cta: v }))} />
            <Field label="Website / Landing Page URL">
              <input style={inputStyle} value={form.landing_page_url} onChange={e => setForm(f => ({ ...f, landing_page_url: e.target.value }))} placeholder="https://yoursite.com or calendly link" />
            </Field>
          </ESection>

          {/* Sticky save bar */}
          <div style={{ position: "sticky", bottom: 0, marginTop: 8, padding: "16px 0", background: "linear-gradient(to top, #0d0d0d 60%, transparent)" }}>
            <button onClick={saveProfile} disabled={saving}
              style={{ width: "100%", padding: "14px 0", background: saving ? "#3a3a6a" : "#5B5BD6", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(91,91,214,0.3)" }}>
              {saving ? "Saving…" : "Save All Answers"}
            </button>
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

// ─── Questionnaire editable helpers ──────────────────────────────────────────

function ESection({ title, children }) {
  return (
    <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#5B5BD6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  );
}

// Multi-select chips with optional custom add (topics, USPs, FAQs, emotional states…)
function ChipMulti({ label, options, value = [], onChange, max, allowCustom = true }) {
  const [custom, setCustom] = useState("");
  const toggle = (item) => {
    if (value.includes(item)) onChange(value.filter(v => v !== item));
    else { if (max && value.length >= max) return; onChange([...value, item]); }
  };
  const addCustom = () => {
    const t = custom.trim();
    if (!t || value.includes(t) || (max && value.length >= max)) return;
    onChange([...value, t]); setCustom("");
  };
  const extra = value.filter(v => !options.includes(v));
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}{max ? ` (max ${max})` : ""}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: allowCustom ? 8 : 0 }}>
        {options.map(opt => {
          const on = value.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              style={{ padding: "6px 12px", borderRadius: 18, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`, background: on ? "#1e1e3a" : "#0d0d0d", color: on ? "#8080ff" : "#888", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
              {on && <Check size={10} />} {opt}
            </button>
          );
        })}
        {extra.map(v => (
          <button key={v} type="button" onClick={() => toggle(v)}
            style={{ padding: "6px 12px", borderRadius: 18, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1.5px solid #5B5BD6", background: "#1e1e3a", color: "#8080ff", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
            <Check size={10} /> {v} <X size={10} />
          </button>
        ))}
      </div>
      {allowCustom && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Add custom…"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={addCustom} style={{ width: 38, borderRadius: 10, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Plus size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// Single-select string chips (language)
function SingleChip({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {options.map(opt => {
          const on = value === opt;
          return (
            <button key={opt} type="button" onClick={() => onChange(on ? "" : opt)}
              style={{ padding: "7px 14px", borderRadius: 18, fontSize: 12, cursor: "pointer", border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`, background: on ? "#1e1e3a" : "#0d0d0d", color: on ? "#8080ff" : "#888", fontFamily: "inherit" }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Single-select rich options [{key,label,desc?,icon?}] (brand voice, goal, CTA)
function SingleSelect({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map(o => {
          const on = value === o.key;
          return (
            <button key={o.key} type="button" onClick={() => onChange(on ? "" : o.key)}
              style={{ padding: "11px 14px", borderRadius: 12, textAlign: "left", cursor: "pointer", border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`, background: on ? "#1e1e3a" : "#0d0d0d", display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit" }}>
              {o.icon && <span style={{ fontSize: 18 }}>{o.icon}</span>}
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? "#fff" : "#ccc" }}>{o.label}</span>
                {o.desc && <span style={{ display: "block", fontSize: 11, color: "#555", marginTop: 2 }}>{o.desc}</span>}
              </span>
              {on && <Check size={14} style={{ color: "#5B5BD6", flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Free-form tag list (dislikes, topics to avoid, underserved topics)
function AdminTags({ label, value = [], onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => { const t = input.trim(); if (!t || value.includes(t)) return; onChange([...value, t]); setInput(""); };
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
          {value.map(v => (
            <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 18, background: "#1e1e3a", border: "1px solid #2a2a4a", fontSize: 12, color: "#8080ff" }}>
              {v}
              <button type="button" onClick={() => onChange(value.filter(x => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", color: "#8080ff", padding: 0, display: "flex" }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder || "Add…"}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ width: 38, borderRadius: 10, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function AdminToggle({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#0d0d0d", border: "1.5px solid #2a2a2a", borderRadius: 12, marginBottom: 20 }}>
      <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        style={{ width: 44, height: 25, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", background: value ? "#5B5BD6" : "#2a2a2a", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 22 : 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </button>
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
