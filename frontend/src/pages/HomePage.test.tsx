import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import HomePage from "./HomePage";

jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ token: "staff" }) }));
jest.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: { role: "admin", firstname: "Test", lastname: "User" } }) }));
jest.mock("../components/PlayerReportModal", () => () => null);
jest.mock("../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = axiosInstance.get as jest.Mock;
type Pending = { url: string; resolve: (value: any) => void; reject: (error: any) => void };
let pending: Pending[];
beforeEach(() => {
  global.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn(), unobserve: jest.fn() })) as any;
  pending = [];
  get.mockReset().mockImplementation((url: string) => {
    if (url === "/database/metadata") return Promise.resolve({ data: {} });
    return new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
  });
});
const mount = () => render(<MemoryRouter><HomePage /></MemoryRouter>);
const reports = (name: string) => ({ data: { reports: [{ report_id: 1, player_name: name, scout_name: "Scout", created_at: "2026-10-16", report_type: "Player Assessment", performance_score: 7, attribute_score: 7 }], has_more: false } });

test("finished dashboard sections remain visible while another fails", async () => {
  mount();
  expect(screen.getByText(/Welcome, Test User/)).toBeInTheDocument();
  expect(pending).toHaveLength(3);
  await act(async () => { pending[0].resolve(reports("Early Player")); });
  expect(screen.getByText("Early Player")).toBeInTheDocument();
  expect(screen.getAllByText("Loading reports…")).toHaveLength(2);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => { pending[1].reject(new Error("database unavailable")); });
  expect(screen.getByText("Early Player")).toBeInTheDocument();
  expect(screen.getByText(/Reports could not be loaded/)).toBeInTheDocument();
  log.mockRestore();
  expect(get.mock.calls.some(([url]) => url === "/users/me")).toBe(false);
});

test("changing the recency filter discards stale results", async () => {
  mount();
  const previous = pending[0];
  fireEvent.change(screen.getByDisplayValue("Last 7 Days"), { target: { value: "30" } });
  await act(async () => { previous.resolve(reports("Stale Player")); pending[3].resolve(reports("Current Player")); });
  expect(screen.queryByText("Stale Player")).not.toBeInTheDocument();
  expect(screen.getByText("Current Player")).toBeInTheDocument();
});
