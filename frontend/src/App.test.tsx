import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./axiosInstance", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("axios", () => ({ __esModule: true, default: { isAxiosError: jest.fn() } }));

test("the public login route loads without authenticated data requests", async () => {
  localStorage.clear();
  window.history.replaceState({}, "", "/login");
  render(<App />);
  expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});
