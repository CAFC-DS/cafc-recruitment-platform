import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentContactsPage from "./AgentContactsPage";
import { agentContactsService } from "../services/agentContactsService";
import { contactLetter, dataScoreDisplay } from "../utils/agentContactsGrouping";

jest.mock("../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../services/agentContactsService", () => ({
  agentContactsService: { list: jest.fn(), recentRecs: jest.fn() },
}));

let mockRole = "senior_manager";
jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { role: mockRole }, isIntelReviewer: mockRole === "intel_reviewer" }),
}));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));

const service = agentContactsService as jest.Mocked<typeof agentContactsService>;

const contact = (overrides = {}) => ({
  agent_user_id: 1,
  name: "Ana Costa",
  agency: "AC Rep",
  email: "ana@ac.example",
  phone: null as string | null,
  rec_count: 3,
  last_rec_at: "2026-06-08T10:00:00",
  details_from_latest_rec: false,
  ...overrides,
});

const CONTACTS = [
  contact({ agent_user_id: 7, name: "Daniel Brooks", agency: "Brooks Mgmt", email: "dan@bm.example", phone: "+44 7700 900456", rec_count: 22, last_rec_at: "2026-11-25T10:00:00" }),
  contact({ agent_user_id: 3, name: "Lucía Ferrer", agency: "Ferrer FG", email: "lucia@ffg.example", rec_count: 9, last_rec_at: "2026-11-12T10:00:00" }),
  contact({ agent_user_id: 1, name: "Ana Costa", details_from_latest_rec: true }),
];

const renderPage = async (contacts = CONTACTS) => {
  service.list.mockResolvedValue(contacts);
  render(<MemoryRouter><AgentContactsPage /></MemoryRouter>);
  await screen.findByText("Daniel Brooks");
};

const agentRowNames = () =>
  screen.getAllByTestId("agent-row").map((row) => within(row).getByTestId("agent-name").textContent);

const sectionLetters = () => screen.queryAllByTestId("letter-section").map((row) => row.textContent);

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "senior_manager";
});

test("contactLetter folds accents, upper-cases, and buckets non-letters", () => {
  expect(contactLetter("Lucía Ferrer")).toBe("L");
  expect(contactLetter("émile")).toBe("E");
  expect(contactLetter("3 Lions Mgmt")).toBe("#");
  expect(contactLetter("")).toBe("#");
});

test("contactLetter files Ł, Ø, Æ and Đ under their base letter", () => {
  expect(contactLetter("Łukasz Nowak")).toBe("L");
  expect(contactLetter("Øyvind Berg")).toBe("O");
  expect(contactLetter("Æsa Lund")).toBe("A");
  expect(contactLetter("Đorđe Ilić")).toBe("D");
});

test("search ignores accents", async () => {
  await renderPage();
  fireEvent.change(screen.getByPlaceholderText("Search name, agency or email"), { target: { value: "lucia ferrer" } });
  expect(agentRowNames()).toEqual(["Lucía Ferrer"]);
});

test("lists agents A–Z with letter sections", async () => {
  await renderPage();
  expect(agentRowNames()).toEqual(["Ana Costa", "Daniel Brooks", "Lucía Ferrer"]);
  expect(sectionLetters()).toEqual(["A", "D", "L"]);
  expect(screen.getByText("3 agents")).toBeInTheDocument();
});

test("groups names by folded first letter with # last", async () => {
  await renderPage([...CONTACTS, contact({ agent_user_id: 9, name: "3 Lions Mgmt" }), contact({ agent_user_id: 10, name: "émile Roux" })]);
  expect(sectionLetters()).toEqual(["A", "D", "E", "L", "#"]);
  expect(agentRowNames()[agentRowNames().length - 1]).toBe("3 Lions Mgmt");
});

test('shows "Details from latest rec" only when flagged', async () => {
  await renderPage();
  expect(screen.getAllByText("Details from latest rec")).toHaveLength(1);
  const anaRow = screen.getAllByTestId("agent-row")[0];
  expect(within(anaRow).getByText("Details from latest rec")).toBeInTheDocument();
});

test("sorting by Recs hides letter sections and orders desc", async () => {
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: /Recs/ }));
  expect(agentRowNames()).toEqual(["Daniel Brooks", "Lucía Ferrer", "Ana Costa"]);
  expect(sectionLetters()).toEqual([]);
  expect(screen.queryByRole("navigation", { name: "Jump to letter" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Recs/ }));
  expect(agentRowNames()).toEqual(["Ana Costa", "Lucía Ferrer", "Daniel Brooks"]);
});

test("search filters by agency and email", async () => {
  await renderPage();
  const search = screen.getByPlaceholderText("Search name, agency or email");
  fireEvent.change(search, { target: { value: "brooks mgmt" } });
  expect(agentRowNames()).toEqual(["Daniel Brooks"]);
  fireEvent.change(search, { target: { value: "ffg.example" } });
  expect(agentRowNames()).toEqual(["Lucía Ferrer"]);
});

test("shows empty state when search matches nothing", async () => {
  await renderPage();
  fireEvent.change(screen.getByPlaceholderText("Search name, agency or email"), { target: { value: "zzz" } });
  expect(screen.getByText("No agents match that search.")).toBeInTheDocument();
  expect(screen.queryAllByTestId("agent-row")).toHaveLength(0);
});

test("shows an error when the list fails to load", async () => {
  service.list.mockRejectedValue(new Error("boom"));
  render(<MemoryRouter><AgentContactsPage /></MemoryRouter>);
  expect(await screen.findByText("Couldn't load agent contacts.")).toBeInTheDocument();
});

const recs = (total: number) => ({
  total,
  items: [
    { id: 11, player_name: "Kofi Mensah", recommended_position: "LWB", player_date_of_birth: "2005-03-01", submitted_at: "2026-11-25T09:00:00", status: "Under Review" as const },
  ],
});

test("opening a row fetches recs once and shows them", async () => {
  service.recentRecs.mockResolvedValue(recs(22));
  await renderPage();
  const danielRow = screen.getAllByTestId("agent-row")[1];
  fireEvent.click(danielRow);
  expect(danielRow).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByText("Kofi Mensah")).toBeInTheDocument();
  expect(screen.getByText("25 Nov 2026", { selector: "td" })).toBeInTheDocument();
  fireEvent.click(danielRow);
  expect(screen.queryByText("Kofi Mensah")).not.toBeInTheDocument();
  fireEvent.click(danielRow);
  await screen.findByText("Kofi Mensah");
  expect(service.recentRecs).toHaveBeenCalledTimes(1);
  expect(service.recentRecs).toHaveBeenCalledWith(7, 5);
});

test('footer says "View all 22 in External Recommendations" and links to /lists/external?agent=7', async () => {
  service.recentRecs.mockResolvedValue(recs(22));
  await renderPage();
  fireEvent.click(screen.getAllByTestId("agent-row")[1]);
  const link = await screen.findByRole("link", { name: /View all 22 in External Recommendations/ });
  expect(link).toHaveAttribute("href", "/lists/external?agent=7");
});

test('footer says "Open in External Recommendations" for 5 or fewer', async () => {
  service.recentRecs.mockResolvedValue(recs(3));
  await renderPage();
  fireEvent.click(screen.getAllByTestId("agent-row")[0]);
  expect(await screen.findByRole("link", { name: /Open in External Recommendations/ })).toHaveAttribute("href", "/lists/external?agent=1");
});

test("a failed recs load shows an error in the panel", async () => {
  service.recentRecs.mockRejectedValue(new Error("boom"));
  await renderPage();
  fireEvent.click(screen.getAllByTestId("agent-row")[0]);
  expect(await screen.findByText("Couldn't load recommendations.")).toBeInTheDocument();
});

test("clicking an email link does not open the row", async () => {
  await renderPage();
  fireEvent.click(screen.getByRole("link", { name: "dan@bm.example" }));
  expect(screen.getAllByTestId("agent-row")[1]).toHaveAttribute("aria-expanded", "false");
  expect(service.recentRecs).not.toHaveBeenCalled();
});

test("phone links strip spaces and blanks show a dash", async () => {
  await renderPage();
  expect(screen.getByRole("link", { name: "+44 7700 900456" })).toHaveAttribute("href", "tel:+447700900456");
  expect(within(screen.getAllByTestId("agent-row")[0]).getAllByText("—").length).toBeGreaterThan(0);
});


// --- scores ---------------------------------------------------------------------------------------

const SCORED = [
  contact({ agent_user_id: 7, name: "Daniel Brooks", rec_count: 22, avg_performance_score: 6.4, performance_scored_count: 9, avg_data_score: 106.8, data_scored_count: 14 }),
  contact({ agent_user_id: 3, name: "Lucía Ferrer", rec_count: 9, avg_performance_score: 7.25, performance_scored_count: 4, avg_data_score: 112.4, data_scored_count: 6 }),
  contact({ agent_user_id: 1, name: "Ana Costa", rec_count: 3, avg_performance_score: null, performance_scored_count: 0, avg_data_score: null, data_scored_count: 0 }),
];

test("agent score columns use full headings", async () => {
  await renderPage(SCORED);
  expect(screen.getByRole("button", { name: "Average performance" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Average data score" })).toBeInTheDocument();
  expect(screen.queryByText(/Avg /)).not.toBeInTheDocument();
});

test("agent averages render as chips, and an agent with none shows a dash", async () => {
  await renderPage(SCORED);
  const [ana, daniel, lucia] = screen.getAllByTestId("agent-row");
  expect(within(daniel).getByText("6.4")).toBeInTheDocument();
  expect(within(daniel).getByText("107")).toBeInTheDocument();
  expect(within(lucia).getByText("7.3")).toBeInTheDocument();
  expect(within(ana).getByTestId("avg-performance")).toHaveTextContent("—");
  expect(within(ana).getByTestId("avg-data")).toHaveTextContent("—");
});

test("hovering an average explains how many players it covers", async () => {
  await renderPage(SCORED);
  fireEvent.mouseOver(within(screen.getAllByTestId("agent-row")[1]).getByText("6.4"));
  expect(await screen.findByText("Average of 9 scouted players (of 22 recommendations)")).toBeInTheDocument();
});

test("sorting by Average data score puts the highest first and unscored agents last", async () => {
  await renderPage(SCORED);
  fireEvent.click(screen.getByRole("button", { name: "Average data score" }));
  expect(agentRowNames()).toEqual(["Lucía Ferrer", "Daniel Brooks", "Ana Costa"]);
  fireEvent.click(screen.getByRole("button", { name: /Average data score/ }));
  expect(agentRowNames()).toEqual(["Daniel Brooks", "Lucía Ferrer", "Ana Costa"]);
});

test("Intel Reviewers see no score columns", async () => {
  mockRole = "intel_reviewer";
  await renderPage(SCORED);
  expect(screen.queryByRole("button", { name: "Average performance" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Average data score" })).not.toBeInTheDocument();
});

test("the accordion shows each player's Performance and Data score", async () => {
  service.recentRecs.mockResolvedValue({
    total: 2,
    items: [
      { id: 11, player_name: "Kofi Mensah", recommended_position: "LWB", player_date_of_birth: "2005-03-01", submitted_at: "2026-11-25T09:00:00", status: "Under Review" as const,
        avg_performance_score: 7, data_score: { kind: "career" as const, value: 114.2, band: 4, band_name: "Strong starter", position: "LWB", season: "25/26", seasons: 3, min: 3000 } },
      { id: 12, player_name: "Ryan Clarke", recommended_position: "LWB", player_date_of_birth: "1999-11-30", submitted_at: "2026-08-24T09:00:00", status: "Submitted" as const,
        avg_performance_score: null, data_score: null },
    ],
  });
  await renderPage(SCORED);
  fireEvent.click(screen.getAllByTestId("agent-row")[1]);
  const kofi = (await screen.findByText("Kofi Mensah")).closest("tr") as HTMLElement;
  const panel = kofi.closest("table") as HTMLElement;
  expect(within(panel).getByRole("columnheader", { name: "Performance" })).toBeInTheDocument();
  expect(within(panel).getByRole("columnheader", { name: "Data score" })).toBeInTheDocument();
  expect(within(kofi).getByText("7.0")).toBeInTheDocument();
  expect(within(kofi).getByText("114")).toBeInTheDocument();
  const ryan = screen.getByText("Ryan Clarke").closest("tr") as HTMLElement;
  expect(within(ryan).getAllByText("—").length).toBe(2);
});


test("an average data score is rounded before its band is chosen", () => {
  expect(dataScoreDisplay(115.6)).toEqual({ value: 116, band: 5 });
  expect(dataScoreDisplay(115.4)).toEqual({ value: 115, band: 4 });
  expect(dataScoreDisplay(91.5)).toEqual({ value: 92, band: 1 });
});
