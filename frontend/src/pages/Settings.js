import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  User, Link2, CreditCard, UserCog,
  Instagram, Check, CheckCircle2, Camera, Pencil, Mail, LogOut,
  Zap, BarChart3, Calendar, FileText,
  AlertCircle, Loader2, Plus, X, Globe, Linkedin, Youtube, Twitter, Phone,
} from "lucide-react";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INTERESTS = [
  { value: "lifestyle",     label: "Lifestyle" },
  { value: "business",      label: "Business & Entrepreneurship" },
  { value: "education",     label: "Education & Learning" },
  { value: "fitness",       label: "Fitness & Health" },
  { value: "diets",         label: "Diets & Nutrition" },
  { value: "food",          label: "Food & Cooking" },
  { value: "travel",        label: "Travel & Adventure" },
  { value: "fashion",       label: "Fashion & Beauty" },
  { value: "finance",       label: "Finance & Investing" },
  { value: "tech",          label: "Tech & Gaming" },
  { value: "science",       label: "Science & Research" },
  { value: "music",         label: "Music & Entertainment" },
  { value: "motivation",    label: "Motivation & Mindset" },
  { value: "mental_health", label: "Mental Health" },
  { value: "sports",        label: "Sports & Athletics" },
  { value: "personal_dev",  label: "Personal Development" },
];

const TABS = [
  { key: "profile",      label: "Profile",      icon: User },
  { key: "creator",      label: "Creator",      icon: UserCog },
  { key: "connections",  label: "Connections",  icon: Link2 },
  { key: "subscription", label: "Subscription", icon: CreditCard },
];

// ─── Creator tab option lists ─────────────────────────────────────────────────
const EMOTIONAL_STATES_OPTS = ["Ambitious","Overwhelmed","Confused","Motivated","Stuck","Frustrated","Burned Out","Anxious"];
const TOPICS_LOVE_OPTS = ["Mindset & Psychology","Business Strategy","Social Media Growth","Sales & Marketing","Personal Finance","Health & Wellness","Relationships","Productivity & Habits","Leadership","Content Creation","Brand Building","Entrepreneurship","Investing","Fitness","Spiritual Growth"];
const SOLUTIONS_OPTS = ["Social Media Growth","Personal Branding","Content Creation","Financial Freedom","Passive Income","Confidence & Mindset","Business Scaling","Productivity","Public Speaking","Sales & Marketing","Leadership Skills","Community Building"];
const USPS_OPTS = ["Proven Track Record","Simplified Approach","No Fluff, Just Results","Step-by-Step System","Personal Attention","From the Same Background","Affordable Pricing","Holistic Method","Cultural Understanding","Fast Results","Done-With-You Model","Real-Life Experience","Industry Insider","24/7 Support","Unique Framework"];
const FAQ_OPTS = ["How do I get started?","How much does it cost?","How long will it take?","Do I need experience?","What results can I expect?","Is this right for me?","What makes you different?","Do you offer refunds?","How much time do I need?","Can I do this part-time?","Will you work with me 1-on-1?","Do you have testimonials?"];
const LANGUAGES_OPTS = ["English","हिन्दी","Hinglish","தமிழ்","తెలుగు","ಕನ್ನಡ","മലയാളം","मराठी","ગુજરાતી","বাংলা","ਪੰਜਾਬੀ","اردو","Other"];
const GOALS_OPTS = [
  { key: "leads",      label: "Get More Leads",           icon: "🎯" },
  { key: "reach",      label: "Grow Reach & Awareness",   icon: "📡" },
  { key: "followers",  label: "Grow Followers",           icon: "👥" },
  { key: "visibility", label: "Visibility and Influence", icon: "✨" },
];
const CTAS_OPTS = [
  { key: "dm",    label: "DM Me" },
  { key: "link",  label: "Visit Link" },
  { key: "book",  label: "Book Call" },
  { key: "enrol", label: "Enrol Now" },
  { key: "other", label: "Other" },
];
const BRAND_VOICES_OPTS = [
  { key: "blunt",        label: "Blunt & Raw",    desc: "Direct, no fluff, tells it like it is" },
  { key: "motivational", label: "Motivational",   desc: "Inspiring, energetic, pushes forward" },
  { key: "educational",  label: "Educational",    desc: "Breaks things down, teaches clearly" },
  { key: "storytelling", label: "Storytelling",   desc: "Narrative-first, personal journeys" },
  { key: "humorous",     label: "Humorous",       desc: "Wit and relatability over everything" },
];
const SPICE_LABELS_MAP = ["","Safe","Balanced","Honest","Bold","Controversial"];
const AVOID_PREFIXES = ["I will never post about","I refuse to","I won't create content that","I avoid","I don't do"];

export default function Settings({ onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const setTab = t => setSearchParams({ tab: t });
  const user = useUser();

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0d0d0d" }} data-testid="settings-page">
      {/* Header */}
      <div className="flex-shrink-0" style={{ background: "#161616", borderBottom: "1px solid #2a2a2a" }}>
        <div className="max-w-2xl mx-auto px-6 pt-6 pb-0">
          <h1 className="text-xl font-bold mb-4" style={{ color: "#ffffff" }}>Settings</h1>
          <div className="flex items-center gap-0">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                style={activeTab === key
                  ? { borderColor: "#5B5BD6", color: "#5B5BD6" }
                  : { borderColor: "transparent", color: "#888888" }
                }
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {activeTab === "profile"      && <ProfileTab user={user} onLogout={onLogout} />}
        {activeTab === "creator"      && <CreatorTab user={user} />}
        {activeTab === "connections"  && <ConnectionsTab user={user} />}
        {activeTab === "subscription" && <SubscriptionTab user={user} />}
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileTab({ user, onLogout }) {
  const clientId    = user?.client_id;
  const refreshUser = user?.refreshUser;

  const [editMode, setEditMode]         = useState(false);
  const [name, setName]                 = useState("");
  const [bio, setBio]                   = useState("");
  const [interests, setInterests]       = useState([]);
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [igStatus, setIgStatus]         = useState(null);
  const fileInputRef                    = useRef(null);

  // Sync form from user context
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setBio(user.bio || "");
      setInterests(user.interests || []);
      setPhotoPreview(user.avatar_url || null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, user?.bio, user?.interests, user?.avatar_url]);

  // Fetch Instagram status
  useEffect(() => {
    if (!clientId) return;
    axios.get(`${API}/instagram/status/${clientId}`)
      .then(r => setIgStatus(r.data)).catch(() => {});
  }, [clientId]);

  const handlePhotoChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const cancelEdit = () => {
    setEditMode(false);
    setName(user?.name || "");
    setBio(user?.bio || "");
    setInterests(user?.interests || []);
    setPhotoFile(null);
    setPhotoPreview(user?.avatar_url || null);
  };

  const authHeaders = () => {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name can't be empty");
    setSaving(true);
    try {
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        try {
          await axios.post(`${API}/auth/profile/photo`, fd, { headers: authHeaders() });
        } catch {}
      }
      await axios.put(`${API}/auth/profile`, { name: name.trim(), bio: bio.trim(), interests }, { headers: authHeaders() });
      if (refreshUser) await refreshUser();
      toast.success("Profile updated");
      setEditMode(false);
      setPhotoFile(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = val =>
    setInterests(p => p.includes(val) ? p.filter(v => v !== val) : [...p, val]);

  const initials   = (name || user?.name || "?")[0]?.toUpperCase() || "?";
  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  // Shared avatar element
  const Avatar = ({ clickable }) => (
    <div
      onClick={() => clickable && fileInputRef.current?.click()}
      style={{
        width: 88, height: 88, borderRadius: "50%", flexShrink: 0,
        background: photoPreview ? "transparent" : "#1e1e3a",
        border: "4px solid #161616",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
        cursor: clickable ? "pointer" : "default",
        boxShadow: "0 4px 20px rgba(91,91,214,0.2)",
      }}
    >
      {photoPreview
        ? <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 30, fontWeight: 700, color: "#5B5BD6" }}>{initials}</span>
      }
      {clickable && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
          <Camera size={18} style={{ color: "#fff" }} />
          <span style={{ fontSize: 9, color: "#fff", fontWeight: 700, letterSpacing: "0.5px" }}>CHANGE</span>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />

      {editMode ? (
        /* ══════════ EDIT MODE ══════════ */
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Photo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 0 4px" }}>
            <Avatar clickable />
            <span style={{ fontSize: 11, color: "#666666" }}>Tap to change photo</span>
          </div>

          {/* Name */}
          <PfField label="Full Name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              style={{ ...pfInput, fontSize: 15, fontWeight: 600 }} />
          </PfField>

          {/* Bio */}
          <PfField label="Quick Bio">
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Tell your audience who you are and what you create…"
              rows={3} style={{ ...pfInput, resize: "vertical", lineHeight: 1.6 }} />
          </PfField>

          {/* Content niches */}
          <div>
            <div style={pfSectionLabel}>Content Niches</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {INTERESTS.map(({ value, label }) => {
                const on = interests.includes(value);
                return (
                  <button key={value} type="button" onClick={() => toggleInterest(value)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", borderRadius: 11, textAlign: "left", fontSize: 12, fontWeight: 500,
                    border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`,
                    background: on ? "#1e1e3a" : "#161616", color: on ? "#5B5BD6" : "#cccccc",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <span>{label}</span>
                    {on && <Check size={11} style={{ color: "#5B5BD6" }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button onClick={save} disabled={saving} style={{
              flex: 1, padding: "13px 0", fontSize: 13, fontWeight: 700, borderRadius: 12,
              border: "none", background: "#5B5BD6", color: "#fff",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(91,91,214,0.25)",
            }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={cancelEdit} disabled={saving} style={{
              flex: 1, padding: "13px 0", fontSize: 13, fontWeight: 600, borderRadius: 12,
              border: "1.5px solid #2a2a2a", background: "#161616", color: "#888888", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ══════════ VIEW MODE ══════════ */
        <div>

          {/* ── Banner + Avatar ── */}
          <div style={{ position: "relative", marginBottom: 56 }}>
            <div style={{
              height: 112, borderRadius: 20,
              background: "linear-gradient(135deg, #5B5BD6 0%, #8B5CF6 55%, #EC4899 100%)",
            }} />
            <div style={{ position: "absolute", bottom: -44, left: 20 }}>
              <Avatar clickable={false} />
            </div>
          </div>

          {/* ── Name + email + bio ── */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", lineHeight: 1.2 }}>
              {user?.name || "—"}
            </div>
            {user?.email && (
              <div style={{ fontSize: 12, color: "#666666", marginTop: 3 }}>{user.email}</div>
            )}
            {bio ? (
              <p style={{ fontSize: 13, color: "#888888", lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>{bio}</p>
            ) : (
              <p style={{ fontSize: 13, color: "#555", fontStyle: "italic", marginTop: 10, marginBottom: 0 }}>
                No bio yet — click Edit Profile to add one
              </p>
            )}
          </div>

          {/* ── Content niches ── */}
          <div style={{ marginBottom: 22 }}>
            <div style={pfSectionLabel}>Content Niches</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {interests.length > 0
                ? interests.map(val => {
                    const lbl = INTERESTS.find(i => i.value === val)?.label;
                    return lbl ? (
                      <span key={val} style={{ fontSize: 12, fontWeight: 500, padding: "5px 13px", borderRadius: 20, background: "#1e1e3a", color: "#5B5BD6", border: "1px solid #3a3a6a" }}>
                        {lbl}
                      </span>
                    ) : null;
                  })
                : <span style={{ fontSize: 13, color: "#666666" }}>No niches selected yet</span>
              }
            </div>
          </div>

          {/* ── Account details ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={pfSectionLabel}>Account Details</div>
            <div style={{ background: "#161616", border: "1.5px solid #2a2a2a", borderRadius: 16, overflow: "hidden" }}>
              {[
                user?.email   && { Icon: Mail,      label: "Email",        value: user.email,   color: "#ffffff" },
                joinedDate    && { Icon: Calendar,   label: "Member since", value: joinedDate,   color: "#ffffff" },
                {                  Icon: Instagram,  label: "Instagram",
                  value: igStatus?.connected ? `@${igStatus.username || igStatus.name || "Connected"}` : "Not connected",
                  color: igStatus?.connected ? "#059669" : "#666666" },
              ].filter(Boolean).map(({ Icon, label, value, color }, i, arr) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                  borderBottom: i < arr.length - 1 ? "1px solid #2a2a2a" : "none",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={15} style={{ color: "#5B5BD6" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#666666", fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 13, color, fontWeight: 500, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Edit button ── */}
          <button onClick={() => setEditMode(true)} style={{
            width: "100%", padding: "13px 0", fontSize: 13, fontWeight: 600, borderRadius: 12,
            border: "1.5px solid #5B5BD6", background: "#161616", color: "#5B5BD6",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Pencil size={13} /> Edit Profile
          </button>

          {/* ── Sign Out ── */}
          <button
            onClick={onLogout}
            style={{
              width: "100%", padding: "13px 0", fontSize: 13, fontWeight: 600, borderRadius: 12,
              border: "1.5px solid #dc2626", background: "#161616", color: "#dc2626",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              marginTop: 10,
            }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Creator Profile ─────────────────────────────────────────────────────────

function CreatorTab({ user }) {
  const refreshUser = user?.refreshUser;
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    profile_name: "", whatsapp_number: "", city_country: "",
    instagram_username: "", instagram_profile_url: "",
    website_url: "", linkedin_url: "", youtube_url: "", twitter_url: "",
    business_description: "", niche_statement: "", target_audience: "",
    audience_age_min: 18, audience_age_max: 45,
    audience_emotional_states: [], has_case_studies: false,
    topics_love: [], solutions_provided: [], unique_selling_points: [], faqs: [],
    brand_voice: "", spice_level: 3,
    content_language: "English", content_dislikes: [],
    topics_to_avoid: ["", "", "", "", ""],
    underserved_topics: ["", "", "", "", ""],
    competitors: ["", "", "", "", "", "", "", ""],
    primary_goal: "", content_cta: "", landing_page_url: "",
  });

  // Sync from user object
  useEffect(() => {
    if (!user) return;
    setForm(prev => ({
      ...prev,
      profile_name:              user.profile_name || "",
      whatsapp_number:           user.whatsapp_number || "",
      city_country:              user.city_country || "",
      instagram_username:        user.instagram_username || "",
      instagram_profile_url:     user.instagram_profile_url || "",
      website_url:               user.website_url || "",
      linkedin_url:              user.linkedin_url || "",
      youtube_url:               user.youtube_url || "",
      twitter_url:               user.twitter_url || "",
      business_description:      user.business_description || "",
      niche_statement:           user.niche_statement || "",
      target_audience:           user.target_audience || "",
      audience_age_min:          user.audience_age_min || 18,
      audience_age_max:          user.audience_age_max || 45,
      audience_emotional_states: user.audience_emotional_states || [],
      has_case_studies:          user.has_case_studies || false,
      topics_love:               user.topics_love || [],
      solutions_provided:        user.solutions_provided || [],
      unique_selling_points:     user.unique_selling_points || [],
      faqs:                      user.faqs || [],
      brand_voice:               user.brand_voice || "",
      spice_level:               user.spice_level || 3,
      content_language:          user.content_language || "English",
      content_dislikes:          user.content_dislikes || [],
      topics_to_avoid:           padArr(user.topics_to_avoid || [], 5),
      underserved_topics:        padArr(user.underserved_topics || [], 5),
      competitors:               padArr(user.competitors || [], 8),
      primary_goal:              user.primary_goal || "",
      content_cta:               user.content_cta || "",
      landing_page_url:          user.landing_page_url || "",
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.client_id]);

  const upd = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const updArr = (key, idx, val) => setForm(f => {
    const arr = [...f[key]];
    arr[idx] = val;
    return { ...f, [key]: arr };
  });

  const authH = () => {
    const t = localStorage.getItem("sc_token") || localStorage.getItem("token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        competitors: form.competitors.filter(c => c.trim()).map(c => c.replace(/^@/, "")),
        topics_to_avoid: form.topics_to_avoid.filter(t => t.trim()),
        underserved_topics: form.underserved_topics.filter(t => t.trim()),
      };
      await axios.put(`${API}/auth/profile`, payload, { headers: authH() });
      if (refreshUser) await refreshUser();
      toast.success("Creator profile saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Section 1: Basic Info */}
      <CrSection title="Basic Info & Access">
        <CrField label="Profile Name">
          <input value={form.profile_name} onChange={e => upd("profile_name", e.target.value)} placeholder="How you want to be known" style={pfInput} />
        </CrField>
        <CrField label="WhatsApp Number">
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <Phone size={14} style={{ color: "#555", margin: "0 10px" }} />
            <input value={form.whatsapp_number} onChange={e => upd("whatsapp_number", e.target.value)} placeholder="+91 98765 43210" style={{ ...pfInput, padding: "11px 14px 11px 0" }} />
          </div>
        </CrField>
        <CrField label="City & Country">
          <input value={form.city_country} onChange={e => upd("city_country", e.target.value)} placeholder="e.g. Mumbai, India" style={pfInput} />
        </CrField>
        <CrField label="Instagram Username">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Instagram size={14} style={{ color: "#555", margin: "0 10px" }} />
            <input value={form.instagram_username} onChange={e => upd("instagram_username", e.target.value.replace(/^@/, ""))} placeholder="yourhandle" style={{ ...pfInput, padding: "11px 14px 11px 0" }} />
          </div>
        </CrField>
        <CrField label="Instagram Profile URL">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Globe size={14} style={{ color: "#555", margin: "0 10px" }} />
            <input value={form.instagram_profile_url} onChange={e => upd("instagram_profile_url", e.target.value)} placeholder="https://instagram.com/yourhandle" style={{ ...pfInput, padding: "11px 14px 11px 0" }} />
          </div>
        </CrField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <CrField label="Website">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Globe size={13} style={{ color: "#555", margin: "0 8px" }} />
              <input value={form.website_url} onChange={e => upd("website_url", e.target.value)} placeholder="yoursite.com" style={{ ...pfInput, padding: "11px 10px 11px 0", fontSize: 12 }} />
            </div>
          </CrField>
          <CrField label="LinkedIn">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Linkedin size={13} style={{ color: "#555", margin: "0 8px" }} />
              <input value={form.linkedin_url} onChange={e => upd("linkedin_url", e.target.value)} placeholder="linkedin.com/in/you" style={{ ...pfInput, padding: "11px 10px 11px 0", fontSize: 12 }} />
            </div>
          </CrField>
          <CrField label="YouTube">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Youtube size={13} style={{ color: "#555", margin: "0 8px" }} />
              <input value={form.youtube_url} onChange={e => upd("youtube_url", e.target.value)} placeholder="Channel link" style={{ ...pfInput, padding: "11px 10px 11px 0", fontSize: 12 }} />
            </div>
          </CrField>
          <CrField label="Twitter / X">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Twitter size={13} style={{ color: "#555", margin: "0 8px" }} />
              <input value={form.twitter_url} onChange={e => upd("twitter_url", e.target.value)} placeholder="x.com/yourhandle" style={{ ...pfInput, padding: "11px 10px 11px 0", fontSize: 12 }} />
            </div>
          </CrField>
        </div>
      </CrSection>

      {/* Section 2: Brand & Audience */}
      <CrSection title="Story, Brand & Audience">
        <CrField label="About Your Business">
          <textarea value={form.business_description} onChange={e => upd("business_description", e.target.value)} rows={5}
            placeholder="What you do, who you help, and what your system/process is…"
            style={{ ...pfInput, resize: "vertical", lineHeight: 1.6 }} />
        </CrField>
        <CrField label="One-Line Niche Statement">
          <input value={form.niche_statement} onChange={e => upd("niche_statement", e.target.value)} placeholder='I help [audience] [achieve outcome]' style={pfInput} />
        </CrField>
        <CrField label="Target Audience">
          <input value={form.target_audience} onChange={e => upd("target_audience", e.target.value)} placeholder="e.g. Corporate employees, freelancers, coaches" style={pfInput} />
        </CrField>

        {/* Age range */}
        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Audience Age Range</div>
          <div style={{ background: "#1e1e1e", borderRadius: 12, padding: "14px", border: "1.5px solid #2a2a2a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{form.audience_age_min}</span>
              <span style={{ fontSize: 12, color: "#555" }}>to</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{form.audience_age_max}</span>
            </div>
            <input type="range" min={13} max={65} value={form.audience_age_min} onChange={e => upd("audience_age_min", Math.min(parseInt(e.target.value), form.audience_age_max - 5))}
              style={{ width: "100%", accentColor: "#5B5BD6", marginBottom: 6 }} />
            <input type="range" min={13} max={65} value={form.audience_age_max} onChange={e => upd("audience_age_max", Math.max(parseInt(e.target.value), form.audience_age_min + 5))}
              style={{ width: "100%", accentColor: "#5B5BD6" }} />
          </div>
        </div>

        <CrChipMulti label="Audience Emotional State" options={EMOTIONAL_STATES_OPTS} value={form.audience_emotional_states} onChange={v => upd("audience_emotional_states", v)} allowCustom={false} max={2} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #1e1e1e", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#ccc" }}>Do you have client case studies or results?</span>
          <button onClick={() => upd("has_case_studies", !form.has_case_studies)}
            style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: form.has_case_studies ? "#5B5BD6" : "#2a2a2a", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 2, left: form.has_case_studies ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>

        <CrChipMulti label="Topics I Love" options={TOPICS_LOVE_OPTS} value={form.topics_love} onChange={v => upd("topics_love", v)} />
        <CrChipMulti label="Solutions I Provide" options={SOLUTIONS_OPTS} value={form.solutions_provided} onChange={v => upd("solutions_provided", v)} />
        <CrChipMulti label="Unique Selling Points" options={USPS_OPTS} value={form.unique_selling_points} onChange={v => upd("unique_selling_points", v)} />
        <CrChipMulti label="FAQs from Audience" options={FAQ_OPTS} value={form.faqs} onChange={v => upd("faqs", v)} />

        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Brand Voice</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {BRAND_VOICES_OPTS.map(v => (
              <button key={v.key} onClick={() => upd("brand_voice", v.key)}
                style={{ padding: "10px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", border: `1.5px solid ${form.brand_voice === v.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.brand_voice === v.key ? "#1e1e3a" : "#1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: form.brand_voice === v.key ? "#fff" : "#ccc" }}>{v.label}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{v.desc}</div>
                </div>
                {form.brand_voice === v.key && <Check size={12} style={{ color: "#5B5BD6", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={pfSectionLabel}>Content Boldness</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5B5BD6" }}>{SPICE_LABELS_MAP[form.spice_level]}</span>
          </div>
          <input type="range" min={1} max={5} step={1} value={form.spice_level} onChange={e => upd("spice_level", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#5B5BD6" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 4 }}>
            <span>Safe</span><span>Controversial</span>
          </div>
        </div>
      </CrSection>

      {/* Section 3: Content Strategy */}
      <CrSection title="Content Strategy & Direction">
        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Content Language</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {LANGUAGES_OPTS.map(lang => (
              <button key={lang} onClick={() => upd("content_language", lang)}
                style={{ padding: "7px 13px", borderRadius: 18, fontSize: 12, cursor: "pointer", border: `1.5px solid ${form.content_language === lang ? "#5B5BD6" : "#2a2a2a"}`, background: form.content_language === lang ? "#1e1e3a" : "#1e1e1e", color: form.content_language === lang ? "#8080ff" : "#aaa" }}>
                {lang}
              </button>
            ))}
          </div>
        </div>

        <CrTagInput label="Content I Dislike" value={form.content_dislikes} onChange={v => upd("content_dislikes", v)} placeholder="e.g. Clickbait, aggressive selling…" />

        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Topics to Avoid</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {AVOID_PREFIXES.map((prefix, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#1e1e1e", borderRadius: 10, border: "1.5px solid #2a2a2a", padding: "0 12px" }}
                onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
                <span style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap", flexShrink: 0 }}>{prefix}</span>
                <input value={form.topics_to_avoid[i]} onChange={e => updArr("topics_to_avoid", i, e.target.value)}
                  placeholder="…" style={{ ...pfInput, background: "transparent", border: "none", padding: "10px 0", fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Underserved Topics in Your Niche</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{ background: "#1e1e1e", borderRadius: 10, border: "1.5px solid #2a2a2a" }}
                onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
                <input value={form.underserved_topics[i]} onChange={e => updArr("underserved_topics", i, e.target.value)}
                  placeholder={`Topic ${i + 1}`} style={pfInput} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Competitor Accounts (8 best accounts in your niche)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", background: "#1e1e1e", borderRadius: 10, border: "1.5px solid #2a2a2a", padding: "0 10px" }}
                onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
                onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
                <span style={{ color: "#555", fontSize: 13 }}>@</span>
                <input value={form.competitors[i]} onChange={e => updArr("competitors", i, e.target.value.replace(/^@/, ""))}
                  placeholder="username" style={{ ...pfInput, padding: "9px 8px", fontSize: 12, background: "transparent", border: "none" }} />
              </div>
            ))}
          </div>
        </div>
      </CrSection>

      {/* Section 4: Goals & CTA */}
      <CrSection title="Goals, CTA & Lead Generation">
        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Primary Instagram Goal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {GOALS_OPTS.map(g => (
              <button key={g.key} onClick={() => upd("primary_goal", g.key)}
                style={{ padding: "12px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", border: `1.5px solid ${form.primary_goal === g.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.primary_goal === g.key ? "#1e1e3a" : "#1e1e1e", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: form.primary_goal === g.key ? "#fff" : "#ccc" }}>{g.label}</span>
                {form.primary_goal === g.key && <Check size={13} style={{ color: "#5B5BD6", marginLeft: "auto" }} />}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={pfSectionLabel}>Preferred CTA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CTAS_OPTS.map(c => (
              <button key={c.key} onClick={() => upd("content_cta", c.key)}
                style={{ padding: "8px 16px", borderRadius: 18, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.content_cta === c.key ? "#5B5BD6" : "#2a2a2a"}`, background: form.content_cta === c.key ? "#1e1e3a" : "#1e1e1e", color: form.content_cta === c.key ? "#8080ff" : "#aaa" }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <CrField label="Landing Page / Website URL">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Globe size={14} style={{ color: "#555", margin: "0 10px" }} />
            <input value={form.landing_page_url} onChange={e => upd("landing_page_url", e.target.value)} placeholder="https://yoursite.com or calendly link" style={{ ...pfInput, padding: "11px 14px 11px 0" }} />
          </div>
        </CrField>
      </CrSection>

      {/* Save */}
      <button onClick={save} disabled={saving}
        style={{ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 700, borderRadius: 12, border: "none", background: saving ? "#3a3a6a" : "#5B5BD6", color: "#fff", cursor: saving ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(91,91,214,0.25)", marginBottom: 32 }}>
        {saving ? "Saving…" : "Save Creator Profile"}
      </button>
    </div>
  );
}

function CrSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #1e1e1e" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function CrField({ label, children }) {
  return (
    <div>
      <div style={pfSectionLabel}>{label}</div>
      <div style={{ background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 12, overflow: "hidden" }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
        {children}
      </div>
    </div>
  );
}

function CrChipMulti({ label, options, value, onChange, allowCustom = true, max }) {
  const [custom, setCustom] = useState("");
  const toggle = item => {
    if (value.includes(item)) { onChange(value.filter(v => v !== item)); return; }
    if (max && value.length >= max) return;
    onChange([...value, item]);
  };
  const addCustom = () => {
    const t = custom.trim();
    if (!t || value.includes(t)) return;
    if (max && value.length >= max) return;
    onChange([...value, t]); setCustom("");
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={pfSectionLabel}>{label}{max ? <span style={{ color: "#555", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> (up to {max})</span> : ""}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: allowCustom ? 8 : 0 }}>
        {options.map(opt => {
          const on = value.includes(opt);
          return (
            <button key={opt} onClick={() => toggle(opt)}
              style={{ padding: "6px 12px", borderRadius: 18, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${on ? "#5B5BD6" : "#2a2a2a"}`, background: on ? "#1e1e3a" : "#1e1e1e", color: on ? "#8080ff" : "#888", display: "flex", alignItems: "center", gap: 4 }}>
              {on && <Check size={9} style={{ color: "#8080ff" }} />} {opt}
            </button>
          );
        })}
        {value.filter(v => !options.includes(v)).map(v => (
          <button key={v} onClick={() => toggle(v)}
            style={{ padding: "6px 12px", borderRadius: 18, fontSize: 11, fontWeight: 500, cursor: "pointer", border: "1.5px solid #5B5BD6", background: "#1e1e3a", color: "#8080ff", display: "flex", alignItems: "center", gap: 4 }}>
            <Check size={9} /> {v} <X size={9} />
          </button>
        ))}
      </div>
      {allowCustom && (
        <div style={{ display: "flex", gap: 7 }}>
          <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustom()} placeholder="Add your own…"
            style={{ flex: 1, background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#fff", outline: "none", fontFamily: "inherit" }}
            onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
            onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
          <button onClick={addCustom}
            style={{ width: 36, height: 36, borderRadius: 9, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function CrTagInput({ label, value, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]); setInput("");
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={pfSectionLabel}>{label}</div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
          {value.map(v => (
            <div key={v} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 18, background: "#2a0a0a", border: "1px solid #7f1d1d", fontSize: 11, color: "#ef4444" }}>
              {v}
              <button onClick={() => onChange(value.filter(x => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0, display: "flex" }}>
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder}
          style={{ flex: 1, background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 10, padding: "9px 12px", fontSize: 12, color: "#fff", outline: "none", fontFamily: "inherit" }}
          onFocus={e => e.currentTarget.style.borderColor = "#5B5BD6"}
          onBlur={e => e.currentTarget.style.borderColor = "#2a2a2a"} />
        <button onClick={add}
          style={{ width: 36, height: 36, borderRadius: 9, background: "#5B5BD6", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function padArr(arr, len) {
  const copy = [...arr];
  while (copy.length < len) copy.push("");
  return copy;
}

// ─── Connections ──────────────────────────────────────────────────────────────

function ConnectionsTab({ user }) {
  const clientId = user?.client_id;
  const [ig, setIg]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const igR = await axios.get(`${API}/instagram/status/${clientId}`);
      setIg(igR.data);
    } catch {}
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Listen for the OAuth popup completing and for native app resume (Capacitor)
  useEffect(() => {
    const onMessage = async (e) => {
      if (e.data?.type !== "BUNDLE_AUTH") return;
      await load();
      window.dispatchEvent(new Event("sc:refresh"));
    };
    const onAppResume = async () => {
      await load();
      window.dispatchEvent(new Event("sc:refresh"));
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("sc:app-resume", onAppResume);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("sc:app-resume", onAppResume);
    };
  }, [load]);

  const connectInstagram = async () => {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const { data } = await axios.get(`${API}/bundle/connect/${clientId}`, { headers });
      if (data.already_connected) {
        toast.success(`Instagram already connected${data.instagram_username ? ` as @${data.instagram_username}` : ""}!`);
        await load();
        window.dispatchEvent(new Event("sc:refresh"));
      } else if (data.url) {
        // Open without noopener so the popup can postMessage back to window.opener
        window.open(data.url, "bundle_connect", "width=520,height=720,noopener=no");
      } else {
        toast.error("Could not get connect URL");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to initiate connect";
      toast.error(msg, { duration: 6000 });
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await axios.delete(`${API}/instagram/disconnect/${clientId}`);
      toast.success("Instagram disconnected");
      await load();
      window.dispatchEvent(new Event("sc:refresh"));
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section title="Social Accounts" description="Connect Instagram to publish and schedule posts automatically">
        {loading ? (
          <div className="flex items-center gap-2 text-sm py-6" style={{ color: "#666666" }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-2xl border-2 transition-all"
              style={{
                background:  ig?.connected ? "#0a2016" : "#161616",
                borderColor: ig?.connected ? "#14532d" : "#2a2a2a",
              }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", color: "#fff" }}>
                  <Instagram size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#ffffff" }}>Instagram</div>
                  <div className="text-xs mt-0.5" style={{ color: "#666666" }}>
                    {ig?.connected ? `@${ig.username || ig.name}` : "Reels, feed posts, stories"}
                  </div>
                  {ig?.warning && (
                    <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: "#d97706" }}>
                      <AlertCircle size={11} /> {ig.warning}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {ig?.connected ? (
                  <>
                    <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#059669" }}>
                      <CheckCircle2 size={13} /> Connected
                    </div>
                    <button
                      onClick={disconnect}
                      disabled={disconnecting}
                      className="text-xs ml-2 transition-colors disabled:opacity-50"
                      style={{ color: "#666666" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                      onMouseLeave={e => e.currentTarget.style.color = "#666666"}
                    >
                      {disconnecting ? "…" : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={connectInstagram}
                    disabled={!clientId}
                    className="text-xs font-semibold px-4 py-2 rounded-xl text-white transition-colors disabled:opacity-50"
                    style={{ background: "#5B5BD6", border: "none", cursor: clientId ? "pointer" : "not-allowed" }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs" style={{ color: "#666666" }}>
              More platforms (YouTube, TikTok, Threads) coming soon
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Subscription ─────────────────────────────────────────────────────────────

const FREE_LIMITS = { posts: 30, scheduled: 10 };

function SubscriptionTab({ user }) {
  const clientId = user?.client_id;
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    const fetchStats = async () => {
      try {
        const resp = await axios.get(`${API}/posts?client_id=${clientId}&limit=500`);
        const posts = resp.data?.posts || resp.data || [];
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = posts.filter(p => new Date(p.created_at || p.scheduled_at) >= monthStart);
        setStats({
          total:      posts.length,
          published:  posts.filter(p => p.status === "published").length,
          scheduled:  posts.filter(p => p.status === "scheduled").length,
          drafts:     posts.filter(p => p.status === "draft").length,
          this_month: thisMonth.length,
        });
      } catch { setStats({ total: 0, published: 0, scheduled: 0, drafts: 0, this_month: 0 }); }
      finally { setLoading(false); }
    };
    fetchStats();
  }, [clientId]);

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Section title="Current Plan">
        <div className="p-5 rounded-2xl border-2" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "#1e1e3a", color: "#5B5BD6" }}>
                <Zap size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "#ffffff" }}>Free Plan</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "#1e1e3a", color: "#5B5BD6" }}>
                    CURRENT
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#666666" }}>Member since {joinedDate}</div>
              </div>
            </div>
            <button
              className="text-xs font-semibold px-4 py-2 rounded-xl text-white transition-colors"
              style={{ background: "#5B5BD6" }}
              onClick={() => toast.info("Pro plan coming soon! We'll notify you when it launches.")}
            >
              Upgrade
            </button>
          </div>

          {/* Pro teaser */}
          <div className="mt-4 p-4 rounded-xl border" style={{ background: "#0d0d0d", borderColor: "#2a2a2a" }}>
            <div className="text-xs font-semibold mb-2" style={{ color: "#5B5BD6" }}>Pro Plan — Coming Soon</div>
            <ul className="space-y-1.5">
              {[
                "Unlimited posts & scheduling",
                "AI-generated captions with no monthly cap",
                "Advanced analytics & growth insights",
                "Priority support",
              ].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs" style={{ color: "#888888" }}>
                  <Check size={11} style={{ color: "#5B5BD6", flexShrink: 0 }} /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Usage */}
      <Section title="Account Usage" description="Your activity this month and all time">
        {loading ? (
          <div className="flex items-center gap-2 text-sm py-4" style={{ color: "#666666" }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <UsageStat
              icon={<FileText size={14} style={{ color: "#666666" }} />}
              label="Posts this month"
              value={stats?.this_month ?? 0}
              limit={FREE_LIMITS.posts}
            />
            <UsageStat
              icon={<Calendar size={14} style={{ color: "#666666" }} />}
              label="Scheduled posts"
              value={stats?.scheduled ?? 0}
              limit={FREE_LIMITS.scheduled}
            />
            <UsageStat
              icon={<BarChart3 size={14} style={{ color: "#666666" }} />}
              label="Total posts published"
              value={stats?.published ?? 0}
              limit={null}
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { label: "Drafts", value: stats?.drafts ?? 0 },
                { label: "All posts", value: stats?.total ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="p-4 rounded-2xl border" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
                  <div className="text-2xl font-bold" style={{ color: "#ffffff" }}>{value}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#666666" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function UsageStat({ icon, label, value, limit }) {
  const pct = limit ? Math.min((value / limit) * 100, 100) : null;
  const nearLimit = pct !== null && pct >= 80;

  return (
    <div className="p-4 rounded-2xl border" style={{ background: "#161616", borderColor: "#2a2a2a" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: "#cccccc" }}>
          {icon} {label}
        </div>
        <div className="text-sm font-semibold" style={{ color: "#ffffff" }}>
          {value}{limit ? <span className="text-xs font-normal" style={{ color: "#666666" }}> / {limit}</span> : ""}
        </div>
      </div>
      {limit && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1e1e1e" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: nearLimit ? "#f59e0b" : "#5B5BD6" }}
          />
        </div>
      )}
      {nearLimit && (
        <p className="text-[10px] mt-1.5" style={{ color: "#d97706" }}>Approaching limit — upgrade for unlimited</p>
      )}
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

// ─── Shared ───────────────────────────────────────────────────────────────────

const pfSectionLabel = {
  fontSize: 11, fontWeight: 700, color: "#666666",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
};

const pfInput = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  fontSize: 13, color: "#ffffff", background: "transparent",
  border: "none", outline: "none", fontFamily: "inherit",
};

function PfField({ label, children }) {
  return (
    <div>
      <div style={pfSectionLabel}>{label}</div>
      <div
        style={{ background: "#1e1e1e", border: "1.5px solid #2a2a2a", borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}
        onFocusCapture={e => e.currentTarget.style.borderColor = "#5B5BD6"}
        onBlurCapture={e => e.currentTarget.style.borderColor = "#2a2a2a"}
      >
        {children}
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "#ffffff" }}>{title}</h2>
        {description && <p className="text-xs mt-0.5" style={{ color: "#666666" }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}
