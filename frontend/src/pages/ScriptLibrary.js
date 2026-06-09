import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, Video, Library } from "lucide-react";
import ScriptIngest from "../components/scripts/ScriptIngest";
import ScriptTranscribe from "../components/scripts/ScriptTranscribe";
import ScriptLibraryTable from "../components/scripts/ScriptLibraryTable";

const TABS = [
  { value: "upload", label: "Upload Script", icon: Upload },
  { value: "transcribe", label: "Transcribe Reel", icon: Video },
  { value: "library", label: "Library", icon: Library },
];

export default function ScriptLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "upload";
  const setTab = (t) => setSearchParams({ tab: t });
  const [refreshKey, setRefreshKey] = useState(0);

  function onDone() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Page header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="font-sans text-xl font-black tracking-tight">SCRIPT LIBRARY</h1>
        <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
          Winning scripts and reel transcripts — uploaded examples are injected into AI generation prompts
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6 flex gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
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
      {activeTab === "upload" && <ScriptIngest onDone={onDone} />}
      {activeTab === "transcribe" && <ScriptTranscribe onDone={onDone} />}
      {activeTab === "library" && <ScriptLibraryTable refreshKey={refreshKey} />}
    </div>
  );
}
