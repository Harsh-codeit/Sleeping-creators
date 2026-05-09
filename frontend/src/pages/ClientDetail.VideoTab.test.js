import { render, screen } from "@testing-library/react";
import axios from "axios";
import ClientDetail from "./ClientDetail";

jest.mock("axios");
jest.mock("../components/VideoStudio", () => () => <div data-testid="video-studio" />);
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "c1" }),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "" }),
}));

beforeEach(() => {
  axios.get.mockResolvedValue({ data: { id: "c1", name: "Test Client" } });
});

test("Video tab exists in tab list", async () => {
  render(<ClientDetail />);
  const videoTabs = await screen.findAllByText("VIDEO");
  expect(videoTabs.length).toBeGreaterThan(0);
});
