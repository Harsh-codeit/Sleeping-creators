import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// The 7 canonical hook types — must match the backend generation taxonomy
// (backend/hook_clients.py HOOK_TYPES).
export const HOOK_TYPES = [
  { value: "credibility_borrow", label: "Credibility Borrow" },
  { value: "myth_bust", label: "Myth Bust" },
  { value: "emotional_state", label: "Emotional State" },
  { value: "relatable_scene", label: "Relatable Scene" },
  { value: "shocking_number", label: "Shocking Number" },
  { value: "direct_confront", label: "Direct Confront" },
  { value: "family_relationship", label: "Family Relationship" },
];

export const HOOK_TYPE_LABEL = HOOK_TYPES.reduce((acc, t) => {
  acc[t.value] = t.label;
  return acc;
}, {});

// Allowed image MIME types + size cap (mirror of the backend ingest gate).
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Shared shadcn Select styling to match NicheSelect / the zinc-mono system.
const triggerClass =
  "w-full bg-zinc-950 border border-zinc-700 rounded-none px-3 py-2 h-auto text-sm text-white focus:outline-none focus:ring-0 focus:border-zinc-400 data-[placeholder]:text-zinc-600 transition-colors duration-150";
const contentClass = "bg-zinc-950 border border-zinc-700 text-white rounded-none";
const itemClass =
  "text-sm text-zinc-300 focus:bg-zinc-800 focus:text-white data-[state=checked]:text-white rounded-none cursor-pointer";

/**
 * Hook-type dropdown bound to the canonical 7-type taxonomy.
 *
 * @param {string}   value       Current hook_type slug.
 * @param {Function} onChange    (slug: string) => void
 * @param {boolean}  includeAll  Render an "All types" option (value "") for filtering.
 * @param {string}   placeholder
 * @param {string}   testid      data-testid for the trigger.
 */
export function HookTypeSelect({
  value,
  onChange,
  includeAll = false,
  placeholder = "Select a hook type…",
  testid,
}) {
  // shadcn Select cannot use "" as an item value; use a sentinel for "all".
  const ALL = "__all__";
  const current = includeAll ? value || ALL : value || undefined;

  const handleChange = (v) => onChange(v === ALL ? "" : v);

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className={triggerClass} data-testid={testid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClass}>
        {includeAll && (
          <SelectItem className={itemClass} value={ALL}>
            All types
          </SelectItem>
        )}
        {HOOK_TYPES.map((t) => (
          <SelectItem key={t.value} className={itemClass} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
