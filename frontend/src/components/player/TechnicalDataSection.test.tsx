import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import axiosInstance from "../../axiosInstance";
import TechnicalDataSection, { formatValue, shortLabel, TechnicalCategory, TechnicalRow } from "./TechnicalDataSection";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));
const get = axiosInstance.get as jest.Mock;

const metric = (key: string, label: string, ch: number | null, value: number | null = 1.23, percent = false) =>
  ({ key, label, percent, lower_better: false, ch, value });
const cat = (key: string, label: string, ch: number | null, bandName: string, metrics: TechnicalCategory["metrics"]) =>
  ({ key, label, ch, band: null, band_name: bandName, metrics });

const striker = (overrides: Partial<TechnicalRow> = {}): TechnicalRow => ({
  season: "23/24", league: "League Two", club: "Notts County", position: "Striker", position_key: "striker",
  min: 4626, t: 2024, ch: 104, band_name: "Starter", has_metrics: true,
  categories: [
    cat("shot_threat", "Shot threat", 113.2, "Strong starter", [metric("npxg", "Non-penalty xG per 90", 122, 0.52), metric("shots", "Shots per 90", 105)]),
    cat("box_presence", "Box presence", 94.6, "Squad level", [metric("ft", "First-time shot share", 106, 0.38, true)]),
    cat("creativity", "Creativity", 80.2, "Below Championship level", [metric("xa", "Expected assists", 87)]),
    cat("carrying", "Carrying", 91.9, "Below Championship level", [metric("drb", "Dribbles", 82)]),
  ],
  ...overrides,
});
const centreBack = (): TechnicalRow => ({
  ...striker({ season: "25/26", club: "Club B", league: "Championship", position: "Centre-back", position_key: "cb", min: 610 }),
  categories: ["aerial", "ball_winning", "progression", "ball_security", "defending"].map((k, i) =>
    cat(k, k.replace("_", " "), 95 + i, "Average", [metric(`${k}1`, `Metric ${i}`, 100 + i)])),
});
const respond = (rows: TechnicalRow[]) => get.mockResolvedValue({ data: { available: true, message: null, run: null, rows } });

beforeEach(() => get.mockReset());

test("fetches the player's technical data and shows each category's Championship score and level", async () => {
  respond([striker()]);
  render(<TechnicalDataSection playerId="external_7" />);
  const table = await screen.findByRole("table");
  expect(get).toHaveBeenCalledWith("/players/external_7/technical-data");
  const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
  expect(rows).toEqual(["Shot threat113Strong starter", "Box presence95Squad level", "Creativity80Below Championship level", "Carrying92Below Championship level"]);
  expect(screen.getByText(/Notts County \(League Two\)/)).toBeInTheDocument();
  expect(screen.queryByText(/small sample/)).not.toBeInTheDocument();
});

test("draws one bar per metric with its score printed", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByRole("table");
  const bars = container.querySelectorAll(".td-bars rect");
  expect(bars).toHaveLength(5);
  expect(Array.from(container.querySelectorAll(".td-bar-value")).map((t) => t.textContent)).toEqual(["122", "105", "106", "87", "82"]);
  fireEvent.mouseMove(bars[0], { clientX: 10, clientY: 10 });
  expect(screen.getByText("Non-penalty xG per 90").closest(".td-tip")).toHaveTextContent("Championship score 1220.52 in League Two");
  fireEvent.mouseMove(bars[2], { clientX: 10, clientY: 10 });
  expect(screen.getByText("First-time shot share", { selector: "b" }).closest(".td-tip")).toHaveTextContent("38% in League Two");
});

test("renders five categories for a centre-back and warns about a small sample", async () => {
  respond([centreBack()]);
  render(<TechnicalDataSection playerId="external_7" />);
  const table = await screen.findByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(6);
  expect(screen.getByText(/small sample, under 900 minutes/)).toBeInTheDocument();
});

test("switching season changes the scores shown", async () => {
  respond([centreBack(), striker()]);
  render(<TechnicalDataSection playerId="external_7" />);
  const table = await screen.findByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(6);
  fireEvent.change(screen.getByLabelText("Season"), { target: { value: "1" } });
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(5);
  expect(screen.getByText("Shot threat", { selector: "td" })).toBeInTheDocument();
});

test("clicking a category picks it out in both charts", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByRole("table");
  fireEvent.click(screen.getByText("Creativity", { selector: "td" }));
  expect(container.querySelectorAll(".td-bars rect.is-faded")).toHaveLength(4);
  expect(container.querySelectorAll(".td-table tr.is-dim")).toHaveLength(3);
  fireEvent.click(screen.getByText("Creativity", { selector: "td" }));
  expect(container.querySelectorAll(".td-bars rect.is-faded")).toHaveLength(0);
});

test("shows categories only until the weekly refresh packages metric scores", async () => {
  const old = striker({ has_metrics: false });
  old.categories = old.categories.map((c) => ({ ...c, metrics: null }));
  respond([old]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByRole("table");
  expect(screen.getByText(/arrive with the next weekly data refresh/)).toBeInTheDocument();
  expect(container.querySelector(".td-bars")).toBeNull();
});

test("passes on the API's message when there is no data", async () => {
  get.mockResolvedValue({ data: { available: false, message: "Technical data is only available for external players.", run: null, rows: [] } });
  render(<TechnicalDataSection playerId="internal_3" />);
  expect(await screen.findByText("Technical data is only available for external players.")).toBeInTheDocument();
});

test("offers a retry when the request fails", async () => {
  get.mockRejectedValueOnce(new Error("down"));
  respond([striker()]);
  render(<TechnicalDataSection playerId="external_7" />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

test("formats values as the scout app does", () => {
  const m = { key: "x", label: "x", percent: false, lower_better: false, ch: 100 };
  expect([0.523, 12.34, 140.6].map((value) => formatValue({ ...m, value }))).toEqual(["0.52", "12.3", "141"]);
  expect(formatValue({ ...m, value: 0.384, percent: true })).toBe("38%");
  expect(formatValue({ ...m, key: "r_pass_over_expected", value: -0.0123 })).toBe("−1.2 pts");
  expect(formatValue({ ...m, value: null })).toBeNull();
});

test("drops the unit from labels under the bars", () => {
  expect(["Shots per 90", "Interceptions per 1,000 opponent touches", "Passes completed under pressure (share)", "Aerial duel win rate"].map(shortLabel))
    .toEqual(["Shots", "Interceptions", "Passes completed under pressure", "Aerial duel win rate"]);
});
