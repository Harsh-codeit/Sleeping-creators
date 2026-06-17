import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import DriveImageGrid from "./DriveImageGrid";

jest.mock("axios");

const IMAGES = [
  { drive_file_id: "a", name: "alpha.jpg", thumbnail_url: "http://t/a" },
  { drive_file_id: "b", name: "beta.png", thumbnail_url: "http://t/b" },
];

test("renders thumbnails and reports selection", async () => {
  axios.get.mockResolvedValue({ data: IMAGES });
  const onSelect = jest.fn();
  render(<DriveImageGrid clientId="c1" selectedFileId={null} onSelect={onSelect} />);

  const alpha = await screen.findByAltText("alpha.jpg");
  fireEvent.click(alpha);
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(IMAGES[0]));
});
