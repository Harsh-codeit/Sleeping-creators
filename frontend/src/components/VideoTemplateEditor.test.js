import { render, screen } from "@testing-library/react";
import VideoTemplateEditor from "./VideoTemplateEditor";

// VideoCanvasPreview uses ResizeObserver and canvas APIs not available in jsdom
jest.mock("./VideoCanvasPreview", () => () => <div data-testid="canvas-preview" />);

const noop = () => {};

test("renders template name field", () => {
  render(<VideoTemplateEditor clientId="c1" onSaved={noop} onCancel={noop} />);
  expect(screen.getByPlaceholderText(/CTA Slide Up/i)).toBeInTheDocument();
});

test("renders Overlay Style section", () => {
  render(<VideoTemplateEditor clientId="c1" onSaved={noop} onCancel={noop} />);
  expect(screen.getByText("Overlay Style")).toBeInTheDocument();
});

test("renders Font section", () => {
  render(<VideoTemplateEditor clientId="c1" onSaved={noop} onCancel={noop} />);
  expect(screen.getByText("Font Preset")).toBeInTheDocument();
});

test("renders Mood Tags section", () => {
  render(<VideoTemplateEditor clientId="c1" onSaved={noop} onCancel={noop} />);
  expect(screen.getByText("Mood Tags")).toBeInTheDocument();
});

test("renders CTA Shadow switch", () => {
  render(<VideoTemplateEditor clientId="c1" onSaved={noop} onCancel={noop} />);
  expect(screen.getByText(/Button Shadow/i)).toBeInTheDocument();
});
