import { render, screen } from "@testing-library/react";
import { VideoField } from "./VideoField";

test("renders label and children", () => {
  render(<VideoField label="Overlay Style"><input data-testid="child" /></VideoField>);
  expect(screen.getByText("Overlay Style")).toBeInTheDocument();
  expect(screen.getByTestId("child")).toBeInTheDocument();
});
