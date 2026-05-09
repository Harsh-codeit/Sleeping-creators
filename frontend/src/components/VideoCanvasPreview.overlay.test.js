import { render, screen } from "@testing-library/react";
import VideoCanvasPreview from "./VideoCanvasPreview";

// JSDOM reports clientWidth=0 for all elements; give containers a fake width
// so the dims.w > 0 guard inside the component lets overlays render.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() { return 300; },
  });
});

afterEach(() => {
  delete HTMLElement.prototype.clientWidth;
});

const baseTemplate = {
  cta_button_text: "Go",
  cta_button_bg_color: "#ffffff",
  cta_button_text_color: "#000000",
  cta_button_size: "M",
  cta_button_arrow: false,
  cta_button_x_ratio: 0.5,
  cta_button_y_ratio: 0.88,
  cta_button_border_radius: 12,
  cta_animation: "fade",
  cta_delay: 0,
  overlay_style: "color_tint",
  overlay_color: "#ff0000",
  overlay_opacity: 0.4,
  font_preset: "elegant_serif",
};

test("renders overlay layer element", () => {
  render(<VideoCanvasPreview template={baseTemplate} />);
  expect(document.querySelector("[data-overlay]")).toBeInTheDocument();
});

test("overlay layer has correct rgba background for color_tint", () => {
  render(<VideoCanvasPreview template={baseTemplate} />);
  const el = document.querySelector("[data-overlay]");
  expect(el.style.background).toMatch(/rgba\(255,\s*0,\s*0/);
});

test("button uses cta_button_border_radius from template", () => {
  render(<VideoCanvasPreview template={baseTemplate} />);
  const btn = screen.getByText("Go");
  expect(btn.style.borderRadius).toBe("12px");
});
