import { render, screen, fireEvent } from "@testing-library/react";
import { MusicTrackCard } from "./MusicTrackCard";

jest.mock("./WaveformEditor", () => () => <div data-testid="waveform-editor" />);

const TRACK = {
  id: "t1", name: "Energy Beat", filename: "beat.mp3",
  r2_url: "https://r2.example/music/t1.mp3",
  duration: 120, mood_tags: ["energy", "power"], segments: [],
  uploaded_at: "2026-05-09T00:00:00Z",
};

test("renders track name and mood tags", () => {
  render(<MusicTrackCard track={TRACK} onDeleted={() => {}} onUpdated={() => {}} />);
  expect(screen.getByText("Energy Beat")).toBeInTheDocument();
  expect(screen.getByText("energy")).toBeInTheDocument();
  expect(screen.getByText("power")).toBeInTheDocument();
});

test("renders duration formatted", () => {
  render(<MusicTrackCard track={TRACK} onDeleted={() => {}} onUpdated={() => {}} />);
  expect(screen.getByText("2:00")).toBeInTheDocument();
});

test("Edit button is present", () => {
  render(<MusicTrackCard track={TRACK} onDeleted={() => {}} onUpdated={() => {}} />);
  expect(screen.getByText("Edit")).toBeInTheDocument();
});
