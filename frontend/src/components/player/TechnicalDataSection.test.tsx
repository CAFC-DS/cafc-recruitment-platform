import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import axiosInstance from "../../axiosInstance";
import TechnicalDataSection, { formatValue, leagueTag, Reference, referenceNotes, shortLabel, TechnicalCategory, TechnicalRow } from "./TechnicalDataSection";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));
const get = axiosInstance.get as jest.Mock;

const OWN: Reference = { q: [80, 86, 92, 98, 104], mean: 92, beats: 70 };
const CHAMP: Reference = { q: [88, 94, 100, 106, 112], mean: 100, beats: 40 };
const metric = (key: string, label: string, ch: number | null, value: number | null = 1.23, percent = false) =>
  ({ key, label, percent, lower_better: false, ch, value, own: OWN, champ: CHAMP, champ_value: 0.9 });
const cat = (key: string, label: string, ch: number | null, bandName: string, metrics: TechnicalCategory["metrics"], own: Reference | null = OWN) =>
  ({ key, label, ch, band: null, band_name: bandName, metrics, own, champ: CHAMP });

const striker = (overrides: Partial<TechnicalRow> = {}): TechnicalRow => ({
  season: "23/24", league: "League Two", club: "Notts County", position: "Striker", position_key: "striker",
  min: 4626, t: 2024, ch: 104, band_name: "Starter", has_metrics: true,
  reference: { own: { league: "League Two", season: "23/24", n: 99 }, champ: { season: "23/24", n: 93 } },
  categories: [
    cat("shot_threat", "Shot threat", 113.2, "Strong starter", [metric("npxg", "Non-penalty xG per 90", 122, 0.52), metric("shots", "Shots per 90", 105)]),
    cat("box_presence", "Box presence", 94.6, "Squad level", [metric("ft", "First-time shot share", 106, 0.38, true)]),
    cat("creativity", "Creativity", 80.2, "Below Championship level", [metric("xa", "Expected assists", 87)]),
    cat("carrying", "Carrying", 91.9, "Below Championship level", [metric("drb", "Dribbles", 82)], { q: [70, 78, 85, 90, 95], mean: 85, beats: 90 }),
  ],
  ...overrides,
});
const centreBack = (): TechnicalRow => ({
  ...striker({ season: "25/26", club: "Club B", league: "Championship", position: "Centre-back", position_key: "cb", min: 610,
    reference: { own: null, champ: { season: "25/26", n: 93 } } }),
  categories: ["aerial", "ball_winning", "progression", "ball_security", "defending"].map((k, i) =>
    cat(k, k.replace("_", " "), 95 + i, "Average", [metric(`${k}1`, `Metric ${i}`, 100 + i)], null)),
});
const respond = (rows: TechnicalRow[]) => get.mockResolvedValue({ data: { available: true, message: null, run: null, rows } });
const categoryRows = (container: HTMLElement) => Array.from(container.querySelectorAll(".td-cat > .td-row"));
const rowText = (r: Element) => `${r.querySelector(".td-name")?.textContent} ${r.querySelector(".data-score-box")?.textContent}`;
const metricNames = (container: HTMLElement) => Array.from(container.querySelectorAll(".td-metric .td-name")).map((n) => n.firstChild?.textContent);

beforeEach(() => get.mockReset());

test("fetches the player's technical data and lists each category's score and level", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  expect(get).toHaveBeenCalledWith("/players/external_7/technical-data");
  expect(categoryRows(container).map(rowText)).toEqual([
    "Shot threatStrong starter 113", "Box presenceSquad level 95", "CreativityBelow Championship level 80", "CarryingBelow Championship level 92"]);
  expect(screen.getByText("Notts County · League Two")).toBeInTheDocument();
  expect(screen.getByText(/4,626 minutes in 2023\/24/)).toBeInTheDocument();
  expect(container.querySelector(".td-scores")).toHaveTextContent("CH index104Starter");
  expect(screen.queryByText(/Small sample/)).not.toBeInTheDocument();
});

test("sums the profile up in one sentence, against the Championship and his own league", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  expect(container.querySelector(".td-verdict")).toHaveTextContent(
    "Above Championship level in shot threat (113). Below it in creativity (80) and carrying (92); still above most League Two strikers in carrying (92).");
});

test("draws his own league's box above the Championship's, with the counts behind them", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  const first = container.querySelector(".td-cat .td-strip")!;
  expect(first.querySelectorAll(".td-s-own, .td-s-champ")).toHaveLength(2);
  expect(first.getAttribute("aria-label")).toContain("League Two: average 92, median 92, middle half 86–98, 10th–90th percentile 80–104; he beats 70%");
  expect(first.querySelectorAll(".td-s-mean")).toHaveLength(2);
  expect(screen.getByText("vs L2")).toBeInTheDocument();
  expect(screen.getByText("vs Championship")).toBeInTheDocument();
  expect(screen.getByText(/League Two 2023\/24 \(99 regulars\) · Championship 2023\/24 \(93 regulars\)/)).toBeInTheDocument();
  expect(screen.queryByRole("note")).toBeNull();  // a plain this-league-this-season comparison needs no note
  expect(container.querySelector(".td-r-own")).not.toBeNull();
});

test("a Championship player gets the Championship box only and a small-sample warning", async () => {
  respond([centreBack()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText(/Club B · Championship/);
  expect(categoryRows(container)).toHaveLength(5);
  expect(container.querySelectorAll(".td-cat .td-s-own")).toHaveLength(0);
  expect(container.querySelectorAll(".td-cat .td-s-champ")).toHaveLength(5);
  expect(container.querySelector(".td-r-own")).toBeNull();
  expect(screen.getByText(/small sample/)).toHaveAttribute("title", "Under 900 minutes, so read these scores with care.");
});

test("categories open one at a time to show their metrics", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  expect(metricNames(container)).toEqual([]);
  const [shot, box] = categoryRows(container);
  fireEvent.click(shot);
  expect(shot).toHaveAttribute("aria-expanded", "true");
  expect(metricNames(container)).toEqual(["Non-penalty xG", "Shots"]);
  expect(screen.getByText(/0\.52 · CH median 0\.90 · per 90/)).toBeInTheDocument();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(metricNames(container)).toEqual(["First-time shot share"]);
  expect(container.querySelectorAll(".td-cat.is-dim")).toHaveLength(3);
  fireEvent.click(categoryRows(container)[1]);
  expect(metricNames(container)).toEqual([]);
});

test("clicking a radar label opens that category", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  fireEvent.click(screen.getByText("CREATIVITY"));
  expect(metricNames(container)).toEqual(["Expected assists"]);
  expect(container.querySelectorAll(".td-r-label.is-dim")).toHaveLength(3);
});

test("switching season changes the scores shown and closes the open category", async () => {
  respond([centreBack(), striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText(/Club B · Championship/);
  fireEvent.click(categoryRows(container)[0]);
  fireEvent.change(screen.getByLabelText("Season"), { target: { value: "1" } });
  expect(categoryRows(container)).toHaveLength(4);
  expect(screen.getByText("Shot threat")).toBeInTheDocument();
  expect(metricNames(container)).toEqual([]);
});

test("shows categories only, without opening, until the weekly refresh packages metric scores", async () => {
  const old = striker({ has_metrics: false });
  old.categories = old.categories.map((c) => ({ ...c, metrics: null }));
  respond([old]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  expect(screen.getByText(/arrive with the next weekly data refresh/)).toBeInTheDocument();
  expect(container.querySelector('.td-row[role="button"]')).toBeNull();
  fireEvent.click(categoryRows(container)[0]);
  expect(container.querySelector(".td-metrics")).toBeNull();
});

test("a page without reference boxes still shows scores and the player's mark", async () => {
  const bare = striker({ reference: { own: null, champ: null } });
  bare.categories = bare.categories.map((c) => ({ ...c, own: null, champ: null }));
  respond([bare]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  expect(container.querySelectorAll(".td-s-own, .td-s-champ")).toHaveLength(0);
  expect(container.querySelectorAll(".td-s-player")).toHaveLength(4);
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
  expect(await screen.findByText("Shot threat")).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

test("formats values as the scout app does", () => {
  const m = { key: "x", label: "x", percent: false, lower_better: false, ch: 100 };
  expect([0.523, 12.34, 140.6].map((value) => formatValue({ ...m, value }))).toEqual(["0.52", "12.3", "141"]);
  expect(formatValue({ ...m, value: 0.384, percent: true })).toBe("38%");
  expect(formatValue({ ...m, key: "r_pass_over_expected", value: -0.0123 })).toBe("−1.2 pts");
  expect(formatValue({ ...m, value: null })).toBeNull();
});

test("drops the unit from metric names", () => {
  expect(["Shots per 90", "Interceptions per 1,000 opponent touches", "Passes completed under pressure (share)", "Aerial duel win rate"].map(shortLabel))
    .toEqual(["Shots", "Interceptions", "Passes completed under pressure", "Aerial duel win rate"]);
});

test("compares him with each group's average and says how much of it he beats", async () => {
  respond([striker()]);
  const { container } = render(<TechnicalDataSection playerId="external_7" />);
  await screen.findByText("Shot threat");
  const shot = container.querySelector(".td-cat .td-row")!;
  expect(Array.from(shot.querySelectorAll(".td-vs")).map((v) => v.textContent)).toEqual(["+21avg 92 · beats 70%", "+13avg 100 · beats 40%"]);
  const creativity = container.querySelectorAll(".td-cat .td-row")[2];
  const champ = creativity.querySelectorAll(".td-vs b")[1];
  expect(champ).toHaveTextContent("−20");
  expect(champ).toHaveClass("is-below");
});

test("shortens league names for the average labels", () => {
  expect(["League Two", "League One", "Eredivisie", "Scottish Championship", null].map(leagueTag)).toEqual(["L2", "L1", "Eredivisie", "Scottish Cham…", "League"]);
});

test("says when a box combines seasons, skips a season under way, or is missing", async () => {
  const pooled = striker({
    position: "Attacking midfielder",
    reference: {
      own: { league: "Allsvenskan", season: "2025–2026", seasons: ["2025", "2026"], n: 30, pooled: true, same_season: false, in_progress: null, missing: false },
      champ: { league: "Championship", season: "25/26", seasons: ["25/26"], n: 41, pooled: false, same_season: false, in_progress: "26/27", missing: false },
      min_regulars: 20, pool_seasons: 3,
    },
  });
  respond([pooled]);
  render(<TechnicalDataSection playerId="external_7" />);
  const note = await screen.findByRole("note");
  expect(note).toHaveTextContent("Allsvenskan box combines 2025 and 2026: no single season had 20 attacking midfielders with 900+ minutes (30 across them).");
  expect(note).toHaveTextContent("Championship box uses 2025/26: 2026/27 is still under way and has too few regulars so far.");
  expect(screen.getByText("2025–2026 · 30")).toBeInTheDocument();
});

test("explains a missing league box", () => {
  expect(referenceNotes({ own: { league: "Allsvenskan", season: "2024–2026", seasons: ["2024", "2025", "2026"], n: 16, pooled: true, missing: true }, champ: null }, "Attacking midfielder"))
    .toEqual(["No Allsvenskan box: only 16 attacking midfielders played 900+ minutes over 2024–2026, and a box needs 20."]);
});
