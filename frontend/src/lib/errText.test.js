import { errText, detailToText } from "./errText";

describe("errText / detailToText", () => {
  test("string detail (HTTPException) passes through", () => {
    expect(errText({ response: { data: { detail: "Client name is required" } } }, "fb"))
      .toBe("Client name is required");
  });

  test("FastAPI 422 array detail is flattened to a string (never returns the array)", () => {
    const err = {
      response: {
        data: {
          detail: [
            { type: "value_error", loc: ["body", "niche_slug"], msg: "Value error, niche_slug must be a known niche slug (got '')" },
          ],
        },
      },
    };
    const out = errText(err, "Failed to save profile");
    expect(typeof out).toBe("string");
    expect(out).toContain("niche_slug must be a known niche slug");
  });

  test("multiple 422 errors join with '; '", () => {
    const detail = [{ msg: "field a bad" }, { msg: "field b bad" }];
    expect(detailToText(detail)).toBe("field a bad; field b bad");
  });

  test("object detail with msg is coerced", () => {
    expect(detailToText({ msg: "boom" })).toBe("boom");
  });

  test("missing / unusable detail falls back, always a string", () => {
    expect(errText({}, "Failed to save profile")).toBe("Failed to save profile");
    expect(errText(undefined, "fb")).toBe("fb");
    expect(typeof errText({ response: { data: { detail: [{}] } } }, "fb")).toBe("string");
    expect(errText({ response: { data: { detail: [{}] } } }, "fb")).toBe("fb");
  });
});
