import { resolveInitialTab } from "./initialTab";

const TABS = ["Overview", "Strategy", "Pipeline", "Posts"];

test("returns the matching tab by exact name", () => {
  expect(resolveInitialTab("Pipeline", TABS)).toBe("Pipeline");
});

test("matches case-insensitively", () => {
  expect(resolveInitialTab("pipeline", TABS)).toBe("Pipeline");
});

test("missing param falls back to Overview", () => {
  expect(resolveInitialTab(null, TABS)).toBe("Overview");
});

test("unknown param falls back to Overview", () => {
  expect(resolveInitialTab("bogus", TABS)).toBe("Overview");
});

test("custom fallback is honoured", () => {
  expect(resolveInitialTab(null, TABS, "Posts")).toBe("Posts");
});
