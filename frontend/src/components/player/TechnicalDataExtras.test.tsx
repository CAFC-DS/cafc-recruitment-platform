import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TechnicalDataExtras, { ExtrasRow } from "./TechnicalDataExtras";

jest.mock("../../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));

const row = (overrides: Partial<ExtrasRow> = {}): ExtrasRow => ({
  season: "25/26", league: "League Two", position: "Striker", min: 3000, t: 2026, ch: 96,
  categories: [{ key: "shot_threat", label: "Shot threat", ch: 104 }, { key: "carrying", label: "Carrying", ch: 88 }],
  scores: { ch: 96, ch_lo: 90, ch_hi: 102, team: 92, team_rel: 6.2, career: 94, career_seasons: 3, forecast: 98, forecast_lo: 91, forecast_hi: 105 },
  outlook: { starter_championship: 0.41, starter_premier_league: 0.12, step_up_success: 0.28, availability: 0.83, availability_seasons: 2 },
  role_fit: { best: 1, profiles: [{ name: "Poacher", desc: "Lives in the box.", fit: 55 }, { name: "Runner", desc: "Carries the ball.", fit: 70 }] },
  similar: [
    { impect_id: 8, profile_id: "external_8", name: "Close Match", club: "Club 8", league: "League One", season: "25/26", ch: 97, categories: [106, 85], distance: 1.9 },
    { impect_id: 9, profile_id: null, name: "Not On Platform", club: "Club 9", league: "Eredivisie", season: "2026", ch: 95, categories: [104, 88], distance: 4.6 },
  ],
  ...overrides,
});
const show = (r: ExtrasRow, rows: ExtrasRow[] = [r]) =>
  render(<MemoryRouter><TechnicalDataExtras rows={rows} row={r} /></MemoryRouter>);

test("puts the outlook as chances in ten, with the forecast, availability and team context", () => {
  show(row());
  const outlook = screen.getByRole("region", { name: "Outlook" });
  expect(outlook).toHaveTextContent("Forecast 98 next season in an average Championship team (likely 91–105).");
  expect(within(outlook).getByText("Championship starter").nextSibling).toHaveTextContent("4 in 10");
  expect(within(outlook).getByText("Stepping up").nextSibling).toHaveTextContent("3 in 10");
  expect(outlook).toHaveTextContent("83% of league minutes, last 2 seasons");
  expect(outlook).toHaveTextContent("His team was 6 points stronger than the League Two average; in an average team his CH index would be 92.");
});

test("leaves out stepping up and team context when they do not apply", () => {
  const r = row();
  r.outlook = { ...r.outlook!, step_up_success: null };
  r.scores = { ...r.scores!, team_rel: 1.5 };
  show(r);
  const outlook = screen.getByRole("region", { name: "Outlook" });
  expect(within(outlook).queryByText("Stepping up")).toBeNull();
  expect(outlook).not.toHaveTextContent("Team context");
});

test("shows role fit with the closest type picked out", () => {
  show(row());
  const fit = screen.getByRole("region", { name: "Role fit" });
  expect(fit).toHaveTextContent("Closest to a runner: carries the ball.");
  expect(within(fit).getByText("Runner").closest("li")).toHaveClass("is-best");
  expect(within(fit).getByText("Poacher").closest("li")).toHaveTextContent("55%");
});

test("draws one point per season at his most-played position, then the forecast", () => {
  const older = row({ season: "24/25", t: 2025, ch: 90, min: 2500 });
  const sameSeasonOtherPosition = row({ season: "24/25", t: 2025, ch: 120, min: 300 });
  const current = row();
  show(current, [current, older, sameSeasonOtherPosition]);
  const history = screen.getByRole("img", { name: /CH index by season/ });
  expect(history).toHaveAccessibleName("CH index by season: 24/25 90, 25/26 96, forecast 98");
});

test("lists similar players, linking those the platform has", () => {
  show(row());
  const table = screen.getByRole("table");
  const link = within(table).getByRole("link", { name: "Close Match" });
  expect(link).toHaveAttribute("href", "/player/external_8?tab=technical");
  expect(within(table).queryByRole("link", { name: "Not On Platform" })).toBeNull();
  const rows = within(table).getAllByRole("row");
  expect(rows[2]).toHaveTextContent("Club 8 · League One · 2025/26");
  expect(rows[2]).toHaveTextContent("106+2");
  expect(rows[2]).toHaveTextContent("Very close");
  expect(rows[3]).toHaveTextContent("Similar");
  expect(screen.getByText(/Only players in leagues with SkillCorner game intelligence data are listed\./)).toBeInTheDocument();
});

test("renders nothing extra for a page without the new columns", () => {
  const { container } = show(row({ scores: undefined, outlook: undefined, role_fit: null, similar: [], ch: null }));
  expect(container).toBeEmptyDOMElement();
});

test("compares over the last three seasons by default, with this season one click away", () => {
  const r = row({
    similar_recent_basis: { seasons: "23/24–25/26", minutes: 7400, ch: 98, categories: [102, 91] },
    similar_recent: [{ impect_id: 12, profile_id: "external_12", name: "Steady Type", club: "Club 12", league: "League One", season: "23/24–25/26", minutes: 8100, ch: 99, categories: [103, 90], distance: 1.1 }],
  });
  show(r);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("2023/24–2025/26 · 7,400 minutes");
  expect(within(table).getByRole("link", { name: "Steady Type" })).toBeInTheDocument();
  expect(within(table).getByText("Club 12 · League One · 2023/24–2025/26")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "This season" }));
  expect(within(screen.getByRole("table")).getByRole("link", { name: "Close Match" })).toBeInTheDocument();
  expect(within(screen.getByRole("table")).queryByText("Steady Type")).toBeNull();
});
