/**
 * Per-step validators for the onboarding wizard.
 * Each validator returns either null (valid) or a string error message
 * identifying the first missing/invalid field for that step.
 *
 * Conventions:
 * - String fields: non-empty after trim
 * - Array fields: at least 1 entry that is itself non-empty (after trim)
 * - Multi-select arrays (chips/checkboxes): at least 1 element
 * - Boolean fields are always considered "answered" (default false = "No")
 * - account_goals has a non-empty default ("followers") → always answered
 */

const isEmptyStr = (v) => !(v && String(v).trim());
const isEmptyArr = (v) => !Array.isArray(v) || v.filter(x => x && String(x).trim()).length === 0;

function checkStrings(form, pairs) {
  for (const [key, label] of pairs) {
    if (isEmptyStr(form[key])) return `${label} is required`;
  }
  return null;
}

function checkArrays(form, pairs) {
  for (const [key, label] of pairs) {
    if (isEmptyArr(form[key])) return `${label} — provide at least one entry`;
  }
  return null;
}

function checkMultiSelects(form, pairs) {
  for (const [key, label] of pairs) {
    if (!Array.isArray(form[key]) || form[key].length === 0) {
      return `${label} — pick at least one option`;
    }
  }
  return null;
}

export function validateStep1(form) {
  const stringErr = checkStrings(form, [
    ["name",                  "Client / full name"],
    ["brand_name",            "Brand name"],
    ["email",                 "Email"],
    ["whatsapp",              "WhatsApp number"],
    ["city_country",          "City & Country"],
    ["instagram_handle",      "Instagram username"],
    ["instagram_profile_url", "Instagram profile URL"],
    ["instagram_password",    "Instagram password"],
    ["website_url",           "Website URL"],
    ["linkedin_url",          "LinkedIn URL"],
    ["youtube_url",           "YouTube URL"],
    ["twitter_url",           "Twitter / X URL"],
    ["profile_photo_link",    "Profile photo Drive link"],
    ["google_drive_images",   "Photos Drive link"],
    ["google_drive_videos",   "Videos Drive link"],
  ]);
  if (stringErr) return stringErr;
  return checkArrays(form, [
    ["pr_links", "PR / Media links"],
  ]);
}

export function validateStep2(form) {
  const stringErr = checkStrings(form, [
    ["personal_story",              "Personal story"],
    ["business_description",        "Business description"],
    ["niche",                       "One-line niche statement"],
    ["daily_life",                  "Daily life description"],
    ["target_audience_description", "Target audience"],
    ["audience_age_range",          "Audience age range"],
  ]);
  if (stringErr) return stringErr;

  const multiErr = checkMultiSelects(form, [
    ["audience_emotional_state", "Audience emotional state"],
  ]);
  if (multiErr) return multiErr;

  const arrErr = checkArrays(form, [
    ["solutions_provided",       "Solutions you provide"],
    ["audience_problems",        "Audience problems"],
    ["audience_desires",         "Audience desires"],
    ["audience_myths",           "Audience myths"],
    ["audience_failed_attempts", "Failed attempts"],
    ["unique_selling_points",    "Unique selling points"],
    ["frequent_questions",       "Frequently asked questions"],
    ["love_topics",              "Topics you love"],
  ]);
  if (arrErr) return arrErr;

  // Conditional: case studies required only when has_case_studies === true
  if (form.has_case_studies === true) {
    const caseErr = checkStrings(form, [
      ["case_study_1", "Case Study 1"],
      ["case_study_2", "Case Study 2"],
    ]);
    if (caseErr) return caseErr;
  }
  return null;
}

export function validateStep3(form) {
  const stringErr = checkStrings(form, [
    ["signature_topic",            "Signature topic"],
    ["niche_working_topics",       "Working topics in your niche"],
    ["niche_oversaturated_topics", "Over-saturated topics"],
    ["niche_underserved_topics",   "Under-served topics"],
    ["disliked_content",           "Content you dislike"],
  ]);
  if (stringErr) return stringErr;

  const multiErr = checkMultiSelects(form, [
    ["brand_vibe", "Brand vibe"],
  ]);
  if (multiErr) return multiErr;

  const langVal = Array.isArray(form.language) ? form.language[0] : form.language;
  if (!langVal || !String(langVal).trim()) return "Content language — please select a language";

  return checkArrays(form, [
    ["competitor_accounts", "Competitor accounts"],
    ["not_to_do_list",      "Topics to avoid"],
  ]);
}

export function validateStep4(form) {
  return checkStrings(form, [
    ["next_step_after_view", "Next step after viewing"],
    ["cta_link",             "Landing page URL"],
  ]);
}

/**
 * Run every step's validator. Returns the first error encountered
 * (with a "[Step N] " prefix), or null if everything is filled.
 * Used by the final submit so users can't slip past a step they
 * already moved through.
 */
export function validateAll(form) {
  const steps = [validateStep1, validateStep2, validateStep3, validateStep4];
  for (let i = 0; i < steps.length; i++) {
    const err = steps[i](form);
    if (err) return `[Step ${i + 1}] ${err}`;
  }
  return null;
}

export const STEP_VALIDATORS = {
  1: validateStep1,
  2: validateStep2,
  3: validateStep3,
  4: validateStep4,
};
