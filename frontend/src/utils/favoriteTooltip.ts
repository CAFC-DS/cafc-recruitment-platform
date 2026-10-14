import type { FavoriteDetails } from "../services/playerListsService";

export const favoriteTooltip = (details?: FavoriteDetails | null): string => {
  const date = details?.favorited_at ? new Date(details.favorited_at) : null;
  const since = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Unknown";
  return `Favourited since: ${since}\nFavourited by: ${details?.favorited_by || "Unknown"}`;
};
