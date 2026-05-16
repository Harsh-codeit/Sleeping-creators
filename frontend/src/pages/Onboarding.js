import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Check, ChevronRight, ChevronLeft, X, Zap,
  User, BookOpen, Compass, Target
} from "lucide-react";

import Step1 from "./onboarding/steps/Step1";
import Step2 from "./onboarding/steps/Step2";
import Step3 from "./onboarding/steps/Step3";
import Step4 from "./onboarding/steps/Step4";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEPS = [
  { id: 1, label: "Basic Info",       icon: User,     desc: "Identity & access" },
  { id: 2, label: "Story & Audience", icon: BookOpen, desc: "Personal story & audience intel" },
  { id: 3, label: "Content Strategy", icon: Compass,  desc: "Vibe, niche & competitors" },
  { id: 4, label: "Goals & Funnel",   icon: Target,   desc: "CTA, lead magnet & platforms" },
];

const INITIAL = {
  // — Step 1A: Personal & Contact —
  name: "", brand_name: "", email: "", whatsapp: "", city_country: "",
  // — Step 1B: Social & Online —
  instagram_handle: "", instagram_profile_url: "", instagram_access_link: "",
  website_url: "", linkedin_url: "", youtube_url: "", twitter_url: "",
  pr_links: [""],
  // — Step 1C: Assets (Drive links) —
  profile_photo_link: "", logo_link: "",
  google_drive_images: "", google_drive_videos: "",
  // — Step 1D: Account Health —
  account_suspended: false, paid_ads_run: false,
  // — Step 2A: Story & Business —
  personal_story: "", business_description: "", niche: "", daily_life: "",
  // — Step 2B: Audience —
  target_audience_description: "", audience_age_range: "", audience_emotional_state: [],
  // — Step 2C: Deep Audience Intelligence (cap 5) —
  solutions_provided: [""], audience_problems: [""], audience_desires: [""],
  audience_myths: [""], audience_failed_attempts: [""], unique_selling_points: [""],
  frequent_questions: [""], love_topics: [""],
  // — Step 2D: Case Studies —
  has_case_studies: false, case_study_1: "", case_study_2: "",
  // — Step 3A: Positioning —
  signature_topic: "", brand_vibe: [], language: ["English"],
  // — Step 3B: Competitive Landscape —
  niche_working_topics: "", niche_oversaturated_topics: "", niche_underserved_topics: "",
  // — Step 3C: Competitors (cap 8) —
  competitor_accounts: [""],
  // — Step 3D: Boundaries —
  disliked_content: "", not_to_do_list: [""],
  // — Step 4A: Goal & Next Step —
  account_goals: "followers", next_step_after_view: "",
  // — Step 4B: Lead Magnet & Funnel —
  lead_magnets: [""], lead_magnet_link: "", cta_link: "",
  // — Platforms (required at submit) —
  platforms: [],
};

// Arrays whose entries can be user-emptied via MultiInput / CappedMultiInput.
// Filtered with .filter(Boolean) before submit. MultiCheckbox arrays
// (audience_emotional_state, brand_vibe, language, platforms) are NOT in this
// list — they only contain explicitly-selected values.
const ARRAY_FIELDS_TO_FILTER = [
  "pr_links", "lead_magnets", "competitor_accounts", "not_to_do_list",
  "solutions_provided", "audience_problems", "audience_desires",
  "audience_myths", "audience_failed_attempts", "unique_selling_points",
  "frequent_questions", "love_topics",
];

/* ── Review Summary ────────────────────────────────────────────── */

function ReviewSection({ title, items }) {
  const filled = items.filter(i => {
    const v = i.value;
    if (Array.isArray(v)) return v.filter(Boolean).length > 0;
    if (typeof v === "boolean") return true;
    return Boolean(v);
  });
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">{title}</div>
      <div className="space-y-1.5">
        {filled.map(i => (
          <div key={i.label} className="flex gap-3">
            <span className="text-[10px] font-mono text-zinc-600 w-40 flex-shrink-0">{i.label}</span>
            <span className="text-xs text-zinc-300 break-words flex-1">
              {Array.isArray(i.value)
                ? i.value.filter(Boolean).join(", ")
                : typeof i.value === "boolean"
                  ? (i.value ? "Yes" : "No")
                  : i.value}
            </span>
          </div>
        ))}
        {filled.length === 0 && (
          <div className="text-[10px] text-zinc-700 font-mono italic">No data provided for this section</div>
        )}
      </div>
    </div>
  );
}

function truncate(s, n = 120) {
  const v = (s || "").trim();
  return v.length > n ? v.slice(0, n) + "…" : v;
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

      <ReviewSection title="Basic Info & Access" items={[
        { label: "Name",            value: form.name },
        { label: "Brand Name",      value: form.brand_name },
        { label: "Email",           value: form.email },
        { label: "WhatsApp",        value: form.whatsapp },
        { label: "City, Country",   value: form.city_country },
        { label: "Instagram",       value: form.instagram_handle ? `@${form.instagram_handle}` : "" },
        { label: "IG Profile URL",  value: form.instagram_profile_url },
        { label: "Website",         value: form.website_url },
        { label: "LinkedIn",        value: form.linkedin_url },
        { label: "YouTube",         value: form.youtube_url },
        { label: "Twitter / X",     value: form.twitter_url },
        { label: "PR / Media",      value: form.pr_links },
        { label: "Profile Photo",   value: form.profile_photo_link },
        { label: "Logo",            value: form.logo_link },
        { label: "Photos (Drive)",  value: form.google_drive_images },
        { label: "Videos (Drive)",  value: form.google_drive_videos },
        { label: "Account Flagged", value: form.account_suspended },
        { label: "Paid Ads Run",    value: form.paid_ads_run },
      ]} />

      <ReviewSection title="Story & Audience" items={[
        { label: "Personal Story",  value: truncate(form.personal_story, 140) },
        { label: "Business",        value: truncate(form.business_description, 140) },
        { label: "Niche",           value: form.niche },
        { label: "Daily Life",      value: truncate(form.daily_life, 100) },
        { label: "Target Audience", value: truncate(form.target_audience_description, 120) },
        { label: "Age Range",       value: form.audience_age_range },
        { label: "Emotional State", value: form.audience_emotional_state },
        { label: "Solutions",       value: form.solutions_provided },
        { label: "Problems",        value: form.audience_problems },
        { label: "Desires",         value: form.audience_desires },
        { label: "Myths",           value: form.audience_myths },
        { label: "Failed Attempts", value: form.audience_failed_attempts },
        { label: "USPs",            value: form.unique_selling_points },
        { label: "FAQs",            value: form.frequent_questions },
        { label: "Love Topics",     value: form.love_topics },
        { label: "Case Study 1",    value: truncate(form.case_study_1, 100) },
        { label: "Case Study 2",    value: truncate(form.case_study_2, 100) },
      ]} />

      <ReviewSection title="Content Strategy" items={[
        { label: "Signature Topic", value: truncate(form.signature_topic, 120) },
        { label: "Brand Vibe",      value: form.brand_vibe },
        { label: "Language",        value: form.language },
        { label: "Working Topics",  value: truncate(form.niche_working_topics, 120) },
        { label: "Oversaturated",   value: truncate(form.niche_oversaturated_topics, 120) },
        { label: "Underserved",     value: truncate(form.niche_underserved_topics, 120) },
        { label: "Competitors",     value: form.competitor_accounts },
        { label: "Disliked",        value: truncate(form.disliked_content, 120) },
        { label: "Topics to Avoid", value: form.not_to_do_list },
      ]} />

      <ReviewSection title="Goals, CTA & Funnel" items={[
        { label: "Primary Goal",    value: form.account_goals },
        { label: "Next Step",       value: form.next_step_after_view },
        { label: "Lead Magnets",    value: form.lead_magnets },
        { label: "Lead Magnet URL", value: form.lead_magnet_link },
        { label: "Landing Page",    value: form.cta_link },
        { label: "Platforms",       value: form.platforms },
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

  const totalSteps = STEPS.length + 1; // 4 steps + Review = 5

  const validateStep = () => {
    if (step === 1 && !form.name.trim()) {
      toast.error("Client name is required");
      return false;
    }
    if (step === STEPS.length && form.platforms.length === 0) {
      toast.error("Select at least one platform before submitting");
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const back = () => setStep(s => Math.max(s - 1, 1));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Client name is required");
    if (form.platforms.length === 0) return toast.error("Select at least one platform");
    setSubmitting(true);
    try {
      const payload = { ...form };
      for (const key of ARRAY_FIELDS_TO_FILTER) {
        if (Array.isArray(payload[key])) {
          payload[key] = payload[key].filter(Boolean);
        }
      }
      await axios.post(`${API}/clients/onboard`, payload);
      toast.success(`${form.name} successfully onboarded!`);
      navigate("/clients");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to submit onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((step - 1) / (totalSteps - 1)) * 100;

  const stepContent = {
    1: <Step1 form={form} set={set} />,
    2: <Step2 form={form} set={set} />,
    3: <Step3 form={form} set={set} />,
    4: <Step4 form={form} set={set} />,
    5: <Review form={form} />,
  };

  const currentStep =
    step <= STEPS.length
      ? STEPS[step - 1]
      : { label: "Review", icon: Check, desc: "Confirm & submit" };
  const Icon = currentStep.icon;
  const isFinalStep = step === totalSteps;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col" data-testid="onboarding-page">
      {/* Top bar */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-white flex items-center justify-center">
            <Zap size={14} className="text-black" />
          </div>
          <div>
            <span className="text-sm font-bold text-white">Sleeping Creators</span>
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
            {STEPS.map((s) => {
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
              isFinalStep ? "bg-white/5 border border-zinc-700" : "border border-transparent"
            }`}>
              <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border text-[10px] font-mono ${
                isFinalStep ? "border-zinc-400 text-zinc-200" : "border-zinc-700 text-zinc-600"
              }`}>
                <Check size={9} />
              </div>
              <div>
                <div className={`text-xs font-semibold ${isFinalStep ? "text-white" : "text-zinc-600"}`}>Review</div>
                <div className={`text-[9px] font-mono ${isFinalStep ? "text-zinc-400" : "text-zinc-700"}`}>Confirm & submit</div>
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

              {!isFinalStep ? (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150"
                  data-testid="ob-next-btn"
                >
                  {step === STEPS.length ? "Review" : "Next"} <ChevronRight size={14} />
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
