import { render, screen, fireEvent } from "@testing-library/react";
import { ChipGroup } from "./ChipGroup";

test("renders options and fires onChange", () => {
  const onChange = jest.fn();
  render(<ChipGroup options={["a", "b", "c"]} value="a" onChange={onChange} />);
  expect(screen.getByText("a")).toBeInTheDocument();
  fireEvent.click(screen.getByText("b"));
  expect(onChange).toHaveBeenCalledWith("b");
});

test("selected option has bg-white class", () => {
  render(<ChipGroup options={["x", "y"]} value="x" onChange={() => {}} />);
  expect(screen.getByText("x").className).toMatch(/bg-white/);
});
