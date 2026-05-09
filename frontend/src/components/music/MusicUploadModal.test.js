import { render, screen } from "@testing-library/react";
import { MusicUploadModal } from "./MusicUploadModal";

test("renders upload form fields", () => {
  render(<MusicUploadModal open={true} onClose={() => {}} onUploaded={() => {}} />);
  expect(screen.getByPlaceholderText(/track name/i)).toBeInTheDocument();
  expect(screen.getByText(/upload track/i)).toBeInTheDocument();
});

test("does not render when open=false", () => {
  render(<MusicUploadModal open={false} onClose={() => {}} onUploaded={() => {}} />);
  expect(screen.queryByText(/upload track/i)).not.toBeInTheDocument();
});
