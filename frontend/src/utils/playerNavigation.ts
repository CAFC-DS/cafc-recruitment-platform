/**
 * Utility functions for handling player navigation with both external and manual players
 */

import { Player } from "../types/Player";

/**
 * Get the correct navigation path for a player based on their ID type
 */
export const getPlayerProfilePath = (player: Player): string => {
  // If universal_id is available, parse it to determine the route
  if (player.universal_id) {
    if (player.universal_id.startsWith("internal_")) {
      const cafcId = player.universal_id.replace("internal_", "");
      return `/player-profile/${cafcId}`;
    } else if (player.universal_id.startsWith("external_")) {
      const playerId = player.universal_id.replace("external_", "");
      return `/player/${playerId}`;
    }
  }

  // Fallback to ID-based detection
  if (player.cafc_player_id) {
    return `/player-profile/${player.cafc_player_id}`;
  } else if (player.player_id) {
    return `/player/${player.player_id}`;
  }

  // Should not happen, but provide a fallback
  console.warn("Unable to determine player profile path for:", player);
  return `/player/${player.player_id || player.cafc_player_id || 0}`;
};

/**
 * Get the effective player ID for API calls (handles both external and manual players)
 */
export const getEffectivePlayerId = (player: Player): number | null => {
  return player.player_id || player.cafc_player_id || null;
};

/**
 * Check if a player is manual (internal) vs external
 */
export const isManualPlayer = (player: Player): boolean => {
  if (player.universal_id) {
    return player.universal_id.startsWith("manual_");
  }
  return Boolean(player.cafc_player_id && !player.player_id);
};
