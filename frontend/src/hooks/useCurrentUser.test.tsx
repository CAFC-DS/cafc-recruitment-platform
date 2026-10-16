import React, { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import axiosInstance from "../axiosInstance";
import { CurrentUserProvider, useCurrentUser } from "./useCurrentUser";

let mockToken: string | null = "account-a";
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ token: mockToken }) }));
jest.mock("../axiosInstance", () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = axiosInstance.get as jest.Mock;
const staff = { id: 1, username: "a", role: "admin" };
const Consumer = ({ name }: { name: string }) => {
  const { user, loading, canAccessAdmin } = useCurrentUser();
  return <div data-testid={name}>{loading ? "loading" : user ? `${user.username}:${canAccessAdmin}` : "signed-out"}</div>;
};
const App = () => <StrictMode><CurrentUserProvider><Consumer name="guard" /><Consumer name="navbar" /><Consumer name="page" /></CurrentUserProvider></StrictMode>;
beforeEach(() => { get.mockReset(); mockToken = "account-a"; });

test("three consumers and StrictMode share one user request", async () => {
  get.mockResolvedValue({ data: staff });
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("a:true"));
  expect(screen.getByTestId("guard")).toHaveTextContent("a:true");
  expect(get).toHaveBeenCalledTimes(1);
});

test("account changes hide previous permissions and ignore late responses", async () => {
  let resolveA: (value: any) => void = () => {};
  let resolveB: (value: any) => void = () => {};
  get.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }));
  const { rerender } = render(<App />);
  mockToken = "account-b";
  get.mockImplementationOnce(() => new Promise(resolve => { resolveB = resolve; }));
  rerender(<App />);
  expect(screen.getByTestId("page")).toHaveTextContent("loading");
  await act(async () => { resolveA({ data: staff }); });
  expect(screen.getByTestId("page")).toHaveTextContent("loading");
  await act(async () => { resolveB({ data: { id: 2, username: "b", role: "scout" } }); });
  expect(screen.getByTestId("page")).toHaveTextContent("b:false");
  mockToken = null;
  rerender(<App />);
  expect(screen.getByTestId("page")).toHaveTextContent("signed-out");
  expect(get).toHaveBeenCalledTimes(2);
});

test("logout ignores an in-flight user response", async () => {
  let resolve: (value: any) => void = () => {};
  get.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { rerender } = render(<App />);
  mockToken = null;
  rerender(<App />);
  await act(async () => { resolve({ data: staff }); });
  expect(screen.getByTestId("page")).toHaveTextContent("signed-out");
});
