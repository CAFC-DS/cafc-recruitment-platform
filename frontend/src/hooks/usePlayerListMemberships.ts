/**
 * usePlayerListMemberships Hook
 *
 * Custom hook for fetching all lists a specific player belongs to.
 * Used to display multi-list badges on player cards.
 */

import { useState, useEffect } from "react";
import {
  getPlayerListMemberships,
  PlayerListMembership,
} from "../services/playerListsService";

interface UsePlayerListMembershipsReturn {
  memberships: PlayerListMembership[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all lists a player belongs to
 * @param universalId - The player's universal ID (internal_X or external_X)
 * @param enabled - Whether to fetch data (default: true)
 */
export const usePlayerListMemberships = (
  universalId: string,
  enabled: boolean = true
): UsePlayerListMembershipsReturn => {
  const [memberships, setMemberships] = useState<PlayerListMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemberships = async () => {
    if (!universalId || !enabled) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await getPlayerListMemberships(universalId);
      setMemberships(data);
    } catch (err: any) {
      console.error("Error fetching player list memberships:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to load player list memberships."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberships();
  }, [universalId, enabled]);

  return {
    memberships,
    loading,
    error,
    refetch: fetchMemberships,
  };
};
