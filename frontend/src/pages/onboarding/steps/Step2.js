import { useState } from "react";
import {
  Label,
  Input,
  Textarea,
  SubsectionHeader,
  YesNoToggle,
  MultiCheckbox,
  CappedMultiInput,
  LongTextarea,
} from "../primitives";

/**
 * Step 2 — Story, Brand & Audience
 * 4 sub-sections, 18 fields.
 * Contract: ({ form, set }) where set is (key, value) => void.
 */
export default function Step2({ form, set }) {
  const [dailyParts, setDailyParts] = useState(() => {
    const parts = (form.daily_life || "").split("\n");
    return [parts[0] || "", parts[1] || "", parts[2] || "", parts[3] || ""];
  });

  const updateDailyLife = (idx, val) => {
    const next = [...dailyParts];
    next[idx] = val;
    setDailyParts(next);
    set("daily_life", next.join("\n"));
  };

  return (
    <div className="space-y-8">
      {/* ── 2A — Your Story & Business ───────────────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader id="2A" label="Your Story & Business" />

        <LongTextarea
          label="Tell us your personal story"
          value={form.personal_story ?? ""}
          onChange={(v) => set("personal_story", v)}
          minWords={500}
          rows={8}
          testid="ob-personal-story"
          placeholder="When did you start? Why? What failures? Achievements? Family/childhood? Your vision. Be real — this becomes content."
        />

        <LongTextarea
          label="Tell us about your business"
          value={form.business_description ?? ""}
          onChange={(v) => set("business_description", v)}
          minWords={300}
          rows={6}
          testid="ob-business"
          placeholder="What do you do? How do you help people? What's your process or system and vision?"
        />

        <div>
          <Label>One-Line Niche Statement</Label>
          <Input
            testid="ob-niche"
            value={form.niche ?? ""}
            onChange={(e) => set("niche", e.target.value)}
            placeholder="One-line niche statement: 'I help busy moms lose 10kg without a gym'"
          />
        </div>

        <div>
          <Label>Describe your daily life right now</Label>
          <div className="space-y-2">
            {[
              { label: "Morning routine", idx: 0, placeholder: "6am — wake up, gym, coffee…" },
              { label: "Afternoon",       idx: 1, placeholder: "Calls, client work, lunch…" },
              { label: "Evening",         idx: 2, placeholder: "Dinner, family time, wind down…" },
              { label: "Lifestyle",       idx: 3, placeholder: "Hobbies, passions, anything extra…" },
            ].map(({ label, idx, placeholder }) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-600 w-28 flex-shrink-0">{label}</span>
                <input
                  data-testid={`ob-daily-life-${idx}`}
                  value={dailyParts[idx]}
                  onChange={(e) => updateDailyLife(idx, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2B — Your Audience ───────────────────────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader id="2B" label="Your Audience" />

        <div>
          <Label>Who is your Target Audience?</Label>
          <Textarea
            testid="ob-target-audience"
            rows={3}
            value={form.target_audience_description ?? ""}
            onChange={(e) => set("target_audience_description", e.target.value)}
            placeholder="Working professionals aged 28-40 who want to build a personal brand"
          />
        </div>

        <div>
          <Label>Audience Age Range</Label>
          <Input
            testid="ob-age-range"
            value={form.audience_age_range ?? ""}
            onChange={(e) => set("audience_age_range", e.target.value)}
            placeholder="25-40 years"
          />
        </div>

        <MultiCheckbox
          label="Audience Emotional State"
          options={[
            "Ambitious",
            "Stressed",
            "Confused",
            "Motivated",
            "Depressed",
            "Directionless",
            "Lonely",
          ]}
          values={form.audience_emotional_state ?? []}
          onChange={(v) => set("audience_emotional_state", v)}
          testid="ob-emotional"
          columns={4}
        />
      </section>

      {/* ── 2C — Deep Audience Intelligence ──────────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader
          id="2C"
          label="Deep Audience Intelligence"
          hint="5 items each — the more specific, the better."
        />

        <CappedMultiInput
          label="5 Solutions You Provide"
          values={form.solutions_provided ?? []}
          onChange={(v) => set("solutions_provided", v)}
          cap={5}
          placeholder="What problems do you actually solve?"
          testid="ob-solutions"
        />

        <CappedMultiInput
          label="5 Problems Your Audience Faces"
          values={form.audience_problems ?? []}
          onChange={(v) => set("audience_problems", v)}
          cap={5}
          placeholder="What keeps them up at night?"
          testid="ob-problems"
        />

        <CappedMultiInput
          label="5 Desires / Dream Outcomes"
          values={form.audience_desires ?? []}
          onChange={(v) => set("audience_desires", v)}
          cap={5}
          placeholder="What do they secretly wish for?"
          testid="ob-desires"
        />

        <CappedMultiInput
          label="5 Myths Your Audience Believes"
          values={form.audience_myths ?? []}
          onChange={(v) => set("audience_myths", v)}
          cap={5}
          placeholder="e.g. You need 10k followers before making money"
          testid="ob-myths"
        />

        <CappedMultiInput
          label="5 Things They Tried That Didn't Work"
          values={form.audience_failed_attempts ?? []}
          onChange={(v) => set("audience_failed_attempts", v)}
          cap={5}
          placeholder="What failed solutions have they already tried?"
          testid="ob-failed-attempts"
        />

        <CappedMultiInput
          label="5 Unique Selling Points (USPs)"
          values={form.unique_selling_points ?? []}
          onChange={(v) => set("unique_selling_points", v)}
          cap={5}
          placeholder="What makes YOU different?"
          testid="ob-usps"
        />

        <CappedMultiInput
          label="5 Most Frequently Asked Questions"
          values={form.frequent_questions ?? []}
          onChange={(v) => set("frequent_questions", v)}
          cap={5}
          placeholder="In DMs, calls, real life — what do they ask?"
          testid="ob-faqs"
        />

        <CappedMultiInput
          label="5 Topics You Love To Talk About"
          values={form.love_topics ?? []}
          onChange={(v) => set("love_topics", v)}
          cap={5}
          placeholder="e.g. sales, cold call, closing, onboarding"
          testid="ob-love-topics"
        />
      </section>

      {/* ── 2D — Case Studies & Social Proof ─────────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader id="2D" label="Case Studies & Social Proof" />

        <YesNoToggle
          label="Do you have client case studies or results?"
          value={form.has_case_studies ?? false}
          onChange={(v) => set("has_case_studies", v)}
          testid="ob-has-case"
        />

        {form.has_case_studies === true && (
          <>
            <div>
              <Label>Case Study 1</Label>
              <Textarea
                testid="ob-case-1"
                rows={4}
                value={form.case_study_1 ?? ""}
                onChange={(e) => set("case_study_1", e.target.value)}
                placeholder="Case Study 1: Client situation → Problem → Result you got them"
              />
            </div>

            <div>
              <Label>Case Study 2</Label>
              <Textarea
                testid="ob-case-2"
                rows={4}
                value={form.case_study_2 ?? ""}
                onChange={(e) => set("case_study_2", e.target.value)}
                placeholder="Case Study 2: Client situation → Problem → Result you got them"
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
