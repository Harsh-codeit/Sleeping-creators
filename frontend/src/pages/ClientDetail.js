import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Circle, Pause, Play, Save, Wand2, Send, Trash2, Link, Link2Off, RefreshCw, Plus, X, Check, MessageCircle, Users, Upload, Download, Filter, Eye, Search, Star, Film, Image, CheckCircle } from "lucide-react";
import PipelineManager from "@/components/PipelineManager";
import CompetitorTab from "@/components/CompetitorTab";
import { StatusBadge, getPostActions } from "@/lib/postStatus";
import { render } from "@react-email/render";
import { ContentStrategyOnboardingEmail } from "../emails/ContentStrategyOnboardingEmail";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "twitter", "threads"];
const TABS = ["Overview", "Strategy", "Platforms", "Posts", "Pipeline", "Leads", "Competitors", "Trends", "Dropbox", "Apps", "Profile", "Emails"];

const STATUS_DOT = { active: "text-emerald-400", paused: "text-amber-400", error: "text-red-400" };

// ─── Edit Profile helpers ─────────────────────────────────────────────────────

function initEditForm(client) {
  const ob = client.onboarding_data || {};
  return {
    name: client.name || "",
    bio: client.bio || "",
    platforms: client.platforms || [],
    username: ob.username || "",
    whatsapp: ob.whatsapp || "",
    email: ob.email || "",
    website_url: ob.website_url || "",
    pr_links: ob.pr_links?.length ? ob.pr_links : [""],
    instagram_handle: ob.instagram_handle || "",
    instagram_access_link: ob.instagram_access_link || "",
    instagram_password: ob.instagram_password || "",
    niche: ob.niche || client.industry || "",
    problem_solved: ob.problem_solved || "",
    brand_vibe: Array.isArray(ob.brand_vibe) ? ob.brand_vibe : (ob.brand_vibe ? [ob.brand_vibe] : []),
    account_goals: ob.account_goals || "followers",
    cta_link: ob.cta_link || "",
    language: Array.isArray(ob.language) ? (ob.language[0] ?? "English") : (ob.language || "English"),
    branding_assets_link: ob.branding_assets_link || "",
    google_drive_images: ob.google_drive_images || "",
    google_drive_videos: ob.google_drive_videos || "",
    drive_images_folder_id: ob.drive_images_folder_id || "",
    competitor_accounts: ob.competitor_accounts?.length ? ob.competitor_accounts : [""],
    not_to_do_list: ob.not_to_do_list?.length ? ob.not_to_do_list : [""],
    preferred_carousel_template: ob.preferred_carousel_template || "full_white",
    preferred_video_template: ob.preferred_video_template || "",
    // Step 1A additions
    brand_name: ob.brand_name || "",
    city_country: ob.city_country || "",
    // Step 1B additions
    instagram_profile_url: ob.instagram_profile_url || "",
    linkedin_url: ob.linkedin_url || "",
    youtube_url: ob.youtube_url || "",
    twitter_url: ob.twitter_url || "",
    // Step 1C additions
    profile_photo_link: ob.profile_photo_link || "",
    logo_link: ob.logo_link || "",
    // Step 1D additions
    account_suspended: ob.account_suspended ?? false,
    paid_ads_run: ob.paid_ads_run ?? false,
    // Step 2A additions
    personal_story: ob.personal_story || "",
    business_description: ob.business_description || "",
    industry_label: ob.industry_label || "",
    daily_life: ob.daily_life || "",
    // Step 2B additions
    target_audience_description: ob.target_audience_description || "",
    audience_age_range: ob.audience_age_range || "",
    audience_emotional_state: Array.isArray(ob.audience_emotional_state) ? ob.audience_emotional_state : [],
    // Step 2C additions (8 capped-5 lists)
    solutions_provided: ob.solutions_provided?.length ? ob.solutions_provided : [""],
    audience_problems: ob.audience_problems?.length ? ob.audience_problems : [""],
    audience_desires: ob.audience_desires?.length ? ob.audience_desires : [""],
    audience_myths: ob.audience_myths?.length ? ob.audience_myths : [""],
    audience_failed_attempts: ob.audience_failed_attempts?.length ? ob.audience_failed_attempts : [""],
    unique_selling_points: ob.unique_selling_points?.length ? ob.unique_selling_points : [""],
    frequent_questions: ob.frequent_questions?.length ? ob.frequent_questions : [""],
    love_topics: ob.love_topics?.length ? ob.love_topics : [""],
    // Step 2D additions
    has_case_studies: ob.has_case_studies ?? false,
    case_study_1: ob.case_study_1 || "",
    case_study_2: ob.case_study_2 || "",
    // Step 3A additions
    signature_topic: ob.signature_topic || "",
    // Step 3B additions
    niche_working_topics: ob.niche_working_topics || "",
    niche_oversaturated_topics: ob.niche_oversaturated_topics || "",
    niche_underserved_topics: ob.niche_underserved_topics || "",
    // Step 3D additions
    disliked_content: ob.disliked_content || "",
    // Step 4A additions
    next_step_after_view: ob.next_step_after_view || "",
    // Step 4B additions
    lead_magnet_link: ob.lead_magnet_link || "",
  };
}

function ELabel({ children, optional }) {
  return (
    <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
      {children}
      {optional && <span className="ml-1 text-zinc-600 normal-case tracking-normal">optional</span>}
    </label>
  );
}
function EInput(props) {
  return <input {...props} className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150" />;
}
function ETextarea({ rows = 3, ...props }) {
  return <textarea rows={rows} {...props} className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150 resize-none" />;
}
function EMultiInput({ label, values, onChange, placeholder, optional }) {
  const add = () => onChange([...values, ""]);
  const remove = (i) => onChange(values.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(values.map((x, idx) => idx === i ? v : x));
  return (
    <div>
      <ELabel optional={optional}>{label}</ELabel>
      <div className="space-y-2">
        {values.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input value={val} onChange={e => update(i, e.target.value)} placeholder={placeholder}
              className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150" />
            {values.length > 1 && (
              <button type="button" onClick={() => remove(i)}
                className="px-2 text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-900 transition-colors duration-150">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white font-mono transition-colors duration-150">
          <Plus size={12} /> Add another
        </button>
      </div>
    </div>
  );
}

const EDIT_GOALS = [
  { value: "followers", label: "Grow Followers" },
  { value: "leads", label: "Generate Leads" },
  { value: "both", label: "Both" },
];
const EDIT_LANGUAGES = ["English", "Hindi", "Tamil", "Marathi", "Gujarati", "Kannada", "Hinglish", "Arabic", "Spanish", "French", "Portuguese", "German", "Other"];
const EDIT_CAROUSEL_TEMPLATES = [
  { value: "dark_card", label: "Dark Card" },
  { value: "full_white", label: "Quote White" },
  { value: "floating_card", label: "Floating Card" },
  { value: "dark_card_rich", label: "Dark Card (Rich)" },
  { value: "full_white_rich", label: "Quote White (Rich)" },
  { value: "floating_card_rich", label: "Floating (Rich)" },
];
const EDIT_ALL_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "twitter", "threads"];
const EDIT_BRAND_VIBES = ["Professional", "Rude/Bold", "Funny", "Inspirational", "Creative", "Straight-talking", "Funky"];
const EDIT_LANGUAGE_OPTIONS = [
  "English", "Hindi", "Hinglish", "Punjabi", "Bengali",
  "Tamil", "Telugu", "Kannada", "Marathi", "Urdu",
  "Gujarati", "Malayalam", "Odia", "Assamese", "Maithili",
  "Santali", "Kashmiri", "Nepali", "Sindhi", "Konkani",
  "Dogri", "Manipuri", "Bodo",
  "Arabic", "Chinese (Simplified)", "Chinese (Traditional)",
  "French", "German", "Spanish", "Portuguese", "Italian",
  "Russian", "Japanese", "Korean", "Turkish", "Dutch",
  "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
  "Greek", "Hebrew", "Thai", "Vietnamese", "Indonesian",
  "Malay", "Swahili", "Persian (Farsi)", "Other",
];
const EDIT_EMOTIONAL_STATES = ["Ambitious", "Stressed", "Confused", "Motivated", "Depressed", "Directionless", "Lonely"];
const EDIT_NEXT_STEPS = [
  { value: "dm", label: "DM Me" },
  { value: "link", label: "Visit Link" },
  { value: "call", label: "Book Call" },
  { value: "enrol", label: "Enrol Now" },
  { value: "other", label: "Other" },
];

function DriveVideosFolderCard({ client, clientId, setClient }) {
  const [value, setValue] = useState(client.drive_folder_id || "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clipCount, setClipCount] = useState(null);
  const dirty = value !== (client.drive_folder_id || "");

  useEffect(() => {
    axios.get(`${API}/clients/${clientId}/drive-clips`)
      .then(r => setClipCount((r.data || []).length))
      .catch(() => {});
  }, [clientId]);

  const save = async () => {
    setSaving(true);
    try {
      const resp = await axios.put(`${API}/clients/${clientId}`, { drive_folder_id: value });
      setClient(resp.data);
      toast.success("Drive folder saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const syncClips = async () => {
    setSyncing(true);
    try {
      const body = value.trim() ? { folder_id: value.trim() } : {};
      const resp = await axios.post(`${API}/clients/${clientId}/drive-clips/sync`, body);
      setClipCount(resp.data?.synced ?? null);
      toast.success(`Synced ${resp.data?.synced ?? 0} clips`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase">Drive Videos Folder</div>
        {client.drive_folder_id
          ? <span className="text-[10px] font-mono text-emerald-500">● Connected</span>
          : <span className="text-[10px] font-mono text-zinc-600">Not configured</span>
        }
      </div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Paste Google Drive folder URL or ID..."
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
      />
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-[10px] text-zinc-600 font-mono">
          {clipCount != null ? `${clipCount} clips synced` : "No clips synced"}
        </span>
        <div className="flex gap-2">
          <button onClick={syncClips} disabled={syncing || !value.trim()}
            className="px-3 py-1 border border-zinc-700 text-zinc-300 text-[10px] font-mono hover:bg-zinc-800 hover:text-white disabled:opacity-50 transition-colors">
            {syncing ? "Syncing..." : "Sync clips"}
          </button>
          {dirty && (
            <button onClick={save} disabled={saving}
              className="px-3 py-1 bg-white text-black text-[10px] font-mono hover:bg-zinc-200 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DriveImagesFolderCard({ client, clientId, setClient }) {
  const [value, setValue] = useState(client.drive_images_folder_id || "");
  const [saving, setSaving] = useState(false);
  const dirty = value !== (client.drive_images_folder_id || "");

  const save = async () => {
    setSaving(true);
    try {
      const resp = await axios.put(`${API}/clients/${clientId}`, { drive_images_folder_id: value });
      setClient(resp.data);
      toast.success("Drive folder saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase">Carousel Drive Images</div>
        {client.drive_images_folder_id
          ? <span className="text-[10px] font-mono text-emerald-500">● Connected</span>
          : <span className="text-[10px] font-mono text-zinc-600">Not configured</span>
        }
      </div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Paste Google Drive folder URL or ID..."
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-zinc-600 font-mono">
          {client.drive_images_index != null ? `${client.drive_images_index} exports cycled` : "No exports yet"}
        </span>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="px-3 py-1 bg-white text-black text-[10px] font-mono hover:bg-zinc-200 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

function EditProfileTab({ editForm, setEditForm, saving, onSave, onComplete, completing }) {
  const set = (key, val) => setEditForm(f => ({ ...f, [key]: val }));
  return (
    <div className="max-w-2xl space-y-5" data-testid="edit-profile-tab">

      {/* 1. Identity */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Identity</div>
        <div className="space-y-4">
          <div>
            <ELabel>Client Name *</ELabel>
            <EInput value={editForm.name} onChange={e => set("name", e.target.value)} placeholder="Acme Corp" data-testid="edit-name" />
          </div>
          <div>
            <ELabel optional>Brand Name</ELabel>
            <EInput value={editForm.brand_name} onChange={e => set("brand_name", e.target.value)} placeholder="The public-facing brand name" data-testid="edit-brand-name" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <ELabel optional>Username</ELabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">@</span>
                <input value={editForm.username} onChange={e => set("username", e.target.value)} placeholder="handle"
                  data-testid="edit-username"
                  className="w-full bg-zinc-950 border border-zinc-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150" />
              </div>
            </div>
            <div>
              <ELabel optional>WhatsApp</ELabel>
              <EInput value={editForm.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="+1 234 567 8900" data-testid="edit-whatsapp" />
            </div>
            <div>
              <ELabel optional>Email</ELabel>
              <EInput value={editForm.email} onChange={e => set("email", e.target.value)} placeholder="hello@acme.com" type="email" data-testid="edit-email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <ELabel optional>City / Country</ELabel>
              <EInput value={editForm.city_country} onChange={e => set("city_country", e.target.value)} placeholder="e.g. Mumbai, India" data-testid="edit-city-country" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <ELabel>Account Previously Suspended?</ELabel>
              <div className="flex gap-2">
                <button type="button" onClick={() => set("account_suspended", true)}
                  data-testid="edit-account-suspended-yes"
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.account_suspended === true ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  Yes
                </button>
                <button type="button" onClick={() => set("account_suspended", false)}
                  data-testid="edit-account-suspended-no"
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.account_suspended === false ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  No
                </button>
              </div>
            </div>
            <div>
              <ELabel>Paid Ads Run?</ELabel>
              <div className="flex gap-2">
                <button type="button" onClick={() => set("paid_ads_run", true)}
                  data-testid="edit-paid-ads-run-yes"
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.paid_ads_run === true ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  Yes
                </button>
                <button type="button" onClick={() => set("paid_ads_run", false)}
                  data-testid="edit-paid-ads-run-no"
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.paid_ads_run === false ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Online Presence */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Online Presence</div>
        <div className="space-y-4">
          <div>
            <ELabel optional>Website URL</ELabel>
            <EInput value={editForm.website_url} onChange={e => set("website_url", e.target.value)} placeholder="https://acme.com" type="url" data-testid="edit-website" />
          </div>
          <EMultiInput label="PR / Media Links" values={editForm.pr_links} onChange={v => set("pr_links", v)}
            placeholder="https://techcrunch.com/article/..." optional />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>Instagram Handle</ELabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">@</span>
                <input value={editForm.instagram_handle} onChange={e => set("instagram_handle", e.target.value)} placeholder="acmecorp"
                  data-testid="edit-ig-handle"
                  className="w-full bg-zinc-950 border border-zinc-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150" />
              </div>
            </div>
            <div>
              <ELabel>Instagram Password</ELabel>
              <EInput type="password" autoComplete="new-password" value={editForm.instagram_password} onChange={e => set("instagram_password", e.target.value)} placeholder="Stored as a string for account re-verification" data-testid="edit-ig-password" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>Instagram Profile URL</ELabel>
              <EInput value={editForm.instagram_profile_url} onChange={e => set("instagram_profile_url", e.target.value)} placeholder="https://instagram.com/acmecorp" type="url" data-testid="edit-instagram-profile-url" />
            </div>
            <div>
              <ELabel optional>Profile Photo Link</ELabel>
              <EInput value={editForm.profile_photo_link} onChange={e => set("profile_photo_link", e.target.value)} placeholder="Drive / Dropbox / direct image URL" type="url" data-testid="edit-profile-photo-link" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>LinkedIn URL</ELabel>
              <EInput value={editForm.linkedin_url} onChange={e => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." type="url" data-testid="edit-linkedin-url" />
            </div>
            <div>
              <ELabel optional>YouTube URL</ELabel>
              <EInput value={editForm.youtube_url} onChange={e => set("youtube_url", e.target.value)} placeholder="https://youtube.com/@channel" type="url" data-testid="edit-youtube-url" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>Twitter / X URL</ELabel>
              <EInput value={editForm.twitter_url} onChange={e => set("twitter_url", e.target.value)} placeholder="https://twitter.com/handle" type="url" data-testid="edit-twitter-url" />
            </div>
            <div>
              <ELabel optional>Logo Link</ELabel>
              <EInput value={editForm.logo_link} onChange={e => set("logo_link", e.target.value)} placeholder="Drive / Dropbox / direct image URL" type="url" data-testid="edit-logo-link" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Brand Profile */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Brand Profile</div>
        <div className="space-y-4">
          <div>
            <ELabel optional>Niche / Target Market</ELabel>
            <EInput value={editForm.niche} onChange={e => set("niche", e.target.value)} placeholder="e.g. Health-conscious adults 25-40, B2B SaaS CTOs" data-testid="edit-niche" />
          </div>
          <div>
            <ELabel optional>Problem the Client Solves</ELabel>
            <ETextarea value={editForm.problem_solved} onChange={e => set("problem_solved", e.target.value)} placeholder="Describe what their product/service helps customers achieve..." data-testid="edit-problem" />
          </div>
          <div>
            <ELabel>Brand Vibe / Tone of Voice</ELabel>
            <div className="grid grid-cols-3 gap-2">
              {EDIT_BRAND_VIBES.map(v => {
                const selected = (editForm.brand_vibe || []).includes(v);
                return (
                  <button key={v} type="button"
                    onClick={() => {
                      const cur = Array.isArray(editForm.brand_vibe) ? editForm.brand_vibe : [];
                      const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
                      set("brand_vibe", next);
                    }}
                    data-testid={`edit-brand-vibe-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    className={`relative py-2.5 px-3 border text-xs font-mono text-left transition-all duration-150 ${selected ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                    {selected && (<span className="absolute top-1 right-1"><Check size={8} /></span>)}
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <ELabel optional>Personal Story</ELabel>
            <ETextarea rows={6} value={editForm.personal_story} onChange={e => set("personal_story", e.target.value)} placeholder="When did you start? Why? What failures, achievements, vision? Be real — this becomes content." data-testid="edit-personal-story" />
          </div>
          <div>
            <ELabel optional>Business Description</ELabel>
            <ETextarea rows={4} value={editForm.business_description} onChange={e => set("business_description", e.target.value)} placeholder="What do you do? How do you help people?" data-testid="edit-business-description" />
          </div>
          <div>
            <ELabel optional>Industry Label</ELabel>
            <EInput value={editForm.industry_label} onChange={e => set("industry_label", e.target.value)} placeholder="Short category label, e.g. Fitness" data-testid="edit-industry-label" />
          </div>
          <div>
            <ELabel optional>Daily Life</ELabel>
            <ETextarea rows={3} value={editForm.daily_life} onChange={e => set("daily_life", e.target.value)} placeholder="Morning to night — what's a typical day?" data-testid="edit-daily-life" />
          </div>
          <div>
            <ELabel optional>Signature Topic</ELabel>
            <ETextarea rows={2} value={editForm.signature_topic} onChange={e => set("signature_topic", e.target.value)} placeholder="The ONE topic your account is known for" data-testid="edit-signature-topic" />
          </div>
          <div>
            <ELabel optional>Target Audience Description</ELabel>
            <ETextarea rows={3} value={editForm.target_audience_description} onChange={e => set("target_audience_description", e.target.value)} placeholder="Job title, life situation, struggles" data-testid="edit-target-audience-description" />
          </div>
          <div>
            <ELabel optional>Audience Age Range</ELabel>
            <EInput value={editForm.audience_age_range} onChange={e => set("audience_age_range", e.target.value)} placeholder="25-40 years" data-testid="edit-audience-age-range" />
          </div>
          <div>
            <ELabel>Account Goals</ELabel>
            <div className="flex gap-2">
              {EDIT_GOALS.map(g => (
                <button key={g.value} type="button" onClick={() => set("account_goals", g.value)}
                  data-testid={`edit-goal-${g.value}`}
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.account_goals === g.value ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>CTA Link</ELabel>
              <EInput value={editForm.cta_link} onChange={e => set("cta_link", e.target.value)} placeholder="https://acme.com/book-demo" type="url" data-testid="edit-cta" />
            </div>
            <div>
              <ELabel>Language</ELabel>
              <select
                data-testid="edit-language"
                value={Array.isArray(editForm.language) ? (editForm.language[0] ?? "") : (editForm.language ?? "")}
                onChange={e => set("language", e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-400 transition-colors duration-150"
              >
                <option value="" disabled>Select a language</option>
                {EDIT_LANGUAGE_OPTIONS.map(l => (
                  <option key={l} value={l} className="bg-zinc-950">{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <ELabel>Next Step After View</ELabel>
            <div className="grid grid-cols-5 gap-2">
              {EDIT_NEXT_STEPS.map(s => (
                <button key={s.value} type="button" onClick={() => set("next_step_after_view", s.value)}
                  data-testid={`edit-next-step-after-view-${s.value}`}
                  className={`py-2 px-2 border text-xs font-mono transition-all duration-150 ${editForm.next_step_after_view === s.value ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3.5 Audience Intelligence */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Audience Intelligence</div>
        <div className="space-y-4">
          <div>
            <ELabel>Audience Emotional State</ELabel>
            <div className="grid grid-cols-3 gap-2">
              {EDIT_EMOTIONAL_STATES.map(s => {
                const selected = (editForm.audience_emotional_state || []).includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => {
                      const cur = Array.isArray(editForm.audience_emotional_state) ? editForm.audience_emotional_state : [];
                      const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
                      set("audience_emotional_state", next);
                    }}
                    data-testid={`edit-audience-emotional-state-${s.toLowerCase()}`}
                    className={`relative py-2.5 px-3 border text-xs font-mono text-left transition-all duration-150 ${selected ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                    {selected && (<span className="absolute top-1 right-1"><Check size={8} /></span>)}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <EMultiInput label="Solutions You Provide" values={editForm.solutions_provided} onChange={v => set("solutions_provided", v)}
            placeholder="e.g. 1-on-1 coaching, signature framework..." optional />
          <EMultiInput label="Problems Your Audience Faces" values={editForm.audience_problems} onChange={v => set("audience_problems", v)}
            placeholder="e.g. Can't stick to a routine" optional />
          <EMultiInput label="Desires / Dream Outcomes" values={editForm.audience_desires} onChange={v => set("audience_desires", v)}
            placeholder="e.g. Effortless 6-figure business" optional />
          <EMultiInput label="Myths Your Audience Believes" values={editForm.audience_myths} onChange={v => set("audience_myths", v)}
            placeholder="e.g. You need to post 3x a day" optional />
          <EMultiInput label="Things They Tried That Didn't Work" values={editForm.audience_failed_attempts} onChange={v => set("audience_failed_attempts", v)}
            placeholder="e.g. Random viral hacks" optional />
          <EMultiInput label="Unique Selling Points (USPs)" values={editForm.unique_selling_points} onChange={v => set("unique_selling_points", v)}
            placeholder="What makes you different?" optional />
          <EMultiInput label="Frequently Asked Questions" values={editForm.frequent_questions} onChange={v => set("frequent_questions", v)}
            placeholder="What do people always ask you?" optional />
          <EMultiInput label="Topics You Love To Talk About" values={editForm.love_topics} onChange={v => set("love_topics", v)}
            placeholder="Topics that energise you" optional />
        </div>
      </div>

      {/* 4. Content Assets */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Content Assets</div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>Branding Assets Link</ELabel>
              <EInput value={editForm.branding_assets_link} onChange={e => set("branding_assets_link", e.target.value)} placeholder="Google Drive / Dropbox link to logos, brand kit..." type="url" data-testid="edit-branding" />
            </div>
            <div>
              <ELabel optional>Lead Magnet Link</ELabel>
              <EInput value={editForm.lead_magnet_link} onChange={e => set("lead_magnet_link", e.target.value)} placeholder="Drive link for the lead magnet asset" type="url" data-testid="edit-lead-magnet-link" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ELabel optional>Google Drive — Images</ELabel>
              <EInput value={editForm.google_drive_images} onChange={e => set("google_drive_images", e.target.value)} placeholder="https://drive.google.com/..." type="url" data-testid="edit-drive-images" />
            </div>
            <div>
              <ELabel optional>Google Drive — Videos</ELabel>
              <EInput value={editForm.google_drive_videos} onChange={e => set("google_drive_videos", e.target.value)} placeholder="https://drive.google.com/..." type="url" data-testid="edit-drive-videos" />
            </div>
          </div>
          <div>
            <ELabel optional>Carousel Drive Images Folder</ELabel>
            <EInput value={editForm.drive_images_folder_id} onChange={e => set("drive_images_folder_id", e.target.value)} placeholder="Folder URL or ID — used for Drive Image elements in carousel export" data-testid="edit-drive-images-folder" />
          </div>
        </div>
      </div>

      {/* 4.5 Case Studies */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Case Studies</div>
        <div className="space-y-4">
          <div>
            <ELabel>Do You Have Case Studies?</ELabel>
            <div className="flex gap-2">
              <button type="button" onClick={() => set("has_case_studies", true)}
                data-testid="edit-has-case-studies-yes"
                className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.has_case_studies === true ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                Yes
              </button>
              <button type="button" onClick={() => set("has_case_studies", false)}
                data-testid="edit-has-case-studies-no"
                className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.has_case_studies === false ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                No
              </button>
            </div>
          </div>
          {editForm.has_case_studies === true && (
            <>
              <div>
                <ELabel optional>Case Study 1</ELabel>
                <ETextarea rows={4} value={editForm.case_study_1} onChange={e => set("case_study_1", e.target.value)} placeholder="Client situation → Problem → Result" data-testid="edit-case-study-1" />
              </div>
              <div>
                <ELabel optional>Case Study 2</ELabel>
                <ETextarea rows={4} value={editForm.case_study_2} onChange={e => set("case_study_2", e.target.value)} placeholder="Client situation → Problem → Result" data-testid="edit-case-study-2" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 5. Competitors & Boundaries */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Competitors & Boundaries</div>
        <div className="space-y-4">
          <div>
            <ELabel optional>Disliked Content</ELabel>
            <ETextarea rows={3} value={editForm.disliked_content} onChange={e => set("disliked_content", e.target.value)} placeholder="What formats/tones/topics do you NOT want?" data-testid="edit-disliked-content" />
          </div>
          <div>
            <ELabel optional>Niche — Working Topics</ELabel>
            <ETextarea rows={3} value={editForm.niche_working_topics} onChange={e => set("niche_working_topics", e.target.value)} placeholder="Topics in your niche that are working right now" data-testid="edit-niche-working-topics" />
          </div>
          <div>
            <ELabel optional>Niche — Over-saturated Topics</ELabel>
            <ETextarea rows={3} value={editForm.niche_oversaturated_topics} onChange={e => set("niche_oversaturated_topics", e.target.value)} placeholder="Topics that are OVER-SATURATED" data-testid="edit-niche-oversaturated-topics" />
          </div>
          <div>
            <ELabel optional>Niche — Under-served Topics</ELabel>
            <ETextarea rows={3} value={editForm.niche_underserved_topics} onChange={e => set("niche_underserved_topics", e.target.value)} placeholder="Topics that are UNDER-SERVED" data-testid="edit-niche-underserved-topics" />
          </div>
          <EMultiInput label="Competitor Accounts" values={editForm.competitor_accounts} onChange={v => set("competitor_accounts", v)}
            placeholder="@competitor_handle or URL" optional />
        </div>
      </div>

      {/* 6. Not to Do List */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Voice & Training</div>
        <div className="space-y-4">
          <EMultiInput label={`"Not to Do" List`} values={editForm.not_to_do_list} onChange={v => set("not_to_do_list", v)}
            placeholder="e.g. Never discuss pricing publicly, avoid political topics..." optional />
        </div>
      </div>

      {/* 7. Templates & Platforms */}
      <div className="bg-zinc-900 border border-zinc-800 p-5">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Templates & Platforms</div>
        <div className="space-y-5">
          <div>
            <ELabel>Preferred Carousel Template</ELabel>
            <div className="flex gap-2">
              {EDIT_CAROUSEL_TEMPLATES.map(t => (
                <button key={t.value} type="button" onClick={() => set("preferred_carousel_template", t.value)}
                  data-testid={`edit-carousel-${t.value}`}
                  className={`flex-1 py-2 px-3 border text-xs font-mono transition-all duration-150 ${editForm.preferred_carousel_template === t.value ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <ELabel>Active Platforms *</ELabel>
            <div className="grid grid-cols-3 gap-2">
              {EDIT_ALL_PLATFORMS.map(p => (
                <button key={p} type="button"
                  onClick={() => {
                    const next = editForm.platforms.includes(p)
                      ? editForm.platforms.filter(x => x !== p)
                      : [...editForm.platforms, p];
                    set("platforms", next);
                  }}
                  data-testid={`edit-platform-${p}`}
                  className={`relative py-2.5 px-3 border text-xs font-mono uppercase text-left transition-all duration-150 ${editForm.platforms.includes(p) ? "border-white bg-white/5 text-white" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}>
                  {editForm.platforms.includes(p) && (
                    <span className="absolute top-1 right-1"><Check size={8} /></span>
                  )}
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save / Complete */}
      <div className="flex items-center justify-between pb-8">
        <button onClick={onComplete} disabled={completing || saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors duration-150">
          <CheckCircle size={14} />
          {completing ? "Scheduling…" : "Complete Onboarding"}
        </button>
        <button onClick={onSave} disabled={saving} data-testid="save-edit-btn"
          className="flex items-center gap-2 px-6 py-2.5 bg-white text-black text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-150">
          <Save size={14} />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Profile Photo Editor ─────────────────────────────────────────────────────

function ProfilePhotoEditor({ client, setClient, clientId }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await axios.post(`${API}/clients/${clientId}/upload-photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setClient(prev => ({ ...prev, profile_photo_url: resp.data.profile_photo_url }));
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async () => {
    try {
      const resp = await axios.put(`${API}/clients/${clientId}`, { profile_photo_url: "" });
      setClient(resp.data);
      toast.success("Photo removed");
    } catch { toast.error("Failed to remove photo"); }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFile}
        className="hidden"
        data-testid="profile-photo-file-input"
      />
      <button
        data-testid="upload-photo-btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full py-1.5 text-xs bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : client.profile_photo_url ? "Change Photo" : "Upload Photo"}
      </button>
      {client.profile_photo_url && (
        <button
          data-testid="remove-photo-btn"
          onClick={removePhoto}
          className="w-full py-1.5 text-xs border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900 transition-colors duration-150"
        >
          Remove Photo
        </button>
      )}
      <p className="text-[9px] font-mono text-zinc-600">JPEG · PNG · WebP · max 5MB</p>
    </div>
  );
}

// ─── Platforms Tab ────────────────────────────────────────────────────────────

const ALL_BUNDLE_PLATFORMS = [
  "instagram", "facebook", "twitter", "linkedin",
  "tiktok", "youtube", "threads", "pinterest",
];

const PLATFORM_LABEL = {
  instagram: "Instagram", facebook: "Facebook", twitter: "Twitter/X",
  linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube",
  threads: "Threads", pinterest: "Pinterest",
};

function PlatformsTab({ client, setClient, clientId }) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbDisconnecting, setFbDisconnecting] = useState(false);
  const [fbPages, setFbPages] = useState([]);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [selectingPage, setSelectingPage] = useState(false);
  const [bundleSetupLoading, setBundleSetupLoading] = useState(false);
  const [bundleConnectLoading, setBundleConnectLoading] = useState(false);
  const [bundleRefreshLoading, setBundleRefreshLoading] = useState(false);

  const bundleTeamId = client.bundle_team_id;
  const bundlePlatforms = client.bundle_platforms || [];

  const bundleSetup = async () => {
    setBundleSetupLoading(true);
    try {
      const resp = await axios.post(`${API}/bundle/setup/${clientId}`);
      const { portal_url } = resp.data;
      await axios.get(`${API}/clients/${clientId}`).then(r => setClient(r.data));
      window.open(portal_url, "_blank", "width=700,height=700,scrollbars=yes");
      toast.success("Bundle team created! Connect your social accounts in the portal.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to set up Bundle team");
    } finally {
      setBundleSetupLoading(false);
    }
  };

  const bundleConnect = async () => {
    setBundleConnectLoading(true);
    try {
      const platforms = ALL_BUNDLE_PLATFORMS.join(",");
      const resp = await axios.get(`${API}/bundle/connect/${clientId}`, { params: { platforms } });
      window.open(resp.data.portal_url, "_blank", "width=700,height=700,scrollbars=yes");
      toast.success("Portal opened — connect accounts, then click Refresh.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to open Bundle portal");
    } finally {
      setBundleConnectLoading(false);
    }
  };

  const bundleRefresh = async () => {
    setBundleRefreshLoading(true);
    try {
      const resp = await axios.post(`${API}/bundle/refresh/${clientId}`);
      setClient(resp.data);
      toast.success("Platform connections refreshed");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to refresh");
    } finally {
      setBundleRefreshLoading(false);
    }
  };

  const igConnected = client.instagram_connected;
  const igUsername  = client.instagram_username;
  const igExpiresAt = client.instagram_token_expires_at;

  const fbConnected  = client.facebook_connected;
  const fbPageName   = client.facebook_page_name;
  const fbExpiresAt  = client.facebook_token_expires_at;

  const connectInstagram = async (appIndex = 1) => {
    setConnecting(true);
    try {
      const resp = await axios.get(`${API}/instagram/connect/${clientId}?app=${appIndex}`);
      const { auth_url } = resp.data;

      const popup = window.open(
        auth_url,
        "instagram_connect",
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );

      // Listen for message from popup
      const handler = (e) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "INSTAGRAM_AUTH") return;
        window.removeEventListener("message", handler);
        setConnecting(false);

        if (e.data.success) {
          toast.success(`Instagram @${e.data.username} connected!`);
          // Refresh client data
          axios.get(`${API}/clients/${clientId}`).then(r => setClient(r.data));
        } else {
          toast.error(`Instagram connection failed: ${e.data.error || "Unknown error"}`);
        }
        if (popup && !popup.closed) popup.close();
      };
      window.addEventListener("message", handler);

      // Fallback: poll for popup close
      const poll = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", handler);
          setConnecting(false);
        }
      }, 600);
    } catch (err) {
      toast.error("Failed to start Instagram connection");
      setConnecting(false);
    }
  };

  const disconnectInstagram = async () => {
    if (!window.confirm("Disconnect Instagram? Posts to Instagram will stop working.")) return;
    setDisconnecting(true);
    try {
      await axios.delete(`${API}/instagram/disconnect/${clientId}`);
      toast.success("Instagram disconnected");
      const r = await axios.get(`${API}/clients/${clientId}`);
      setClient(r.data);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  // ─── Facebook connect/disconnect ─────────────────────────────────────────
  const connectFacebook = async () => {
    setFbConnecting(true);
    try {
      const resp = await axios.get(`${API}/facebook/connect/${clientId}`);
      const { auth_url } = resp.data;

      const popup = window.open(
        auth_url,
        "facebook_connect",
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );

      const handler = (e) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "FACEBOOK_AUTH") return;
        window.removeEventListener("message", handler);
        setFbConnecting(false);

        if (e.data.success) {
          if (e.data.selectPage) {
            toast.success(`Facebook authenticated! ${e.data.pageCount} pages found — select one below.`);
            loadFbPages();
            setShowPageSelector(true);
          } else {
            toast.success(`Facebook Page "${e.data.pageName || ""}" connected!`);
          }
          axios.get(`${API}/clients/${clientId}`).then(r => setClient(r.data));
        } else {
          toast.error(`Facebook connection failed: ${e.data.error || "Unknown error"}`);
        }
        if (popup && !popup.closed) popup.close();
      };
      window.addEventListener("message", handler);

      const poll = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", handler);
          setFbConnecting(false);
        }
      }, 600);
    } catch (err) {
      toast.error("Failed to start Facebook connection");
      setFbConnecting(false);
    }
  };

  const loadFbPages = async () => {
    try {
      const resp = await axios.get(`${API}/facebook/pages/${clientId}`);
      setFbPages(resp.data);
    } catch { /* ignore */ }
  };

  const selectFbPage = async (pageId) => {
    setSelectingPage(true);
    try {
      await axios.post(`${API}/facebook/select-page/${clientId}`, { page_id: pageId });
      toast.success("Facebook Page selected!");
      setShowPageSelector(false);
      const r = await axios.get(`${API}/clients/${clientId}`);
      setClient(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to select page");
    } finally {
      setSelectingPage(false);
    }
  };

  const disconnectFacebook = async () => {
    if (!window.confirm("Disconnect Facebook? Posts to Facebook will stop working.")) return;
    setFbDisconnecting(true);
    try {
      await axios.delete(`${API}/facebook/disconnect/${clientId}`);
      toast.success("Facebook disconnected");
      setFbPages([]);
      setShowPageSelector(false);
      const r = await axios.get(`${API}/clients/${clientId}`);
      setClient(r.data);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setFbDisconnecting(false);
    }
  };

  const togglePlatformEnabled = async (platform, enabled) => {
    try {
      const configs = { ...(client.platform_configs || {}) };
      if (!configs[platform]) configs[platform] = { posts_per_day: 2, posting_times: ["09:00", "17:00"] };
      configs[platform].enabled = enabled;
      const resp = await axios.put(`${API}/clients/${clientId}`, { platform_configs: configs });
      setClient(resp.data);
      toast.success(`${platform} ${enabled ? "enabled" : "disabled"}`);
    } catch { toast.error("Failed to update platform"); }
  };

  return (
    <div className="space-y-6">
      {/* Social Accounts Connect Card */}
      <div className="border border-emerald-900/50 bg-zinc-900 p-5">
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center flex-shrink-0">
              <Link size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Social Accounts</div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Connect and manage publishing platforms</div>
            </div>
          </div>
          {bundleTeamId && (
            <button
              onClick={bundleRefresh}
              disabled={bundleRefreshLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={bundleRefreshLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          )}
        </div>

        {bundleTeamId ? (
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-zinc-500">Team ID: <span className="text-zinc-400">{bundleTeamId}</span></div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Connected Platforms</div>
              <div className="flex flex-wrap gap-2">
                {ALL_BUNDLE_PLATFORMS.map(p => {
                  const isConnected = bundlePlatforms.includes(p);
                  return (
                    <span
                      key={p}
                      className={`text-[10px] font-mono px-2 py-1 border ${
                        isConnected
                          ? "border-emerald-700 text-emerald-400 bg-emerald-950/30"
                          : "border-zinc-800 text-zinc-600 bg-zinc-950"
                      }`}
                    >
                      {PLATFORM_LABEL[p]} {isConnected ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              onClick={bundleConnect}
              disabled={bundleConnectLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-700 to-teal-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Link size={13} />
              {bundleConnectLoading ? "Opening..." : "+ Connect More Accounts"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-mono text-zinc-500">
              No social accounts connected yet. Click below to set up publishing for this client.
            </div>
            <button
              onClick={bundleSetup}
              disabled={bundleSetupLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-700 to-teal-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Link size={13} />
              {bundleSetupLoading ? "Setting up..." : "Setup Publishing"}
            </button>
          </div>
        )}
      </div>


      {/* All platforms grid — hidden */}
    </div>
  );
}

// ─── Leads Tab ───────────────────────────────────────────────────────────────

const LEAD_STATUSES = ["new", "replied", "dm_sent", "converted", "ignored"];
const LEAD_STATUS_COLORS = {
  new: "border-blue-700 text-blue-400",
  replied: "border-amber-700 text-amber-400",
  dm_sent: "border-emerald-700 text-emerald-400",
  converted: "border-purple-700 text-purple-400",
  ignored: "border-zinc-700 text-zinc-500",
};

function LeadsTab({ clientId, client, posts }) {
  const [config, setConfig] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, new: 0, replied: 0, dm_sent: 0, converted: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [dmModal, setDmModal] = useState(null); // lead object or null
  const [dmText, setDmText] = useState("");
  const [dmFileUrl, setDmFileUrl] = useState("");
  const [sendingDm, setSendingDm] = useState(false);
  const [replyModal, setReplyModal] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Config form state
  const [cfgKeywords, setCfgKeywords] = useState([""]);
  const [cfgAutoReply, setCfgAutoReply] = useState("");
  const [cfgAutoDm, setCfgAutoDm] = useState("");
  const [cfgDmFileUrl, setCfgDmFileUrl] = useState("");
  const [cfgMonitoredPosts, setCfgMonitoredPosts] = useState([]);
  const [cfgEnabled, setCfgEnabled] = useState(true);
  const cfgFileRef = useRef(null);
  const [cfgUploading, setCfgUploading] = useState(false);

  const publishedPosts = (posts || []).filter(p => p.status === "published" && p.platform === "instagram");

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterKeyword) params.set("keyword", filterKeyword);
      const [leadsResp, statsResp] = await Promise.all([
        axios.get(`${API}/clients/${clientId}/leads?${params}`),
        axios.get(`${API}/clients/${clientId}/leads/stats`),
      ]);
      setLeads(leadsResp.data);
      setStats(statsResp.data);
    } catch { toast.error("Failed to load leads"); }
  };

  const fetchConfig = async () => {
    try {
      const resp = await axios.get(`${API}/clients/${clientId}/keyword-config`);
      setConfig(resp.data);
      if (resp.data && resp.data.keywords?.length) {
        setCfgKeywords(resp.data.keywords.length ? resp.data.keywords : [""]);
        setCfgAutoReply(resp.data.auto_comment_reply || "");
        setCfgAutoDm(resp.data.auto_dm_message || "");
        setCfgDmFileUrl(resp.data.auto_dm_file_url || "");
        setCfgMonitoredPosts(resp.data.monitored_post_ids || []);
        setCfgEnabled(resp.data.enabled !== false);
      }
    } catch { /* no config yet */ }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchLeads()]);
      setLoading(false);
    };
    load();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchLeads(); }, [filterStatus, filterKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const resp = await axios.put(`${API}/clients/${clientId}/keyword-config`, {
        keywords: cfgKeywords.filter(Boolean),
        auto_comment_reply: cfgAutoReply,
        auto_dm_message: cfgAutoDm,
        auto_dm_file_url: cfgDmFileUrl,
        monitored_post_ids: cfgMonitoredPosts,
        enabled: cfgEnabled,
      });
      setConfig(resp.data);
      toast.success("Keyword config saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save config");
    } finally { setSavingConfig(false); }
  };

  const deleteConfig = async () => {
    try {
      await axios.delete(`${API}/clients/${clientId}/keyword-config`);
      setConfig(null);
      setCfgKeywords([""]);
      setCfgAutoReply("");
      setCfgAutoDm("");
      setCfgDmFileUrl("");
      setCfgMonitoredPosts([]);
      setCfgEnabled(true);
      toast.success("Keyword config deleted");
    } catch { toast.error("Failed to delete config"); }
  };

  const handleCfgFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25MB");
    setCfgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await axios.post(`${API}/clients/${clientId}/keyword-config/upload-file`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCfgDmFileUrl(resp.data.file_url);
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setCfgUploading(false);
      e.target.value = "";
    }
  };

  const updateLeadStatus = async (leadId, status) => {
    try {
      await axios.put(`${API}/leads/${leadId}`, { status });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
      fetchLeads();
      toast.success(`Lead marked as ${status}`);
    } catch { toast.error("Failed to update lead"); }
  };

  const deleteLead = async (leadId) => {
    try {
      await axios.delete(`${API}/leads/${leadId}`);
      setLeads(prev => prev.filter(l => l.id !== leadId));
      fetchLeads();
      toast.success("Lead deleted");
    } catch { toast.error("Failed to delete lead"); }
  };

  const sendDm = async () => {
    if (!dmText && !dmFileUrl) return toast.error("Enter a message or select a file");
    setSendingDm(true);
    try {
      const resp = await axios.post(`${API}/leads/${dmModal.id}/send-dm`, { message: dmText, file_url: dmFileUrl });
      if (resp.data.success) {
        toast.success("DM sent successfully");
        fetchLeads();
      } else {
        toast.error(resp.data.error || "DM failed — user may not have messaged you first");
      }
      setDmModal(null);
      setDmText("");
      setDmFileUrl("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send DM");
    } finally { setSendingDm(false); }
  };

  const handleDmFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25MB");
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await axios.post(`${API}/clients/${clientId}/keyword-config/upload-file`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDmFileUrl(resp.data.file_url);
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const sendReply = async () => {
    if (!replyText.trim()) return toast.error("Enter a reply message");
    setSendingReply(true);
    try {
      await axios.post(`${API}/leads/${replyModal.id}/reply-comment`, { message: replyText });
      toast.success("Reply posted");
      fetchLeads();
      setReplyModal(null);
      setReplyText("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to reply");
    } finally { setSendingReply(false); }
  };

  const toggleMonitoredPost = (postId) => {
    setCfgMonitoredPosts(prev =>
      prev.includes(postId) ? prev.filter(p => p !== postId) : [...prev, postId]
    );
  };

  if (loading) return <div className="text-zinc-500 text-sm font-mono p-8">Loading leads...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-white" },
          { label: "New", value: stats.new, color: "text-blue-400" },
          { label: "Replied", value: stats.replied, color: "text-amber-400" },
          { label: "DM Sent", value: stats.dm_sent, color: "text-emerald-400" },
          { label: "Converted", value: stats.converted, color: "text-purple-400" },
          { label: "Ignored", value: stats.ignored, color: "text-zinc-500" },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className={`text-xl font-mono font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Config Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors duration-150"
        >
          <Filter size={14} />
          {showConfig ? "HIDE KEYWORD CONFIG" : "KEYWORD CONFIG"}
          {config?.enabled && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
        </button>
        <div className="flex items-center gap-2">
          {filterStatus && (
            <button onClick={() => setFilterStatus("")} className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-800 px-2 py-1">
              Clear filter <X size={10} className="inline ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* Keyword Configuration Panel */}
      {showConfig && (
        <div className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Keyword Monitoring Config</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] font-mono text-zinc-500">{cfgEnabled ? "ENABLED" : "DISABLED"}</span>
              <button
                onClick={() => setCfgEnabled(!cfgEnabled)}
                className={`w-8 h-4 rounded-full transition-colors duration-150 ${cfgEnabled ? "bg-emerald-500" : "bg-zinc-700"}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-150 ${cfgEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </label>
          </div>

          <EMultiInput
            label="Keywords to Monitor"
            values={cfgKeywords}
            onChange={setCfgKeywords}
            placeholder="e.g. INFO, PRICE, DM ME"
          />

          <div>
            <ELabel>Auto Comment Reply</ELabel>
            <ETextarea
              value={cfgAutoReply}
              onChange={e => setCfgAutoReply(e.target.value)}
              placeholder="Thanks! Check your DMs 🔥"
              rows={2}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Automatically posted as a reply to the matching comment</p>
          </div>

          <div>
            <ELabel>Auto DM Message</ELabel>
            <ETextarea
              value={cfgAutoDm}
              onChange={e => setCfgAutoDm(e.target.value)}
              placeholder="Hey! Here's the info you requested..."
              rows={2}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Sent via DM (only works if user has messaged you first)</p>
          </div>

          <div>
            <ELabel optional>DM File Attachment</ELabel>
            <div className="flex items-center gap-2">
              <input
                ref={cfgFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4"
                onChange={handleCfgFileUpload}
                className="hidden"
              />
              <button
                onClick={() => cfgFileRef.current?.click()}
                disabled={cfgUploading}
                className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-700 px-3 py-2 transition-colors duration-150 disabled:opacity-50"
              >
                <Upload size={13} />
                {cfgUploading ? "Uploading..." : "Upload File"}
              </button>
              {cfgDmFileUrl && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs text-emerald-400 truncate flex-1">{cfgDmFileUrl.split("/").pop()}</span>
                  <button onClick={() => setCfgDmFileUrl("")} className="text-zinc-600 hover:text-red-400"><X size={12} /></button>
                </div>
              )}
            </div>
          </div>

          {/* Post Selector */}
          <div>
            <ELabel optional>Monitor Specific Posts</ELabel>
            <p className="text-[10px] text-zinc-600 mb-2">Leave empty to monitor all published Instagram posts</p>
            {publishedPosts.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-800 p-2">
                {publishedPosts.map(post => (
                  <label key={post.id} className="flex items-start gap-2 py-1 cursor-pointer hover:bg-zinc-800 px-2 -mx-2 transition-colors duration-150">
                    <input
                      type="checkbox"
                      checked={cfgMonitoredPosts.includes(post.id)}
                      onChange={() => toggleMonitoredPost(post.id)}
                      className="mt-0.5 accent-emerald-500"
                    />
                    <span className="text-xs text-zinc-300 truncate">{(post.text || "").slice(0, 80) || "Untitled post"}</span>
                    <span className="text-[10px] text-zinc-600 ml-auto whitespace-nowrap">
                      {post.published_at ? new Date(post.published_at).toLocaleDateString() : ""}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No published Instagram posts yet</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
            >
              <Save size={13} />
              {savingConfig ? "Saving..." : "Save Config"}
            </button>
            {config?.keywords?.length > 0 && (
              <button
                onClick={deleteConfig}
                className="flex items-center gap-1.5 text-xs font-mono text-red-400 hover:text-red-300 border border-red-900 px-3 py-2 transition-colors duration-150"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-400 px-3 py-2 focus:outline-none focus:border-zinc-500"
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
        </select>
        <input
          value={filterKeyword}
          onChange={e => setFilterKeyword(e.target.value)}
          placeholder="Filter by keyword..."
          className="bg-zinc-950 border border-zinc-700 text-xs text-white px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-48"
        />
      </div>

      {/* Leads Table */}
      {leads.length === 0 ? (
        <div className="text-center py-12">
          <Users size={32} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">No leads captured yet</p>
          <p className="text-xs text-zinc-600 mt-1">Configure keywords above and leads will appear here when comments match</p>
        </div>
      ) : (
        <div className="border border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase tracking-wider">
                <th className="text-left px-3 py-2.5">User</th>
                <th className="text-left px-3 py-2.5">Comment</th>
                <th className="text-left px-3 py-2.5">Keyword</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">DM</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-right px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors duration-150">
                  <td className="px-3 py-2.5">
                    <span className="text-white font-medium">@{lead.username}</span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="text-zinc-400 truncate block">{lead.comment_text}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 text-[10px] font-mono uppercase">{lead.keyword_matched}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`border px-2 py-0.5 text-[10px] font-mono uppercase ${LEAD_STATUS_COLORS[lead.status] || "border-zinc-700 text-zinc-500"}`}>
                      {(lead.status || "new").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-mono ${lead.dm_status === "sent" ? "text-emerald-400" : lead.dm_status === "failed" ? "text-red-400" : "text-zinc-600"}`}>
                      {lead.dm_status || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setDmModal(lead); setDmText(""); setDmFileUrl(""); }}
                        title="Send DM"
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
                      >
                        <Send size={13} />
                      </button>
                      <button
                        onClick={() => { setReplyModal(lead); setReplyText(""); }}
                        title="Reply to comment"
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors duration-150"
                      >
                        <MessageCircle size={13} />
                      </button>
                      {lead.status !== "converted" && (
                        <button
                          onClick={() => updateLeadStatus(lead.id, "converted")}
                          title="Mark as converted"
                          className="p-1.5 text-zinc-500 hover:text-purple-400 transition-colors duration-150"
                        >
                          <Check size={13} />
                        </button>
                      )}
                      {lead.status !== "ignored" && (
                        <button
                          onClick={() => updateLeadStatus(lead.id, "ignored")}
                          title="Ignore"
                          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteLead(lead.id)}
                        title="Delete lead"
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors duration-150"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Send DM Modal */}
      {dmModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDmModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono text-white">Send DM to @{dmModal.username}</h3>
              <button onClick={() => setDmModal(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <p className="text-[10px] text-zinc-500">Note: DMs only work if the user has messaged your account first (Instagram policy)</p>
            <div>
              <ELabel>Message</ELabel>
              <ETextarea value={dmText} onChange={e => setDmText(e.target.value)} placeholder="Type your message..." rows={3} />
            </div>
            <div>
              <ELabel optional>Attach File</ELabel>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4" onChange={handleDmFileUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-700 px-3 py-2 transition-colors duration-150 disabled:opacity-50"
                >
                  <Upload size={13} />
                  {uploadingFile ? "Uploading..." : "Upload"}
                </button>
                {dmFileUrl && <span className="text-xs text-emerald-400 truncate flex-1">{dmFileUrl.split("/").pop()}</span>}
              </div>
            </div>
            <button
              onClick={sendDm}
              disabled={sendingDm || (!dmText && !dmFileUrl)}
              className="w-full bg-white text-black py-2 text-xs font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send size={13} />
              {sendingDm ? "Sending..." : "Send DM"}
            </button>
          </div>
        </div>
      )}

      {/* Reply to Comment Modal */}
      {replyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setReplyModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono text-white">Reply to @{replyModal.username}'s comment</h3>
              <button onClick={() => setReplyModal(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-3">
              <p className="text-xs text-zinc-400 italic">"{replyModal.comment_text}"</p>
            </div>
            <div>
              <ELabel>Your Reply</ELabel>
              <ETextarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply..." rows={2} />
            </div>
            <button
              onClick={sendReply}
              disabled={sendingReply || !replyText.trim()}
              className="w-full bg-white text-black py-2 text-xs font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <MessageCircle size={13} />
              {sendingReply ? "Posting..." : "Post Reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ClientDetail ────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState(null);
  const [posts, setPosts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [postKindFilter, setPostKindFilter] = useState("all"); // all | video | carousel | text
  const [retryingPostId, setRetryingPostId] = useState(null);
  const [viewingVideoPost, setViewingVideoPost] = useState(null);
  const [editForm, setEditForm] = useState(null);
  // tone and topics_exclude removed — they are canonical at onboarding_data.brand_vibe /
  // onboarding_data.not_to_do_list. Editable only in Profile tab; this tab shows read-only mirrors.
  const [strategyForm, setStrategyForm] = useState({ themes: "", hashtags: "", topics_include: [], video_hooks: [], video_prompt: "" });
  const [topicIncludeInput, setTopicIncludeInput] = useState("");
  const [neverCoverInput, setNeverCoverInput] = useState("");
  const [hookGenOpen, setHookGenOpen] = useState(false);
  const [hookGenKeyword, setHookGenKeyword] = useState("");
  const [hookGenLoading, setHookGenLoading] = useState(false);
  const [competitorInsight, setCompetitorInsight] = useState(null);
  const [togglingWinner, setTogglingWinner] = useState(null);
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [clientEmails, setClientEmails] = useState([]);

  const refreshAnalytics = async () => {
    if (refreshingAnalytics) return;
    setRefreshingAnalytics(true);
    try {
      await axios.post(`${API}/analytics/clients/${id}/refresh`);
      const { data } = await axios.get(`${API}/analytics/clients/${id}`);
      setAnalytics(data);
      toast.success("Analytics refreshed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to refresh analytics");
    } finally {
      setRefreshingAnalytics(false);
    }
  };

  const fetchClient = async () => {
    try {
      const [clientResp, postsResp, analyticsResp] = await Promise.all([
        axios.get(`${API}/clients/${id}`),
        axios.get(`${API}/posts?client_id=${id}&limit=50`),
        axios.get(`${API}/analytics/clients/${id}`)
      ]);
      setClient(clientResp.data);
      setPosts(postsResp.data);
      setAnalytics(analyticsResp.data);
      setEditForm(initEditForm(clientResp.data));
      const s = clientResp.data.strategy || {};
      setStrategyForm({
        themes: (s.themes || []).join(", "),
        hashtags: (s.hashtags || []).join(", "),
        topics_include: (s.topics_include || []).map(e =>
          typeof e === "string" ? { text: e, type: "topic" } : e
        ),
        video_hooks: s.video_hooks || [],
        video_prompt: s.video_prompt || ""
      });
    } catch { toast.error("Failed to load client"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchClient();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== "Overview") return;
    Promise.all([
      axios.get(`${API}/clients/${id}/competitor-posts`, { params: { limit: 1 } }),
      axios.get(`${API}/clients/${id}/competitors`)
    ]).then(([{ data: compPosts }, { data: comps }]) => {
      if (compPosts[0]) {
        const comp = comps.find(c => c.id === compPosts[0].competitor_id);
        setCompetitorInsight({ ...compPosts[0], handle: comp?.handle });
      }
    }).catch(() => {});
  }, [activeTab, id]);

  // Auto-refresh posts while any video is mid-render or publishing
  useEffect(() => {
    if (activeTab !== "Posts") return;
    const inFlight = posts.some(p => p.status === "rendering" || p.status === "publishing");
    if (!inFlight) return;
    const iv = setInterval(() => {
      axios.get(`${API}/posts?client_id=${id}&limit=50`)
        .then(r => setPosts(r.data))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [activeTab, posts, id]);

  useEffect(() => {
    if (activeTab === 'Emails' && id) {
      axios.get(`${API}/clients/${id}/emails`).then(r => setClientEmails(r.data)).catch(() => {});
    }
  }, [activeTab, id]);

  const saveEditProfile = async () => {
    if (!editForm) return;
    if (!editForm.name.trim()) return toast.error("Client name is required");
    if (editForm.platforms.length === 0) return toast.error("Select at least one platform");
    setSavingEdit(true);
    try {
      const payload = {
        ...editForm,
        pr_links: editForm.pr_links.filter(Boolean),
        competitor_accounts: editForm.competitor_accounts.filter(Boolean),
        not_to_do_list: editForm.not_to_do_list.filter(Boolean),
      };
      const resp = await axios.put(`${API}/clients/${id}`, payload);
      setClient(resp.data);
      setEditForm(initEditForm(resp.data));
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save profile");
    } finally {
      setSavingEdit(false);
    }
  };

  const completeOnboarding = async () => {
    if (!client) return;
    const to = client.onboarding_data?.email || '';
    if (!to) return toast.error("No email address on file for this client");
    setCompletingOnboarding(true);
    try {
      const html = await render(
        <ContentStrategyOnboardingEmail
          clientName={client.name}
          privacyPolicyUrl="https://sleepingcreators.com/privacy"
          baseUrl={window.location.origin}
        />
      );
      await axios.post(`${API}/clients/${id}/complete-onboarding`, {
        to,
        subject: `We Got Your Form, Here's What Happens Next | Sleeping Creators`,
        html,
      });
      toast.success("Onboarding complete! Welcome email scheduled for 2 hours from now.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to schedule onboarding email");
    } finally {
      setCompletingOnboarding(false);
    }
  };

  const generateHook = async () => {
    setHookGenLoading(true);
    try {
      const r = await axios.post(`${API}/clients/${id}/generate-video-hook`, {
        keyword: hookGenKeyword.trim() || "",
      });
      const newHook = {
        id: (crypto?.randomUUID?.() || `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        title: r.data.title || "",
        prompt: r.data.prompt || "",
      };
      setStrategyForm(f => ({ ...f, video_hooks: [newHook, ...f.video_hooks] }));
      setHookGenKeyword("");
      setHookGenOpen(false);
      toast.success("Hook generated — review & Save Strategy to persist");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generation failed");
    } finally {
      setHookGenLoading(false);
    }
  };

  const saveStrategy = async () => {
    setSaving(true);
    try {
      // tone and topics_exclude intentionally omitted — canonical at
      // onboarding_data.brand_vibe / onboarding_data.not_to_do_list, derived to
      // strategy.tone / strategy.topics_exclude server-side by _recompute_derived.
      const strategy = {
        themes: strategyForm.themes.split(",").map(t => t.trim()).filter(Boolean),
        hashtags: strategyForm.hashtags.split(",").map(h => h.trim().replace(/^#/, "").replace(/^/, "#")).filter(h => h !== "#"),
        topics_include: strategyForm.topics_include,
        video_hooks: strategyForm.video_hooks.filter(h => h.title.trim() || h.prompt.trim()),
        video_prompt: (strategyForm.video_prompt || "").trim()
      };
      const resp = await axios.put(`${API}/clients/${id}`, { strategy });
      setClient(resp.data);
      toast.success("Strategy saved");
    } catch { toast.error("Failed to save strategy"); }
    finally { setSaving(false); }
  };

  const toggleClientStatus = async () => {
    try {
      if (client.status === "active") {
        await axios.post(`${API}/clients/${id}/pause`);
        setClient(c => ({ ...c, status: "paused" }));
        toast.warning("Client paused");
      } else {
        await axios.post(`${API}/clients/${id}/resume`);
        setClient(c => ({ ...c, status: "active" }));
        toast.success("Client resumed");
      }
    } catch { toast.error("Failed to update status"); }
  };

  const handleClientUpdate = async (updates) => {
    try {
      const resp = await axios.put(`${API}/clients/${id}`, updates);
      setClient(resp.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update client");
    }
  };

  const openGenerateModal = async () => {
    try {
      const resp = await axios.get(`${API}/templates`);
      setTemplates(resp.data || []);
    } catch { setTemplates([]); }
    setShowGenModal(true);
  };

  const generateCarousel = async ({ templateId, topic, platform, slideCount, slideFormat }) => {
    setGenerating(true);
    setShowGenModal(false);
    try {
      const resp = await axios.post(`${API}/carousel/generate`, {
        client_id: id,
        platform,
        template: templateId,
        topic,
        slide_count: slideCount,
        slide_format: slideFormat,
      });
      toast.success(`Carousel "${resp.data.title}" generated`);
      // Save the carousel
      const saveResp = await axios.post(`${API}/carousels`, {
        ...resp.data,
        client_id: id,
        client_name: client.name,
        platform,
        template: templateId,
      });
      toast.success("Carousel saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const publishingInFlight = useRef(new Set());
  const publishPost = async (post) => {
    if (publishingInFlight.current.has(post.id)) return;
    publishingInFlight.current.add(post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, _publishing: true } : p));
    try {
      const resp = await axios.post(`${API}/posts/${post.id}/publish`);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...resp.data, _publishing: false } : p));
      toast.success(resp.data.status === "published" ? "Published!" : "Failed to publish");
    } catch {
      toast.error("Failed to publish");
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, _publishing: false } : p));
    } finally {
      publishingInFlight.current.delete(post.id);
    }
  };

  const deletePost = async (postId) => {
    try {
      await axios.delete(`${API}/posts/${postId}`);
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success("Deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const retryRender = async (post) => {
    if (retryingPostId === post.id) return;
    setRetryingPostId(post.id);
    try {
      await axios.post(`${API}/posts/${post.id}/retry-render`);
      setPosts(prev => prev.map(p => p.id === post.id
        ? { ...p, status: "rendering", error_message: null, r2_video_url: null, r2_snapshot_url: null }
        : p));
      toast.success("Re-rendering — refresh in ~30s");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Retry failed");
    } finally {
      setRetryingPostId(null);
    }
  };

  const toggleWinner = async (post) => {
    if (togglingWinner === post.id) return;
    setTogglingWinner(post.id);
    try {
      const resp = await axios.post(`${API}/posts/${post.id}/winner`);
      if (typeof resp.data.is_winner !== "undefined") {
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...resp.data } : p));
      }
    } catch {
      toast.error("Failed to update winner status");
    } finally {
      setTogglingWinner(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING CLIENT...</div>;
  }
  if (!client) {
    return <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-zinc-500 font-mono">Client not found</div>
      <button onClick={() => navigate("/clients")} className="text-xs text-white underline">Back to clients</button>
    </div>;
  }

  return (
    <div className="p-6" data-testid="client-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate("/clients")} className="p-1.5 text-zinc-500 hover:text-white border border-zinc-800 hover:bg-zinc-800 transition-colors duration-150">
          <ArrowLeft size={14} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white">
            {client.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{client.name}</h1>
              <Circle size={7} className={`fill-current ${STATUS_DOT[client.status] || "text-zinc-500"}`} />
              <span className="text-xs font-mono text-zinc-500 capitalize">{client.status}</span>
            </div>
            <div className="text-xs text-zinc-500 font-mono">{client.industry}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="generate-bulk-btn"
            onClick={openGenerateModal}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50"
          >
            <Wand2 size={12} className={generating ? "animate-spin" : ""} />
            {generating ? "Generating..." : "AI Generate"}
          </button>
          <button
            data-testid="toggle-status-btn"
            onClick={toggleClientStatus}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border transition-colors duration-150 ${
              client.status === "active"
                ? "border-amber-800 text-amber-400 hover:bg-amber-950"
                : "border-emerald-800 text-emerald-400 hover:bg-emerald-950"
            }`}
          >
            {client.status === "active" ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}
          </button>
        </div>
      </div>

      {/* Stats — derive "Posts Today" from the loaded posts list so it stays
          accurate even when the stored client.posts_today counter drifts
          (e.g. Bundle webhook published a post but the increment was missed). */}
      {(() => {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const publishedToday = posts.filter(p => {
          if (p.status !== "published") return false;
          const ts = p.published_at || p.publishedAt;
          return ts && new Date(ts) >= todayStart;
        }).length;
        const publishedTotal = posts.filter(p => p.status === "published").length;
        return (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Posts Today", value: Math.max(publishedToday, client.posts_today ?? 0) },
              { label: "Posts Total", value: Math.max(publishedTotal, client.posts_total ?? 0) },
              { label: "Followers", value: (analytics?.totals?.followers ?? 0).toLocaleString() },
              { label: "Impressions", value: (analytics?.totals?.impressions ?? 0).toLocaleString() },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 p-3">
                <div className="text-[10px] font-mono text-zinc-500 uppercase">{s.label}</div>
                <div className="text-2xl font-bold font-mono text-white mt-1">{s.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 mb-6">
        {TABS.map(tab => (
          <button
            key={tab}
            data-testid={`tab-${tab.toLowerCase()}`}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors duration-150 ${
              activeTab === tab ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            {/* Profile Photo */}
            <div className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Profile Photo</div>
              <div className="flex items-center gap-4">
                {(client.profile_photo_url || client.onboarding_data?.profile_photo_link) ? (
                  <img src={client.profile_photo_url || client.onboarding_data?.profile_photo_link} alt={client.name}
                    className="w-14 h-14 rounded-full object-cover border border-zinc-700" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-bold text-white">
                    {client.avatar}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <ProfilePhotoEditor client={client} setClient={setClient} clientId={id} />
                </div>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Client Info</div>
              {client.bio && (
                <div className="py-1.5 border-b border-zinc-800">
                  <div className="text-[10px] font-mono text-zinc-500 mb-1">About</div>
                  <div className="text-xs text-zinc-300 whitespace-pre-wrap">{client.bio}</div>
                </div>
              )}
              {[
                { label: "Industry", value: client.industry || "—" },
                { label: "Brand Voice", value: client.brand_voice || "—" },
                { label: "Target Audience", value: client.target_audience || "—" },
                { label: "Platforms", value: (client.platforms || []).join(", ") || "—" },
              ].map(f => (
                <div key={f.label} className="flex justify-between py-1.5 border-b border-zinc-800 last:border-0">
                  <span className="text-xs font-mono text-zinc-500">{f.label}</span>
                  <span className="text-xs font-mono text-zinc-300 text-right max-w-48 truncate">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <DriveImagesFolderCard client={client} clientId={id} setClient={setClient} />
            <DriveVideosFolderCard client={client} clientId={id} setClient={setClient} />
            <div className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono text-zinc-500 uppercase">Performance</div>
                <button
                  data-testid="refresh-analytics-btn"
                  onClick={refreshAnalytics}
                  disabled={refreshingAnalytics || !analytics?.bundle_connected}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title={analytics?.bundle_connected ? "Refresh analytics from Bundle" : "Connect to Bundle first"}
                >
                  <RefreshCw size={11} className={refreshingAnalytics ? "animate-spin" : ""} />
                  {refreshingAnalytics ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {[
                { label: "Followers", value: (analytics?.totals?.followers ?? 0).toLocaleString() },
                { label: "Impressions", value: (analytics?.totals?.impressions ?? 0).toLocaleString() },
                { label: "Likes", value: (analytics?.totals?.likes ?? 0).toLocaleString() },
                { label: "Comments", value: (analytics?.totals?.comments ?? 0).toLocaleString() },
              ].map(f => (
                <div key={f.label} className="flex justify-between py-1.5 border-b border-zinc-800 last:border-0">
                  <span className="text-xs font-mono text-zinc-500">{f.label}</span>
                  <span className="text-xs font-mono text-white">{f.value}</span>
                </div>
              ))}
              {analytics?.bundle_connected === false && (
                <div className="text-[10px] text-zinc-600 font-mono mt-2">
                  Connect this client to Bundle to see analytics.
                </div>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Story Automation</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-zinc-300">Auto-publish story</div>
                  <div className="text-[10px] font-mono text-zinc-600 mt-0.5">Post a story with every Instagram publish</div>
                </div>
                <button
                  onClick={async () => {
                    const next = !(client.auto_story_enabled ?? true);
                    setClient(c => ({ ...c, auto_story_enabled: next }));
                    try {
                      await axios.put(`${API}/clients/${id}`, { auto_story_enabled: next });
                    } catch {
                      setClient(c => ({ ...c, auto_story_enabled: !next }));
                      toast.error("Failed to update story setting");
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    (client.auto_story_enabled ?? true) ? "bg-emerald-600" : "bg-zinc-700"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    (client.auto_story_enabled ?? true) ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
              </div>
            </div>
            {competitorInsight && (
              <div className="bg-zinc-900 border border-zinc-800 p-4">
                <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3">Top Competitor Post</div>
                <div className="space-y-1">
                  {competitorInsight.handle && (
                    <div className="flex justify-between py-1.5 border-b border-zinc-800">
                      <span className="text-xs font-mono text-zinc-500">Handle</span>
                      <span className="text-xs font-mono text-zinc-300">{competitorInsight.handle}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-b border-zinc-800">
                    <span className="text-xs font-mono text-zinc-500">Score</span>
                    <span className="text-xs font-mono text-amber-400">{competitorInsight.engagement_score?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800">
                    <span className="text-xs font-mono text-zinc-500">Platform</span>
                    <span className="text-xs font-mono text-zinc-400 uppercase">{competitorInsight.platform}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 pt-2 line-clamp-2">
                    {competitorInsight.caption?.slice(0, 140) || "(no caption)"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "Strategy" && (
        <div className="max-w-2xl space-y-3">
          {/* Content Strategy card */}
          <div className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-4">Content Strategy</div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Content Themes</label>
                <input
                  data-testid="strategy-themes-input"
                  value={strategyForm.themes}
                  onChange={e => setStrategyForm(f => ({ ...f, themes: e.target.value }))}
                  placeholder="product updates, industry tips, thought leadership"
                  className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">
                    Tone of Voice <span className="text-zinc-700 normal-case tracking-normal">— mirror</span>
                  </label>
                  <div className="w-full bg-zinc-950/50 border border-dashed border-zinc-800 px-3 py-2 text-sm text-zinc-400" data-testid="strategy-tone-mirror">
                    {(() => {
                      const v = client?.onboarding_data?.brand_vibe;
                      const s = Array.isArray(v) ? v.join(", ") : (v || "");
                      return s || <span className="text-zinc-700 italic">Set in Profile → Brand Vibe</span>;
                    })()}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Brand Hashtags</label>
                  <input
                    data-testid="strategy-hashtags-input"
                    value={strategyForm.hashtags}
                    onChange={e => setStrategyForm(f => ({ ...f, hashtags: e.target.value }))}
                    placeholder="#SaaS, #TechInnovation"
                    className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Topic Rules card */}
          <div className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-4">Topic Rules</div>
            <div className="grid grid-cols-2 gap-4">
              {/* Include */}
              <div className="border border-zinc-800 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-mono text-emerald-500 uppercase">Always Include</span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                  {strategyForm.topics_include.map((entry, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs">
                      {entry.text}
                      <button
                        onClick={() => setStrategyForm(f => ({
                          ...f,
                          topics_include: f.topics_include.map((e, j) =>
                            j === i ? { ...e, type: e.type === "mention" ? "topic" : "mention" } : e
                          )
                        }))}
                        title={entry.type === "mention" ? "MENTION — click to change to TOPIC" : "TOPIC — click to change to MENTION"}
                        className={`font-mono text-[9px] uppercase tracking-widest px-1 border transition-colors cursor-pointer ${
                          entry.type === "mention"
                            ? "border-sky-700 text-sky-400 hover:border-sky-500"
                            : "border-emerald-800 text-emerald-600 hover:border-emerald-600"
                        }`}
                      >
                        {entry.type === "mention" ? "mention" : "topic"}
                      </button>
                      <button
                        onClick={() => setStrategyForm(f => ({ ...f, topics_include: f.topics_include.filter((_, j) => j !== i) }))}
                        className="text-emerald-600 hover:text-emerald-300 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  data-testid="strategy-topics-include-input"
                  value={topicIncludeInput}
                  onChange={e => setTopicIncludeInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && topicIncludeInput.trim()) {
                      e.preventDefault();
                      const val = topicIncludeInput.trim().replace(/,$/, "");
                      if (val && !strategyForm.topics_include.some(e => e.text === val)) {
                        setStrategyForm(f => ({ ...f, topics_include: [...f.topics_include, { text: val, type: "topic" }] }));
                      }
                      setTopicIncludeInput("");
                    }
                  }}
                  placeholder="Type and press Enter"
                  className="w-full bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* Exclude — editable, syncs to onboarding_data.not_to_do_list */}
              <div className="border border-zinc-800 p-3 space-y-2" data-testid="strategy-topics-exclude-mirror">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="text-[10px] font-mono text-rose-500 uppercase">Never Cover</span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                  {(client?.onboarding_data?.not_to_do_list || []).filter(Boolean).map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-950 border border-rose-800 text-rose-400 text-xs">
                      {tag}
                      <button
                        onClick={async () => {
                          const updated = (client.onboarding_data.not_to_do_list || []).filter((_, j) => j !== i);
                          try {
                            const resp = await axios.put(`${API}/clients/${id}`, { onboarding_data: { ...client.onboarding_data, not_to_do_list: updated } });
                            setClient(resp.data);
                          } catch { toast.error("Failed to update"); }
                        }}
                        className="text-rose-600 hover:text-rose-300 transition-colors"
                      ><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <input
                  data-testid="strategy-never-cover-input"
                  value={neverCoverInput}
                  onChange={e => setNeverCoverInput(e.target.value)}
                  onKeyDown={async e => {
                    if ((e.key === "Enter" || e.key === ",") && neverCoverInput.trim()) {
                      e.preventDefault();
                      const val = neverCoverInput.trim().replace(/,$/, "");
                      const current = (client?.onboarding_data?.not_to_do_list || []).filter(Boolean);
                      if (val && !current.includes(val)) {
                        try {
                          const resp = await axios.put(`${API}/clients/${id}`, { onboarding_data: { ...client.onboarding_data, not_to_do_list: [...current, val] } });
                          setClient(resp.data);
                        } catch { toast.error("Failed to update"); }
                      }
                      setNeverCoverInput("");
                    }
                  }}
                  placeholder="Type and press Enter"
                  className="w-full bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-rose-700"
                />
              </div>
            </div>
          </div>

          {/* Video Hooks card */}
          <div className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-baseline justify-between mb-4">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Video Hooks</span>
              <span className="text-[10px] font-mono text-zinc-600">
                {strategyForm.video_hooks.length} saved
              </span>
            </div>

            <div className="space-y-2.5">
              {strategyForm.video_hooks.map((hook, i) => (
                <div key={hook.id} className="group flex items-start gap-2">
                  <div className="flex-1 border border-zinc-800 hover:border-zinc-700 transition-colors duration-200 p-3 space-y-2">
                    <input
                      value={hook.title}
                      onChange={e => setStrategyForm(f => ({
                        ...f,
                        video_hooks: f.video_hooks.map((h, j) => j === i ? { ...h, title: e.target.value } : h)
                      }))}
                      placeholder="Hook title (e.g., 3 ways to grow your business)"
                      maxLength={80}
                      className="w-full bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none border-b border-transparent focus:border-zinc-700 pb-1.5 transition-colors duration-200"
                    />
                    <textarea
                      value={hook.prompt}
                      onChange={e => setStrategyForm(f => ({
                        ...f,
                        video_hooks: f.video_hooks.map((h, j) => j === i ? { ...h, prompt: e.target.value } : h)
                      }))}
                      placeholder="Full AI prompt — the brief the model uses to write caption/text/hashtags"
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none transition-colors duration-200 font-mono leading-relaxed"
                    />
                  </div>
                  <button
                    onClick={() => setStrategyForm(f => ({
                      ...f,
                      video_hooks: f.video_hooks.filter((_, j) => j !== i)
                    }))}
                    aria-label="Remove hook"
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 text-zinc-600 hover:text-rose-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setStrategyForm(f => ({
                  ...f,
                  video_hooks: [
                    ...f.video_hooks,
                    { id: (crypto?.randomUUID?.() || `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), title: "", prompt: "" }
                  ]
                }))}
                className="border border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-zinc-950 transition-colors duration-200 px-3 py-2.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1.5"
              >
                <Plus size={12} /> Add hook
              </button>
              <button
                onClick={() => setHookGenOpen(o => !o)}
                className={`border border-dashed transition-colors duration-200 px-3 py-2.5 text-[11px] font-mono flex items-center justify-center gap-1.5 ${
                  hookGenOpen
                    ? "border-zinc-500 bg-zinc-950 text-zinc-300"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:bg-zinc-950 hover:text-zinc-300"
                }`}
              >
                <Wand2 size={12} /> Generate with AI
              </button>
            </div>

            {hookGenOpen && (
              <div className="mt-2 border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Seed keyword (optional)
                </label>
                <input
                  value={hookGenKeyword}
                  onChange={e => setHookGenKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !hookGenLoading) generateHook(); }}
                  placeholder="growth, productivity, mindset… (leave blank to let AI pick on-strategy)"
                  className="w-full bg-zinc-900 border border-zinc-700 px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors duration-200 font-mono"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-mono text-zinc-600">
                    Uses {client?.name || "client"}'s niche, voice, and topic rules.
                  </p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setHookGenOpen(false); setHookGenKeyword(""); }}
                      disabled={hookGenLoading}
                      className="border border-zinc-700 text-zinc-400 text-[11px] font-mono hover:bg-zinc-800 transition-colors duration-200 px-3 py-1.5 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={generateHook}
                      disabled={hookGenLoading}
                      className="bg-white text-black text-[11px] font-semibold hover:bg-zinc-200 transition-colors duration-200 px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {hookGenLoading ? <RefreshCw size={11} className="animate-spin" /> : <Wand2 size={11} />}
                      {hookGenLoading ? "Generating…" : "Generate"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Video Prompt Override */}
          <div className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Video Prompt Override
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                {strategyForm.video_prompt ? "active" : "using global"}
              </span>
            </div>
            <p className="text-[10px] font-mono text-zinc-600 leading-relaxed mb-2">
              Override the global video-generation prompt just for {client?.name || "this client"}.
              Leave empty to use whatever is set in <span className="text-zinc-400">Settings → Video Generation Prompt</span>.
              Placeholders <code className="text-zinc-400">[TARGET AUDIENCE]</code> and <code className="text-zinc-400">[WHAT THEY TEACH OR SELL OR SOLVE]</code> are auto-filled from this client.
            </p>
            <textarea
              data-testid="client-video-prompt-input"
              value={strategyForm.video_prompt}
              onChange={e => setStrategyForm(f => ({ ...f, video_prompt: e.target.value }))}
              rows={8}
              placeholder="(empty — falls back to global)"
              className="w-full bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-y transition-colors duration-200 font-mono leading-relaxed"
            />
            <div className="text-[10px] font-mono text-zinc-600 mt-1.5">
              {(strategyForm.video_prompt || "").length} chars
            </div>
          </div>

          <button
            data-testid="save-strategy-btn"
            onClick={saveStrategy}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? "Saving..." : "Save Strategy"}
          </button>
        </div>
      )}

      {activeTab === "Platforms" && (
        <div className="space-y-4">
          <PlatformsTab client={client} setClient={setClient} clientId={id} />
        </div>
      )}

      {activeTab === "Posts" && (() => {
        const KINDS = [
          { value: "all",      label: "All",      count: posts.length },
          { value: "video",    label: "Video",    count: posts.filter(p => p.kind === "video").length },
          { value: "carousel", label: "Carousel", count: posts.filter(p => p.kind === "carousel" || (p.kind !== "video" && p.kind !== "text")).length },
          { value: "text",     label: "Text",     count: posts.filter(p => p.kind === "text").length },
        ];
        const filtered = postKindFilter === "all"
          ? posts
          : postKindFilter === "carousel"
            ? posts.filter(p => p.kind === "carousel" || (p.kind !== "video" && p.kind !== "text"))
            : posts.filter(p => p.kind === postKindFilter);

        return (
          <>
            {/* Kind filter row */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {KINDS.map(k => (
                <button
                  key={k.value}
                  onClick={() => setPostKindFilter(k.value)}
                  className={`px-2.5 py-1 text-[11px] font-mono border transition-colors duration-150 flex items-center gap-1.5 ${
                    postKindFilter === k.value
                      ? "border-white text-white bg-zinc-900"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {k.label}
                  <span className={postKindFilter === k.value ? "text-zinc-400" : "text-zinc-600"}>{k.count}</span>
                </button>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-800 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                <div className="col-span-5">Content</div>
                <div className="col-span-2">Platform</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-1 text-right">Act.</div>
              </div>
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">
                  {posts.length === 0 ? (
                    <>No posts yet. <button onClick={openGenerateModal} className="text-white underline ml-1">Generate with AI</button></>
                  ) : (
                    <>No {postKindFilter} posts.</>
                  )}
                </div>
              ) : (
                filtered.map(post => {
                  const isVideo = post.kind === "video";
                  const actions = getPostActions(post);
                  return (
                    <div key={post.id} className="grid grid-cols-12 gap-2 px-4 py-3 data-row" data-testid={`post-row-${post.id}`}>
                      <div className="col-span-5 flex items-center gap-3 min-w-0">
                        {/* Thumbnail — 9:16 mini for video, 1:1 for carousel */}
                        <div className={`flex-shrink-0 bg-zinc-800 overflow-hidden ${isVideo ? "w-8 h-14" : "w-12 h-12"}`}>
                          {isVideo ? (
                            post.r2_snapshot_url ? (
                              <img src={post.r2_snapshot_url} alt="" className="w-full h-full object-cover" />
                            ) : post.r2_video_url ? (
                              <video src={post.r2_video_url} muted preload="metadata" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film size={12} className="text-zinc-700" />
                              </div>
                            )
                          ) : (
                            post.image_url ? (
                              <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image size={12} className="text-zinc-700" />
                              </div>
                            )
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white font-semibold truncate leading-tight">
                            {post.topic || post.title || (isVideo ? "Untitled video" : "Untitled")}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono line-clamp-1 mt-0.5">
                            {post.caption || post.text || "—"}
                          </p>
                          {post.error_message && (
                            <p className="text-[10px] text-red-400 font-mono mt-0.5 truncate">⚠ {post.error_message.slice(0, 90)}</p>
                          )}
                          {post.competitor_hook_text && (
                            <div className="text-[10px] font-mono text-zinc-500 mt-1 truncate" title={post.competitor_hook_text}>
                              Hook from {post.competitor_username ? `@${post.competitor_username}` : "competitor"}: "{post.competitor_hook_text}"
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center text-xs font-mono text-zinc-500 capitalize">{post.platform}</div>
                      <div className="col-span-2 flex items-center">
                        <StatusBadge status={post.status} />
                      </div>
                      <div className="col-span-2 flex items-center text-[10px] font-mono text-zinc-600">
                        {post.created_at ? new Date(post.created_at).toLocaleDateString() : "—"}
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        {/* View — video posts with playable MP4 */}
                        {isVideo && post.r2_video_url && (
                          <button
                            onClick={() => setViewingVideoPost(post)}
                            title="Preview video"
                            className="p-1 text-zinc-600 hover:text-white transition-colors duration-150"
                          >
                            <Eye size={11} />
                          </button>
                        )}
                        {/* Retry — failed renders only */}
                        {actions.retry && (
                          <button
                            onClick={() => retryRender(post)}
                            disabled={retryingPostId === post.id}
                            title="Retry render"
                            className="p-1 text-zinc-600 hover:text-cyan-400 transition-colors duration-150 disabled:opacity-40"
                          >
                            <RefreshCw size={11} className={retryingPostId === post.id ? "animate-spin" : ""} />
                          </button>
                        )}
                        {/* Re-render — succeeded / pending_approval posts */}
                        {actions.rerender && (
                          <button
                            onClick={() => retryRender(post)}
                            disabled={retryingPostId === post.id}
                            title="Re-render video"
                            className="p-1 text-zinc-600 hover:text-violet-400 transition-colors duration-150 disabled:opacity-40"
                          >
                            <RefreshCw size={11} className={retryingPostId === post.id ? "animate-spin" : ""} />
                          </button>
                        )}
                        {/* Publish — carousel-only */}
                        {actions.publish && (
                          <button onClick={() => publishPost(post)} disabled={!!post._publishing} className="p-1 text-zinc-600 hover:text-blue-400 transition-colors duration-150 disabled:opacity-40">
                            <Send size={11} />
                          </button>
                        )}
                        <button
                          onClick={() => toggleWinner(post)}
                          disabled={togglingWinner === post.id}
                          aria-label={post.is_winner ? "Remove from Dropbox" : "Add to Dropbox"}
                          title={post.is_winner ? "Remove from Dropbox" : "Add to Dropbox"}
                          className={`p-1 transition-colors duration-150 disabled:opacity-40 ${post.is_winner ? "text-amber-400" : "text-zinc-600 hover:text-amber-400"}`}
                        >
                          <Star size={11} className={post.is_winner ? "fill-current" : ""} />
                        </button>
                        {post.is_winner && post.winner_source === "auto" && (
                          <span className="text-[8px] font-mono text-zinc-600 uppercase">auto</span>
                        )}
                        <button onClick={() => deletePost(post.id)} className="p-1 text-zinc-600 hover:text-red-400 transition-colors duration-150">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Video preview modal */}
            {viewingVideoPost && (
              <div
                className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
                onClick={() => setViewingVideoPost(null)}
              >
                <div
                  className="bg-zinc-950 border border-zinc-800 w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800 flex-shrink-0">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {viewingVideoPost.topic || "Video"}
                      </div>
                      <StatusBadge status={viewingVideoPost.status} />
                    </div>
                    <button onClick={() => setViewingVideoPost(null)} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
                  </div>
                  <div className="overflow-y-auto">
                    {viewingVideoPost.r2_video_url ? (
                      <video src={viewingVideoPost.r2_video_url} controls autoPlay className="w-full bg-black" />
                    ) : (
                      <div className="aspect-[9/16] flex items-center justify-center text-zinc-600 font-mono text-xs">
                        Video not yet rendered
                      </div>
                    )}
                    {viewingVideoPost.caption && (
                      <div className="px-4 py-3 border-t border-zinc-800">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Caption</div>
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{viewingVideoPost.caption}</p>
                      </div>
                    )}
                    {(viewingVideoPost.hashtags?.length > 0) && (
                      <div className="px-4 py-3 border-t border-zinc-800">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Hashtags</div>
                        <div className="flex flex-wrap gap-1">
                          {viewingVideoPost.hashtags.map((t, i) => (
                            <span key={i} className="text-[10px] font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5">#{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {viewingVideoPost.error_message && (
                      <div className="px-4 py-3 border-t border-red-900/40 bg-red-950/20">
                        <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest mb-1.5">Error</div>
                        <p className="text-xs text-red-300 font-mono">{viewingVideoPost.error_message}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {activeTab === "Pipeline" && client && (
        <PipelineManager
          clientId={client.id}
          clientPlatforms={client.platforms || []}
          client={client}
          onClientUpdate={handleClientUpdate}
        />
      )}

      {activeTab === "Leads" && client && (
        <LeadsTab clientId={id} client={client} posts={posts} />
      )}

      {activeTab === "Competitors" && (
        <CompetitorTab clientId={id} />
      )}

      {activeTab === "Trends" && (
        <TrendsTab clientId={id} client={client} />
      )}

      {activeTab === "Dropbox" && (
        <DropboxTab clientId={id} />
      )}

      {activeTab === "Apps" && (
        <AppsTab clientId={id} client={client} />
      )}


      {activeTab === "Profile" && editForm && (
        <EditProfileTab
          editForm={editForm}
          setEditForm={setEditForm}
          saving={savingEdit}
          onSave={saveEditProfile}
          onComplete={completeOnboarding}
          completing={completingOnboarding}
        />
      )}

      {activeTab === 'Emails' && (
        <div className="p-6" data-testid="emails-tab">
          <p className="text-xs font-sans text-zinc-500 uppercase tracking-widest mb-4">Email History</p>
          {clientEmails.length === 0
            ? <p className="text-sm font-mono text-zinc-600">No emails sent to this client yet.</p>
            : (
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-2 pr-4 font-normal">Type</th>
                    <th className="text-left py-2 pr-4 font-normal">Subject</th>
                    <th className="text-left py-2 pr-4 font-normal">Sent By</th>
                    <th className="text-left py-2 pr-4 font-normal">Sent At</th>
                    <th className="text-left py-2 font-normal">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {clientEmails.map(e => (
                    <tr key={e._id} className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors duration-200">
                      <td className="py-2 pr-4 text-zinc-300">{e.type}</td>
                      <td className="py-2 pr-4 text-zinc-400 max-w-[220px] truncate">{e.subject}</td>
                      <td className="py-2 pr-4 text-zinc-400">{e.sent_by}</td>
                      <td className="py-2 pr-4 text-zinc-400">{new Date(e.sent_at).toLocaleString()}</td>
                      <td className="py-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          e.delivery_status === 'delivered' || e.delivery_status === 'opened' ? 'bg-emerald-500' :
                          e.delivery_status === 'bounced' ? 'bg-red-500' : 'bg-zinc-500'
                        }`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {showGenModal && (
        <GenerateCarouselModal
          templates={templates}
          platforms={client.platforms || PLATFORMS.slice(0, 2)}
          onGenerate={generateCarousel}
          onClose={() => setShowGenModal(false)}
        />
      )}
    </div>
  );
}

function DropboxTab({ clientId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${API}/clients/${clientId}/dropbox`, { signal: controller.signal })
      .then(r => setPosts(r.data))
      .catch(err => { if (!axios.isCancel(err)) { setPosts([]); toast.error("Failed to load Dropbox"); } })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [clientId]);

  const togglePromote = async (post) => {
    setPromoting(post.id);
    try {
      const resp = await axios.patch(`${API}/posts/${post.id}/promote-global`, {
        promoted: !post.promoted_global,
      });
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...resp.data } : p));
    } catch {
      toast.error("Failed to update");
    } finally {
      setPromoting(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-xs font-mono text-zinc-500">Loading Dropbox...</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-400">Winning Content Dropbox</div>
          <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
            Posts starred manually or auto-flagged as top 20% engagement · used as AI examples
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2 py-1">
          {posts.length} posts
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-900 p-10 text-center">
          <div className="text-xs font-mono text-zinc-500 mb-1">No winning posts yet</div>
          <div className="text-[10px] font-mono text-zinc-700">
            Star posts manually in the Posts tab, or wait for performance data to come in.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => {
            const score = post.engagement_score || 0;
            const perf = post.performance || {};
            return (
              <div key={post.id} className="border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-zinc-300 line-clamp-2 mb-2">{post.text}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[9px] font-mono text-zinc-600 uppercase">{post.platform}</span>
                      <span className="text-[9px] font-mono text-zinc-600 uppercase">{post.content_type}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 border ${
                        post.winner_source === "auto"
                          ? "border-blue-800 text-blue-400"
                          : "border-amber-800 text-amber-400"
                      }`}>
                        {post.winner_source === "auto" ? "AUTO" : "MANUAL"}
                      </span>
                      {score > 0 && (
                        <span className="text-[9px] font-mono text-zinc-600">
                          ★ {score.toLocaleString()}
                        </span>
                      )}
                      {perf.likes > 0 && (
                        <span className="text-[9px] font-mono text-zinc-700">
                          {perf.likes}L · {perf.comments}C · {perf.shares}S
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <button
                      onClick={() => togglePromote(post)}
                      disabled={promoting === post.id}
                      aria-label={post.promoted_global ? "Remove from Global Library" : "Promote to Global Library"}
                      aria-busy={promoting === post.id}
                      className={`text-[9px] font-mono px-2 py-1 border transition-colors duration-150 disabled:opacity-40 ${
                        post.promoted_global
                          ? "border-emerald-700 text-emerald-400 hover:border-red-700 hover:text-red-400"
                          : "border-zinc-700 text-zinc-500 hover:border-emerald-700 hover:text-emerald-400"
                      }`}
                    >
                      {promoting === post.id ? "Updating..." : post.promoted_global ? "Global ✓" : "Promote Global"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrendsTab({ clientId, client }) {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Keywords state
  const [autoKeywords, setAutoKeywords] = useState([]);
  const [customKeywords, setCustomKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [savingKeywords, setSavingKeywords] = useState(false);

  const fetchKeywords = async () => {
    try {
      const resp = await axios.get(`${API}/clients/${clientId}/trend-keywords`);
      setAutoKeywords(resp.data.auto_keywords || []);
      setCustomKeywords(resp.data.custom_keywords || []);
    } catch {
      // non-fatal — keywords panel just stays empty
    }
  };

  const fetchTrends = async () => {
    try {
      const resp = await axios.get(`${API}/clients/${clientId}/trends?limit=50`);
      setTrends(resp.data);
    } catch {
      setTrends([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
    fetchTrends();
  }, [clientId]);

  const saveCustomKeywords = async (updated, onSuccess) => {
    setSavingKeywords(true);
    try {
      const resp = await axios.patch(`${API}/clients/${clientId}/trend-keywords`, {
        custom_trend_keywords: updated,
      });
      setCustomKeywords(resp.data.custom_keywords || []);
      if (onSuccess) onSuccess();
    } catch {
      toast.error("Failed to save keyword");
    } finally {
      setSavingKeywords(false);
    }
  };

  const handleAddKeyword = () => {
    if (savingKeywords) return;
    const kw = newKeyword.trim().toLowerCase();
    if (!kw) return;
    if (customKeywords.includes(kw)) {
      toast.error("Keyword already exists");
      return;
    }
    saveCustomKeywords([...customKeywords, kw], () => setNewKeyword(""));
  };

  const handleRemoveKeyword = (kw) => {
    if (savingKeywords) return;
    saveCustomKeywords(customKeywords.filter(k => k !== kw));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await axios.post(`${API}/clients/${clientId}/trends/refresh`);
      await Promise.all([fetchTrends(), fetchKeywords()]);
      toast.success("Trends refreshed");
    } catch {
      toast.error("Failed to fetch trends");
    } finally {
      setRefreshing(false);
    }
  };

  const instagram = trends.filter(t => t.source === "apify_instagram");
  const google = trends.filter(t => t.source === "pytrends");
  const expiresAt = trends[0]?.expires_at ? new Date(trends[0].expires_at) : null;
  const fetchedAt = trends[0]?.fetched_at ? new Date(trends[0].fetched_at) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-xs font-mono text-zinc-500">Loading trends...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-400">Trend Intelligence</div>
          {fetchedAt ? (
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
              Last fetched: {fetchedAt.toLocaleString()} &nbsp;·&nbsp;
              {expiresAt && expiresAt > new Date()
                ? <span className="text-emerald-600">Cache valid for {Math.round((expiresAt - new Date()) / 60000)} min</span>
                : <span className="text-amber-600">Cache expired</span>
              }
            </div>
          ) : (
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">No trend data yet — auto-refresh runs every 6 hours</div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh Now"}
        </button>
      </div>

      {/* Keywords panel */}
      <div className="border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Keyword Sources</div>
          <div className="text-[10px] font-mono text-zinc-600">
            {autoKeywords.length + customKeywords.length} active · top 5 used per fetch
          </div>
        </div>

        {/* Auto-derived keywords */}
        {autoKeywords.length > 0 && (
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Auto-derived</div>
            <div className="flex flex-wrap gap-1.5">
              {autoKeywords.map((kw, i) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-zinc-700 bg-zinc-800 text-[10px] font-mono text-zinc-400"
                >
                  <span className="text-zinc-600 text-[9px]">{i + 1}</span>
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom keywords */}
        <div>
          <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">
            Custom
            {customKeywords.length > 0 && (
              <span className="ml-1 text-emerald-600">· highest priority</span>
            )}
          </div>
          {customKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {customKeywords.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-800 bg-emerald-950 text-[10px] font-mono text-emerald-400"
                >
                  {kw}
                  <button
                    onClick={() => handleRemoveKeyword(kw)}
                    disabled={savingKeywords}
                    aria-label={`Remove ${kw}`}
                    className="text-emerald-700 hover:text-red-400 transition-colors duration-100 disabled:opacity-40 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-zinc-700 mb-3">
              No custom keywords — auto-derived ones are used
            </div>
          )}

          {/* Add keyword input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddKeyword()}
              placeholder="e.g. personal finance tips"
              disabled={savingKeywords}
              className="flex-1 bg-zinc-800 border border-zinc-700 px-2 py-1 text-[10px] font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
            <button
              onClick={handleAddKeyword}
              disabled={savingKeywords || !newKeyword.trim()}
              className="px-3 py-1 text-[10px] font-mono border border-zinc-600 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
            >
              {savingKeywords ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      {trends.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-900 p-10 text-center">
          <div className="text-xs font-mono text-zinc-500 mb-1">No trends cached yet</div>
          <div className="text-[10px] font-mono text-zinc-700">
            The scheduler fetches trends every 6 hours. Click Refresh Now to fetch immediately.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {/* Instagram / Apify */}
          <div className="border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-bold">IG</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Instagram Hashtags</div>
              <div className="ml-auto text-[10px] font-mono text-zinc-600">{instagram.length} trends</div>
            </div>
            {instagram.length === 0 ? (
              <div className="text-[10px] font-mono text-zinc-600">No Instagram trends cached</div>
            ) : (
              <div className="space-y-2">
                {instagram.map((t, i) => (
                  <div key={t.id || i} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-zinc-600 w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-xs font-mono text-pink-400 truncate">{t.hashtag || t.topic}</span>
                    </div>
                    {t.volume > 0 && (
                      <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 ml-2">
                        {t.volume >= 1000 ? `${(t.volume / 1000).toFixed(0)}k` : t.volume}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Google Trends / pytrends */}
          <div className="border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-bold">G</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Google Search</div>
              <div className="ml-auto text-[10px] font-mono text-zinc-600">{google.length} trends</div>
            </div>
            {google.length === 0 ? (
              <div className="text-[10px] font-mono text-zinc-600">No Google trends cached</div>
            ) : (
              <div className="space-y-2">
                {google.map((t, i) => (
                  <div key={t.id || i} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-zinc-600 w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-xs font-mono text-blue-400 truncate">{t.topic || t.hashtag}</span>
                    </div>
                    {t.volume > 0 && (
                      <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 ml-2">
                        {t.volume >= 1000 ? `${(t.volume / 1000).toFixed(0)}k` : t.volume}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Posts tagged with trends */}
      {trends.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">How Trends Are Used</div>
          <div className="text-[10px] font-mono text-zinc-600 leading-relaxed">
            These trends are automatically injected into Claude's prompt when this client's pipelines run.
            Claude picks the 1–2 most relevant trends and generates posts that feel native — not trend-chasing.
            Each generated post is tagged with its <span className="text-zinc-400">trend_source</span> field, visible in the Posts tab.
          </div>
        </div>
      )}
    </div>
  );
}

function AppsTab({ clientId, client }) {
  const [sheetInfo, setSheetInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState(client?.onboarding_data?.email || "");
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    axios.get(`${API}/clients/${clientId}/sheet`)
      .then(r => setSheetInfo(r.data))
      .catch(() => setSheetInfo({ connected: false }))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleCreate() {
    if (!email) return;
    setCreating(true);
    try {
      const r = await axios.post(`${API}/clients/${clientId}/sheet/create`, {
        share_with_email: email,
      });
      setSheetInfo({
        connected: true,
        sheet_url: r.data.sheet_url,
        shared_with: email,
        last_synced_at: null,
      });
      setShowModal(false);
      toast.success("Sheet created and shared. Initial sync running in background.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create sheet");
    } finally {
      setCreating(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await axios.post(`${API}/clients/${clientId}/sheet/sync`);
      toast.success("Sync started — sheet will update in a moment");
      // Refresh info after a short delay to pick up new last_synced_at
      setTimeout(async () => {
        const r = await axios.get(`${API}/clients/${clientId}/sheet`);
        setSheetInfo(r.data);
        setSyncing(false);
      }, 4000);
    } catch (e) {
      toast.error("Sync failed");
      setSyncing(false);
    }
  }

  const sheetIcon = (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <rect width="24" height="24" rx="2" fill="#1D6F42" />
      <path d="M7 8h10M7 11h10M7 14h7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 6v12" stroke="white" strokeWidth="1.5" />
    </svg>
  );

  if (loading) {
    return <div className="text-xs font-mono text-zinc-600 py-6 text-center">Loading integrations...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-xs font-mono text-zinc-400">Integrations</div>
          <div className="text-[10px] font-mono text-zinc-600 mt-0.5">Connect external tools to automate your workflow</div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2 py-1">
          {sheetInfo?.connected ? "1" : "0"} / 1 connected
        </div>
      </div>

      {/* Google Sheets Card */}
      <div className="border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-800 flex items-center justify-center flex-shrink-0">
              {sheetIcon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-white">Google Sheets</div>
                {sheetInfo?.connected ? (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    Connected
                  </span>
                ) : null}
              </div>
              <div className="text-xs font-mono text-zinc-500 mt-0.5 max-w-md leading-relaxed">
                {sheetInfo?.connected
                  ? `Shared with ${sheetInfo.shared_with} · Posts, competitors and trends sync every 6 hours`
                  : "Create a Google Sheet for this client. Posts, competitors, and trends sync automatically."}
              </div>
              {sheetInfo?.connected && sheetInfo.last_synced_at && (
                <div className="text-[10px] font-mono text-zinc-600 mt-1">
                  Last synced {new Date(sheetInfo.last_synced_at).toLocaleString()}
                </div>
              )}
              {sheetInfo?.connected && !sheetInfo.last_synced_at && (
                <div className="text-[10px] font-mono text-zinc-600 mt-1">
                  Initial sync in progress...
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            {sheetInfo?.connected ? (
              <>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50"
                >
                  <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
                <a
                  href={sheetInfo.sheet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-emerald-800 text-emerald-400 hover:bg-emerald-950 transition-colors duration-150"
                >
                  <Link size={11} />
                  Open Sheet
                </a>
              </>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150"
              >
                <Link size={11} />
                Create Sheet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* More integrations footer */}
      <div className="border border-dashed border-zinc-800 p-5 text-center">
        <div className="text-xs font-mono text-zinc-600">More integrations coming — request one at the bottom of the dashboard</div>
      </div>

      {/* Create Sheet Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Create Google Sheet</div>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
            <div className="text-xs font-mono text-zinc-500 leading-relaxed">
              We'll create the sheet on our Google account and share it with the client's email. The sheet will have 4 tabs: Client Info, Posts, Competitors, and Trends.
            </div>
            <div>
              <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                Client Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="mt-1 w-full bg-zinc-950 border border-zinc-700 text-xs font-mono text-white px-3 py-2 outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-mono text-zinc-500 border border-zinc-800 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !email}
                className="px-4 py-2 text-xs font-mono text-white border border-emerald-700 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create & Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function GenerateCarouselModal({ templates, platforms, onGenerate, onClose }) {
  const [templateId, setTemplateId] = useState("");
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState(platforms[0] || "instagram");
  const [slideCount, setSlideCount] = useState(5);
  const [slideFormat, setSlideFormat] = useState("tips");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!templateId) return toast.error("Select a template");
    if (!topic.trim()) return toast.error("Enter a topic");
    onGenerate({ templateId, topic: topic.trim(), platform, slideCount, slideFormat });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Generate Carousel</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Template</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            >
              <option value="">Select a template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.is_starter ? " (Starter)" : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Topic / Content Brief</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              rows={3}
              placeholder="What should the carousel be about?"
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Platform</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                {platforms.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Slides</label>
              <input
                type="number"
                value={slideCount}
                onChange={e => setSlideCount(parseInt(e.target.value) || 5)}
                min={3}
                max={15}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Content Format</label>
            <select
              value={slideFormat}
              onChange={e => setSlideFormat(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            >
              <option value="tips">Tips / Insights (default)</option>
              <option value="story">Storytelling Arc</option>
              <option value="myth_bust">Myth-Busting</option>
              <option value="case_study">Case Study</option>
              <option value="step_by_step">Step-by-Step Process</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150"
          >
            <Wand2 size={14} />
            Generate Carousel
          </button>
        </form>
      </div>
    </div>
  );
}
