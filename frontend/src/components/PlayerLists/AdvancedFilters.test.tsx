import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AdvancedFilters, PlayerListFilters } from "./AdvancedFilters";

const emptyFilters: PlayerListFilters = {
  playerName: "", position: "", club: "", competition: [], performanceScores: [],
  minAge: "", maxAge: "", minReports: "", maxReports: "", stages: [],
  archivedReasons: [], initialReasons: [], recencyMonths: "",
};

function setup() {
  const callbacks = {
    onFilterChange: jest.fn(), onClearFilters: jest.fn(),
    onShowArchivedChange: jest.fn(), onIncludeArchivedReportsChange: jest.fn(),
    onIncludeFlagReportsChange: jest.fn(),
  };
  render(<AdvancedFilters showFilters setShowFilters={jest.fn()}
    filters={emptyFilters} showArchived={false} includeArchivedReports={false}
    includeFlagReports={false} competitionOptions={["League One"]}
    archivedReasonOptions={["Scouting", "Budget", "Availability"]}
    initialReasonOptions={[]} {...callbacks} />);
  return callbacks;
}

test("holds multiple archive reasons and include options until Apply All", async () => {
  const callbacks = setup();
  fireEvent.change(screen.getByPlaceholderText("Enter player name"), { target: { value: "Smith" } });
  // The initial and archived reason selectors both start with this label.
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "All reasons" })[1]);
  });
  fireEvent.click(screen.getByLabelText("Budget"));
  fireEvent.click(screen.getByLabelText("Availability"));
  expect(screen.getByLabelText("Budget")).toBeChecked();
  expect(screen.getByLabelText("Availability")).toBeChecked();
  expect(screen.getByLabelText("Scouting")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "2 reasons selected" })).toHaveAttribute("aria-expanded", "true");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "None selected" }));
  });
  fireEvent.click(screen.getByLabelText("Include archived players"));
  fireEvent.click(screen.getByLabelText("Include archived reports in counts"));
  fireEvent.click(screen.getByLabelText("Include flag reports in counts"));
  Object.values(callbacks).forEach((callback) => expect(callback).not.toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Apply All" }));
  expect(callbacks.onFilterChange).toHaveBeenCalledTimes(1);
  expect(callbacks.onFilterChange).toHaveBeenCalledWith({
    ...emptyFilters, playerName: "Smith", archivedReasons: ["Budget", "Availability"],
  });
  expect(callbacks.onShowArchivedChange).toHaveBeenCalledWith(true);
  expect(callbacks.onIncludeArchivedReportsChange).toHaveBeenCalledWith(true);
  expect(callbacks.onIncludeFlagReportsChange).toHaveBeenCalledWith(true);
});

test("clearing filters stays pending until Apply All", () => {
  const callbacks = setup();
  fireEvent.change(screen.getByPlaceholderText("Enter player name"), { target: { value: "Smith" } });
  fireEvent.click(screen.getByRole("button", { name: /Clear All Filters/ }));
  expect(screen.getByPlaceholderText("Enter player name")).toHaveValue("");
  Object.values(callbacks).forEach((callback) => expect(callback).not.toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Apply All" }));
  expect(callbacks.onFilterChange).toHaveBeenCalledWith(emptyFilters);
  expect(callbacks.onShowArchivedChange).toHaveBeenCalledWith(false);
  expect(callbacks.onIncludeArchivedReportsChange).toHaveBeenCalledWith(false);
  expect(callbacks.onIncludeFlagReportsChange).toHaveBeenCalledWith(false);
});
