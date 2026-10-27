import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PitchViewListSelector } from "./PitchViewListSelector";

test("positioned and custom lists can be toggled with the keyboard", () => {
  const onToggleList = jest.fn();
  render(<PitchViewListSelector
    lists={[
      { id: 1, list_name: "CF", player_count: 3 },
      { id: 2, list_name: "Priority targets", player_count: 2 },
    ]}
    visibleListIds={new Set([1])}
    onToggleList={onToggleList}
  />);

  const positioned = screen.getByRole("button", { name: "CF (3)", pressed: true });
  const custom = screen.getByRole("button", { name: "Priority targets (2)", pressed: false });
  userEvent.tab();
  expect(positioned).toHaveFocus();
  userEvent.keyboard("{Enter}");
  expect(onToggleList).toHaveBeenLastCalledWith(1);

  userEvent.tab();
  expect(custom).toHaveFocus();
  userEvent.keyboard(" ");
  expect(onToggleList).toHaveBeenLastCalledWith(2);
});
