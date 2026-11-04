import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExternalRecommendationsListPage from "./ExternalRecommendationsListPage";
import { internalRecommendationsService } from "../services/internalRecommendationsService";

jest.mock("../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../services/internalRecommendationsService", () => ({
  internalRecommendationsService: {
    list: jest.fn(),
    getFiltersMeta: jest.fn(),
    getDetail: jest.fn(),
    getStatusHistory: jest.fn(),
    bulkUpdateStatus: jest.fn(),
    saveReview: jest.fn(),
  },
}));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: { isDark: false } }) }));
jest.mock("../components/recommendations/RecommendationReviewModal", () => ({ __esModule: true, default: () => null }));

let mockRole = "senior_manager";
jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { role: mockRole }, isIntelReviewer: mockRole === "intel_reviewer" }),
}));

const service = internalRecommendationsService as jest.Mocked<typeof internalRecommendationsService>;

const row = (overrides = {}) => ({
  id: 1,
  player_name: "Jon Smith",
  recommended_position: "RCB(3), DM",
  player_date_of_birth: "2000-01-01",
  submission_date: "2026-10-28T10:00:00",
  agent_name: "Pat Agent",
  status: "Submitted",
  potential_deal_type: "Permanent Transfer,Loan with Option",
  transfer_fee_amount: 650000,
  transfer_fee_currency: "GBP",
  expected_wages_per_week: 8000,
  expected_wages_currency: "GBP",
  wage_basis: "Gross",
  avg_performance_score: 7,
  data_score: { kind: "career", value: 120, band: 5, band_name: "Elite", position: "Centre-back", season: "25/26", seasons: 3, min: 3000 },
  linked_player_id: 42,
  ...overrides,
});

const respondWith = (items: object[], counts = { needs_decision: 42, all: 632 }) => {
  service.list.mockResolvedValue({ items, page: 1, page_size: 25, total: items.length, queue_counts: counts } as never);
};

const renderPage = () => render(<MemoryRouter><ExternalRecommendationsListPage /></MemoryRouter>);

beforeEach(() => {
  mockRole = "senior_manager";
  jest.clearAllMocks();
  service.getFiltersMeta.mockResolvedValue({ statuses: ["Submitted", "Under Review", "Archived Submission"], agents: [] } as never);
  respondWith([row()]);
});

test("opens on what needs a decision, with counts for both tabs", async () => {
  renderPage();
  await screen.findByText("Jon Smith");
  expect(service.list.mock.calls[0][0].status).toBe("Submitted,Under Review");
  expect(screen.getByRole("button", { name: /Needs decision/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Needs decision/ })).toHaveTextContent("42");
  expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("632");
});

test("the All tab loads every status", async () => {
  renderPage();
  await screen.findByText("Jon Smith");
  service.list.mockClear();
  fireEvent.click(screen.getByRole("button", { name: /^All/ }));
  await waitFor(() => expect(service.list).toHaveBeenCalled());
  expect(service.list.mock.calls[0][0].status).toBe("");
});

test("shows a row's details in the agreed columns", async () => {
  renderPage();
  const rowEl = (await screen.findByText("Jon Smith")).closest("tr")!;
  const cells = within(rowEl);
  expect(cells.getByText("7.0")).toBeInTheDocument();
  expect(cells.getByText("120")).toBeInTheDocument();
  expect(cells.getByText("RCB(3), DM")).toBeInTheDocument();
  expect(cells.getByText(/^Age \d+$/)).toBeInTheDocument();
  expect(cells.getByText("Pat Agent")).toBeInTheDocument();
  expect(cells.getByText("28/10/2026")).toBeInTheDocument();
  expect(cells.getByText("Perm, Loan+ · GBP 650,000")).toBeInTheDocument();
  expect(cells.getByText("GBP 8,000 p/w gross")).toBeInTheDocument();
});

test("changing a status queues it as unsaved until it is saved", async () => {
  service.bulkUpdateStatus.mockResolvedValue({ updated: 1, failed: 0, failures: [] } as never);
  renderPage();
  await screen.findByText("Jon Smith");
  fireEvent.change(screen.getByLabelText("Review status for Jon Smith"), { target: { value: "Under Review" } });
  expect(screen.getByText("Unsaved")).toBeInTheDocument();
  expect(service.bulkUpdateStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Save 1 Change/ }));
  await waitFor(() => expect(service.bulkUpdateStatus).toHaveBeenCalledWith([{ recommendation_id: 1, new_status: "Under Review" }]));
});

test("Intel Reviewers read status and can only view", async () => {
  mockRole = "intel_reviewer";
  renderPage();
  await screen.findByText("Jon Smith");
  expect(screen.queryByLabelText("Review status for Jon Smith")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View Jon Smith" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review Jon Smith" })).not.toBeInTheDocument();
});

test("only admins can select rows, and the email action needs a selection", async () => {
  renderPage();
  await screen.findByText("Jon Smith");
  expect(screen.queryByLabelText("Select Jon Smith for NCUC")).not.toBeInTheDocument();
});

test("selecting a row as an admin offers the email action", async () => {
  mockRole = "admin";
  renderPage();
  await screen.findByText("Jon Smith");
  expect(screen.queryByText(/Email users/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Select Jon Smith for NCUC"));
  expect(screen.getByRole("link", { name: /Email users \/ mark 1 NCUC/ })).toHaveAttribute("href", "/admin/email?ids=1");
});

test("resubmissions are a small tag that explains itself and opens the previous one", async () => {
  respondWith([row({ previous_recommendation_id: 9, resubmission_changes: "Now a loan" })]);
  service.getDetail.mockResolvedValue(row({ id: 9 }) as never);
  renderPage();
  const tag = await screen.findByRole("button", { name: "Resubmission" });
  fireEvent.mouseOver(tag);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Now a loan");
  fireEvent.click(tag);
  await waitFor(() => expect(service.getDetail).toHaveBeenCalledWith(9));
});

test("an empty queue says so and offers everything", async () => {
  respondWith([], { needs_decision: 0, all: 632 });
  renderPage();
  expect(await screen.findByText("Nothing is waiting for a decision.")).toBeInTheDocument();
  service.list.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "See all recommendations" }));
  await waitFor(() => expect(service.list.mock.calls[0][0].status).toBe(""));
});

test("a failed load shows an error", async () => {
  service.list.mockRejectedValue(new Error("nope"));
  renderPage();
  expect(await screen.findByText("Failed to load external recommendations")).toBeInTheDocument();
});
