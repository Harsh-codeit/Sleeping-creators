import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import MusicLibraryPage from "./MusicLibraryPage";

jest.mock("axios");
jest.mock("../components/music/MusicTrackCard", () => ({
  MusicTrackCard: ({ track }) => <div data-testid="track-card">{track.name}</div>,
}));
jest.mock("../components/music/MusicUploadModal", () => ({
  MusicUploadModal: ({ open }) => open ? <div data-testid="upload-modal" /> : null,
}));

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [] });
});

test("renders page heading", async () => {
  render(<MusicLibraryPage />);
  expect(screen.getByText("Music Library")).toBeInTheDocument();
});

test("renders Upload Track button", async () => {
  render(<MusicLibraryPage />);
  expect(screen.getByText("Upload Track")).toBeInTheDocument();
});

test("shows empty state when no tracks", async () => {
  render(<MusicLibraryPage />);
  await waitFor(() => expect(screen.getByText(/No tracks/i)).toBeInTheDocument());
});
