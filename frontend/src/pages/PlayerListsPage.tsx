/**
 * PlayerListsPage Component - REDESIGNED
 *
 * Clean table view for player lists with:
 * - List selection with toggle pills
 * - Sortable columns
 * - Multi-list badges showing all player lists
 * - Inline stage editing
 * - CSV export
 * - Optimized data fetching
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Container,
  Button,
  Alert,
  Form,
  Table,
  Badge,
  Modal,
  Spinner,
  ListGroup,
  Dropdown,
  OverlayTrigger,
  Popover,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { usePlayerLists } from "../hooks/usePlayerLists";
import MultiListBadges from "../components/PlayerLists/MultiListBadges";
import EmptyState from "../components/PlayerLists/EmptyState";
import { AdvancedFilters, PlayerListFilters as AdvancedFiltersType } from "../components/PlayerLists/AdvancedFilters";
import { PitchViewListSelector } from "../components/PlayerLists/PitchViewListSelector";
import PlayerNotesModal from "../components/PlayerLists/PlayerNotesModal";
import StageChangeReasonModal from "../components/PlayerLists/StageChangeReasonModal";
import StageHistoryModal from "../components/PlayerLists/StageHistoryModal";
import {
  getPlayerNotes,
  setPlayerNotes,
  isPlayerFavorite,
  togglePlayerFavorite,
} from "../utils/playerListPreferences";
import {
  createPlayerList,
  updatePlayerList,
  deletePlayerList,
  addPlayerToList,
  removePlayerFromList,
  searchPlayers,
  updatePlayerStage,
  exportPlayersToCSV,
  getBatchPlayerListMemberships,
  getStageChangeReasons,
  getPlayerStageHistory,
  PlayerListMembership,
  PlayerListFilters,
} from "../services/playerListsService";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../utils/colorUtils";
import {
  colors,
  borderRadius,
  buttonStyles,
  badgeStyles,
  getStageBgColor,
  getStageTextColor,
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

interface PlayerList {
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

type SortField = "name" | "age" | "club" | "stage" | "score" | "reports" | "favorites";
type SortDirection = "asc" | "desc";

// Archive Info Content Component for Popover
const ArchiveInfoContent: React.FC<{
  itemId: number;
  fetchArchiveInfo: (itemId: number) => Promise<any>;
}> = ({ itemId, fetchArchiveInfo }) => {
  const [archiveData, setArchiveData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchArchiveInfo(itemId);
      setArchiveData(data);
      setLoading(false);
    };
    loadData();
  }, [itemId, fetchArchiveInfo]);

  if (loading) {
    return (
      <div style={{ padding: "0.5rem", textAlign: "center" }}>
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (!archiveData) {
    return (
      <div style={{ padding: "0.5rem", fontSize: "0.85rem", color: "#666" }}>
        No archive information available
      </div>
    );
  }

  return (
    <div style={{ fontSize: "0.85rem" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <strong style={{ color: "#333" }}>Archive Information</strong>
      </div>
      <div style={{ lineHeight: "1.6", color: "#555" }}>
        <div>
          <strong>Reason:</strong> {archiveData.reason}
        </div>
        <div>
          <strong>Date:</strong>{" "}
          {archiveData.date
            ? new Date(archiveData.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Europe/London",
              })
            : "N/A"}
        </div>
        <div>
          <strong>By:</strong> {archiveData.changedBy}
        </div>
        {archiveData.previousStage && (
          <div>
            <strong>Previous:</strong> {archiveData.previousStage}
          </div>
        )}
      </div>
    </div>
  );
};

const PlayerListsPage: React.FC = () => {
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

  // Use custom hook for data
  const { lists, loading, error: fetchError, refetch } = usePlayerLists(debouncedFilters);

  // Local error
  const [error, setError] = useState<string | null>(null);

  // Show archived state (not part of API filters)
  const [showArchived, setShowArchived] = useState(false);
  const [includeArchivedReports, setIncludeArchivedReports] = useState(false);
  const [includeFlagReports, setIncludeFlagReports] = useState(false);

  // Visible lists (multi-select)
  const [visibleListIds, setVisibleListIds] = useState<Set<number>>(new Set());

  // Sorting
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pitch view expanded toggle
  const [pitchViewExpanded, setPitchViewExpanded] = useState(false);

  // Modals
  const [showListModal, setShowListModal] = useState(false);
  const [editingList, setEditingList] = useState<PlayerList | null>(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Add player modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Player notes and favorites
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedPlayerForNotes, setSelectedPlayerForNotes] = useState<{
    universalId: string;
    name: string;
  } | null>(null);
  const [playerFavorites, setPlayerFavorites] = useState<Set<string>>(new Set());

  // Remove player (currently using batch removal with pending state)
  // const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);

  // Batch list memberships (for MultiListBadges performance)
  const [batchMemberships, setBatchMemberships] = useState<Record<string, PlayerListMembership[]>>({});
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  // Batch save state for pending changes
  const [pendingStageChanges, setPendingStageChanges] = useState<Map<number, string>>(new Map());
  const [pendingRemovals, setPendingRemovals] = useState<Set<number>>(new Set());
  const [savingChanges, setSavingChanges] = useState(false);

  // Stage change reason modal state
  const [showStageReasonModal, setShowStageReasonModal] = useState(false);
  const [stageReasonModalData, setStageReasonModalData] = useState<{
    playerName: string;
    targetStage: "Stage 1" | "Archived";
    itemId: number;
    oldStage: string;
    universalId?: string;
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

  // Archive info cache for popovers
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

  // Permission check
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

  // Merge errors
  useEffect(() => {
    if (fetchError) {
      setError(fetchError);
    }
  }, [fetchError]);

  // Debounce filters (800ms delay to reduce frequent reloads)
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
    }, 800);

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

  // Toggle list visibility
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

  // Toggle all lists
  const toggleAllLists = (visible: boolean) => {
    if (visible) {
      setVisibleListIds(new Set(lists.map((list) => list.id)));
    } else {
      setVisibleListIds(new Set());
    }
  };

  // Get visible lists and merged players
  const visibleLists = useMemo(() => {
    return lists.filter((list) => visibleListIds.has(list.id));
  }, [lists, visibleListIds]);

  // Merge players from all visible lists (deduplicate by universal_id)
  const mergedPlayers = useMemo(() => {
    const playerMap = new Map();

    visibleLists.forEach((list) => {
      list.players.forEach((player) => {
        // If player not yet in map, add them
        if (!playerMap.has(player.universal_id)) {
          playerMap.set(player.universal_id, {
            ...player,
            // Track which lists this player is in
            _listIds: [list.id],
            _listNames: [list.list_name],
          });
        } else {
          // Player already exists, add this list to their tracking
          const existing = playerMap.get(player.universal_id);
          existing._listIds.push(list.id);
          existing._listNames.push(list.list_name);
        }
      });
    });

    return Array.from(playerMap.values());
  }, [visibleLists]);

  // For backwards compatibility, use first visible list as "current" for certain operations
  const currentList = useMemo(() => {
    return visibleLists.length === 1 ? visibleLists[0] : null;
  }, [visibleLists]);

  // Fetch batch memberships when merged players change
  useEffect(() => {
    const fetchBatchMemberships = async () => {
      if (mergedPlayers.length === 0) {
        setBatchMemberships({});
        return;
      }

      try {
        setLoadingMemberships(true);
        const universalIds = mergedPlayers.map((p) => p.universal_id);
        const memberships = await getBatchPlayerListMemberships(universalIds);
        setBatchMemberships(memberships);
      } catch (err) {
        console.error("Error fetching batch memberships:", err);
        setBatchMemberships({});
      } finally {
        setLoadingMemberships(false);
      }
    };

    fetchBatchMemberships();
  }, [mergedPlayers]);

  // Sort players with optimistic updates applied
  const sortedPlayers = useMemo(() => {
    // Filter out pending removals (optimistic update)
    let result = mergedPlayers.filter(
      (player) => !pendingRemovals.has(player.item_id)
    );

    // Filter out archived players if showArchived is false
    if (!showArchived) {
      result = result.filter((player) => {
        const currentStage = pendingStageChanges.get(player.item_id) || player.stage;
        return currentStage !== "Archived";
      });
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "name":
          aVal = (a.player_name || "").toLowerCase();
          bVal = (b.player_name || "").toLowerCase();
          break;
        case "age":
          aVal = a.age || 0;
          bVal = b.age || 0;
          break;
        case "club":
          aVal = (a.squad_name || "").toLowerCase();
          bVal = (b.squad_name || "").toLowerCase();
          break;
        case "stage":
          // Check pending stage changes (optimistic update)
          aVal = pendingStageChanges.get(a.item_id) || a.stage;
          bVal = pendingStageChanges.get(b.item_id) || b.stage;
          break;
        case "score":
          aVal = a.avg_performance_score || 0;
          bVal = b.avg_performance_score || 0;
          break;
        case "reports":
          aVal = a.report_count;
          bVal = b.report_count;
          break;
        case "favorites":
          aVal = playerFavorites.has(a.universal_id) ? 1 : 0;
          bVal = playerFavorites.has(b.universal_id) ? 1 : 0;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [mergedPlayers, sortField, sortDirection, pendingStageChanges, pendingRemovals, showArchived, playerFavorites]);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };


  const openCreateModal = () => {
    setEditingList(null);
    setListName("");
    setListDescription("");
    setShowListModal(true);
  };

  const openEditModal = (list: PlayerList) => {
    setEditingList(list);
    setListName(list.list_name);
    setListDescription(list.description || "");
    setShowListModal(true);
  };

  const handleSaveList = async () => {
    if (!listName.trim()) {
      setError("List name is required");
      return;
    }

    try {
      setSavingList(true);
      setError(null);

      if (editingList) {
        await updatePlayerList(editingList.id, listName, listDescription);
      } else {
        const result = await createPlayerList(listName, listDescription);
        // Show only the newly created list
        setVisibleListIds(new Set([result.list_id]));
      }

      await refetch();
      setShowListModal(false);
      setEditingList(null);
      setListName("");
      setListDescription("");
    } catch (err: any) {
      console.error("Error saving list:", err);
      setError(err.response?.data?.detail || "Failed to save list.");
    } finally {
      setSavingList(false);
    }
  };

  const handleDeleteList = async (listId: number) => {
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

  const handleAddPlayer = async (player: PlayerSearchResult) => {
    // Only allow adding when exactly 1 list is selected
    if (!currentList) return; // Only works with single list selected

    // Store selected player and open reason modal
    setTempSelectedPlayer(player);
    setStageReasonModalData({
      playerName: player.player_name,
      targetStage: "Stage 1",
      itemId: -1, // Not applicable for new additions
      oldStage: "",
      universalId: player.universal_id,
    });
    setShowAddPlayerModal(false);
    setShowStageReasonModal(true);
  };

  // Confirm adding player with reason
  const confirmAddPlayer = async (reason: string, description?: string) => {
    if (!currentList || !tempSelectedPlayer) return;

    try {
      setAddingPlayer(true);
      setError(null);

      await addPlayerToList(
        currentList.id,
        tempSelectedPlayer.universal_id,
        reason,
        description
      );
      await refetch();

      setShowStageReasonModal(false);
      setStageReasonModalData(null);
      setTempSelectedPlayer(null);
      setPlayerSearchQuery("");
      setPlayerSearchResults([]);
    } catch (err: any) {
      console.error("Error adding player:", err);
      setError(err.response?.data?.detail || "Failed to add player.");
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleRemovePlayer = (itemId: number) => {
    // Add to pending removals instead of saving immediately (batch mode)
    setPendingRemovals((prev) => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
  };

  // Notes and favorites handlers
  const userId = currentUser?.id?.toString() || "0";

  const handleOpenNotesModal = (player: any) => {
    setSelectedPlayerForNotes({
      universalId: player.universal_id,
      name: player.player_name,
    });
    setShowNotesModal(true);
  };

  const handleSaveNotes = (universalId: string, notes: string) => {
    setPlayerNotes(universalId, notes);
    setShowNotesModal(false);
  };

  const handleToggleFavorite = (universalId: string) => {
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

  // Load user-specific favorites on mount or when lists change
  useEffect(() => {
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
  }, [lists, userId]);

  const handleStageChange = (itemId: number, newStage: string, player?: any) => {
    // Stage 1 and Archived require reason modal
    if (newStage === "Stage 1" || newStage === "Archived") {
      if (!player) {
        console.error("Player data required for Stage 1/Archived change");
        return;
      }

      setStageReasonModalData({
        playerName: player.player_name,
        targetStage: newStage as "Stage 1" | "Archived",
        itemId: itemId,
        oldStage: player.stage,
      });
      setShowStageReasonModal(true);
    } else {
      // Stage 2, 3, 4 use batch mode as before
      setPendingStageChanges((prev) => {
        const newMap = new Map(prev);
        newMap.set(itemId, newStage);
        return newMap;
      });
    }
  };

  // Confirm stage change with reason
  const confirmStageChange = async (reason: string, description?: string) => {
    if (!currentList || !stageReasonModalData) return;

    try {
      setSavingChanges(true);
      setError(null);

      await updatePlayerStage(
        currentList.id,
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
  const openStageHistory = (player: any) => {
    if (!currentList) return;

    setHistoryModalData({
      listId: currentList.id,
      itemId: player.item_id,
      playerName: player.player_name,
    });
    setShowHistoryModal(true);
  };

  // Fetch archive info for popover
  const fetchArchiveInfo = async (itemId: number) => {
    if (!currentList) return null;

    const cacheKey = `${currentList.id}-${itemId}`;

    // Return cached data if available
    if (archiveInfoCache[cacheKey]) {
      return archiveInfoCache[cacheKey];
    }

    try {
      const history = await getPlayerStageHistory(currentList.id, itemId);
      // Find the most recent archive entry
      const archiveEntry = history.find((h: any) => h.newStage === "Archived");

      if (archiveEntry) {
        const info = {
          reason: archiveEntry.reason,
          date: archiveEntry.changedAt,
          changedBy: archiveEntry.changedByName || "Unknown",
          previousStage: archiveEntry.oldStage,
        };

        // Cache the result
        setArchiveInfoCache(prev => ({
          ...prev,
          [cacheKey]: info,
        }));

        return info;
      }
    } catch (error) {
      console.error("Error fetching archive info:", error);
    }

    return null;
  };

  const handleExport = () => {
    if (visibleListIds.size === 0) return;
    const filename = visibleListIds.size === 1
      ? `${lists.find((list) => visibleListIds.has(list.id))?.list_name || "export"}.csv`
      : "player-lists-export.csv";
    exportPlayersToCSV(sortedPlayers, filename);
  };

  const getPlayerPath = (universalId: string): string => {
    if (universalId.startsWith("internal_")) {
      return `/player-profile/${universalId.replace("internal_", "")}`;
    } else if (universalId.startsWith("external_")) {
      return `/player/${universalId.replace("external_", "")}`;
    }
    return "/";
  };

  /**
   * Save all pending changes in batch
   */
  const savePendingChanges = async () => {
    if (!currentList || (pendingStageChanges.size === 0 && pendingRemovals.size === 0)) {
      return;
    }

    try {
      setSavingChanges(true);
      setError(null);

      // Execute all stage updates
      const stageUpdatePromises = Array.from(pendingStageChanges.entries()).map(
        ([itemId, newStage]) => updatePlayerStage(currentList.id, itemId, newStage)
      );

      // Execute all removals
      const removalPromises = Array.from(pendingRemovals).map(
        (itemId) => removePlayerFromList(currentList.id, itemId)
      );

      await Promise.all([...stageUpdatePromises, ...removalPromises]);
      await refetch();

      // Clear pending changes
      setPendingStageChanges(new Map());
      setPendingRemovals(new Set());
    } catch (err: any) {
      console.error("Error saving changes:", err);
      setError(err.response?.data?.detail || "Failed to save changes. Please try again.");
    } finally{
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
    setPendingRemovals(new Set());
  };

  // Debounce player search in modal
  useEffect(() => {
    const timer = setTimeout(() => {
      handlePlayerSearch(playerSearchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [playerSearchQuery]);

  // Loading state
  if (userLoading || loading) {
    return (
      <Container className="mt-4">
        <div className="mb-3">
          <h3>Player Lists</h3>
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
      <h3>Player Lists</h3>

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

              {/* Add Player Button - Only visible when single list is selected */}
              {currentList && (
                <Button
                  size="sm"
                  variant="dark"
                  onClick={() => setShowAddPlayerModal(true)}
                >
                  + Add Player
                </Button>
              )}

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
                      <Dropdown.Item onClick={() => navigate("/lists/kanban")}>
                        🔄 Switch to Kanban View
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
                  {includeFlagReports && (
                    <Badge bg="secondary" className="ms-2" style={{ fontSize: "0.7rem" }}>
                      Report counts incl. flags
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

          {visibleListIds.size > 0 && (
            <>
              {/* Content */}
              {sortedPlayers.length === 0 ? (
                <EmptyState
                  title="No Players Found"
                  message={currentList ? "Add players to start building your recruitment pipeline." : "No players in the selected lists."}
                  actionLabel={currentList ? "Add Player" : undefined}
                  onAction={currentList ? () => setShowAddPlayerModal(true) : undefined}
                  icon="📋"
                />
              ) : (
                // Table View
                <div className="table-responsive">
                  <Table responsive hover striped className="table-compact table-sm">
                    <thead className="table-dark">
                      <tr>
                        <th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
                          Player {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th onClick={() => handleSort("age")} style={{ cursor: "pointer" }}>
                          Age {sortField === "age" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th onClick={() => handleSort("club")} style={{ cursor: "pointer" }}>
                          Club {sortField === "club" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th onClick={() => handleSort("stage")} style={{ cursor: "pointer" }}>
                          Stage {sortField === "stage" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th>Lists</th>
                        <th onClick={() => handleSort("score")} style={{ cursor: "pointer" }}>
                          Score {sortField === "score" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th onClick={() => handleSort("reports")} style={{ cursor: "pointer" }}>
                          Reports {sortField === "reports" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((player) => {
                        const scoreColor = player.avg_performance_score
                          ? getPerformanceScoreColor(player.avg_performance_score)
                          : colors.gray[400];
                        const textColor = getContrastTextColor(scoreColor);

                        // Check for pending changes (for visual indicators)
                        const hasPendingStageChange = pendingStageChanges.has(player.item_id);
                        const pendingRemoval = pendingRemovals.has(player.item_id);
                        const currentStage = hasPendingStageChange
                          ? pendingStageChanges.get(player.item_id)!
                          : player.stage;
                        const isArchived = currentStage === "Archived";

                        return (
                          <tr
                            key={player.item_id}
                            style={{
                              backgroundColor: pendingRemoval
                                ? "rgba(239, 68, 68, 0.05)" // Light red for removals
                                : hasPendingStageChange
                                ? "rgba(245, 158, 11, 0.05)" // Light orange for stage changes
                                : isArchived
                                ? "#f9fafb" // Muted background for archived
                                : "transparent",
                              opacity: pendingRemoval ? 0.6 : isArchived ? 0.85 : 1,
                              textDecoration: pendingRemoval ? "line-through" : "none",
                              borderLeft: isArchived ? "3px solid #9ca3af" : "none",
                            }}
                          >
                            <td>
                              <a
                                href={getPlayerPath(player.universal_id)}
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate(getPlayerPath(player.universal_id));
                                }}
                                style={{ textDecoration: "none", color: colors.primary }}
                              >
                                <strong>
                                  {player.player_name || `Unknown Player (ID: ${player.player_id || player.cafc_player_id})`}
                                </strong>
                                {getPlayerNotes(player.universal_id) && (
                                  <span
                                    className="ms-2"
                                    style={{
                                      fontSize: "0.85rem",
                                      opacity: 0.7,
                                    }}
                                    title="Has notes"
                                  >
                                    📝
                                  </span>
                                )}
                                {hasPendingStageChange && (
                                  <Badge
                                    bg=""
                                    className="ms-2"
                                    style={{
                                      backgroundColor: "#f59e0b",
                                      color: "white",
                                      fontSize: "0.6rem",
                                      padding: "2px 6px",
                                      fontWeight: "600",
                                    }}
                                    title="Unsaved stage change"
                                  >
                                    UNSAVED
                                  </Badge>
                                )}
                                {pendingRemoval && (
                                  <Badge
                                    bg=""
                                    className="ms-2"
                                    style={{
                                      backgroundColor: "#ef4444",
                                      color: "white",
                                      fontSize: "0.6rem",
                                      padding: "2px 6px",
                                      fontWeight: "600",
                                    }}
                                    title="Pending removal"
                                  >
                                    REMOVING
                                  </Badge>
                                )}
                                {isArchived && !pendingRemoval && !hasPendingStageChange && (
                                  <>
                                    <Badge
                                      bg=""
                                      className="ms-2"
                                      style={{
                                        backgroundColor: "#9ca3af",
                                        color: "white",
                                        fontSize: "0.6rem",
                                        padding: "2px 6px",
                                        fontWeight: "600",
                                      }}
                                      title="Archived player"
                                    >
                                      ARCHIVED
                                    </Badge>
                                    {currentList && (
                                      <OverlayTrigger
                                        trigger={["hover", "focus"]}
                                        placement="top"
                                        overlay={
                                          <Popover id={`archive-popover-${player.item_id}`} style={{ maxWidth: "300px" }}>
                                            <Popover.Body>
                                              <ArchiveInfoContent
                                                itemId={player.item_id}
                                                fetchArchiveInfo={fetchArchiveInfo}
                                              />
                                            </Popover.Body>
                                          </Popover>
                                        }
                                      >
                                        <span
                                          style={{
                                            marginLeft: "4px",
                                            cursor: "pointer",
                                            fontSize: "0.75rem",
                                            color: "#999",
                                            display: "inline-flex",
                                            alignItems: "center",
                                          }}
                                          title="Archive details"
                                        >
                                          ⓘ
                                        </span>
                                      </OverlayTrigger>
                                    )}
                                  </>
                                )}
                              </a>
                            </td>
                            <td>{player.age || "N/A"}</td>
                            <td>{player.squad_name || "Unknown"}</td>
                            <td>
                              {currentList ? (
                                <Form.Select
                                  size="sm"
                                  value={currentStage}
                                  onChange={(e) => handleStageChange(player.item_id, e.target.value, player)}
                                  disabled={pendingRemoval}
                                  style={{
                                    fontSize: "0.75rem",
                                    width: "110px",
                                    backgroundColor: getStageBgColor(currentStage),
                                    color: getStageTextColor(currentStage),
                                    border: hasPendingStageChange ? "2px solid #f59e0b" : "none",
                                    fontWeight: "600",
                                  }}
                                >
                                  <option value="Stage 1">Stage 1</option>
                                  <option value="Stage 2">Stage 2</option>
                                  <option value="Stage 3">Stage 3</option>
                                  <option value="Stage 4">Stage 4</option>
                                  <option value="Archived">Archived</option>
                                </Form.Select>
                              ) : (
                                <Badge
                                  bg=""
                                  style={{
                                    fontSize: "0.75rem",
                                    backgroundColor: getStageBgColor(currentStage),
                                    color: getStageTextColor(currentStage),
                                    fontWeight: "600",
                                  }}
                                >
                                  {currentStage}
                                </Badge>
                              )}
                            </td>
                            <td>
                              <MultiListBadges
                                universalId={player.universal_id}
                                maxVisible={2}
                                showStage={false}
                                memberships={batchMemberships[player.universal_id] || []}
                                loading={loadingMemberships}
                              />
                            </td>
                            <td>
                              {player.avg_performance_score !== null ? (
                                <Badge
                                  bg=""
                                  style={{
                                    backgroundColor: scoreColor,
                                    color: textColor,
                                    fontSize: "0.85rem",
                                    fontWeight: "bold",
                                    padding: "4px 10px",
                                  }}
                                >
                                  {player.avg_performance_score.toFixed(1)}
                                </Badge>
                              ) : (
                                <span className="text-muted">N/A</span>
                              )}
                            </td>
                            <td>
                              {player.report_count}
                              {player.live_reports > 0 && (
                                <Badge
                                  bg=""
                                  className="ms-2"
                                  style={{
                                    backgroundColor: "#ffffff",
                                    color: "#000000",
                                    border: "1px solid #dee2e6",
                                    fontSize: "0.75rem",
                                    padding: "3px 6px",
                                  }}
                                >
                                  🏟️ {player.live_reports}
                                </Badge>
                              )}
                            </td>
                            <td>
                              <div className="btn-group" style={{ justifyContent: "center" }}>
                                <Button
                                  size="sm"
                                  title="Add/Edit Notes"
                                  onClick={() => handleOpenNotesModal(player)}
                                  className="btn-action-circle btn-action-edit"
                                >
                                  📝
                                </Button>
                                <Button
                                  size="sm"
                                  title="View stage history"
                                  onClick={() => openStageHistory(player)}
                                  className="btn-action-circle"
                                  disabled={!currentList}
                                >
                                  📊
                                </Button>
                                <Button
                                  size="sm"
                                  title={playerFavorites.has(player.universal_id) ? "Remove from favorites" : "Add to favorites"}
                                  onClick={() => handleToggleFavorite(player.universal_id)}
                                  className="btn-action-circle"
                                  style={{ color: playerFavorites.has(player.universal_id) ? "#FFD700" : "#6b7280" }}
                                >
                                  {playerFavorites.has(player.universal_id) ? "⭐" : "☆"}
                                </Button>
                                <Button
                                  size="sm"
                                  title={!currentList ? "Select a single list to remove players" : pendingRemoval ? "Pending removal" : "Remove from list"}
                                  onClick={() => handleRemovePlayer(player.item_id)}
                                  className="btn-action-circle btn-action-delete"
                                  disabled={!currentList || pendingRemoval}
                                >
                                  {pendingRemoval ? "..." : "🗑️"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </>
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
                placeholder="e.g., Priority Targets"
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
          <Button variant="primary" onClick={handleSaveList} disabled={savingList || !listName.trim()}>
            {savingList ? (
              <>
                <Spinner as="span" animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : editingList ? (
              "Update"
            ) : (
              "Create"
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
          <Modal.Title>
            Add Player to {visibleListIds.size === 1
              ? lists.find((list) => visibleListIds.has(list.id))?.list_name
              : "Selected Lists"}
          </Modal.Title>
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
                    <strong>
                      {player.player_name || `Unknown Player (ID: ${player.player_id || player.cafc_player_id})`}
                    </strong>
                    <div className="text-muted small">
                      {player.position && `${player.position} • `}
                      {player.squad_name || "Unknown Club"}
                      {player.age && ` • Age ${player.age}`}
                    </div>
                  </div>
                  <span style={{ color: colors.primary, fontSize: "0.9rem" }}>Add →</span>
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
          stageReasonModalData?.universalId
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

      {/* Floating Save/Discard Changes Button */}
      {currentList && (pendingStageChanges.size > 0 || pendingRemovals.size > 0) && (
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
    </Container>
  );
};

export default PlayerListsPage;
