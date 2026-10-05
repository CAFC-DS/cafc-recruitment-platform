/**
 * usePlayerLists Hook
 *
 * Custom hook for managing player lists data with caching and refetch capabilities.
 * Provides loading states, error handling, and optimized data fetching.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllListsWithDetails,
  ListWithPlayers,
  PlayerListFilters,
} from "../services/playerListsService";

interface UsePlayerListsReturn {
  lists: ListWithPlayers[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<ListWithPlayers[] | null>;
  setLists: React.Dispatch<React.SetStateAction<ListWithPlayers[]>>;
}

/**
 * Hook to fetch and manage all player lists with player details
 */
export const usePlayerLists = (filters?: PlayerListFilters): UsePlayerListsReturn => {
  const [lists, setLists] = useState<ListWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the latest request may update state: a slower, older fetch (different
  // filters) must never overwrite the results of a newer one.
  const abortRef = useRef<AbortController | null>(null);

  const fetchLists = useCallback(async (): Promise<ListWithPlayers[] | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const data = await getAllListsWithDetails(filters, controller.signal);
      if (abortRef.current !== controller) return null; // superseded
      setLists(data);
      return data;
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
        return null; // superseded by a newer request
      }
      console.error("Error fetching player lists:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to load player lists. Please try again."
      );
      return null;
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [filters]); // Refetch when filters change

  // Initial fetch and refetch when filters change
  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Cancel any in-flight request when the page unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    lists,
    loading,
    error,
    refetch: fetchLists,
    setLists,
  };
};
