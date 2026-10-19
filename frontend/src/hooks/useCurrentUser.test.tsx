import React, { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const jwt = (id: number, issued: number) => `header.${btoa(JSON.stringify({ sub: `user-${id}`, user_id: id, iat: issued }))}.signature`;
const PendingStages = () => {
  const [stage, setStage] = React.useState("");
  const [filter, setFilter] = React.useState("");
  return <><input aria-label="pending stage" value={stage} onChange={event => setStage(event.target.value)} />
    <input aria-label="list filter" value={filter} onChange={event => setFilter(event.target.value)} /></>;
};
const StageEditor = () => {
  const { user } = useCurrentUser();
  return user ? <PendingStages /> : null;
};
test("pending edits and filters survive renewal and temporary background errors, but not account changes", async () => {
  mockToken = jwt(1, 1);
  get.mockResolvedValueOnce({ data: staff });
  const app = () => <CurrentUserProvider><StageEditor /></CurrentUserProvider>;
  const { rerender } = render(app());
  const editor = await screen.findByLabelText("pending stage");
  fireEvent.change(editor, { target: { value: "Stage 3" } });
  fireEvent.change(screen.getByLabelText("list filter"), { target: { value: "Championship" } });
  let resolve: (value: any) => void = () => {};
  get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mockToken = jwt(1, 2);
  rerender(app());
  expect(screen.getByLabelText("pending stage")).toBe(editor);
  expect(editor).toHaveValue("Stage 3");
  expect(screen.getByLabelText("list filter")).toHaveValue("Championship");
  await act(async () => { resolve({ data: staff }); });
  expect(editor).toHaveValue("Stage 3");
  expect(screen.getByLabelText("list filter")).toHaveValue("Championship");
  get.mockRejectedValueOnce(new Error("temporary network error"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(screen.getByLabelText("pending stage")).toBe(editor);
  expect(editor).toHaveValue("Stage 3");
  expect(screen.getByLabelText("list filter")).toHaveValue("Championship");
  log.mockRestore();
  get.mockImplementationOnce(() => new Promise(() => {}));
  mockToken = jwt(2, 3);
  rerender(app());
  expect(screen.queryByLabelText("pending stage")).toBeNull();
});
