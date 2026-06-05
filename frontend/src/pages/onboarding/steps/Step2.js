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
import NicheSelect from "@/components/NicheSelect";

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

  const parseAgeRange = (str) => {
    const m = /(\d+)[^\d]+(\d+)/.exec(str || "18–35 years");
    return { lo: m ? parseInt(m[1]) : 18, hi: m ? parseInt(m[2]) : 35 };
  };
  const [ageLo, setAgeLo] = useState(() => parseAgeRange(form.audience_age_range).lo);
  const [ageHi, setAgeHi] = useState(() => parseAgeRange(form.audience_age_range).hi);

  const genLabel = (age) => {
    if (age >= 65) return "Boomer";
    if (age >= 45) return "Gen X";
    if (age >= 29) return "Millennial";
    return "Gen Z";
  };

  const handleAgeLo = (v) => {
    const next = Math.min(parseInt(v), ageHi - 1);
    setAgeLo(next);
    set("audience_age_range", `${next}–${ageHi} years`);
  };

  const handleAgeHi = (v) => {
    const next = Math.max(parseInt(v), ageLo + 1);
    setAgeHi(next);
    set("audience_age_range", `${ageLo}–${next} years`);
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
          minWords={200}
          rows={8}
          testid="ob-personal-story"
          placeholder="When did you start? Why? What failures? Achievements? Family/childhood? Your vision. Be real — this becomes content."
        />

        <LongTextarea
          label="Tell us about your business"
          value={form.business_description ?? ""}
          onChange={(v) => set("business_description", v)}
          minWords={100}
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
            placeholder="e.g. D2C skincare for oily Indian skin"
          />
          <p className="text-[10px] font-mono text-zinc-600 mt-1">Be specific — this descriptive line drives how your hooks are written.</p>
        </div>

        <div>
          <Label>Niche category</Label>
          <NicheSelect
            testid="ob-niche-slug"
            value={form.niche_slug ?? ""}
            onChange={(v) => set("niche_slug", v)}
            placeholder="Select your niche category"
          />
          <p className="text-[10px] font-mono text-zinc-600 mt-1">Used to match proven viral hooks from your category</p>
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
          <p className="text-[10px] font-mono text-zinc-600 mb-2">Drag both sliders to set the age range of your target audience</p>
          <div className="space-y-3 pt-1">
            <div className="text-sm font-mono text-white text-center">
              {ageLo} – {ageHi} years
            </div>
            <div className="relative h-6">
              <input
                data-testid="ob-age-lo"
                type="range"
                min={13}
                max={80}
                value={ageLo}
                onChange={(e) => handleAgeLo(e.target.value)}
                className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-600 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-zinc-700"
              />
              <input
                data-testid="ob-age-hi"
                type="range"
                min={13}
                max={80}
                value={ageHi}
                onChange={(e) => handleAgeHi(e.target.value)}
                className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-600 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent"
              />
            </div>
            <div className="flex justify-between">
              <div className="text-center">
                <div className="text-[10px] font-mono text-zinc-500">{ageLo}</div>
                <div className="text-[9px] font-mono text-zinc-600">{genLabel(ageLo)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-mono text-zinc-500">{ageHi}</div>
                <div className="text-[9px] font-mono text-zinc-600">{genLabel(ageHi)}</div>
              </div>
            </div>
          </div>
        </div>

        <MultiCheckbox
          label="Audience Emotional State"
          options={[
            "Ambitious", "Overwhelmed", "Confused", "Motivated",
            "Stuck", "Directionless", "Hopeful", "Frustrated",
            "Burned Out", "Anxious",
          ]}
          values={form.audience_emotional_state ?? []}
          onChange={(v) => set("audience_emotional_state", v)}
          testid="ob-emotional"
          columns={4}
          max={3}
        />
      </section>

      {/* ── 2C — Deep Audience Intelligence ──────────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader
          id="2C"
          label="Deep Audience Intelligence"
          hint="5 items each — the more specific, the better."
        />

        <div>
          <CappedMultiInput
            label="Solutions You Provide"
            values={form.solutions_provided ?? []}
            onChange={(v) => set("solutions_provided", v)}
            cap={10}
            placeholder="What problems do you actually solve?"
            testid="ob-solutions"
          />
          <p className="text-[10px] font-mono text-zinc-600 mt-1.5">Add solutions that are unique to you — the more specific, the better the content output</p>
        </div>

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
