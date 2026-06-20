import { pipelineBadge } from "./pipelineBadge";

test("none status renders an em dash, no subtext", () => {
  const b = pipelineBadge("none", null);
  expect(b.label).toBe("—");
  expect(b.sub).toBe("—");
});

test("error status is labelled ERROR with no next-run subtext", () => {
  const b = pipelineBadge("error", null);
  expect(b.label).toBe("ERROR");
  expect(b.color).toMatch(/red/);
  expect(b.sub).toBe("—");
});

test("active status with a future next run shows a relative 'in ...' subtext", () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const b = pipelineBadge("active", future);
  expect(b.label).toBe("ACTIVE");
  expect(b.sub.startsWith("in ")).toBe(true);
});

test("active status without a next run shows an em dash", () => {
  expect(pipelineBadge("active", null).sub).toBe("—");
});

test("unknown status falls back to none styling", () => {
  expect(pipelineBadge("bogus", null).label).toBe("—");
});
