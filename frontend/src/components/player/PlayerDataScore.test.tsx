import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import axiosInstance from "../../axiosInstance";
import PlayerDataScore from "./PlayerDataScore";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
let mockIsDark = false;
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: mockIsDark } }) }));
const get = axiosInstance.get as jest.Mock;

const row = (ch: number | null, band: number | null, bandName: string | null) => ({
  season: "25/26", league: "Championship", club: "Club A", position: "Centre-back", min: 3000,
  ch, chLo: 100, chHi: 120, fc: 110, fcLo: 104, fcHi: 116, band, band_name: bandName, fc_band: 4, fc_band_name: "Strong starter",
  rel: ch, relN: 3 as number | null, rel_band: band, rel_band_name: bandName,
});
const response = (headline: ReturnType<typeof row> | null) => ({
  available: headline != null, message: null, run: { run_id: "r1", built_at: "2026-10-26T06:00:00" }, headline, rows: headline ? [headline] : [],
});
beforeEach(() => { get.mockReset(); mockIsDark = false; });

test("shows the career score in the scout app's band colour", async () => {
  get.mockResolvedValue({ data: response(row(123.6, 5, "Elite")) });
  render(<PlayerDataScore playerId="external_7" />);
  const box = (await screen.findAllByText("124"))[0];
  expect(get).toHaveBeenCalledWith("/players/external_7/data-scores");
  expect(box).toHaveStyle({ backgroundColor: "#0B4A3B", color: "#FFFFFF" });
  expect(screen.getByText("Elite")).toBeInTheDocument();
  expect(screen.getByText("Career · Centre-back · 3 seasons")).toBeInTheDocument();
});

test("uses the dark palette and the outlined squad-level box", async () => {
  mockIsDark = true;
  get.mockResolvedValue({ data: response(row(103, 3, "Starter")) });
  const { unmount } = render(<PlayerDataScore playerId="external_7" />);
  expect(await screen.findByText("103")).toHaveStyle({ backgroundColor: "#47917A", color: "#0E1214" });
  unmount();
  get.mockResolvedValue({ data: response(row(95, 1, "Squad level")) });
  render(<PlayerDataScore playerId="external_8" />);
  expect(await screen.findByText("95")).toHaveStyle({ boxShadow: "inset 0 0 0 1.5px #97A1A6" });
});

test("falls back to the CH index when there is no career score", async () => {
  get.mockResolvedValue({ data: response({ ...row(110.2, 4, "Strong starter"), rel: null, relN: null, rel_band: null, rel_band_name: null }) });
  render(<PlayerDataScore playerId="external_7" />);
  expect((await screen.findAllByText("110"))[0]).toHaveStyle({ backgroundColor: "#2A7360", color: "#FFFFFF" });
  expect(screen.getByText("Strong starter")).toBeInTheDocument();
  expect(screen.getByText("CH index · Centre-back · 25/26 · 3000 min")).toBeInTheDocument();
});

test("renders nothing when there is no score or the request is refused", async () => {
  get.mockResolvedValue({ data: response(null) });
  const { container, unmount } = render(<PlayerDataScore playerId="external_9" />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
  unmount();
  get.mockRejectedValue({ response: { status: 403 } });
  const refused = render(<PlayerDataScore playerId="external_9" />);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(refused.container).toBeEmptyDOMElement();
});
