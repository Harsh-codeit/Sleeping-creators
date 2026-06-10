import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, Inbox, Library, FileUp, Video, ScrollText, Wand2 } from "lucide-react";
import HookUpload from "../components/hooks/HookUpload";
import HookReviewQueue from "../components/hooks/HookReviewQueue";
import HookLibraryTable from "../components/hooks/HookLibraryTable";
import GenerationPlayground from "../components/hooks/GenerationPlayground";
import ScriptIngest from "../components/scripts/ScriptIngest";
import ScriptTranscribe from "../components/scripts/ScriptTranscribe";
import ScriptLibraryTable from "../components/scripts/ScriptLibraryTable";

const TABS = [
  { value: "generate",         label: "Generation",       icon: Wand2 },
  { value: "upload",           label: "Bulk Upload",      icon: Upload },
  { value: "review",           label: "Review Queue",     icon: Inbox },
  { value: "library",          label: "Hook Library",     icon: Library },
  { value: "script-upload",    label: "Upload Script",    icon: FileUp },
  { value: "script-transcribe",label: "Transcribe Reel",  icon: Video },
  { value: "script-library",   label: "Script Library",   icon: ScrollText },
];

export default function HookLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "upload";
  const setTab = (t) => setSearchParams({ tab: t });

  const [refreshKey, setRefreshKey] = useState(0);
  const [scriptRefreshKey, setScriptRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="hook-library">
      {/* Page header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="font-sans text-xl font-black tracking-tight" data-testid="hook-library-heading">
          HOOK LIBRARY
        </h1>
        <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
          Viral hooks and winning scripts — upload, curate, and browse the retrieval library
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6 flex gap-1 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              data-testid={`hook-tab-${t.value}`}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-mono uppercase tracking-widest border-b-2 -mb-px transition-colors duration-150 cursor-pointer ${
                active
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "generate" && <GenerationPlayground />}
      {activeTab === "upload" && (
        <HookUpload onBatchDone={() => setRefreshKey((k) => k + 1)} />
      )}
      {activeTab === "review" && <HookReviewQueue key={`review-${refreshKey}`} />}
      {activeTab === "library" && <HookLibraryTable key={`library-${refreshKey}`} />}
      {activeTab === "script-upload" && <ScriptIngest onDone={() => setScriptRefreshKey((k) => k + 1)} />}
      {activeTab === "script-transcribe" && <ScriptTranscribe onDone={() => setScriptRefreshKey((k) => k + 1)} />}
      {activeTab === "script-library" && <ScriptLibraryTable refreshKey={scriptRefreshKey} />}
    </div>
  );
}
