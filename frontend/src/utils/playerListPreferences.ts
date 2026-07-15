/**
 * Player List Preferences Utility
 *
 * Manages local storage for player notes.
 *
 * Storage Strategy:
 * - Notes: key: playerList_notes_{universalId}
 *
 * Favorites and decisions were previously stored here per-user (localStorage,
 * key: playerList_{favorite,decision}_{userId}_{universalId}) but are now
 * shared across all users with list access via the backend
 * (see /player-lists/flags in playerListsService.ts).
 */

/**
 * Get notes for a player (global storage)
 * @param universalId - The player's universal ID
 * @returns The notes text or empty string if none exist
 */
export const getPlayerNotes = (universalId: string): string => {
  if (!universalId) return "";
  return localStorage.getItem(`playerList_notes_${universalId}`) || "";
};

/**
 * Set notes for a player (global storage)
 * @param universalId - The player's universal ID
 * @param notes - The notes text to save
 */
export const setPlayerNotes = (universalId: string, notes: string): void => {
  if (!universalId) return;

  if (notes.trim() === "") {
    // Remove the key if notes are empty
    localStorage.removeItem(`playerList_notes_${universalId}`);
  } else {
    localStorage.setItem(`playerList_notes_${universalId}`, notes);
  }
};

