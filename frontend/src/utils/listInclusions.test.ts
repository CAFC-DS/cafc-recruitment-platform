import { applyListInclusions } from "./listInclusions";
import type { ListWithPlayers, PlayerInList } from "../services/playerListsService";
const player = (id: string, moved = false) => ({ universal_id: id, club_move: moved ? { from_club: "Old", to_club: "New", last_old_club_appearance: null, first_new_club_appearance: null } : null } as PlayerInList);
const lists = [{ id: 1, player_count: 4, players: [player("normal"), player("favourite"), player("transfer", true), player("both", true)] }] as ListWithPlayers[];
const favourites = new Set(["favourite", "both"]);
const ids = (options: Parameters<typeof applyListInclusions>[1]) => applyListInclusions(lists, options, favourites)[0].players.map(p => p.universal_id);
it("includes favourites and excludes pink-dot players by default", () => {
  expect(ids({})).toEqual(["normal", "favourite"]);
});
it("applies the two inclusion choices independently, including overlaps", () => {
  expect(ids({ includeSummerTransfers: true })).toEqual(["normal", "favourite", "transfer", "both"]);
  expect(ids({ includeFavourites: false })).toEqual(["normal"]);
  expect(ids({ includeSummerTransfers: true, includeFavourites: false })).toEqual(["normal", "transfer"]);
});
it("updates list counts, leaves source data intact, and never injects favourites", () => {
  expect(applyListInclusions(lists, {}, favourites)[0].player_count).toBe(2);
  expect(lists[0].players).toHaveLength(4);
  expect(applyListInclusions([{...lists[0], players:[player("normal")]}], {includeFavourites:true}, favourites)[0].players).toHaveLength(1);
});
