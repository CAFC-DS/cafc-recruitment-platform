import type { ListWithPlayers } from "../services/playerListsService";

export interface ListInclusions {
  includeSummerTransfers?: boolean;
  includeFavourites?: boolean;
}

/** Narrow the already-filtered results; inclusion never bypasses other filters. */
export function applyListInclusions(
  lists: ListWithPlayers[],
  options: ListInclusions,
  favourites: ReadonlySet<string>,
): ListWithPlayers[] {
  return lists.map(list => {
    const players = list.players.filter(player =>
      (options.includeSummerTransfers === true || !player.club_move) &&
      (options.includeFavourites !== false || !favourites.has(player.universal_id)),
    );
    return { ...list, players, player_count: players.length };
  });
}
