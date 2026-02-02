/**
 * usePlayerLists Hook
 *
 * Custom hook for managing player lists data with caching and refetch capabilities.
 * Provides loading states, error handling, and optimized data fetching.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getAllListsWithDetails,
  ListWithPlayers,
  PlayerListFilters,
} from "../services/playerListsService";

interface UsePlayerListsReturn {
  lists: ListWithPlayers[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setLists: React.Dispatch<React.SetStateAction<ListWithPlayers[]>>;
}

/**
 * Hook to fetch and manage all player lists with player details
 */
export const usePlayerLists = (filters?: PlayerListFilters): UsePlayerListsReturn => {
  const [lists, setLists] = useState<ListWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getAllListsWithDetails(filters);
      setLists(data);
    } catch (err: any) {
      console.error("Error fetching player lists:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to load player lists. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [filters]); // Refetch when filters change

  // Initial fetch and refetch when filters change
  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  return {
    lists,
    loading,
    error,
    refetch: fetchLists,
    setLists,
  };
};
