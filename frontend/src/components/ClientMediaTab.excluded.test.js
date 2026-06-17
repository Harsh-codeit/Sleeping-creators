import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import ClientMediaTab from "./ClientMediaTab";

jest.mock("axios");

beforeEach(() => {
  axios.get.mockImplementation((url) => {
    if (url.includes("/excluded-images")) {
      return Promise.resolve({ data: [
        { drive_file_id: "x1", name: "", thumbnail_url: "http://t/x1" },
      ] });
    }
    return Promise.resolve({ data: [] }); // drive-clips
  });
  axios.post.mockResolvedValue({ data: { restored: true } });
});

test("Excluded view lists tombstoned images and restores one", async () => {
  render(<ClientMediaTab clientId="c1" />);
  fireEvent.click(await screen.findByText("Excluded"));
  const restoreBtn = await screen.findByRole("button", { name: /restore/i });
  fireEvent.click(restoreBtn);
  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/excluded-images/x1/restore"))
  );
});
