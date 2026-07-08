import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  User, Link2, CreditCard,
  Instagram, Check, CheckCircle2, Camera, Pencil, Mail, LogOut,
  Zap, BarChart3, Calendar, FileText,
  AlertCircle, Loader2
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
  { key: "connections",  label: "Connections",  icon: Link2 },
  { key: "subscription", label: "Subscription", icon: CreditCard },
];

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

  const connectInstagram = async () => {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const { data } = await axios.get(`${API}/bundle/connect/${clientId}`, { headers });
      if (data.already_connected) {
        toast.success(`Instagram already connected${data.instagram_username ? ` as @${data.instagram_username}` : ""}!`);
        await load(); // refresh displayed status
      } else if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
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
  fontSize: 11, fontWeight: 700, color: "#cccccc",
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10,
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
        style={{ background: "#1a1a1a", border: "1.5px solid #2a2a2a", borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s" }}
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
