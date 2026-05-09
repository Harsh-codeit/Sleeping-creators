import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayPicker } from "./OverlayPicker";

test("renders all 6 overlay options", () => {
  render(<OverlayPicker value="none" onChange={() => {}} />);
  ["None", "Gradient", "Tint", "Lower Thirds", "Geometric", "Blur"].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

test("calls onChange with correct value on click", () => {
  const onChange = jest.fn();
  render(<OverlayPicker value="none" onChange={onChange} />);
  fireEvent.click(screen.getByText("Gradient"));
  expect(onChange).toHaveBeenCalledWith("gradient_wash");
});

test("selected swatch has ring style", () => {
  render(<OverlayPicker value="blur" onChange={() => {}} />);
  expect(screen.getByText("Blur").closest("button").className).toMatch(/ring/);
});
