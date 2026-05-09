import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import VideoStudio from "./VideoStudio";

jest.mock("axios");

beforeEach(() => {
  axios.get.mockImplementation((url) => {
    if (url.includes("drive-clips")) return Promise.resolve({ data: [] });
    if (url.includes("video-templates")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

test("renders platform chips", async () => {
  render(<VideoStudio clientId="c1" />);
  await waitFor(() => expect(screen.getByText("instagram")).toBeInTheDocument());
});

test("renders Create Video button", async () => {
  render(<VideoStudio clientId="c1" />);
  await waitFor(() => expect(screen.getByText("Create Video")).toBeInTheDocument());
});

test("shows 'No clips' message when drive-clips returns empty", async () => {
  render(<VideoStudio clientId="c1" />);
  await waitFor(() => expect(screen.getByText(/No clips/i)).toBeInTheDocument());
});
