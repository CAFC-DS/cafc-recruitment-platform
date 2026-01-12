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

import React, { useState, useEffect, useRef, useMemo } from "react";
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
import LoadingSkeleton from "../components/PlayerLists/LoadingSkeleton";
import EmptyState from "../components/PlayerLists/EmptyState";
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
  PlayerListMembership,
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
  const { user: currentUser, loading: userLoading } = useCurrentUser();

  // Permissions
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";

  // Use the custom hook for data fetching
  const { lists, loading, error: fetchError, refetch } = usePlayerLists();

  // Local error state
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [visibleListIds, setVisibleListIds] = useState<Set<number>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

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

  // Permission check - redirect if unauthorized
  useEffect(() => {
    if (!userLoading && !isAdmin && !isManager) {
      navigate("/");
    }
  }, [userLoading, isAdmin, isManager, navigate]);

  // Don't auto-select lists - let user choose
  // useEffect removed - lists start deselected

  // Merge fetch error with local error
  useEffect(() => {
    if (fetchError) {
      setError(fetchError);
    }
  }, [fetchError]);

  /**
   * Transform lists into stage-based columns
   */
  const stageColumns = useMemo(() => {
    const stages = {
      "Stage 1": [] as PlayerInList[],
      "Stage 2": [] as PlayerInList[],
      "Stage 3": [] as PlayerInList[],
      "Stage 4": [] as PlayerInList[],
      ...(showArchived ? { "Archived": [] as PlayerInList[] } : {}),
    };

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
      players,
    }));
  }, [lists, visibleListIds, pendingStageChanges, pendingRemovals, showArchived]);

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

    try {
      setAddingPlayer(true);
      setError(null);

      await addPlayerToList(currentListId, player.universal_id);
      await refetch();

      setShowAddPlayerModal(false);
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
    listId: number | string
  ) => {
    // Add or update pending change
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
      <Container fluid className="py-4">
        <div className="mb-4">
          <h3>Player Lists - Kanban View</h3>
        </div>
        <LoadingSkeleton variant="column" count={4} />
      </Container>
    );
  }

  return (
    <Container fluid className="py-3 px-4">
      {/* Error Alert */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="mb-3">
          {error}
        </Alert>
      )}

      {/* Header */}
      <div className="mb-3">
        <h3 className="mb-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>Player Lists - Kanban View</h3>
        <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
          Drag players between stages to track recruitment progress
        </p>
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
          {/* Filters Section */}
          <div
            className="mb-3 p-2 px-3"
            style={{
              backgroundColor: colors.gray[50],
              borderRadius: borderRadius.md,
              border: `1px solid ${colors.gray[200]}`,
            }}
          >
            {/* List Filter Pills */}
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: "0.85rem", color: colors.gray[700] }}>
                  Lists:
                </span>
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => toggleAllLists(true)}
                  style={{ fontSize: "0.75rem", padding: "0 4px" }}
                >
                  All
                </Button>
                <span style={{ color: colors.gray[400] }}>|</span>
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => toggleAllLists(false)}
                  style={{ fontSize: "0.75rem", padding: "0 4px" }}
                >
                  None
                </Button>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {lists.map((list) => {
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
                        opacity: isVisible ? 1 : 0.7,
                      }}
                    >
                      {list.list_name} ({list.player_count})
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Show Archived Toggle */}
            <div className="mt-2">
              <Form.Check
                type="checkbox"
                id="show-archived-checkbox"
                label="Show Archived Players"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                style={{ fontSize: "0.85rem", color: colors.gray[700] }}
              />
            </div>

            {/* Action Buttons */}
            <div className="mt-3 pt-3 border-top">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                {/* Create New List Pill - Always visible */}
                <Button
                  size="sm"
                  variant="dark"
                  onClick={openCreateModal}
                  style={{
                    borderRadius: "50px",
                    padding: "0.4rem 1rem",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  ➕ New List
                </Button>

                {/* List Actions Dropdown - Only visible when lists are selected */}
                {visibleListIds.size > 0 && (
                  <Dropdown>
                    <Dropdown.Toggle
                      variant="dark"
                      size="sm"
                      style={{
                        borderRadius: "50px",
                        padding: "0.4rem 1rem",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                      }}
                    >
                      ⚙️ List Actions
                    </Dropdown.Toggle>

                    <Dropdown.Menu>
                      <Dropdown.Item onClick={() => navigate("/lists")}>
                        🔄 Switch to Table View
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item
                        onClick={() => {
                          // Can only edit a single list (not stage columns)
                          const selectedLists = lists.filter((list) => visibleListIds.has(list.id));
                          if (selectedLists.length === 1) {
                            openEditModal(selectedLists[0]);
                          } else {
                            alert("Please select exactly one list to edit");
                          }
                        }}
                      >
                        ✏️ Edit List
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() => {
                          // Can only delete a single list
                          const selectedLists = lists.filter((list) => visibleListIds.has(list.id));
                          if (selectedLists.length === 1) {
                            handleDeleteList(selectedLists[0].id);
                          } else {
                            alert("Please select exactly one list to delete");
                          }
                        }}
                      >
                        🗑️ Delete List
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item onClick={handleExport}>
                        📊 Export CSV
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                )}
              </div>

              {visibleListIds.size > 0 && lists.filter((list) => visibleListIds.has(list.id)).length !== 1 && (
                <div className="mt-2" style={{ fontSize: "0.75rem", color: colors.gray[600], fontStyle: "italic" }}>
                  Select a single list to access Edit and Delete actions
                </div>
              )}
            </div>
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
                handleStageChange(itemId, fromStage, toStage, player.list_id);
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
    </Container>
  );
};

export default KanbanPage;
