/**
 * Resolve the initial tab from a URL query-param value.
 * Case-insensitive match against `tabs`; falls back to `fallback` when the
 * param is absent or not a known tab. Pure — safe to unit test.
 */
export function resolveInitialTab(param, tabs, fallback = "Overview") {
  if (!param) return fallback;
  const match = tabs.find((t) => t.toLowerCase() === String(param).toLowerCase());
  return match || fallback;
}
