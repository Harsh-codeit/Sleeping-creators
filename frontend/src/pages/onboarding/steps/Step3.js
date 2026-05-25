import {
  Label,
  Textarea,
  SubsectionHeader,
  MultiCheckbox,
} from "../primitives";

const NOT_TO_DO_PROMPTS = [
  "I will never post about",
  "I refuse to",
  "I won't create content that",
  "I avoid",
  "I don't do",
];

const LANGUAGE_OPTIONS = [
  // Indian
  "English", "Hindi", "Hinglish", "Punjabi", "Bengali",
  "Tamil", "Telugu", "Kannada", "Marathi", "Urdu",
  "Gujarati", "Malayalam", "Odia", "Assamese", "Maithili",
  "Santali", "Kashmiri", "Nepali", "Sindhi", "Konkani",
  "Dogri", "Manipuri", "Bodo",
  // Global
  "Arabic", "Chinese (Simplified)", "Chinese (Traditional)",
  "French", "German", "Spanish", "Portuguese", "Italian",
  "Russian", "Japanese", "Korean", "Turkish", "Dutch",
  "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
  "Greek", "Hebrew", "Thai", "Vietnamese", "Indonesian",
  "Malay", "Swahili", "Persian (Farsi)",
  "Other",
];

export default function Step3({ form, set }) {
  return (
    <div className="space-y-8">
      {/* ── 3A — Content Positioning ────────────────────────────────── */}
      <div>
        <SubsectionHeader id="3A" label="Content Positioning" />

        <div className="space-y-4">
          <div>
            <Label>The ONE topic your account should be known for</Label>
            <Textarea
              testid="ob-signature-topic"
              rows={2}
              value={form.signature_topic ?? ""}
              onChange={(e) => set("signature_topic", e.target.value)}
              placeholder="If people had to describe your account in one line — what would it be?"
            />
          </div>

          <MultiCheckbox
            label="Brand / Writing Vibe"
            options={[
              "Professional",
              "Rude/Bold",
              "Funny",
              "Inspirational",
              "Creative",
              "Straight-talking",
              "Funky",
            ]}
            values={form.brand_vibe ?? []}
            onChange={(v) => set("brand_vibe", v)}
            testid="ob-vibe"
            columns={4}
          />

          <div>
            <Label>Language of Content</Label>
            <select
              data-testid="ob-lang"
              value={Array.isArray(form.language) ? (form.language[0] ?? "") : (form.language ?? "")}
              onChange={(e) => set("language", e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-400 transition-colors duration-150"
            >
              <option value="" disabled>Select a language</option>
              {LANGUAGE_OPTIONS.map(opt => (
                <option key={opt} value={opt} className="bg-zinc-950">{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 3B — Competitive Landscape ──────────────────────────────── */}
      <div>
        <SubsectionHeader id="3B" label="Competitive Landscape" />

        <div className="space-y-4">
          <div>
            <Label>Topics from other creators that are working really well</Label>
            <Textarea
              testid="ob-niche-working"
              rows={3}
              value={form.niche_working_topics ?? ""}
              onChange={(e) => set("niche_working_topics", e.target.value)}
              placeholder="Which type of topics/reels in your niche are getting views, saves, shares right now?"
            />
          </div>

          <div>
            <Label>Topics in your niche that are OVER-SATURATED</Label>
            <Textarea
              testid="ob-niche-oversaturated"
              rows={3}
              value={form.niche_oversaturated_topics ?? ""}
              onChange={(e) => set("niche_oversaturated_topics", e.target.value)}
              placeholder="What is everyone posting that people are sick of seeing?"
            />
          </div>

          <div>
            <Label>Topics in your niche that are UNDER-SERVED</Label>
            <Textarea
              testid="ob-niche-underserved"
              rows={3}
              value={form.niche_underserved_topics ?? ""}
              onChange={(e) => set("niche_underserved_topics", e.target.value)}
              placeholder="What gaps do you see? What is nobody talking about that your audience needs?"
            />
          </div>
        </div>
      </div>

      {/* ── 3C — Top 8 Competitor / Niche Accounts ─────────────────── */}
      <div>
        <SubsectionHeader
          id="3C"
          label="Top 8 Competitor Accounts"
          hint="Pick accounts posting daily and getting good reach."
        />

        <div className="space-y-4">
          <CappedMultiInput
            label="8 Best Active Accounts in Your Niche"
            values={form.competitor_accounts ?? []}
            onChange={(v) => set("competitor_accounts", v)}
            cap={8}
            placeholder="@username"
            testid="ob-competitors"
          />
        </div>
      </div>

      {/* ── 3D — Content Boundaries ─────────────────────────────────── */}
      <div>
        <SubsectionHeader id="3D" label="Content Boundaries" />

        <div className="space-y-4">
          <div>
            <Label>Content on social media you personally dislike</Label>
            <Textarea
              testid="ob-disliked-content"
              rows={3}
              value={form.disliked_content ?? ""}
              onChange={(e) => set("disliked_content", e.target.value)}
              placeholder="What formats, tones, or topics do you NOT want us to create?"
            />
          </div>

          <div>
            <Label optional>Topics to AVOID totally</Label>
            <div className="space-y-2">
              {NOT_TO_DO_PROMPTS.map((prompt, idx) => {
                const list = Array.isArray(form.not_to_do_list) ? form.not_to_do_list : [];
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500 w-52 flex-shrink-0">{prompt}</span>
                    <input
                      data-testid={`ob-avoid-${idx}`}
                      value={list[idx] ?? ""}
                      onChange={(e) => {
                        const next = Array(5).fill("").map((_, i) => list[i] ?? "");
                        next[idx] = e.target.value;
                        set("not_to_do_list", next);
                      }}
                      placeholder="…"
                      className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
