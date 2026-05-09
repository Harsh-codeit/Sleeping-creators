import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import VideoEditor from "./VideoEditor";

jest.mock("axios");
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));
const templates = [
  { id: "tpl-1", name: "Podcast Clip", aspect_ratio: "9:16" },
];

const clips = [
  {
    drive_file_id: "drive-clip-1",
    name: "50 MB .mp4",
    duration: 20.086,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem("sc_token", "preview-token");
  axios.get.mockImplementation((url) => {
    if (url.includes("/video-templates")) {
      return Promise.resolve({ data: templates });
    }
    if (url.includes("/drive-clips")) {
      return Promise.resolve({ data: clips });
    }
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  localStorage.clear();
});

test("keeps clip picker closed until requested and shows selected Drive clip", async () => {
  render(<VideoEditor clientId="client-1" />);

  expect(screen.queryByRole("button", { name: "Drive" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Choose clip/ }));

  expect(await screen.findByRole("button", { name: "Drive" })).toBeInTheDocument();

  const clipButton = await screen.findByRole("button", { name: /50 MB \.mp4/ });
  fireEvent.click(clipButton);

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Drive" })).not.toBeInTheDocument();
  });

  expect(screen.getByRole("button", { name: "50 MB .mp4" })).toBeInTheDocument();
  const videoEl = document.querySelector("video");
  expect(videoEl).not.toBeNull();
  expect(videoEl.src).toContain("clients/client-1/clips/drive-clip-1/stream");
});

test("sends video creation payload using backend create route names", async () => {
  axios.post.mockResolvedValue({ data: { status: "queued" } });

  render(<VideoEditor clientId="client-1" />);

  fireEvent.click(screen.getByRole("button", { name: /Choose clip/ }));
  fireEvent.click(await screen.findByRole("button", { name: /50 MB \.mp4/ }));
  fireEvent.click(screen.getByRole("button", { name: "Podcast Clip" }));
  fireEvent.change(screen.getByPlaceholderText(/Write your caption/), {
    target: { value: "Launch caption" },
  });
  fireEvent.change(screen.getByPlaceholderText("#marketing #business"), {
    target: { value: "#launch #video" },
  });
  fireEvent.click(screen.getByRole("button", { name: "instagram" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/videos/create"),
      expect.objectContaining({
        client_id: "client-1",
        clip_id: "drive-clip-1",
        template_id: "tpl-1",
        clip_trim_start: 0,
        clip_trim_end: 20.086,
        caption: "Launch caption",
        hashtags: ["#launch", "#video"],
        platforms: ["instagram"],
        scheduled_at: null,
      })
    );
  });

  const modal = screen.queryByRole("button", { name: "Drive" });
  expect(modal).not.toBeInTheDocument();
});
