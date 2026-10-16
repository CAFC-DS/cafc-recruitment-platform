import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axiosInstance from "../../axiosInstance";
import PlayerPositionPitchMap from "./PlayerPositionPitchMap";
import TechnicalDataSection from "./TechnicalDataSection";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
jest.mock("react-chartjs-2", () => ({ PolarArea: () => null }));
jest.mock("chart.js", () => ({ Chart: { register: jest.fn() } }));
jest.mock("chartjs-plugin-datalabels", () => ({}));
const get = axiosInstance.get as jest.Mock;
const positionData = {
  available: true, message: null,
  filters: { competition: "League A", season: "2026", available: [{ competition: "League A", season: "2026" }, { competition: "League B", season: "2026" }] },
  positions: [{ position: "CENTRAL_MIDFIELD", match_count: 5, minutes: 450, share_pct: 100 }],
};
beforeEach(() => get.mockReset());

test("position-map defaults do not trigger a duplicate request", async () => {
  get.mockResolvedValue({ data: positionData });
  render(<PlayerPositionPitchMap playerId="42" />);
  await screen.findByRole("img", { name: "Pitch map for League A 2026" });
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(get).toHaveBeenCalledTimes(1);
  get.mockResolvedValue({ data: { ...positionData, filters: { ...positionData.filters, competition: "League B" } } });
  fireEvent.change(screen.getByLabelText("Position map competition"), { target: { value: "League B" } });
  await screen.findByRole("img", { name: "Pitch map for League B 2026" });
  expect(get).toHaveBeenCalledTimes(2);
});

test("technical defaults do not repeat the expensive metrics request", async () => {
  get.mockResolvedValue({ data: { available: false, message: "No technical data", entries: [], filters: { competition: "League A", season: "2026", position: "Overall", available: [], positions: [] } } });
  render(<TechnicalDataSection playerId="42" />);
  await screen.findByText("No technical data");
  await act(async () => {});
  expect(get).toHaveBeenCalledTimes(1);
});
