import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AnalyticsPage from "./AnalyticsPage";
import axios from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";
jest.mock("../axiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: jest.fn() }));
jest.mock("../components/analytics/recruitment/PlayerMap", () => () => (
  <div>Map</div>
));
const get = axios.get as jest.Mock;
const auth = useCurrentUser as jest.Mock;
const fixture = {
  summary: {
    fixtures: 1,
    live: 1,
    video: 0,
    both: 0,
    players: 2,
    reports: 3,
    senior_players: 1,
    senior_coverage: 50,
    new: 1,
    progressed: 1,
    archived: 0,
  },
  market: {
    players: 10,
    covered_players: 2,
    teams: 3,
    covered_teams: 1,
    covered_without_club: 0,
  },
  competitions: [
    {
      name: "League",
      teams: 3,
      covered_teams: 1,
      players: 10,
      covered_players: 2,
    },
  ],
  stage_counts: { "Stage 3": 1 },
  links: [{ from: "Stage 2", to: "Stage 3", value: 1 }],
  events: [
    {
      player_id: "external_1",
      name: "Example player",
      club: "Example FC",
      position: "CM",
      from: "Stage 2",
      to: "Stage 3",
      date: "2026-01-02",
      scout: "Phil Chapple",
      category: "progressed",
    },
  ],
  players: [
    {
      player_id: "external_1",
      name: "Example player",
      club: "Example FC",
      country: "England",
      position: "CM",
      stage: "Stage 3",
      reports: 0,
      reports_all: 4,
      senior: true,
    },
  ],
  reports: [],
  positions: [],
  countries: [],
  teams: [],
  seniors: [],
  timeline: [],
  options: {
    competitions: ["League"],
    countries: ["England"],
    positions: ["CM"],
    clubs: ["Example FC"],
    scouts: [],
  },
  start_date: "2026-01-01",
  end_date: "2026-01-31",
};
beforeEach(() => {
  jest.clearAllMocks();
  auth.mockReturnValue({ canAccessAnalytics: true, loading: false });
  get.mockResolvedValue({ data: fixture });
  window.scrollTo = jest.fn();
});
it("preserves applied market/date filters through a Sankey drilldown and return", async () => {
  render(
    <MemoryRouter
      initialEntries={[
        "/analytics?start_date=2026-01-01&end_date=2026-01-31&competitions=League",
      ]}
    >
      <AnalyticsPage />
    </MemoryRouter>,
  );
  const ribbon = await screen.findByRole("button", {
    name: "Stage 2 to Stage 3: 1 movement. View players.",
  });
  expect(get).toHaveBeenCalledWith(
    "/analytics/recruitment",
    expect.objectContaining({
      params: expect.objectContaining({
        competitions: "League",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
      }),
    }),
  );
  fireEvent.click(ribbon);
  expect(
    await screen.findByRole("link", { name: "Example player" }),
  ).toHaveAttribute("href", "/player/1");
  expect(screen.getByLabelText("From")).toHaveValue("2026-01-01");
  fireEvent.click(
    screen.getByRole("button", { name: "Close and return" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Recruitment analytics" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/1 Jan 2026 – 31 Jan 2026 · League/),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});
it("applies a stage filter to the unified endpoint and supports error retry", async () => {
  get.mockRejectedValueOnce({
    response: { data: { detail: "Warehouse unavailable" } },
  });
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Warehouse unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("group", { name: "Headline figures" });
  // stage chips toggle independently and are sent in stage order
  fireEvent.click(screen.getByLabelText("Stage 4"));
  fireEvent.click(screen.getByLabelText("Stage 3"));
  fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith(
      "/analytics/recruitment",
      expect.objectContaining({
        params: expect.objectContaining({ stages: "Stage 3|Stage 4" }),
      }),
    ),
  );
  expect(await screen.findByText(/Stage 3, Stage 4/)).toBeInTheDocument();
});
it("never fetches analytics for an unauthorised user", () => {
  auth.mockReturnValue({ canAccessAnalytics: false, loading: false });
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
  expect(screen.getByText(/don’t have access/)).toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});

it("makes every original analytics section reachable alongside the overview", async () => {
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
  const navigation = screen.getByRole("navigation", {
    name: "Analytics sections",
  });
  expect(navigation).toBeInTheDocument();
  for (const name of [
    "Overview",
    "Player analytics",
    "Match & team analytics",
    "Scout analytics",
    "Stage analytics",
  ]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: "Stage analytics" }));
  expect(
    screen.getByRole("heading", { name: "Stage analytics" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Use this section’s filters below/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Overview" }));
  expect(
    await screen.findByRole("heading", { name: "Recruitment analytics" }),
  ).toBeInTheDocument();
});

it("opens a stage's players without changing the overview's stage filter", async () => {
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: /^Stage 3: 1 players on the end date/,
    }),
  );
  expect(
    await screen.findByText(/Stage 3 players/),
  ).toBeInTheDocument();
  // period count and all-time count sit side by side, so 0 is not misleading
  expect(
    screen.getByRole("columnheader", { name: "All-time reports" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "4" })).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenLastCalledWith(
    "/analytics/recruitment",
    expect.objectContaining({
      params: expect.objectContaining({ stages: undefined }),
    }),
  );
});
