import React from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Preference() {
  const { useNewStageColours, toggleStageColours, toggleDarkMode } = useTheme();
  return <><button onClick={toggleStageColours}>{useNewStageColours ? "New" : "Original"}</button><button onClick={toggleDarkMode}>Theme</button></>;
}

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); });
afterEach(cleanup);

it("switches all middle stage colours and restores the original palette", () => {
  render(<ThemeProvider><Preference /></ThemeProvider>);
  const colour = (stage: number) => document.documentElement.style.getPropertyValue(`--recruitment-stage-${stage}-bg`);
  expect([colour(2), colour(3), colour(4)]).toEqual(["#f59e0b", "#3b82f6", "#16a34a"]);
  fireEvent.click(screen.getByText("Original"));
  expect([colour(2), colour(3), colour(4)]).toEqual(["#a65d32", "#a44d70", "#674464"]);
  expect(document.documentElement.style.getPropertyValue("--recruitment-analytics-stage-4-bg")).toBe("#674464");
  expect(colour(1)).toBe("#6b7280");
  expect(colour(5)).toBe("#7c3aed");
  fireEvent.click(screen.getByText("New"));
  expect(document.documentElement.style.getPropertyValue("--recruitment-analytics-stage-4-bg")).toBe("#15803d");
  expect([colour(2), colour(3), colour(4)]).toEqual(["#f59e0b", "#3b82f6", "#16a34a"]);
});

it("restores the choice after remounting and keeps it when changing theme", () => {
  const view = render(<ThemeProvider><Preference /></ThemeProvider>);
  fireEvent.click(screen.getByText("Original"));
  expect(localStorage.getItem("recruitmentStageColours")).toBe("new");
  view.unmount();
  render(<ThemeProvider><Preference /></ThemeProvider>);
  expect(screen.getByText("New")).toBeTruthy();
  fireEvent.click(screen.getByText("Theme"));
  expect(document.documentElement.style.getPropertyValue("--recruitment-stage-4-bg")).toBe("#674464");
});
