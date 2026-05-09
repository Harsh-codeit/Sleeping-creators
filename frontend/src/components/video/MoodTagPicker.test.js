import { render, screen, fireEvent } from "@testing-library/react";
import { MoodTagPicker } from "./MoodTagPicker";

test("renders all mood tags", () => {
  render(<MoodTagPicker value={[]} onChange={() => {}} />);
  ["energy", "calm", "power", "inspiring"].forEach((tag) => {
    expect(screen.getByText(tag)).toBeInTheDocument();
  });
});

test("clicking a tag adds it", () => {
  const onChange = jest.fn();
  render(<MoodTagPicker value={[]} onChange={onChange} />);
  fireEvent.click(screen.getByText("energy"));
  expect(onChange).toHaveBeenCalledWith(["energy"]);
});

test("clicking a selected tag removes it", () => {
  const onChange = jest.fn();
  render(<MoodTagPicker value={["energy"]} onChange={onChange} />);
  fireEvent.click(screen.getByText("energy"));
  expect(onChange).toHaveBeenCalledWith([]);
});
