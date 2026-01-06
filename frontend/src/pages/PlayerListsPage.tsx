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

import React, { useState, useEffect, useMemo } from "react";
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
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { usePlayerLists } from "../hooks/usePlayerLists";
import MultiListBadges from "../components/PlayerLists/MultiListBadges";
import EmptyState from "../components/PlayerLists/EmptyState";
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
  PlayerListMembership,
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

type SortField = "name" | "age" | "club" | "stage" | "score" | "reports";
type SortDirection = "asc" | "desc";

const PlayerListsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, loading: userLoading, canAccessLists } = useCurrentUser();

  // Use custom hook for data
  const { lists, loading, error: fetchError, refetch } = usePlayerLists();

  // Local error
  const [error, setError] = useState<string | null>(null);

  // Selected list
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

  // Remove player
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);

  // Batch list memberships (for MultiListBadges performance)
  const [batchMemberships, setBatchMemberships] = useState<Record<string, PlayerListMembership[]>>({});
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  // Batch save state for pending changes
  const [pendingStageChanges, setPendingStageChanges] = useState<Map<number, string>>(new Map());
  const [pendingRemovals, setPendingRemovals] = useState<Set<number>>(new Set());
  const [savingChanges, setSavingChanges] = useState(false);

  // Permission check
  useEffect(() => {
    if (!userLoading && !canAccessLists) {
      navigate("/");
    }
  }, [userLoading, canAccessLists, navigate]);

  // Auto-select first list
  useEffect(() => {
    if (lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  // Merge errors
  useEffect(() => {
    if (fetchError) {
      setError(fetchError);
    }
  }, [fetchError]);

  // Get current list and players
  const currentList = useMemo(() => {
    return lists.find((list) => list.id === selectedListId) || null;
  }, [lists, selectedListId]);

  // Fetch batch memberships when current list changes
  useEffect(() => {
    const fetchBatchMemberships = async () => {
      if (!currentList || currentList.players.length === 0) {
        setBatchMemberships({});
        return;
      }

      try {
        setLoadingMemberships(true);
        const universalIds = currentList.players.map((p) => p.universal_id);
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
  }, [currentList]);

  // Sort players with optimistic updates applied
  const sortedPlayers = useMemo(() => {
    if (!currentList) return [];

    // Filter out pending removals (optimistic update)
    let result = currentList.players.filter(
      (player) => !pendingRemovals.has(player.item_id)
    );

    // Sort
    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "name":
          aVal = a.player_name.toLowerCase();
          bVal = b.player_name.toLowerCase();
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
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [currentList, sortField, sortDirection, pendingStageChanges, pendingRemovals]);

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
        setSelectedListId(result.list_id);
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

      if (selectedListId === listId) {
        setSelectedListId(null);
      }

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
    if (!selectedListId) return;

    try {
      setAddingPlayer(true);
      setError(null);

      await addPlayerToList(selectedListId, player.universal_id);
      await refetch();

      setShowAddPlayerModal(false);
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

  const handleStageChange = (itemId: number, newStage: string) => {
    // Add to pending changes instead of saving immediately (batch mode)
    setPendingStageChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(itemId, newStage);
      return newMap;
    });
  };

  const handleExport = () => {
    if (!currentList) return;
    exportPlayersToCSV(sortedPlayers, `${currentList.list_name}.csv`);
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
    if (!selectedListId || (pendingStageChanges.size === 0 && pendingRemovals.size === 0)) {
      return;
    }

    try {
      setSavingChanges(true);
      setError(null);

      // Execute all stage updates
      const stageUpdatePromises = Array.from(pendingStageChanges.entries()).map(
        ([itemId, newStage]) => updatePlayerStage(selectedListId, itemId, newStage)
      );

      // Execute all removals
      const removalPromises = Array.from(pendingRemovals).map(
        (itemId) => removePlayerFromList(selectedListId, itemId)
      );

      await Promise.all([...stageUpdatePromises, ...removalPromises]);
      await refetch();

      // Clear pending changes
      setPendingStageChanges(new Map());
      setPendingRemovals(new Set());
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
      <Container fluid className="py-4">
        <div className="mb-4">
          <h3>Player Lists</h3>
          <p className="text-muted">Loading your player lists...</p>
        </div>
        <div className="table-responsive">
          <Table responsive hover striped className="table-compact table-sm">
            <thead className="table-dark">
              <tr>
                <th>Player</th>
                <th>Age</th>
                <th>Club</th>
                <th>Stage</th>
                <th>Lists</th>
                <th>Score</th>
                <th>Reports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(10)].map((_, index) => (
                <tr key={index}>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "120px",
                        height: "20px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "40px",
                        height: "20px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "100px",
                        height: "20px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "80px",
                        height: "24px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "90px",
                        height: "20px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "50px",
                        height: "24px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "12px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "60px",
                        height: "20px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                  <td>
                    <div
                      className="skeleton-box"
                      style={{
                        width: "32px",
                        height: "32px",
                        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: "4px",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <style>{`
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
        `}</style>
      </Container>
    );
  }

  return (
    <Container fluid className="py-4">
      {/* Error Alert */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="mb-3">
          {error}
        </Alert>
      )}

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="mb-1">Player Lists</h3>
          <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
            Manage your player recruitment lists
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => navigate("/lists/kanban")}
            style={{
              ...buttonStyles.secondary,
              borderRadius: borderRadius.pill,
            }}
          >
            Switch to Kanban View
          </Button>
          <Button
            variant="dark"
            onClick={openCreateModal}
            style={{
              ...buttonStyles.primary,
            }}
          >
            + New List
          </Button>
        </div>
      </div>

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
          {/* List Selection Pills */}
          <div
            className="mb-3 p-3"
            style={{
              backgroundColor: colors.gray[50],
              borderRadius: borderRadius.md,
              border: `1px solid ${colors.gray[200]}`,
            }}
          >
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="fw-semibold" style={{ fontSize: "0.85rem", color: colors.gray[700] }}>
                Select List:
              </span>
            </div>
            <div className="d-flex gap-2 flex-wrap align-items-center">
              {lists.map((list) => {
                const isSelected = selectedListId === list.id;
                return (
                  <Badge
                    key={list.id}
                    bg=""
                    onClick={() => setSelectedListId(list.id)}
                    style={{
                      ...badgeStyles.pill,
                      backgroundColor: isSelected ? colors.primary : colors.gray[300],
                      color: isSelected ? colors.white : colors.gray[600],
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {list.list_name} ({list.player_count})
                  </Badge>
                );
              })}
            </div>

            {/* List Actions */}
            {currentList && (
              <div className="mt-3 pt-3 border-top d-flex gap-2 align-items-center">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => openEditModal(currentList)}
                  style={{ fontSize: "0.8rem" }}
                >
                  ✏️ Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => handleDeleteList(currentList.id)}
                  style={{ fontSize: "0.8rem" }}
                >
                  🗑️ Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={() => setShowAddPlayerModal(true)}
                  style={{ fontSize: "0.8rem" }}
                >
                  + Add Player
                </Button>
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={handleExport}
                  style={{ fontSize: "0.8rem" }}
                >
                  📊 Export CSV
                </Button>
              </div>
            )}
          </div>

          {currentList && (
            <>
              {/* Content */}
              {sortedPlayers.length === 0 ? (
                <EmptyState
                  title="No Players in This List"
                  message="Add players to start building your recruitment pipeline."
                  actionLabel="Add Player"
                  onAction={() => setShowAddPlayerModal(true)}
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

                        return (
                          <tr
                            key={player.item_id}
                            style={{
                              backgroundColor: pendingRemoval
                                ? "rgba(239, 68, 68, 0.05)" // Light red for removals
                                : hasPendingStageChange
                                ? "rgba(245, 158, 11, 0.05)" // Light orange for stage changes
                                : "transparent",
                              opacity: pendingRemoval ? 0.6 : 1,
                              textDecoration: pendingRemoval ? "line-through" : "none",
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
                                <strong>{player.player_name}</strong>
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
                              </a>
                              <div className="text-muted small">{player.position || "Unknown"}</div>
                            </td>
                            <td>{player.age || "N/A"}</td>
                            <td>{player.squad_name || "Unknown"}</td>
                            <td>
                              <Form.Select
                                size="sm"
                                value={currentStage}
                                onChange={(e) => handleStageChange(player.item_id, e.target.value)}
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
                              </Form.Select>
                            </td>
                            <td>
                              <MultiListBadges
                                universalId={player.universal_id}
                                maxVisible={2}
                                showStage={false}
                                memberships={batchMemberships[player.universal_id]}
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
                                <Badge bg="primary" className="ms-2" style={{ fontSize: "0.75rem", padding: "3px 6px" }}>
                                  👁️ {player.live_reports}
                                </Badge>
                              )}
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => handleRemovePlayer(player.item_id)}
                                disabled={removingPlayerId === player.item_id}
                              >
                                {removingPlayerId === player.item_id ? "..." : "×"}
                              </Button>
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
          <Modal.Title>Add Player to {currentList?.list_name}</Modal.Title>
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
    </Container>
  );
};

export default PlayerListsPage;
