import { render, screen, fireEvent } from "@testing-library/react";
import { FontPicker } from "./FontPicker";

test("renders 4 font options", () => {
  render(<FontPicker value="bold_sans" onChange={() => {}} />);
  ["Bold Sans", "Serif", "Handwritten", "Display"].forEach((t) => {
    expect(screen.getByText(t)).toBeInTheDocument();
  });
});

test("calls onChange with preset key", () => {
  const onChange = jest.fn();
  render(<FontPicker value="bold_sans" onChange={onChange} />);
  fireEvent.click(screen.getByText("Serif"));
  expect(onChange).toHaveBeenCalledWith("elegant_serif");
});

test("selected preset has border-white class", () => {
  render(<FontPicker value="elegant_serif" onChange={() => {}} />);
  expect(screen.getByText("Serif").closest("button").className).toMatch(/border-white/);
});
