/**
 * Player List Preferences Utility
 *
 * Manages local storage for player notes, favorites, and decisions.
 *
 * Storage Strategy:
 * - Notes: Global (anyone can see/edit) - key: playerList_notes_{universalId}
 * - Favorites: User-specific - key: playerList_favorite_{userId}_{universalId}
 * - Decisions: User-specific - key: playerList_decision_{userId}_{universalId}
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

/**
 * Check if a player is favorited by a specific user
 * @param userId - The user's ID
 * @param universalId - The player's universal ID
 * @returns True if the player is favorited, false otherwise
 */
export const isPlayerFavorite = (userId: string, universalId: string): boolean => {
  if (!userId || !universalId) return false;
  return localStorage.getItem(`playerList_favorite_${userId}_${universalId}`) === "true";
};

/**
 * Toggle favorite status for a player (user-specific)
 * @param userId - The user's ID
 * @param universalId - The player's universal ID
 * @returns The new favorite status (true if now favorited, false if unfavorited)
 */
export const togglePlayerFavorite = (userId: string, universalId: string): boolean => {
  if (!userId || !universalId) return false;

  const key = `playerList_favorite_${userId}_${universalId}`;
  const currentStatus = localStorage.getItem(key) === "true";
  const newStatus = !currentStatus;

  if (newStatus) {
    localStorage.setItem(key, "true");
  } else {
    localStorage.removeItem(key);
  }

  return newStatus;
};

/**
 * Get all favorited player IDs for a specific user
 * @param userId - The user's ID
 * @returns Set of universal IDs that are favorited
 */
export const getAllFavorites = (userId: string): Set<string> => {
  if (!userId) return new Set();

  const favorites = new Set<string>();
  const prefix = `playerList_favorite_${userId}_`;

  // Iterate through all localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix) && localStorage.getItem(key) === "true") {
      const universalId = key.replace(prefix, "");
      favorites.add(universalId);
    }
  }

  return favorites;
};

/**
 * Check if a player is marked as a decision by a specific user
 * @param userId - The user's ID
 * @param universalId - The player's universal ID
 * @returns True if the player is marked as a decision, false otherwise
 */
export const isPlayerDecision = (userId: string, universalId: string): boolean => {
  if (!userId || !universalId) return false;
  return localStorage.getItem(`playerList_decision_${userId}_${universalId}`) === "true";
};

/**
 * Toggle decision status for a player (user-specific)
 * @param userId - The user's ID
 * @param universalId - The player's universal ID
 * @returns The new decision status (true if now marked, false if unmarked)
 */
export const togglePlayerDecision = (userId: string, universalId: string): boolean => {
  if (!userId || !universalId) return false;

  const key = `playerList_decision_${userId}_${universalId}`;
  const currentStatus = localStorage.getItem(key) === "true";
  const newStatus = !currentStatus;

  if (newStatus) {
    localStorage.setItem(key, "true");
  } else {
    localStorage.removeItem(key);
  }

  return newStatus;
};
