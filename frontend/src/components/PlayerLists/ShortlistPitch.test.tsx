import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShortlistPitch, { getPitchPosition } from "./ShortlistPitch";
import type { ListWithPlayers, PlayerInList } from "../../services/playerListsService";

// jsdom cannot parse CSS variables in border colours; palette switching is
// covered by ThemeContext tests and browser verification.
jest.mock("../../styles/playerLists.theme", () => {
  const actual = jest.requireActual("../../styles/playerLists.theme");
  return { ...actual, getStageBgColor: (stage: string) => actual.originalStageColors[stage]?.bg || actual.originalStageColors["Stage 1"].bg };
});

const player = (id: number, name: string, stage: string): PlayerInList => ({
  item_id: id, player_id: id, cafc_player_id: id, universal_id: `external_${id}`,
  display_order: 0, notes: null, added_by: 1, created_at: "2026-10-20", player_name: name,
  first_name: name, last_name: null, position: null, squad_name: "Test Club", age: 22,
  added_by_username: "test", stage, report_count: 0, avg_performance_score: null, live_reports: 0, video_reports: 0,
});
const list = (id: number, name: string, players: PlayerInList[]): ListWithPlayers => ({
  id, list_name: name, description: null, user_id: 1, created_at: "2026-10-20", updated_at: "2026-10-20",
  created_by_username: "test", created_by_firstname: null, created_by_lastname: null,
  player_count: players.length, avg_performance_score: null, players,
});
beforeEach(() => localStorage.clear());

const baseProps = { stages: ["Stage 4", "Stage 5"], onStagesChange: jest.fn(), getPlayerPath: (id: string) => `/player/${id}` };

test("shows current stages per positional membership and excludes archived and earlier stages", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[
    list(1, "LCB", [player(1, "Shared Player", "Stage 4"), player(2, "Archived Player", "Archived"), player(3, "Earlier Player", "Stage 3")]),
    list(2, "RCB", [player(1, "Shared Player", "Stage 5")]),
  ]} /></MemoryRouter>);
  expect(screen.queryByText("Archived Player")).not.toBeInTheDocument();
  expect(screen.queryByText("Earlier Player")).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "LCB players" })).getByLabelText("Stage 4")).toHaveStyle({ borderColor: "#16a34a" });
  expect(within(screen.getByRole("region", { name: "RCB players" })).getByLabelText("Stage 5")).toHaveStyle({ borderColor: "#7c3aed" });
  expect(screen.getAllByRole("link", { name: /Shared Player/ })).toHaveLength(2);
});

test("honours pending removals and stage changes without dropping custom lists", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} pendingRemovals={new Set([1])} pendingStageChanges={new Map([[2, "Stage 5"]])} lists={[
    list(1, "DM/CM", [player(1, "Removed Player", "Stage 4")]),
    list(2, "Priority targets", [player(2, "Promoted Player", "Stage 3")]),
  ]} /></MemoryRouter>);
  expect(screen.queryByText("Removed Player")).not.toBeInTheDocument();
  const custom = screen.getByRole("region", { name: "Priority targets players" });
  expect(within(custom).getByRole("link", { name: /Promoted Player/ })).toHaveAttribute("href", "/player/external_2");
  expect(within(custom).getByLabelText("Stage 5")).toBeInTheDocument();
});

test("last selected stage stays selected until another stage is enabled", () => {
  const onStagesChange = jest.fn();
  render(<MemoryRouter><ShortlistPitch {...baseProps} stages={["Stage 5"]} onStagesChange={onStagesChange} lists={[]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Stage 5" }));
  expect(screen.getByRole("button", { name: "Stage 5" })).toBeDisabled();
  expect(onStagesChange).not.toHaveBeenCalled();
  expect(screen.getByText(/No players match/)).toBeInTheDocument();
});

test("resetting stage filters restores all active stages and keeps archived players hidden", () => {
  const lists = [list(1, "CF", [
    player(1, "Early Target", "Stage 1"),
    player(2, "Priority Target", "Stage 5"),
    player(3, "Archived Target", "Archived"),
  ])];
  const { rerender } = render(<MemoryRouter><ShortlistPitch {...baseProps} stages={["Stage 5"]} lists={lists} /></MemoryRouter>);
  expect(screen.queryByRole("link", { name: /Early Target/ })).not.toBeInTheDocument();

  rerender(<MemoryRouter><ShortlistPitch {...baseProps} stages={[]} lists={lists} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Early Target/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Priority Target/ })).toBeInTheDocument();
  expect(screen.queryByText("Archived Target")).not.toBeInTheDocument();
  expect(screen.getByText(/2 positional entries shown/)).toBeInTheDocument();
  expect(screen.queryByText(/No players match/)).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("Stage totals")).getAllByRole("button", { pressed: true })).toHaveLength(5);
  expect(screen.getByLabelText("Stage totals")).toHaveTextContent("Stage 11");
});

test("stage toggles narrow an all-stages filter using the stages actually displayed", () => {
  const onStagesChange = jest.fn();
  render(<MemoryRouter><ShortlistPitch {...baseProps} stages={[]} onStagesChange={onStagesChange} lists={[]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Stage 2" }));
  expect(onStagesChange).toHaveBeenCalledWith(["Stage 1", "Stage 3", "Stage 4", "Stage 5"]);
});

test("matches whole position tokens without confusing centre-back sides or arbitrary list names", () => {
  expect(getPitchPosition("RCB")).toBe("RCB");
  expect(getPitchPosition("LB / LWB")).toBe("LB/LWB");
  expect(getPitchPosition("Summer DM/CM targets")).toBe("DM/CM");
  expect(getPitchPosition("Academy recommendations")).toBeNull();
});


test("reserves a central CCB slot and counts positional entries across stages", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[
    list(1, "LCB", [player(1, "Left Defender", "Stage 4")]),
    list(2, "RCB", [player(2, "Right Defender", "Stage 5")]),
  ]} /></MemoryRouter>);
  expect(within(screen.getByRole("region", { name: "CCB players" })).getByText("List not selected")).toBeInTheDocument();
  const totals = screen.getByLabelText("Stage totals");
  expect(totals).toHaveTextContent("Stage 41");
  expect(totals).toHaveTextContent("Stage 51");
  expect(screen.getByText(/2 positional entries shown/)).toBeInTheDocument();
});

test("handles a missing player name without crashing the pitch", () => {
  const unnamed = { ...player(99, "", "Stage 4"), player_name: null } as unknown as PlayerInList;
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[list(1, "CF", [unnamed, player(100, "Named player", "Stage 4")])]} /></MemoryRouter>);
  expect(screen.getByText("Unnamed player")).toBeInTheDocument();
});

test("All stages explicitly resets the shared stage filter", () => {
  const onStagesChange = jest.fn();
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[]} onStagesChange={onStagesChange} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "All stages" }));
  expect(onStagesChange).toHaveBeenCalledWith([]);
});

test("formation reserves separate attack and defence halves with fullbacks first in defence", () => {
  const { container } = render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[]} /></MemoryRouter>);
  const defence = container.querySelector('.shortlist-pitch__half--defence')!;
  expect(within(defence as HTMLElement).getByRole('region', { name:'LB/LWB players' })).toBeInTheDocument();
  expect(within(defence as HTMLElement).getByRole('region', { name:'RB/RWB players' })).toBeInTheDocument();
  expect(within(defence as HTMLElement).queryByRole('region', { name:'DM/CM players' })).not.toBeInTheDocument();
});


test("focus keeps names, exits on Escape and restores keyboard focus", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[list(1, "CF", [player(1, "Focus Target", "Stage 4")])]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
  expect(screen.getByRole('button', { name: 'Exit focus' })).toHaveFocus();
  expect(screen.getByRole('link', { name: /Focus Target/ })).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Exit focus' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Focus' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('');
});

test("club visibility and density change without hiding player names", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} lists={[list(1, "CF", [player(1, "Visible Target", "Stage 4")])]} /></MemoryRouter>);
  expect(screen.queryByText('Test Club')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Club names' }));
  expect(screen.getByText('Test Club')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Comfortable' }));
  expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: /Visible Target/ })).toBeInTheDocument();
});


test("Focus announces filter context and position jump moves keyboard focus", () => {
  render(<MemoryRouter><ShortlistPitch {...baseProps} filterSummary={["Age: 18–23"]} lists={[list(1, "CF", [player(1, "Target", "Stage 4")])]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
  const dialog = screen.getByRole('dialog', { name: 'Recruitment shortlist pitch map' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(within(dialog).getByText('Age: 18–23')).toBeInTheDocument();
  const heading = within(screen.getByRole('region', { name: 'CF players' })).getByRole('heading');
  heading.scrollIntoView = jest.fn();
  fireEvent.change(screen.getByRole('combobox', { name: 'Jump to position' }), { target: { value: 'CF' } });
  expect(heading).toHaveFocus();
  expect(heading.scrollIntoView).toHaveBeenCalled();
});

test("display preferences survive remount without losing names", () => {
  const props = { ...baseProps, lists: [list(1, "CF", [player(1, "Saved Target", "Stage 4")])] };
  const { unmount } = render(<MemoryRouter><ShortlistPitch {...props} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Comfortable' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Club names' }));
  unmount();
  render(<MemoryRouter><ShortlistPitch {...props} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('checkbox', { name: 'Club names' })).toBeChecked();
  expect(screen.getByText('Saved Target')).toBeInTheDocument();
});
