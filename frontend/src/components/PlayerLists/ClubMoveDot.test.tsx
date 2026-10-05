import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ClubMoveDot, { formatAppearanceDate } from "./ClubMoveDot";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: { colors: { surface: "#fff", border: "#ddd", text: "#111" } } }),
}));
const move = {
  from_club: "Old club", to_club: "New club",
  last_old_club_appearance: "2026-04-24", first_new_club_appearance: "2026-07-25",
};
test("renders no marker for unmatched players", () => {
  render(<ClubMoveDot />);
  expect(screen.queryByRole("button")).toBeNull();
});
test("formats appearance dates and handles missing dates", () => {
  expect(formatAppearanceDate("2026-07-25")).toBe("25/07/2026");
  expect(formatAppearanceDate(null)).toBe("Unknown");
  expect(formatAppearanceDate("invalid")).toBe("Unknown");
});
test("tap opens labelled details without activating the player row", async () => {
  const onRowClick = jest.fn();
  render(<div onClick={onRowClick}><ClubMoveDot move={move} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "View club move" }));
  await waitFor(() => expect(screen.getByText("Old club")).toBeTruthy());
  expect(screen.getByText("New club")).toBeTruthy();
  expect(screen.getByText("Last appearance at previous club: 24/04/2026")).toBeTruthy();
  expect(screen.getByText("First appearance at new club: 25/07/2026")).toBeTruthy();
  expect(onRowClick).not.toHaveBeenCalled();
});
test("keyboard focus opens details and Escape dismisses them", async () => {
  render(<ClubMoveDot move={{ ...move, first_new_club_appearance: null }} />);
  const button = screen.getByRole("button");
  fireEvent.focus(button);
  await waitFor(() => expect(screen.getByText("First appearance at new club: Unknown")).toBeTruthy());
  fireEvent.keyDown(button, { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("Old club")).toBeNull());
});
test("hover opens details", async () => {
  render(<ClubMoveDot move={move} />);
  fireEvent.mouseOver(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByText("Old club")).toBeTruthy());
});
