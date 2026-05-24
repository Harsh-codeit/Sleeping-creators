import {
  Label,
  Input,
  SubsectionHeader,
} from "../primitives";

/**
 * Step 4 — Goals & CTA
 * Contract: ({ form, set }) where set is (key, value) => void.
 */
export default function Step4({ form, set }) {
  const goals = [
    { value: "leads", label: "Get More Leads", desc: "Generate inbound DMs and inquiries" },
    { value: "reach", label: "Grow Reach & Awareness", desc: "Maximize impressions and shares" },
    { value: "followers", label: "Grow Followers", desc: "Build a larger audience over time" },
  ];

  const nextSteps = [
    { value: "dm", label: "DM you", desc: "Start a conversation in DMs" },
    { value: "link", label: "Click a link", desc: "Visit a landing page" },
    { value: "call", label: "Book a call", desc: "Schedule a meeting" },
    { value: "enrol", label: "Enrol directly", desc: "Sign up for an offer" },
    { value: "other", label: "Other", desc: "Something else" },
  ];

  const selectedGoal = form.account_goals ?? "followers";
  const selectedNext = form.next_step_after_view ?? "";

  return (
    <div className="space-y-8">
      {/* ── 4A — Your Primary Goal from Instagram ────────────────── */}
      <section className="space-y-4">
        <SubsectionHeader id="4A" label="Your Primary Goal" />

        <div>
          <Label>What's your primary goal?</Label>
          <div className="grid grid-cols-3 gap-2">
            {goals.map((opt) => {
              const selected = selectedGoal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`ob-account-goal-${opt.value}`}
                  onClick={() => set("account_goals", opt.value)}
                  className={`p-3 border text-left transition-all duration-150 ${
                    selected
                      ? "border-white bg-white/5"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <div className="text-xs font-semibold text-white">{opt.label}</div>
                  <div className="mt-1 text-[10px] font-mono text-zinc-500 leading-snug">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>What should viewers do next?</Label>
          <div className="grid grid-cols-5 gap-2">
            {nextSteps.map((opt) => {
              const selected = selectedNext === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`ob-next-step-${opt.value}`}
                  onClick={() => set("next_step_after_view", opt.value)}
                  className={`p-3 border text-left transition-all duration-150 ${
                    selected
                      ? "border-white bg-white/5"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <div className="text-xs font-semibold text-white">{opt.label}</div>
                  <div className="mt-1 text-[10px] font-mono text-zinc-500 leading-snug">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 4B — Call to Action ──────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <Label>Website or Landing Page URL</Label>
          <Input
            type="url"
            testid="ob-cta-link"
            value={form.cta_link ?? ""}
            onChange={(e) => set("cta_link", e.target.value)}
            placeholder="https://yourdomain.com/book-demo"
          />
        </div>
      </section>

      {/* ── 4D — Instagram Access (info card, no fields) ─────────── */}
      <section className="space-y-3">
        <SubsectionHeader id="4D" label="Instagram Access (Final Step)" />

        <div className="bg-emerald-950/30 border border-emerald-800/40 p-4">
          <div className="text-xs font-mono text-emerald-300 mb-2">
            📲 How to Give Instagram Access
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-2">
            You will give us access to post and manage messages on your account.
          </p>
          <p className="text-xs text-zinc-400 mb-2">Here's how:</p>
          <ol className="text-xs text-zinc-300 space-y-1 list-decimal list-inside">
            <li>Check your email — we'll send you an access invite</li>
            <li>Click the link → Login to your Instagram</li>
            <li>Click 'Give Access' → Done!</li>
          </ol>
        </div>

        <div className="bg-amber-950/30 border border-amber-800/40 p-3 text-amber-300/80">
          <p className="text-xs leading-relaxed">
            ⚠ Note: You are giving access for posts and messages ONLY. We will
            never change your password.
          </p>
        </div>
      </section>

    </div>
  );
}
