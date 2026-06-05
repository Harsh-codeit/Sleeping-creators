import { useEffect, useState } from "react";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/*
 * Canonical niche list. Single source of truth = GET /api/taxonomy/niches
 *   → { niches: [{ value: "<slug>", label: "<label>" }, ...] }  (includes "other").
 *
 * The list is fetched once and cached at module scope (shared across every
 * NicheSelect instance — onboarding + client profile — so it isn't re-fetched
 * per mount). The in-flight promise is cached too, so concurrent mounts share
 * a single request.
 */
let _nichesCache = null; // resolved list once loaded
let _nichesPromise = null; // in-flight request (dedupes concurrent fetches)

function fetchNiches() {
  if (_nichesCache) return Promise.resolve(_nichesCache);
  if (_nichesPromise) return _nichesPromise;
  _nichesPromise = axios
    .get(`${API}/taxonomy/niches`)
    .then((res) => {
      const list = Array.isArray(res.data?.niches) ? res.data.niches : [];
      _nichesCache = list;
      return list;
    })
    .catch(() => {
      // Fail soft: never block the form on a taxonomy fetch error.
      _nichesPromise = null;
      return [];
    });
  return _nichesPromise;
}

const triggerClass =
  "w-full bg-zinc-950 border border-zinc-700 rounded-none px-3 py-2.5 h-auto text-sm text-white focus:outline-none focus:ring-0 focus:border-zinc-400 data-[placeholder]:text-zinc-600 transition-colors duration-150";
const contentClass =
  "bg-zinc-950 border border-zinc-700 text-white rounded-none";
const itemClass =
  "text-sm text-zinc-300 focus:bg-zinc-800 focus:text-white data-[state=checked]:text-white rounded-none cursor-pointer";

/**
 * Reusable niche dropdown bound to the canonical taxonomy.
 *
 * Stores the canonical slug (`value`) into the form, renders the human label.
 *
 * Back-compat: a pre-migration client may hold a free-text niche that isn't a
 * slug in the list. We surface that raw value as the current selection (its own
 * synthetic option labelled with the raw text) so the control shows what's
 * stored and the form never breaks. Picking any real option replaces it.
 *
 * @param {string}   value      Current niche value (slug, or legacy free text).
 * @param {Function} onChange   (slug: string) => void
 * @param {string}   placeholder
 * @param {string}   testid     data-testid for the trigger.
 */
export default function NicheSelect({ value, onChange, placeholder = "Select a niche…", testid }) {
  const [niches, setNiches] = useState(_nichesCache || []);
  const [loaded, setLoaded] = useState(Boolean(_nichesCache));

  useEffect(() => {
    let active = true;
    fetchNiches().then((list) => {
      if (!active) return;
      setNiches(list);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const current = value ?? "";
  const known = niches.some((n) => n.value === current);

  // Legacy / unknown value: show it as its own option so the selection renders.
  // Only inject once the list has loaded — otherwise a known slug would briefly
  // look "unknown" while the fetch is in flight.
  const showRawFallback = loaded && current !== "" && !known;

  return (
    <Select value={current || undefined} onValueChange={onChange}>
      <SelectTrigger className={triggerClass} data-testid={testid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClass}>
        {showRawFallback && (
          <SelectItem className={itemClass} value={current}>
            {current} (current)
          </SelectItem>
        )}
        {niches.map((n) => (
          <SelectItem key={n.value} className={itemClass} value={n.value}>
            {n.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
