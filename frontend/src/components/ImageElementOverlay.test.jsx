import React from "react";
import { render, fireEvent } from "@testing-library/react";
import ImageElementOverlay from "./ImageElementOverlay";

const mockElement = {
  id: "e1", type: "image", drive_source: true,
  x: 0.1, y: 0.1, width: 0.4, height: 0.3,
  rotation: 0, opacity: 1,
};
const mockContainerRef = {
  current: { getBoundingClientRect: () => ({ width: 400, height: 500 }) },
};

test("renders Drive Image placeholder text", () => {
  const { getByText } = render(
    <ImageElementOverlay
      element={mockElement}
      containerRef={mockContainerRef}
      onUpdate={jest.fn()}
      onDelete={jest.fn()}
    />
  );
  expect(getByText("Drive Image")).toBeInTheDocument();
});

test("calls onDelete with element id when delete button is clicked", () => {
  const onDelete = jest.fn();
  const { getByTitle } = render(
    <ImageElementOverlay
      element={mockElement}
      containerRef={mockContainerRef}
      onUpdate={jest.fn()}
      onDelete={onDelete}
    />
  );
  fireEvent.mouseDown(getByTitle("Remove image element"));
  expect(onDelete).toHaveBeenCalledWith("e1");
});

test("positions itself using percentage values from element", () => {
  const { container } = render(
    <ImageElementOverlay
      element={mockElement}
      containerRef={mockContainerRef}
      onUpdate={jest.fn()}
      onDelete={jest.fn()}
    />
  );
  const overlay = container.firstChild;
  expect(overlay.style.left).toBe("10%");
  expect(overlay.style.top).toBe("10%");
  expect(overlay.style.width).toBe("40%");
  expect(overlay.style.height).toBe("30%");
});
