/**
 * Player Lists Service
 *
 * Centralized API service for all player list operations.
 * Handles API calls, caching, and error handling.
 */

import axiosInstance from "../axiosInstance";

// ========== Type Definitions ==========

export interface PlayerList {
  id: number;
  list_name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  created_by_username: string;
  created_by_firstname: string | null;
  created_by_lastname: string | null;
  player_count: number;
  avg_performance_score: number | null;
}

export interface PlayerInList {
  item_id: number;
  player_id: number | null;
  cafc_player_id: number | null;
  universal_id: string;
  display_order: number;
  notes: string | null;
  added_by: number;
  created_at: string;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  squad_name: string | null;
  age: number | null;
  added_by_username: string;
  stage: string;
  list_name?: string;
  list_id?: number | string;
  report_count: number;
  avg_performance_score: number | null;
  live_reports: number;
  video_reports: number;
}

export interface ListWithPlayers extends PlayerList {
  players: PlayerInList[];
}

export interface PlayerListMembership {
  list_id: number;
  list_name: string;
  description: string | null;
  item_id: number;
  stage: string;
  added_at: string | null;
}

// ========== API Methods ==========

/**
 * Get all player lists (summary only)
 */
export const getAllPlayerLists = async (): Promise<PlayerList[]> => {
  const response = await axiosInstance.get("/player-lists");
  return response.data.lists;
};

export interface PlayerListFilters {
  playerName?: string;
  position?: string;
  club?: string;
  minAge?: number;
  maxAge?: number;
  minScore?: number;
  maxScore?: number;
  minReports?: number;
  maxReports?: number;
  stages?: string; // Comma-separated
  recencyMonths?: number;
}

/**
 * Get all player lists with complete player details (optimized single query)
 */
export const getAllListsWithDetails = async (
  filters?: PlayerListFilters
): Promise<ListWithPlayers[]> => {
  const params = new URLSearchParams();

  if (filters) {
    if (filters.playerName) params.append("player_name", filters.playerName);
    if (filters.position) params.append("position", filters.position);
    if (filters.club) params.append("club", filters.club);
    if (filters.minAge !== undefined) params.append("min_age", filters.minAge.toString());
    if (filters.maxAge !== undefined) params.append("max_age", filters.maxAge.toString());
    if (filters.minScore !== undefined) params.append("min_score", filters.minScore.toString());
    if (filters.maxScore !== undefined) params.append("max_score", filters.maxScore.toString());
    if (filters.minReports !== undefined) params.append("min_reports", filters.minReports.toString());
    if (filters.maxReports !== undefined) params.append("max_reports", filters.maxReports.toString());
    if (filters.stages) params.append("stages", filters.stages);
    if (filters.recencyMonths !== undefined) params.append("recency_months", filters.recencyMonths.toString());
  }

  const url = params.toString()
    ? `/player-lists/all-with-details?${params.toString()}`
    : "/player-lists/all-with-details";

  const response = await axiosInstance.get(url);
  return response.data.lists;
};

/**
 * Get a specific player list with player details
 */
export const getPlayerListDetails = async (listId: number): Promise<ListWithPlayers> => {
  const response = await axiosInstance.get(`/player-lists/${listId}`);
  return response.data;
};

/**
 * Create a new player list
 */
export const createPlayerList = async (
  listName: string,
  description?: string
): Promise<{ message: string; list_id: number }> => {
  const response = await axiosInstance.post("/player-lists", {
    list_name: listName,
    description: description || null,
  });
  return response.data;
};

/**
 * Update an existing player list
 */
export const updatePlayerList = async (
  listId: number,
  listName: string,
  description?: string
): Promise<{ message: string }> => {
  const response = await axiosInstance.put(`/player-lists/${listId}`, {
    list_name: listName,
    description: description || null,
  });
  return response.data;
};

/**
 * Delete a player list
 */
export const deletePlayerList = async (listId: number): Promise<{ message: string }> => {
  const response = await axiosInstance.delete(`/player-lists/${listId}`);
  return response.data;
};

/**
 * Add a player to a list
 */
export const addPlayerToList = async (
  listId: number,
  universalId: string,
  reason: string,
  description?: string,
  stage: string = "Stage 1"
): Promise<{ message: string; item_id: number }> => {
  // Parse universal_id to get player_id or cafc_player_id
  let player_id = null;
  let cafc_player_id = null;

  if (universalId.startsWith("internal_")) {
    cafc_player_id = parseInt(universalId.replace("internal_", ""));
  } else if (universalId.startsWith("external_")) {
    player_id = parseInt(universalId.replace("external_", ""));
  }

  const response = await axiosInstance.post(`/player-lists/${listId}/players`, {
    player_id,
    cafc_player_id,
    stage,
    reason,
    description,
  });
  return response.data;
};

/**
 * Remove a player from a list
 */
export const removePlayerFromList = async (
  listId: number,
  itemId: number
): Promise<{ message: string }> => {
  const response = await axiosInstance.delete(`/player-lists/${listId}/players/${itemId}`);
  return response.data;
};

/**
 * Update a player's stage in a list
 */
export const updatePlayerStage = async (
  listId: number,
  itemId: number,
  stage: string,
  reason?: string,
  description?: string
): Promise<{ message: string; stage: string }> => {
  const response = await axiosInstance.put(`/player-lists/${listId}/players/${itemId}/stage`, {
    stage,
    reason,
    description,
  });
  return response.data;
};

/**
 * Reorder players in a list
 */
export const reorderPlayers = async (
  listId: number,
  newOrder: number[]
): Promise<{ message: string }> => {
  const response = await axiosInstance.put(`/player-lists/${listId}/reorder`, {
    new_order: newOrder,
  });
  return response.data;
};

/**
 * Get all lists a player belongs to
 */
export const getPlayerListMemberships = async (
  universalId: string
): Promise<PlayerListMembership[]> => {
  const response = await axiosInstance.get(`/players/${universalId}/lists`);
  return response.data.lists;
};

/**
 * Get list memberships for multiple players in a single batch query
 * This eliminates N+1 queries when displaying multi-list badges
 */
export const getBatchPlayerListMemberships = async (
  universalIds: string[]
): Promise<Record<string, PlayerListMembership[]>> => {
  if (!universalIds || universalIds.length === 0) {
    return {};
  }
  const response = await axiosInstance.post("/players/list-memberships/batch", universalIds);
  return response.data;
};

/**
 * Bulk add players to a list
 */
export const bulkAddPlayersToList = async (
  listId: number,
  players: { universal_id: string; stage?: string }[]
): Promise<{ message: string; added: number; skipped: number; errors: string[] }> => {
  const response = await axiosInstance.post(`/player-lists/${listId}/players/bulk`, {
    players,
  });
  return response.data;
};

/**
 * Bulk remove players from a list
 */
export const bulkRemovePlayersFromList = async (
  listId: number,
  itemIds: number[]
): Promise<{ message: string; removed: number }> => {
  const response = await axiosInstance.delete(`/player-lists/${listId}/players/bulk`, {
    data: { item_ids: itemIds },
  });
  return response.data;
};

/**
 * Search for players (reuse existing search endpoint)
 */
export const searchPlayers = async (query: string): Promise<any[]> => {
  if (!query || query.trim().length < 2) {
    return [];
  }
  const response = await axiosInstance.get(`/players/search?query=${encodeURIComponent(query)}`);
  // Backend returns the array directly, not wrapped in a 'players' key
  return response.data || [];
};

/**
 * Get valid reasons for stage changes
 */
export const getStageChangeReasons = async (
  stage: "stage1" | "archived"
): Promise<string[]> => {
  const response = await axiosInstance.get(`/stage-change-reasons?stage=${stage}`);
  return response.data.reasons;
};

/**
 * Get stage change history for a player in a list
 */
export const getPlayerStageHistory = async (
  listId: number,
  itemId: number
): Promise<any[]> => {
  const response = await axiosInstance.get(`/player-lists/${listId}/players/${itemId}/stage-history`);
  return response.data.history;
};

// ========== Export Utilities ==========

/**
 * Export players to CSV format
 */
export const exportPlayersToCSV = (players: PlayerInList[], filename: string = "players.csv"): void => {
  // Define CSV headers
  const headers = [
    "Player Name",
    "Age",
    "Position",
    "Club",
    "Stage",
    "Avg Score",
    "Reports",
    "Live Reports",
    "Video Reports",
  ];

  // Build CSV rows
  const rows = players.map((player) => [
    player.player_name,
    player.age || "N/A",
    player.position || "Unknown",
    player.squad_name || "Unknown",
    player.stage,
    player.avg_performance_score?.toFixed(1) || "N/A",
    player.report_count,
    player.live_reports,
    player.video_reports,
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export a player list to CSV
 */
export const exportListToCSV = async (listId: number): Promise<void> => {
  const list = await getPlayerListDetails(listId);
  const filename = `${list.list_name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.csv`;
  exportPlayersToCSV(list.players, filename);
};
