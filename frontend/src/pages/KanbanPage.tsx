/**
 * KanbanPage Component - REDESIGNED
 *
 * Clean Kanban view for player lists with:
 * - Stage-based columns (Stage 1-4) spanning full width
 * - List selection with toggle pills
 * - Drag & drop stage changes
 * - Batch save mode for stage changes
 * - Better empty states
 * - Optimized data fetching
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Container,
  Button,
  Alert,
  Form,
  ListGroup,
  Modal,
  Badge,
  Spinner,
  Dropdown,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { usePlayerLists } from "../hooks/usePlayerLists";
import KanbanBoard from "../components/Kanban/KanbanBoard";
import { PlayerList } from "../components/Kanban/KanbanColumn";
import { PlayerInList } from "../components/Kanban/PlayerKanbanCard";
import EmptyState from "../components/PlayerLists/EmptyState";
import { AdvancedFilters, PlayerListFilters as AdvancedFiltersType } from "../components/PlayerLists/AdvancedFilters";
import { PitchViewListSelector } from "../components/PlayerLists/PitchViewListSelector";
import PlayerNotesModal from "../components/PlayerLists/PlayerNotesModal";
import StageChangeReasonModal from "../components/PlayerLists/StageChangeReasonModal";
import StageHistoryModal from "../components/PlayerLists/StageHistoryModal";
import { getPlayerNotes, setPlayerNotes, isPlayerFavorite, togglePlayerFavorite } from "../utils/playerListPreferences";
import {
  createPlayerList,
  updatePlayerList,
  deletePlayerList,
  addPlayerToList,
  removePlayerFromList,
  updatePlayerStage,
  searchPlayers,
  exportPlayersToCSV,
  getBatchPlayerListMemberships,
  getStageChangeReasons,
  getPlayerStageHistory,
  PlayerListMembership,
  PlayerListFilters,
} from "../services/playerListsService";
import {
  colors,
  borderRadius,
  buttonStyles,
  badgeStyles,
} from "../styles/playerLists.theme";

interface PlayerSearchResult {
  player_id: number;
  cafc_player_id: number | null;
  player_name: string;
  position: string | null;
  squad_name: string | null;
  age: number | null;
  universal_id: string;
}

const KanbanPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, loading: userLoading, canAccessLists } = useCurrentUser();

  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AdvancedFiltersType>({
    playerName: "",
    position: "",
    club: "",
    performanceScores: [],
    minAge: "",
    maxAge: "",
    minReports: "",
    maxReports: "",
    stages: [],
    recencyMonths: "",
  });

  // Debounced filters for API
  const [debouncedFilters, setDebouncedFilters] = useState<PlayerListFilters>({});

  // Use the custom hook for data fetching
  const { lists, loading, error: fetchError, refetch } = usePlayerLists(debouncedFilters);

  // Local error state
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [visibleListIds, setVisibleListIds] = useState<Set<number>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [includeArchivedReports, setIncludeArchivedReports] = useState(false);
  const [includeFlagReports, setIncludeFlagReports] = useState(false);

  // Pitch view expanded toggle
  const [pitchViewExpanded, setPitchViewExpanded] = useState(false);

  // Sort state
  type SortField = "name" | "age" | "club" | "stage" | "score" | "reports" | "favorites";
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Batch save mode for stage changes and removals
  const [pendingStageChanges, setPendingStageChanges] = useState<Map<number, { fromStage: string; toStage: string; listId: number }>>(new Map());
  const [pendingRemovals, setPendingRemovals] = useState<Map<number, number>>(new Map()); // itemId -> listId
  const [savingChanges, setSavingChanges] = useState(false);

  // Batch list memberships (for MultiListBadges performance)
  const [batchMemberships, setBatchMemberships] = useState<Record<string, PlayerListMembership[]>>({});
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  // Modals
  const [showListModal, setShowListModal] = useState(false);
  const [editingList, setEditingList] = useState<PlayerList | null>(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Add player modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [currentListId, setCurrentListId] = useState<number | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Remove player state
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);

  // Notes and favorites state
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedPlayerForNotes, setSelectedPlayerForNotes] = useState<{
    universalId: string;
    name: string;
  } | null>(null);
  const [playerFavorites, setPlayerFavorites] = useState<Set<string>>(new Set());

  // Stage change reason modal state
  const [showStageReasonModal, setShowStageReasonModal] = useState(false);
  const [stageReasonModalData, setStageReasonModalData] = useState<{
    playerName: string;
    targetStage: "Stage 1" | "Archived";
    itemId: number;
    oldStage: string;
    listId: number;
  } | null>(null);
  const [stage1Reasons, setStage1Reasons] = useState<string[]>([]);
  const [archivedReasons, setArchivedReasons] = useState<string[]>([]);
  const [loadingReasons, setLoadingReasons] = useState(false);

  // Stage history modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyModalData, setHistoryModalData] = useState<{
    listId: number;
    itemId: number;
    playerName: string;
  } | null>(null);

  // Archive info cache for popover
  const [archiveInfoCache, setArchiveInfoCache] = useState<{
    [key: string]: {
      reason: string;
      date: string | null;
      changedBy: string;
      previousStage: string | null;
    } | null;
  }>({});

  // Temporary player selection for add modal
  const [tempSelectedPlayer, setTempSelectedPlayer] = useState<PlayerSearchResult | null>(null);

  // Permission check - redirect if unauthorized
  useEffect(() => {
    if (!userLoading && !canAccessLists) {
      navigate("/");
    }
  }, [userLoading, canAccessLists, navigate]);

  // Fetch stage change reasons on mount
  useEffect(() => {
    const fetchReasons = async () => {
      setLoadingReasons(true);
      try {
        const [stage1, archived] = await Promise.all([
          getStageChangeReasons("stage1"),
          getStageChangeReasons("archived"),
        ]);
        setStage1Reasons(stage1);
        setArchivedReasons(archived);
      } catch (err) {
        console.error("Error fetching stage change reasons:", err);
      } finally {
        setLoadingReasons(false);
      }
    };
    fetchReasons();
  }, []);

  // Don't auto-select lists - let user choose
  // useEffect removed - lists start deselected

  // Merge fetch error with local error
  useEffect(() => {
    if (fetchError) {
      setError(fetchError);
    }
  }, [fetchError]);

  // Debounce filters (500ms delay like scouting page)
  useEffect(() => {
    const timer = setTimeout(() => {
      const apiFilters: PlayerListFilters = {};

      if (filters.playerName) apiFilters.playerName = filters.playerName;
      if (filters.position) apiFilters.position = filters.position;
      if (filters.club) apiFilters.club = filters.club;
      if (filters.minAge) apiFilters.minAge = parseInt(filters.minAge);
      if (filters.maxAge) apiFilters.maxAge = parseInt(filters.maxAge);
      if (filters.minReports) apiFilters.minReports = parseInt(filters.minReports);
      if (filters.maxReports) apiFilters.maxReports = parseInt(filters.maxReports);
      if (filters.recencyMonths) apiFilters.recencyMonths = parseInt(filters.recencyMonths);

      // Handle performance scores array
      if (filters.performanceScores.length > 0) {
        const scores = filters.performanceScores.sort((a, b) => a - b);
        apiFilters.minScore = scores[0];
        apiFilters.maxScore = scores[scores.length - 1];
      }

      // Handle stages array
      if (filters.stages.length > 0) {
        apiFilters.stages = filters.stages.join(",");
      }

      // Include archived reports in counts
      apiFilters.includeArchivedReports = includeArchivedReports;

      // Include flag reports in counts
      apiFilters.includeFlagReports = includeFlagReports;

      setDebouncedFilters(apiFilters);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters, includeArchivedReports, includeFlagReports]);

  // Filter handlers
  const handleFilterChange = useCallback((newFilters: Partial<AdvancedFiltersType>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({
      playerName: "",
      position: "",
      club: "",
      performanceScores: [],
      minAge: "",
      maxAge: "",
      minReports: "",
      maxReports: "",
      stages: [],
      recencyMonths: "",
    });
    setShowArchived(false);
  }, []);

  // Get visible lists
  const visibleLists = useMemo(() => {
    return lists.filter((list) => visibleListIds.has(list.id));
  }, [lists, visibleListIds]);

  // For backwards compatibility, use first visible list as "current" for certain operations
  const currentList = useMemo(() => {
    return visibleLists.length === 1 ? visibleLists[0] : null;
  }, [visibleLists]);

  /**
   * Transform lists into stage-based columns
   * Only show columns for stages selected in the filter (or all if no filter)
   */
  const stageColumns = useMemo(() => {
    // Determine which stages to show
    const stagesToShow = filters.stages.length > 0
      ? filters.stages
      : ["Stage 1", "Stage 2", "Stage 3", "Stage 4", ...(showArchived ? ["Archived"] : [])];

    // Initialize stages object with only the stages to show
    const stages: Record<string, PlayerInList[]> = {};
    stagesToShow.forEach(stage => {
      stages[stage] = [];
    });

    lists.forEach((list) => {
      // Skip lists that are not visible
      if (!visibleListIds.has(list.id)) return;

      list.players.forEach((player) => {
        // Filter out players with pending removals (optimistic update)
        if (pendingRemovals.has(player.item_id)) {
          return;
        }

        // Check if this player has a pending stage change (optimistic update)
        const pendingChange = pendingStageChanges.get(player.item_id);
        const stage = pendingChange ? pendingChange.toStage : (player.stage || "Stage 1");

        const stageArray = stages[stage as keyof typeof stages];
        if (stageArray) {
          stageArray.push({
            ...player,
            list_id: list.id,
            list_name: list.list_name,
          });
        }
      });
    });

    // Sort players within each stage
    const sortPlayers = (players: PlayerInList[]) => {
      return [...players].sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortField) {
          case "name":
            aVal = a.player_name?.toLowerCase() || "";
            bVal = b.player_name?.toLowerCase() || "";
            break;
          case "age":
            aVal = a.age || 0;
            bVal = b.age || 0;
            break;
          case "club":
            aVal = a.squad_name?.toLowerCase() || "";
            bVal = b.squad_name?.toLowerCase() || "";
            break;
          case "stage":
            aVal = a.stage?.toLowerCase() || "";
            bVal = b.stage?.toLowerCase() || "";
            break;
          case "score":
            aVal = a.avg_performance_score || 0;
            bVal = b.avg_performance_score || 0;
            break;
          case "reports":
            aVal = a.report_count || 0;
            bVal = b.report_count || 0;
            break;
          case "favorites":
            aVal = playerFavorites.has(a.universal_id) ? 1 : 0;
            bVal = playerFavorites.has(b.universal_id) ? 1 : 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    };

    // Convert to array format for KanbanBoard
    return Object.entries(stages).map(([stageName, players]) => ({
      id: stageName,
      list_name: stageName,
      description: null,
      user_id: 0,
      created_at: "",
      updated_at: "",
      created_by_username: "",
      created_by_firstname: null,
      created_by_lastname: null,
      player_count: players.length,
      avg_performance_score:
        players.length > 0
          ? players.reduce((sum, p) => sum + (p.avg_performance_score || 0), 0) /
            players.filter((p) => p.avg_performance_score).length
          : null,
      players: sortPlayers(players),
    }));
  }, [lists, visibleListIds, pendingStageChanges, pendingRemovals, showArchived, filters.stages, sortField, sortDirection, playerFavorites]);

  /**
   * Fetch batch memberships when stage columns change
   * This eliminates N+1 queries - one batch request instead of one per player
   */
  useEffect(() => {
    const fetchBatchMemberships = async () => {
      // Collect all unique universal_ids from all stage columns
      const allUniversalIds = new Set<string>();
      stageColumns.forEach((column) => {
        column.players.forEach((player) => {
          allUniversalIds.add(player.universal_id);
        });
      });

      if (allUniversalIds.size === 0) {
        setBatchMemberships({});
        return;
      }

      try {
        setLoadingMemberships(true);
        const universalIdsArray = Array.from(allUniversalIds);
        const memberships = await getBatchPlayerListMemberships(universalIdsArray);
        setBatchMemberships(memberships);
      } catch (err) {
        console.error("Error fetching batch memberships:", err);
        setBatchMemberships({});
      } finally {
        setLoadingMemberships(false);
      }
    };

    fetchBatchMemberships();
  }, [stageColumns]);

  /**
   * Toggle list visibility
   */
  const toggleListVisibility = (listId: number) => {
    setVisibleListIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(listId)) {
        newSet.delete(listId);
      } else {
        newSet.add(listId);
      }
      return newSet;
    });
  };

  /**
   * Toggle all lists
   */
  const toggleAllLists = (visible: boolean) => {
    if (visible) {
      const allListIds = new Set(lists.map((list) => list.id));
      setVisibleListIds(allListIds);
    } else {
      setVisibleListIds(new Set());
    }
  };

  /**
   * Create or update list
   */
  const handleSaveList = async () => {
    if (!listName.trim()) {
      setError("List name is required");
      return;
    }

    try {
      setSavingList(true);
      setError(null);

      if (editingList) {
        // Cast to number since stage columns can't be edited (id is always number for real lists)
        await updatePlayerList(Number(editingList.id), listName, listDescription);
      } else {
        await createPlayerList(listName, listDescription);
      }

      await refetch();

      setShowListModal(false);
      setEditingList(null);
      setListName("");
      setListDescription("");
    } catch (err: any) {
      console.error("Error saving list:", err);
      setError(err.response?.data?.detail || "Failed to save list. Please try again.");
    } finally {
      setSavingList(false);
    }
  };

  /**
   * Open create modal
   */
  const openCreateModal = () => {
    setEditingList(null);
    setListName("");
    setListDescription("");
    setShowListModal(true);
  };

  /**
   * Open edit modal
   */
  const openEditModal = (list: PlayerList) => {
    setEditingList(list);
    setListName(list.list_name);
    setListDescription(list.description || "");
    setShowListModal(true);
  };

  /**
   * Delete a list
   */
  const handleDeleteList = async (listId: number | string) => {
    if (typeof listId !== "number") return; // Can't delete stage columns

    if (!window.confirm("Are you sure you want to delete this list?")) {
      return;
    }

    try {
      setError(null);
      await deletePlayerList(listId);

      // Remove the deleted list from visible lists
      setVisibleListIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listId);
        return newSet;
      });

      await refetch();
    } catch (err: any) {
      console.error("Error deleting list:", err);
      setError(err.response?.data?.detail || "Failed to delete list.");
    }
  };

  /**
   * Export players to CSV
   */
  const handleExport = () => {
    // Get all players from visible lists
    const allPlayers: any[] = [];
    stageColumns.forEach((column) => {
      column.players.forEach((player) => {
        allPlayers.push(player);
      });
    });

    if (allPlayers.length === 0) {
      alert("No players to export");
      return;
    }

    const listNames = lists
      .filter((list) => visibleListIds.has(list.id))
      .map((list) => list.list_name)
      .join("_");

    exportPlayersToCSV(allPlayers, `${listNames || "players"}.csv`);
  };

  /**
   * Search for players with debounce
   */
  const handlePlayerSearch = async (query: string) => {
    if (!query.trim()) {
      setPlayerSearchResults([]);
      return;
    }

    try {
      setSearchingPlayers(true);
      const results = await searchPlayers(query);
      setPlayerSearchResults(results);
    } catch (err) {
      console.error("Error searching players:", err);
      setPlayerSearchResults([]);
    } finally {
      setSearchingPlayers(false);
    }
  };

  /**
   * Debounced search handler
   */
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      handlePlayerSearch(playerSearchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [playerSearchQuery]);

  /**
   * Add player to list
   */
  const handleAddPlayer = async (player: PlayerSearchResult) => {
    if (!currentListId) return;

    // Store selected player and open reason modal
    setTempSelectedPlayer(player);
    setStageReasonModalData({
      playerName: player.player_name,
      targetStage: "Stage 1",
      itemId: -1, // Not applicable for new additions
      oldStage: "",
      listId: currentListId,
    });
    setShowAddPlayerModal(false);
    setShowStageReasonModal(true);
  };

  // Confirm adding player with reason
  const confirmAddPlayer = async (reason: string, description?: string) => {
    if (!currentListId || !tempSelectedPlayer) return;

    try {
      setAddingPlayer(true);
      setError(null);

      await addPlayerToList(
        currentListId,
        tempSelectedPlayer.universal_id,
        reason,
        description
      );
      await refetch();

      setShowStageReasonModal(false);
      setStageReasonModalData(null);
      setTempSelectedPlayer(null);
      setCurrentListId(null);
      setPlayerSearchQuery("");
      setPlayerSearchResults([]);
    } catch (err: any) {
      console.error("Error adding player:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to add player. They may already be in this list."
      );
    } finally {
      setAddingPlayer(false);
    }
  };

  /**
   * Remove player from list (batch mode)
   * Adds to pending removals instead of immediately saving
   */
  const handleRemovePlayer = async (itemId: number, listId: number | string): Promise<void> => {
    setPendingRemovals((prev) => {
      const newMap = new Map(prev);
      newMap.set(itemId, Number(listId));
      return newMap;
    });
  };

  /**
   * Handle stage change (drag-and-drop)
   * Now adds to pending changes instead of immediately saving
   */
  const handleStageChange = (
    itemId: number,
    fromStage: string,
    toStage: string,
    listId: number | string,
    player?: PlayerInList
  ) => {
    // Stage 1 and Archived require reason modal
    if (toStage === "Stage 1" || toStage === "Archived") {
      if (!player) {
        console.error("Player data required for Stage 1/Archived change");
        return;
      }

      setStageReasonModalData({
        playerName: player.player_name,
        targetStage: toStage as "Stage 1" | "Archived",
        itemId: itemId,
        oldStage: fromStage,
        listId: Number(listId),
      });
      setShowStageReasonModal(true);
    } else {
      // Stage 2, 3, 4 use batch mode as before
      setPendingStageChanges((prev) => {
        const newMap = new Map(prev);

        // If there's already a pending change for this item, update the toStage
        // but keep the original fromStage
        const existing = newMap.get(itemId);
        if (existing) {
          newMap.set(itemId, {
            fromStage: existing.fromStage, // Keep original fromStage
            toStage,
            listId: Number(listId),
          });
        } else {
          newMap.set(itemId, {
            fromStage,
            toStage,
            listId: Number(listId),
          });
        }

        return newMap;
      });
    }
  };

  // Confirm stage change with reason
  const confirmStageChange = async (reason: string, description?: string) => {
    if (!stageReasonModalData) return;

    try {
      setSavingChanges(true);
      setError(null);

      await updatePlayerStage(
        stageReasonModalData.listId,
        stageReasonModalData.itemId,
        stageReasonModalData.targetStage,
        reason,
        description
      );
      await refetch();

      setShowStageReasonModal(false);
      setStageReasonModalData(null);
    } catch (err: any) {
      console.error("Error updating stage:", err);
      setError(err.response?.data?.detail || "Failed to update player stage.");
    } finally {
      setSavingChanges(false);
    }
  };

  // Open stage history modal
  const openStageHistory = (player: PlayerInList) => {
    if (!player.list_id) return;

    setHistoryModalData({
      listId: Number(player.list_id),
      itemId: player.item_id,
      playerName: player.player_name,
    });
    setShowHistoryModal(true);
  };

  /**
   * Save all pending stage changes in a batch
   */
  const savePendingChanges = async () => {
    if (pendingStageChanges.size === 0 && pendingRemovals.size === 0) return;

    try {
      setSavingChanges(true);
      setError(null);

      // Execute all stage updates
      const stageUpdatePromises = Array.from(pendingStageChanges.entries()).map(
        ([itemId, change]) => updatePlayerStage(change.listId, itemId, change.toStage)
      );

      // Execute all removals
      const removalPromises = Array.from(pendingRemovals.entries()).map(
        ([itemId, listId]) => removePlayerFromList(listId, itemId)
      );

      await Promise.all([...stageUpdatePromises, ...removalPromises]);
      await refetch();

      // Clear pending changes
      setPendingStageChanges(new Map());
      setPendingRemovals(new Map());
    } catch (err: any) {
      console.error("Error saving changes:", err);
      setError(err.response?.data?.detail || "Failed to save changes. Please try again.");
    } finally {
      setSavingChanges(false);
    }
  };

  /**
   * Discard all pending changes
   */
  const discardPendingChanges = () => {
    const totalChanges = pendingStageChanges.size + pendingRemovals.size;
    if (totalChanges === 0) return;

    if (!window.confirm(`Discard ${totalChanges} unsaved change(s)?`)) {
      return;
    }
    setPendingStageChanges(new Map());
    setPendingRemovals(new Map());
    refetch(); // Refresh to show original state
  };

  /**
   * Handle opening notes modal
   */
  const handleOpenNotesModal = (player: PlayerInList) => {
    setSelectedPlayerForNotes({
      universalId: player.universal_id,
      name: player.player_name,
    });
    setShowNotesModal(true);
  };

  /**
   * Handle saving notes
   */
  const handleSaveNotes = (universalId: string, notes: string) => {
    setPlayerNotes(universalId, notes);
    setShowNotesModal(false);
  };

  /**
   * Handle toggling favorite status
   */
  const handleToggleFavorite = (universalId: string) => {
    const userId = currentUser?.id?.toString() || "0";
    const newFavStatus = togglePlayerFavorite(userId, universalId);
    setPlayerFavorites((prev) => {
      const newSet = new Set(prev);
      if (newFavStatus) {
        newSet.add(universalId);
      } else {
        newSet.delete(universalId);
      }
      return newSet;
    });
  };

  /**
   * Fetch archive info for a player
   */
  const fetchArchiveInfo = async (itemId: number) => {
    // Find the player in stage columns to get their list_id
    let listId: number | null = null;
    for (const column of stageColumns) {
      const player = column.players.find((p) => p.item_id === itemId);
      if (player && player.list_id !== undefined) {
        listId = typeof player.list_id === 'number' ? player.list_id : parseInt(player.list_id as string);
        break;
      }
    }

    if (!listId) {
      return null;
    }

    const cacheKey = `${listId}-${itemId}`;

    if (archiveInfoCache[cacheKey]) {
      return archiveInfoCache[cacheKey];
    }

    try {
      const history = await getPlayerStageHistory(listId, itemId);
      const archiveEntry = history.find((h: any) => h.newStage === "Archived");

      if (archiveEntry) {
        const info = {
          reason: archiveEntry.reason,
          date: archiveEntry.changedAt,
          changedBy: archiveEntry.changedByName || "Unknown",
          previousStage: archiveEntry.oldStage,
        };

        setArchiveInfoCache((prev) => ({ ...prev, [cacheKey]: info }));
        return info;
      }

      return null;
    } catch (err) {
      console.error("Error fetching archive info:", err);
      return null;
    }
  };

  /**
   * Load favorites from localStorage on mount and when lists change
   */
  useEffect(() => {
    const userId = currentUser?.id?.toString() || "0";
    if (!userId || lists.length === 0) return;

    const favs = new Set<string>();
    lists.forEach((list) => {
      list.players.forEach((player) => {
        if (isPlayerFavorite(userId, player.universal_id)) {
          favs.add(player.universal_id);
        }
      });
    });
    setPlayerFavorites(favs);
  }, [lists, currentUser]);

  /**
   * Open add player modal
   */
  const openAddPlayerModal = (listId: number | string) => {
    setCurrentListId(Number(listId));
    setPlayerSearchQuery("");
    setPlayerSearchResults([]);
    setShowAddPlayerModal(true);
  };

  // Loading state
  if (userLoading || loading) {
    return (
      <Container className="mt-4">
        <div className="mb-3">
          <h3>Player Lists - Kanban View</h3>
        </div>
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "400px" }}>
          <div className="text-center">
            <Spinner animation="border" variant="primary" style={{ width: "3rem", height: "3rem" }} />
            <p className="mt-3 text-muted">Loading player lists...</p>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Error Alert */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="mb-3">
          {error}
        </Alert>
      )}

      {/* Header */}
      <h3>Player Lists - Kanban View</h3>

      {lists.length === 0 ? (
        <EmptyState
          title="No Player Lists Yet"
          message="Create your first player list to start organizing your recruitment pipeline."
          actionLabel="Create Your First List"
          onAction={openCreateModal}
          icon="📋"
        />
      ) : (
        <>
          {/* List Selection */}
          <div className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>
                Lists:
              </span>
              <Button size="sm" variant="link" onClick={() => toggleAllLists(true)}>
                All
              </Button>
              <span>|</span>
              <Button size="sm" variant="link" onClick={() => toggleAllLists(false)}>
                None
              </Button>
              <span>|</span>
              <Button
                size="sm"
                variant="link"
                onClick={() => setPitchViewExpanded(!pitchViewExpanded)}
                style={{ fontWeight: pitchViewExpanded ? "bold" : "normal" }}
              >
                {pitchViewExpanded ? "▼ Hide Pitch" : "⚽ Show Pitch"}
              </Button>
            </div>

            {/* Toggle between Pills and Pitch View */}
            {pitchViewExpanded ? (
              <PitchViewListSelector
                lists={lists}
                visibleListIds={visibleListIds}
                onToggleList={toggleListVisibility}
              />
            ) : (
              <div className="d-flex gap-2 flex-wrap align-items-center">
                {[...lists].sort((a, b) => {
                  const getRank = (name: string) => {
                    const u = name.toUpperCase();
                    if (/\bGK\b/.test(u)) return 0;
                    if (u.includes("RB/RWB")) return 1;
                    if (u.includes("LB/LWB")) return 2;
                    if (/\bCB\b/.test(u)) return 3;
                    if (u.includes("DM/CM")) return 4;
                    if (/\bAM\b/.test(u)) return 5;
                    if (/\bW\b/.test(u)) return 6;
                    if (/\bCF\b/.test(u)) return 7;
                    return 8;
                  };
                  return getRank(a.list_name) - getRank(b.list_name);
                }).map((list) => {
                  const isVisible = visibleListIds.has(list.id);
                  return (
                    <Badge
                      key={list.id}
                      bg=""
                      onClick={() => toggleListVisibility(list.id)}
                      style={{
                        ...badgeStyles.pill,
                        backgroundColor: isVisible ? colors.primary : colors.gray[300],
                        color: isVisible ? colors.white : colors.gray[600],
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {list.list_name} ({list.player_count})
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Advanced Filters */}
          <AdvancedFilters
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            includeArchivedReports={includeArchivedReports}
            onIncludeArchivedReportsChange={setIncludeArchivedReports}
            includeFlagReports={includeFlagReports}
            onIncludeFlagReportsChange={setIncludeFlagReports}
          />

          {/* Actions Container */}
          <div className="mb-3">
            {/* Action Buttons */}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Create New List Pill - Always visible */}
              <Button
                size="sm"
                variant="dark"
                onClick={openCreateModal}
              >
                ➕ New List
              </Button>

              {/* List Actions Dropdown - Only visible when lists are selected */}
              {visibleListIds.size > 0 && (
                <Dropdown>
                  <Dropdown.Toggle
                    variant="dark"
                    size="sm"
                  >
                    ⚙️ List Actions
                  </Dropdown.Toggle>

                  <Dropdown.Menu>
                    <Dropdown.Item onClick={() => navigate("/lists")}>
                      🔄 Switch to Table View
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => currentList && openEditModal(currentList)}>
                      ✏️ Edit List
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => currentList && handleDeleteList(currentList.id)}>
                      🗑️ Delete List
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={handleExport}>
                      📊 Export CSV
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}

              {/* Sort Controls */}
              {visibleListIds.size > 0 && (
                <>
                  <span className="text-muted">|</span>
                  <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>Sort:</span>
                  <Form.Select
                    size="sm"
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    style={{ width: "auto" }}
                  >
                    <option value="name">Name</option>
                    <option value="age">Age</option>
                    <option value="club">Club</option>
                    <option value="stage">Stage</option>
                    <option value="score">Score</option>
                    <option value="reports">Reports</option>
                    <option value="favorites">Favorites</option>
                  </Form.Select>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                  >
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </Button>
                  {includeArchivedReports && (
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: "0.7rem" }}>
                      Report counts incl. archived
                    </Badge>
                  )}
                </>
              )}
            </div>

            {visibleListIds.size > 0 && !currentList && (
              <div className="mt-2 text-muted" style={{ fontSize: "0.875rem" }}>
                Select a single list to access actions
              </div>
            )}
          </div>

          {/* Kanban Board */}
          <KanbanBoard
            lists={stageColumns}
            onListsChange={() => {}}
            onEditList={() => {}}
            onDeleteList={() => {}}
            onAddPlayer={openAddPlayerModal}
            onRemovePlayer={handleRemovePlayer}
            onMovePlayer={async (itemId, fromStageId, toStageId) => {
              console.log("onMovePlayer called:", { itemId, fromStageId, toStageId });
              // Search in the target column because optimistic update already moved the player there
              const toStageColumn = stageColumns.find((c) => c.id === toStageId);
              console.log("toStageColumn:", toStageColumn);
              const player = toStageColumn?.players.find((p) => p.item_id === itemId);
              console.log("player found:", player);
              if (player && player.list_id !== undefined) {
                const fromStage = typeof fromStageId === "string" ? fromStageId : "";
                const toStage = typeof toStageId === "string" ? toStageId : "";
                console.log("Calling handleStageChange:", { itemId, fromStage, toStage, listId: player.list_id });
                handleStageChange(itemId, fromStage, toStage, player.list_id, player);
              } else {
                console.warn("Player not found or list_id is undefined:", { player, itemId, toStageId });
              }
            }}
            onReorderPlayer={async () => {}}
            removingPlayerId={removingPlayerId}
            pendingStageChanges={pendingStageChanges}
            pendingRemovals={pendingRemovals}
            batchMemberships={batchMemberships}
            loadingMemberships={loadingMemberships}
            onOpenNotes={handleOpenNotesModal}
            onToggleFavorite={handleToggleFavorite}
            onViewHistory={openStageHistory}
            playerFavorites={playerFavorites}
            fetchArchiveInfo={fetchArchiveInfo}
          />

          {/* Floating Save/Discard Changes Button */}
          {(pendingStageChanges.size > 0 || pendingRemovals.size > 0) && (
            <div
              style={{
                position: "fixed",
                bottom: "30px",
                right: "30px",
                zIndex: 1000,
                display: "flex",
                gap: "10px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                borderRadius: borderRadius.lg,
                backgroundColor: colors.white,
                padding: "12px 16px",
                border: `2px solid ${colors.primary}`,
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: colors.gray[700] }}>
                  {pendingStageChanges.size + pendingRemovals.size} unsaved change
                  {pendingStageChanges.size + pendingRemovals.size > 1 ? "s" : ""}
                  {pendingStageChanges.size > 0 && pendingRemovals.size > 0 && (
                    <span style={{ fontSize: "0.8rem", fontWeight: 400 }}>
                      {" "}({pendingStageChanges.size} stage, {pendingRemovals.size} removal{pendingRemovals.size > 1 ? "s" : ""})
                    </span>
                  )}
                </span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={discardPendingChanges}
                  disabled={savingChanges}
                  style={{
                    ...buttonStyles.secondary,
                    fontSize: "0.85rem",
                    padding: "6px 14px",
                  }}
                >
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={savePendingChanges}
                  disabled={savingChanges}
                  style={{
                    ...buttonStyles.primary,
                    fontSize: "0.85rem",
                    padding: "6px 14px",
                  }}
                >
                  {savingChanges ? (
                    <>
                      <Spinner as="span" animation="border" size="sm" className="me-2" style={{ width: "12px", height: "12px" }} />
                      Saving...
                    </>
                  ) : (
                    `Save ${pendingStageChanges.size + pendingRemovals.size} Change${pendingStageChanges.size + pendingRemovals.size > 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit List Modal */}
      <Modal show={showListModal} onHide={() => !savingList && setShowListModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editingList ? "Edit List" : "Create New List"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>List Name *</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Priority Targets, Shortlist"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                disabled={savingList}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Describe this list..."
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
                disabled={savingList}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowListModal(false)} disabled={savingList}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveList}
            disabled={savingList || !listName.trim()}
          >
            {savingList ? (
              <>
                <Spinner as="span" animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : editingList ? (
              "Update List"
            ) : (
              "Create List"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Player Modal */}
      <Modal
        show={showAddPlayerModal}
        onHide={() => !addingPlayer && setShowAddPlayerModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Add Player to List</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Search for a player</Form.Label>
            <Form.Control
              type="text"
              placeholder="Search by name, club, or position..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              disabled={addingPlayer}
              autoFocus
            />
          </Form.Group>

          {searchingPlayers && (
            <div className="text-center py-4">
              <Spinner animation="border" className="me-2" />
              <span className="text-muted">Searching...</span>
            </div>
          )}

          {addingPlayer && (
            <div className="text-center py-4">
              <Spinner animation="border" className="me-2" />
              <span className="text-muted">Adding player...</span>
            </div>
          )}

          {!searchingPlayers && !addingPlayer && playerSearchResults.length > 0 && (
            <ListGroup>
              {playerSearchResults.map((player) => (
                <ListGroup.Item
                  key={player.universal_id}
                  action
                  onClick={() => handleAddPlayer(player)}
                  className="d-flex justify-content-between align-items-center"
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <strong>{player.player_name}</strong>
                    <div className="text-muted small">
                      {player.position && `${player.position} • `}
                      {player.squad_name || "Unknown Club"}
                      {player.age && ` • Age ${player.age}`}
                    </div>
                  </div>
                  <span style={{ color: "#0d6efd", fontSize: "0.9rem" }}>Add →</span>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          {!searchingPlayers &&
            !addingPlayer &&
            playerSearchQuery.trim() &&
            playerSearchResults.length === 0 && (
              <Alert variant="info">No players found matching "{playerSearchQuery}"</Alert>
            )}

          {!searchingPlayers && !addingPlayer && !playerSearchQuery.trim() && (
            <div className="text-center text-muted py-4">
              <p>Start typing to search for players</p>
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Player Notes Modal */}
      <PlayerNotesModal
        show={showNotesModal}
        onHide={() => setShowNotesModal(false)}
        playerName={selectedPlayerForNotes?.name || ""}
        universalId={selectedPlayerForNotes?.universalId || ""}
        currentNotes={getPlayerNotes(selectedPlayerForNotes?.universalId || "")}
        onSave={handleSaveNotes}
      />

      {/* Stage Change Reason Modal */}
      <StageChangeReasonModal
        show={showStageReasonModal}
        onHide={() => {
          setShowStageReasonModal(false);
          setStageReasonModalData(null);
          setTempSelectedPlayer(null);
        }}
        playerName={stageReasonModalData?.playerName || ""}
        targetStage={stageReasonModalData?.targetStage || "Stage 1"}
        reasons={
          stageReasonModalData?.targetStage === "Stage 1"
            ? stage1Reasons
            : archivedReasons
        }
        onConfirm={
          stageReasonModalData?.itemId === -1
            ? confirmAddPlayer
            : confirmStageChange
        }
        loading={addingPlayer || savingChanges}
      />

      {/* Stage History Modal */}
      <StageHistoryModal
        show={showHistoryModal}
        onHide={() => {
          setShowHistoryModal(false);
          setHistoryModalData(null);
        }}
        listId={historyModalData?.listId || 0}
        itemId={historyModalData?.itemId || 0}
        playerName={historyModalData?.playerName || ""}
      />
    </Container>
  );
};

export default KanbanPage;
