import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentContactsPage from "./AgentContactsPage";
import { agentContactsService } from "../services/agentContactsService";
import { contactLetter } from "../utils/agentContactsGrouping";

jest.mock("../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../services/agentContactsService", () => ({
  agentContactsService: { list: jest.fn(), recentRecs: jest.fn() },
}));

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

beforeEach(() => jest.clearAllMocks());

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
