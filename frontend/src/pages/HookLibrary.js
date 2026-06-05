import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, Inbox, Library } from "lucide-react";
import HookUpload from "../components/hooks/HookUpload";
import HookReviewQueue from "../components/hooks/HookReviewQueue";
import HookLibraryTable from "../components/hooks/HookLibraryTable";

const TABS = [
  { value: "upload", label: "Bulk Upload", icon: Upload },
  { value: "review", label: "Review Queue", icon: Inbox },
  { value: "library", label: "Library", icon: Library },
];

export default function HookLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "upload";
  const setTab = (t) => setSearchParams({ tab: t });

  // Bump a key on the review/library tabs after an upload batch so they refetch
  // when next viewed.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="hook-library">
      {/* Page header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="font-sans text-xl font-black tracking-tight" data-testid="hook-library-heading">
          HOOK LIBRARY
        </h1>
        <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
          Viral first-slide patterns — upload, curate, and browse the retrieval library
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
      {activeTab === "upload" && (
        <HookUpload onBatchDone={() => setRefreshKey((k) => k + 1)} />
      )}
      {activeTab === "review" && <HookReviewQueue key={`review-${refreshKey}`} />}
      {activeTab === "library" && <HookLibraryTable key={`library-${refreshKey}`} />}
    </div>
  );
}
