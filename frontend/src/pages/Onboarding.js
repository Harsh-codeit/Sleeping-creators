import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, X, Plus, Zap,
  User, Link, Palette, FolderOpen, Settings2, Mic, Layout
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ALL_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "twitter", "threads"];
const PLATFORM_COLORS = {
  instagram: "from-pink-500 to-orange-400",
  facebook: "from-blue-600 to-blue-500",
  youtube: "from-red-600 to-red-500",
  linkedin: "from-sky-700 to-sky-600",
  twitter: "from-zinc-300 to-zinc-200",
  threads: "from-zinc-500 to-zinc-400",
};

const STEPS = [
  { id: 1, label: "Identity",       icon: User,      desc: "Basic client info" },
  { id: 2, label: "Assets",         icon: Link,      desc: "Digital presence" },
  { id: 3, label: "Brand Profile",  icon: Palette,   desc: "Voice & goals" },
  { id: 4, label: "Content",        icon: FolderOpen, desc: "Media & magnets" },
  { id: 5, label: "Automation",     icon: Settings2, desc: "Keywords & tracking" },
  { id: 6, label: "Training",       icon: Mic,       desc: "Voice & rules" },
  { id: 7, label: "Templates",      icon: Layout,    desc: "Design & platforms" },
];

const INITIAL = {
  // Step 1
  name: "", username: "", whatsapp: "", email: "",
  // Step 2
  website_url: "", pr_links: [""], instagram_handle: "", instagram_access_link: "",
  // Step 3
  niche: "", problem_solved: "", brand_vibe: "", account_goals: "followers", cta_link: "", language: "English",
  // Step 4
  branding_assets_link: "", google_drive_images: "", google_drive_videos: "", lead_magnets: [""],
  // Step 5
  automation_keywords: [""], competitor_accounts: [""], lead_sheet_link: "", bio_template: "",
  // Step 6
  voice_notes_link: "", not_to_do_list: [""],
  // Step 7
  preferred_carousel_template: "full_white", preferred_video_template: "", platforms: [],
};

/* ── Reusable field components ─────────────────────────────────── */

function Label({ children, optional }) {
  return (
    <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5">
      {children}
      {optional && <span className="ml-1 text-zinc-600 normal-case tracking-normal">optional</span>}
    </label>
  );
}

function Input({ testid, ...props }) {
  return (
    <input
      data-testid={testid}
      {...props}
      className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
    />
  );
}

function Textarea({ testid, rows = 3, ...props }) {
  return (
    <textarea
      data-testid={testid}
      rows={rows}
      {...props}
      className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150 resize-none"
    />
  );
}

function MultiInput({ label, values, onChange, placeholder, testid, optional }) {
  const add = () => onChange([...values, ""]);
  const remove = (i) => onChange(values.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(values.map((x, idx) => idx === i ? v : x));
  return (
    <div>
      <Label optional={optional}>{label}</Label>
      <div className="space-y-2">
        {values.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input
              data-testid={`${testid}-${i}`}
              value={val}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="px-2 text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-900 transition-colors duration-150"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white font-mono transition-colors duration-150"
        >
          <Plus size={12} /> Add another
        </button>
      </div>
    </div>
  );
}

/* ── Step Components ───────────────────────────────────────────── */

function Step1({ form, set }) {
  return (
    <div className="space-y-5" data-testid="step-1">
      <div>
        <Label>Client Name *</Label>
        <Input testid="ob-name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Acme Corp" required />
      </div>
      <div>
        <Label optional>Username / Handle</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">@</span>
          <input
            data-testid="ob-username"
            value={form.username}
            onChange={e => set("username", e.target.value)}
            placeholder="acmecorp"
            className="w-full bg-zinc-950 border border-zinc-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label optional>WhatsApp Number</Label>
          <Input testid="ob-whatsapp" value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="+1 234 567 8900" type="tel" />
        </div>
        <div>
          <Label optional>Email Address</Label>
          <Input testid="ob-email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="hello@acme.com" type="email" />
        </div>
      </div>
    </div>
  );
}

function Step2({ form, set }) {
  return (
    <div className="space-y-5" data-testid="step-2">
      <div>
        <Label optional>Website URL</Label>
        <Input testid="ob-website" value={form.website_url} onChange={e => set("website_url", e.target.value)} placeholder="https://acme.com" type="url" />
      </div>
      <MultiInput
        label="PR / Media Links"
        values={form.pr_links}
        onChange={v => set("pr_links", v)}
        placeholder="https://techcrunch.com/article/..."
        testid="ob-pr"
        optional
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label optional>Instagram Handle</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">@</span>
            <input
              data-testid="ob-ig-handle"
              value={form.instagram_handle}
              onChange={e => set("instagram_handle", e.target.value)}
              placeholder="acmecorp"
              className="w-full bg-zinc-950 border border-zinc-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
            />
          </div>
        </div>
        <div>
          <Label optional>Instagram Access Link</Label>
          <Input testid="ob-ig-access" value={form.instagram_access_link} onChange={e => set("instagram_access_link", e.target.value)} placeholder="Shared login or grant link" />
        </div>
      </div>
    </div>
  );
}

function Step3({ form, set }) {
  const goalOptions = [
    { value: "followers", label: "Grow Followers", desc: "Maximize reach & brand awareness" },
    { value: "leads", label: "Generate Leads", desc: "Convert audience to customers" },
    { value: "both", label: "Both", desc: "Balanced growth and conversion" },
  ];
  const languageOptions = ["English", "Arabic", "Spanish", "French", "Portuguese", "German", "Hindi", "Other"];
  return (
    <div className="space-y-5" data-testid="step-3">
      <div>
        <Label optional>Niche / Target Market</Label>
        <Input testid="ob-niche" value={form.niche} onChange={e => set("niche", e.target.value)} placeholder="e.g. Health-conscious adults 25-40, B2B SaaS CTOs" />
      </div>
      <div>
        <Label optional>Problem the Client Solves</Label>
        <Textarea testid="ob-problem" value={form.problem_solved} onChange={e => set("problem_solved", e.target.value)} placeholder="Describe what their product/service helps customers achieve..." rows={3} />
      </div>
      <div>
        <Label optional>Brand Vibe / Tone of Voice</Label>
        <Textarea testid="ob-vibe" value={form.brand_vibe} onChange={e => set("brand_vibe", e.target.value)} placeholder="e.g. Professional yet approachable, uses data and storytelling, avoids jargon..." rows={2} />
      </div>
      <div>
        <Label>Account Goals</Label>
        <div className="grid grid-cols-3 gap-2">
          {goalOptions.map(g => (
            <button
              key={g.value}
              type="button"
              data-testid={`ob-goal-${g.value}`}
              onClick={() => set("account_goals", g.value)}
              className={`p-3 border text-left transition-all duration-150 ${
                form.account_goals === g.value
                  ? "border-white bg-white/5"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <div className="text-xs font-semibold text-white mb-0.5">{g.label}</div>
              <div className="text-[10px] text-zinc-500 font-mono leading-tight">{g.desc}</div>
              {form.account_goals === g.value && (
                <div className="mt-2 flex items-center gap-1">
                  <Check size={10} className="text-white" />
                  <span className="text-[9px] font-mono text-zinc-300">Selected</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label optional>CTA Link</Label>
          <Input testid="ob-cta" value={form.cta_link} onChange={e => set("cta_link", e.target.value)} placeholder="https://acme.com/book-demo" type="url" />
        </div>
        <div>
          <Label>Language Preference</Label>
          <select
            data-testid="ob-language"
            value={form.language}
            onChange={e => set("language", e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-400 transition-colors duration-150"
          >
            {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function Step4({ form, set }) {
  return (
    <div className="space-y-5" data-testid="step-4">
      <div>
        <Label optional>Branding Assets Link</Label>
        <Input testid="ob-branding" value={form.branding_assets_link} onChange={e => set("branding_assets_link", e.target.value)} placeholder="Google Drive / Dropbox link to logos, brand kit..." type="url" />
        <p className="text-[10px] text-zinc-600 font-mono mt-1">AI will analyze brand colors, fonts, and visual style from linked assets</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label optional>Google Drive — Images</Label>
          <Input testid="ob-drive-images" value={form.google_drive_images} onChange={e => set("google_drive_images", e.target.value)} placeholder="https://drive.google.com/..." type="url" />
        </div>
        <div>
          <Label optional>Google Drive — Videos</Label>
          <Input testid="ob-drive-videos" value={form.google_drive_videos} onChange={e => set("google_drive_videos", e.target.value)} placeholder="https://drive.google.com/..." type="url" />
        </div>
      </div>
      <MultiInput
        label="Lead Magnets"
        values={form.lead_magnets}
        onChange={v => set("lead_magnets", v)}
        placeholder="e.g. Free eBook: 10 Growth Hacks"
        testid="ob-magnet"
        optional
      />
    </div>
  );
}

function Step5({ form, set }) {
  return (
    <div className="space-y-5" data-testid="step-5">
      <MultiInput
        label="Automation Keywords"
        values={form.automation_keywords}
        onChange={v => set("automation_keywords", v)}
        placeholder="e.g. pricing, book, demo, interested"
        testid="ob-keyword"
        optional
      />
      <MultiInput
        label="Competitor Accounts"
        values={form.competitor_accounts}
        onChange={v => set("competitor_accounts", v)}
        placeholder="@competitor_handle or URL"
        testid="ob-competitor"
        optional
      />
      <div>
        <Label optional>Lead Sheet Access Link</Label>
        <Input testid="ob-lead-sheet" value={form.lead_sheet_link} onChange={e => set("lead_sheet_link", e.target.value)} placeholder="Google Sheet or CRM link for tracking leads..." type="url" />
      </div>
      <div>
        <Label optional>Bio Template</Label>
        <Textarea
          testid="ob-bio"
          value={form.bio_template}
          onChange={e => set("bio_template", e.target.value)}
          placeholder="Paste or write the client's social media bio template here..."
          rows={4}
        />
      </div>
    </div>
  );
}

function Step6({ form, set }) {
  return (
    <div className="space-y-5" data-testid="step-6">
      <div>
        <Label optional>Voice Notes Link</Label>
        <Input
          testid="ob-voice-link"
          value={form.voice_notes_link}
          onChange={e => set("voice_notes_link", e.target.value)}
          placeholder="Google Drive / Dropbox link to voice note recordings..."
          type="url"
        />
        <p className="text-[10px] text-zinc-600 font-mono mt-1">Voice notes are used to train the AI on the client's speaking style and personality</p>
      </div>
      <MultiInput
        label={`"Not to Do" List`}
        values={form.not_to_do_list}
        onChange={v => set("not_to_do_list", v)}
        placeholder="e.g. Never discuss pricing publicly, avoid political topics..."
        testid="ob-notodo"
        optional
      />
    </div>
  );
}

const CAROUSEL_TEMPLATES = [
  {
    value: "full_white",
    label: "Full White",
    desc: "Clean white background, bold typography. Great for quotes and thought leadership.",
    preview: (
      <div className="w-full aspect-square bg-white flex flex-col items-center justify-center p-4 rounded">
        <div className="w-8 h-1 bg-zinc-900 mb-3 rounded-full" />
        <div className="space-y-1.5 text-center">
          <div className="h-2 w-24 bg-zinc-900 rounded" />
          <div className="h-2 w-20 bg-zinc-400 rounded" />
          <div className="h-2 w-16 bg-zinc-300 rounded" />
        </div>
        <div className="mt-4 w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
      </div>
    ),
  },
  {
    value: "floating_card",
    label: "Floating Card",
    desc: "Cream background with a white card. Elegant and editorial.",
    preview: (
      <div className="w-full aspect-square bg-amber-50 flex items-center justify-center p-4 rounded">
        <div className="bg-white rounded-lg shadow-md p-4 w-full space-y-2">
          <div className="h-2 w-20 bg-zinc-300 rounded" />
          <div className="h-2 w-16 bg-zinc-200 rounded" />
          <div className="h-2 w-12 bg-zinc-200 rounded" />
        </div>
      </div>
    ),
  },
  {
    value: "full_white_rich",
    label: "Full White (Rich)",
    desc: "White background with structured heading, body, and callout zones. Deep, editorial content.",
    preview: (
      <div className="w-full aspect-square bg-white flex flex-col justify-center p-4 rounded space-y-2">
        <div className="h-3 w-20 bg-zinc-900 rounded" />
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-300 rounded" />
          <div className="h-1.5 w-5/6 bg-zinc-300 rounded" />
          <div className="h-1.5 w-4/6 bg-zinc-300 rounded" />
        </div>
        <div className="border-l-2 border-blue-400 bg-zinc-100 px-2 py-1.5 rounded-sm">
          <div className="h-1.5 w-3/4 bg-zinc-400 rounded" />
        </div>
      </div>
    ),
  },
  {
    value: "floating_card_rich",
    label: "Floating Card (Rich)",
    desc: "Cream background with structured heading, body, and gold callout. Warm and editorial.",
    preview: (
      <div className="w-full aspect-square bg-amber-50 flex items-center justify-center p-4 rounded">
        <div className="bg-white rounded-lg shadow-md p-4 w-full space-y-2">
          <div className="h-3 w-16 bg-zinc-800 rounded" />
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-zinc-300 rounded" />
            <div className="h-1.5 w-5/6 bg-zinc-200 rounded" />
          </div>
          <div className="border-l-2 border-amber-500 bg-amber-50 px-2 py-1 rounded-sm">
            <div className="h-1.5 w-3/4 bg-amber-400 rounded" />
          </div>
        </div>
      </div>
    ),
  },
  {
    value: "dark_card_rich",
    label: "Dark Card (Rich)",
    desc: "Dark background with structured heading, body, and blue accent callout. Bold and modern.",
    preview: (
      <div className="w-full aspect-square bg-black flex items-center justify-center p-4 rounded">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-full space-y-2">
          <div className="h-3 w-16 bg-white rounded" />
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-zinc-600 rounded" />
            <div className="h-1.5 w-5/6 bg-zinc-600 rounded" />
          </div>
          <div className="border-l-2 border-blue-400 bg-zinc-800 px-2 py-1 rounded-sm">
            <div className="h-1.5 w-3/4 bg-zinc-500 rounded" />
          </div>
        </div>
      </div>
    ),
  },
];

const VIDEO_TEMPLATES = ["Talking Head (Reels)", "Text Overlay", "Slideshow", "B-Roll Montage", "Tutorial / How-To", "None / TBD"];

function Step7({ form, set }) {
  return (
    <div className="space-y-6" data-testid="step-7">
      <div>
        <Label>Preferred Carousel Template</Label>
        <div className="grid grid-cols-2 gap-3">
          {CAROUSEL_TEMPLATES.map(t => (
            <button
              key={t.value}
              type="button"
              data-testid={`ob-carousel-${t.value}`}
              onClick={() => set("preferred_carousel_template", t.value)}
              className={`border p-3 text-left transition-all duration-150 ${
                form.preferred_carousel_template === t.value
                  ? "border-white bg-white/5"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <div className="mb-3">{t.preview}</div>
              <div className="text-xs font-semibold text-white mb-1">{t.label}</div>
              <div className="text-[10px] text-zinc-500 font-mono leading-tight">{t.desc}</div>
              {form.preferred_carousel_template === t.value && (
                <div className="mt-2 flex items-center gap-1">
                  <Check size={10} className="text-white" />
                  <span className="text-[9px] font-mono text-zinc-300">Selected</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label optional>Preferred Video Template</Label>
        <div className="grid grid-cols-3 gap-2">
          {VIDEO_TEMPLATES.map(v => (
            <button
              key={v}
              type="button"
              data-testid={`ob-video-${v.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => set("preferred_video_template", form.preferred_video_template === v ? "" : v)}
              className={`py-2.5 px-3 border text-xs font-mono text-left transition-all duration-150 ${
                form.preferred_video_template === v
                  ? "border-white bg-white/5 text-white"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Active Platforms *</Label>
        <p className="text-[10px] text-zinc-600 font-mono mb-2">Select all platforms to automate content for</p>
        <div className="grid grid-cols-3 gap-2">
          {ALL_PLATFORMS.map(p => (
            <button
              key={p}
              type="button"
              data-testid={`ob-platform-${p}`}
              onClick={() => {
                const next = form.platforms.includes(p)
                  ? form.platforms.filter(x => x !== p)
                  : [...form.platforms, p];
                set("platforms", next);
              }}
              className={`relative py-2.5 px-3 border text-xs font-mono uppercase text-left overflow-hidden transition-all duration-150 ${
                form.platforms.includes(p)
                  ? "border-white text-white bg-white/5"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {form.platforms.includes(p) && (
                <span className="absolute top-1 right-1">
                  <Check size={9} className="text-white" />
                </span>
              )}
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Review Summary ────────────────────────────────────────────── */
function ReviewSection({ title, items }) {
  const filled = items.filter(i => {
    const v = i.value;
    if (Array.isArray(v)) return v.filter(Boolean).length > 0;
    return Boolean(v);
  });
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">{title}</div>
      <div className="space-y-1.5">
        {filled.map(i => (
          <div key={i.label} className="flex gap-3">
            <span className="text-[10px] font-mono text-zinc-600 w-36 flex-shrink-0">{i.label}</span>
            <span className="text-xs text-zinc-300 truncate">
              {Array.isArray(i.value) ? i.value.filter(Boolean).join(", ") : i.value}
            </span>
          </div>
        ))}
        {filled.length === 0 && <div className="text-[10px] text-zinc-700 font-mono italic">No data provided for this section</div>}
      </div>
    </div>
  );
}

function Review({ form }) {
  return (
    <div className="space-y-3" data-testid="step-review">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white">
          {form.name ? form.name.slice(0, 2).toUpperCase() : "??"}
        </div>
        <div>
          <div className="text-sm font-bold text-white">{form.name || "Unnamed Client"}</div>
          <div className="text-[10px] font-mono text-zinc-500">Ready to onboard</div>
        </div>
      </div>
      <ReviewSection title="Identity" items={[
        { label: "Name", value: form.name },
        { label: "Username", value: form.username ? `@${form.username}` : "" },
        { label: "WhatsApp", value: form.whatsapp },
        { label: "Email", value: form.email },
      ]} />
      <ReviewSection title="Assets" items={[
        { label: "Website", value: form.website_url },
        { label: "Instagram", value: form.instagram_handle ? `@${form.instagram_handle}` : "" },
        { label: "PR Links", value: form.pr_links },
      ]} />
      <ReviewSection title="Brand Profile" items={[
        { label: "Niche", value: form.niche },
        { label: "Problem Solved", value: form.problem_solved },
        { label: "Brand Vibe", value: form.brand_vibe },
        { label: "Goals", value: form.account_goals },
        { label: "Language", value: form.language },
      ]} />
      <ReviewSection title="Automation" items={[
        { label: "Keywords", value: form.automation_keywords },
        { label: "Competitors", value: form.competitor_accounts },
        { label: "Not To Do", value: form.not_to_do_list },
      ]} />
      <ReviewSection title="Templates & Platforms" items={[
        { label: "Carousel", value: CAROUSEL_TEMPLATES.find(t => t.value === form.preferred_carousel_template)?.label || form.preferred_carousel_template },
        { label: "Video", value: form.preferred_video_template },
        { label: "Platforms", value: form.platforms },
      ]} />
    </div>
  );
}

/* ── Main Wizard ───────────────────────────────────────────────── */
export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const validateStep = () => {
    if (step === 1 && !form.name.trim()) {
      toast.error("Client name is required");
      return false;
    }
    if (step === 7 && form.platforms.length === 0) {
      toast.error("Select at least one platform");
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep(s => Math.min(s + 1, 8));
  };

  const back = () => setStep(s => Math.max(s - 1, 1));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Client name is required");
    if (form.platforms.length === 0) return toast.error("Select at least one platform");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        pr_links: form.pr_links.filter(Boolean),
        lead_magnets: form.lead_magnets.filter(Boolean),
        automation_keywords: form.automation_keywords.filter(Boolean),
        competitor_accounts: form.competitor_accounts.filter(Boolean),
        not_to_do_list: form.not_to_do_list.filter(Boolean),
      };
      await axios.post(`${API}/clients/onboard`, payload);
      toast.success(`${form.name} successfully onboarded!`);
      navigate("/clients");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to submit onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 8; // 7 steps + review
  const progress = ((step - 1) / (totalSteps - 1)) * 100;

  const stepContent = {
    1: <Step1 form={form} set={set} />,
    2: <Step2 form={form} set={set} />,
    3: <Step3 form={form} set={set} />,
    4: <Step4 form={form} set={set} />,
    5: <Step5 form={form} set={set} />,
    6: <Step6 form={form} set={set} />,
    7: <Step7 form={form} set={set} />,
    8: <Review form={form} />,
  };

  const currentStep = step <= 7 ? STEPS[step - 1] : { label: "Review", icon: Check, desc: "Confirm & submit" };
  const Icon = currentStep.icon;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col" data-testid="onboarding-page">
      {/* Top bar */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-white flex items-center justify-center">
            <Zap size={14} className="text-black" />
          </div>
          <div>
            <span className="text-sm font-bold text-white">AutoMonk</span>
            <span className="text-zinc-600 mx-2 text-sm">/</span>
            <span className="text-sm text-zinc-400">Client Onboarding</span>
          </div>
        </div>
        <button
          onClick={() => navigate("/clients")}
          className="text-zinc-500 hover:text-white flex items-center gap-1.5 text-xs font-mono transition-colors duration-150"
        >
          <X size={13} /> Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800 flex-shrink-0">
        <div
          className="h-full bg-white transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
          data-testid="onboarding-progress"
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — steps */}
        <aside className="w-52 flex-shrink-0 border-r border-zinc-800 py-8 px-4 overflow-y-auto hidden md:block">
          <div className="space-y-1">
            {STEPS.map((s, i) => {
              const SIcon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div
                  key={s.id}
                  data-testid={`step-indicator-${s.id}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150 ${
                    active ? "bg-white/5 border border-zinc-700" : "border border-transparent"
                  }`}
                >
                  <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border text-[10px] font-mono transition-colors duration-150 ${
                    done ? "border-white bg-white text-black" :
                    active ? "border-zinc-400 text-zinc-200" :
                    "border-zinc-700 text-zinc-600"
                  }`}>
                    {done ? <Check size={9} /> : s.id}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-semibold truncate transition-colors duration-150 ${
                      active ? "text-white" : done ? "text-zinc-300" : "text-zinc-600"
                    }`}>{s.label}</div>
                    <div className={`text-[9px] font-mono truncate transition-colors duration-150 ${
                      active ? "text-zinc-400" : "text-zinc-700"
                    }`}>{s.desc}</div>
                  </div>
                </div>
              );
            })}
            {/* Review step indicator */}
            <div className={`flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150 ${
              step === 8 ? "bg-white/5 border border-zinc-700" : "border border-transparent"
            }`}>
              <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border text-[10px] font-mono ${
                step === 8 ? "border-zinc-400 text-zinc-200" : "border-zinc-700 text-zinc-600"
              }`}>
                <Check size={9} />
              </div>
              <div>
                <div className={`text-xs font-semibold ${step === 8 ? "text-white" : "text-zinc-600"}`}>Review</div>
                <div className={`text-[9px] font-mono ${step === 8 ? "text-zinc-400" : "text-zinc-700"}`}>Confirm & submit</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main form area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Step header */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <Icon size={18} className="text-zinc-300" />
              </div>
              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                  Step {step} of {totalSteps}
                </div>
                <div className="text-xl font-bold text-white">{currentStep.label}</div>
              </div>
            </div>

            {/* Step content */}
            <div className="mb-10" key={step}>
              {stepContent[step]}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-zinc-800">
              <button
                type="button"
                onClick={back}
                disabled={step === 1}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
                data-testid="ob-back-btn"
              >
                <ChevronLeft size={14} /> Back
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={`h-1 transition-all duration-300 ${
                      i + 1 === step ? "w-6 bg-white" :
                      i + 1 < step ? "w-2 bg-zinc-500" :
                      "w-2 bg-zinc-800"
                    }`}
                  />
                ))}
              </div>

              {step < 8 ? (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150"
                  data-testid="ob-next-btn"
                >
                  {step === 7 ? "Review" : "Next"} <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2 text-sm bg-white text-black font-semibold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                  data-testid="ob-submit-btn"
                >
                  {submitting ? "Creating client..." : "Complete Onboarding"}
                  {!submitting && <Check size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
