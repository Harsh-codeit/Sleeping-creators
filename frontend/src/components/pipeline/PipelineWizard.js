import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EMPTY_FORM } from "./constants";
import PipelineWizardStep1 from "./PipelineWizardStep1";
import PipelineWizardStep2 from "./PipelineWizardStep2";
import PipelineWizardStep3 from "./PipelineWizardStep3";
import PipelineWizardStepSource from "./PipelineWizardStepSource";

const STEPS_DEFAULT = ["Type", "Content", "Schedule"];
const STEPS_VIDEO   = ["Type", "Media", "Schedule"];

function ProgressBar({ step, steps: STEPS }) {
  return (
    <div className="flex items-center gap-0 px-6 pt-5 pb-3">
      {STEPS.map((label, i) => {
        const isDone = i < step;
        const isActive = i === step;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                isDone
                  ? "bg-white border-white"
                  : isActive
                    ? "border-white bg-transparent"
                    : "border-zinc-700 bg-transparent"
              }`}>
                {isDone
                  ? <Check size={11} className="text-black" />
                  : <span className={`text-[10px] font-mono font-bold ${isActive ? "text-white" : "text-zinc-500"}`}>
                      {i + 1}
                    </span>
                }
              </div>
              <span className={`text-[10px] font-mono mt-1 ${isActive ? "text-white" : isDone ? "text-zinc-400" : "text-zinc-600"}`}>
                {label}
              </span>
            </div>
            {/* Connector (skip after last) */}
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-4 ${i < step ? "bg-white" : "bg-zinc-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PipelineWizard({ open, onClose, onSave, saving, initial, clientId, defaultTopics = "" }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...EMPTY_FORM, platforms: [] });

  // Initialise form whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (initial) {
      setForm({
        ...EMPTY_FORM,
        ...initial,
        carousel_topics: Array.isArray(initial.carousel_topics) ? initial.carousel_topics.join(", ") : (initial.carousel_topics || ""),
        carousel_slide_format: initial.carousel_slide_format || "",
        carousel_slide_count: initial.carousel_slide_count ?? EMPTY_FORM.carousel_slide_count,
        carousel_template: initial.carousel_template ?? EMPTY_FORM.carousel_template,
        specific_times: initial.specific_times || ["09:00"],
        days_between_posts: initial.days_between_posts ?? EMPTY_FORM.days_between_posts,
        post_time: initial.post_time || EMPTY_FORM.post_time,
        video_audio_ids: initial.video_audio_ids || [],
        video_audio_strategy: initial.video_audio_strategy || "rotate",
        cta_keyword: initial.cta_keyword || "",
        cta_offer: initial.cta_offer || "",
        global_instructions: initial.global_instructions || "",
        max_posts_per_day: initial.max_posts_per_day ?? 10,
      });
    } else {
      setForm({ ...EMPTY_FORM, platforms: [], carousel_topics: defaultTopics });
    }
  }, [open, initial, defaultTopics]);

  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const isVideo = form.pipeline_type === "video";
  const STEPS = isVideo ? STEPS_VIDEO : STEPS_DEFAULT;
  const lastStep = STEPS.length - 1;

  // Validation per step
  const canNext = () => {
    if (step === 0) return Boolean(form.pipeline_type) && form.name.trim().length > 0;
    if (isVideo && step === 1) return Boolean(form.video_template_id);
    return true;
  };
  const canSubmit = () => form.platforms.length > 0;

  const handleSubmit = () => {
    const payload = {
      ...form,
      carousel_topics: form.carousel_topics.split(",").map(t => t.trim()).filter(Boolean),
    };
    onSave(payload);
  };

  const previewName = form.name.trim() || "New Pipeline";
  const isEdit = Boolean(initial);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-full p-0 bg-zinc-950 border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <DialogHeader className="border-b border-zinc-800 pb-0">
          <DialogTitle className="px-6 pt-5 pb-0 text-sm font-semibold text-white">
            {previewName}
          </DialogTitle>
          <ProgressBar step={step} steps={STEPS} />
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <PipelineWizardStep1 form={form} onChange={onChange} />}
          {isVideo ? (
            <>
              {step === 1 && (
                <div className="space-y-8">
                  <PipelineWizardStepSource form={form} onChange={onChange} clientId={clientId} />
                  <div className="border-t border-zinc-800 pt-6">
                    <PipelineWizardStep2 form={form} onChange={onChange} clientId={clientId} />
                  </div>
                </div>
              )}
              {step === 2 && <PipelineWizardStep3 form={form} onChange={onChange} />}
            </>
          ) : (
            <>
              {step === 1 && <PipelineWizardStep2 form={form} onChange={onChange} clientId={clientId} />}
              {step === 2 && <PipelineWizardStep3 form={form} onChange={onChange} />}
            </>
          )}
        </div>

        {/* Fixed footer */}
        <div className="border-t border-zinc-800 px-6 py-4 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 text-xs font-mono border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < lastStep ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="px-6 py-2 text-xs font-mono bg-white text-black font-bold hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              data-testid="save-pipeline-btn"
              onClick={handleSubmit}
              disabled={saving || !canSubmit()}
              className="px-6 py-2 text-xs font-mono bg-white text-black font-bold hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : isEdit ? "Update Pipeline" : "Create Pipeline"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
