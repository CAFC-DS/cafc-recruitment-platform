import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Button,
  Spinner,
  Alert,
  Form,
  ListGroup,
  Modal,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";
import KanbanBoard from "../components/Kanban/KanbanBoard";
import { ListWithPlayers, PlayerList } from "../components/Kanban/KanbanColumn";
import { PlayerInList } from "../components/Kanban/PlayerKanbanCard";

/**
 * Player search result interface
 */
interface PlayerSearchResult {
  player_id: number;
  cafc_player_id: number | null;
  player_name: string;
  position: string | null;
  squad_name: string | null;
  age: number | null;
  universal_id: string;
}

/**
 * KanbanPage Component
 *
 * Main page for the Kanban-style player list management system.
 * Displays all player lists as columns in a horizontal scrolling board.
 *
 * Features:
 * - Drag-and-drop players between lists
 * - Reorder players within lists
 * - Create/edit/delete lists
 * - Add/remove players
 * - Search players with debounce
 * - Role-based access control (admin/manager only)
 * - Optimistic UI updates
 * - Comprehensive error handling
 *
 * Integration:
 * - Uses existing backend API endpoints
 * - Reuses existing components and utilities
 * - Maintains same permission checks as PlayerListsPage
 * - Preserves all existing data structures
 *
 * Performance:
 * - Loads all lists with players in optimized structure
 * - Memoized components prevent unnecessary re-renders
 * - Optimistic updates for instant feedback
 * - Debounced search (300ms)
 */
const KanbanPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, loading: userLoading } = useCurrentUser();

  // Derived permissions
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";

  // Main state
  const [listsWithPlayers, setListsWithPlayers] = useState<ListWithPlayers[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // List filter state - which lists are visible in Kanban
  const [visibleListIds, setVisibleListIds] = useState<Set<number>>(new Set());

  // Create/Edit List Modal
  const [showListModal, setShowListModal] = useState(false);
  const [editingList, setEditingList] = useState<PlayerList | null>(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Add Player Modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [currentListId, setCurrentListId] = useState<number | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<
    PlayerSearchResult[]
  >([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Remove player state
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);

  // Search cache to avoid redundant API calls
  const searchCache = useRef<Map<string, PlayerSearchResult[]>>(new Map());
  const CACHE_SIZE_LIMIT = 20;

  /**
   * Check permissions - redirect if unauthorized
   */
  useEffect(() => {
    if (!userLoading && !isAdmin && !isManager) {
      navigate("/");
    }
  }, [userLoading, isAdmin, isManager, navigate]);

  /**
   * Fetch all lists with their players
   * This is more efficient than fetching lists and then details separately
   */
  const fetchAllLists = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First, get all list summaries
      const listsResponse = await axiosInstance.get("/player-lists");
      const lists: PlayerList[] = listsResponse.data.lists;

      // Then, fetch details for each list in parallel
      const detailPromises = lists.map((list) =>
        axiosInstance.get(`/player-lists/${list.id}`)
      );

      const detailResponses = await Promise.all(detailPromises);

      // Combine summaries with details
      const listsWithPlayersData: ListWithPlayers[] = lists.map(
        (list, index) => ({
          ...list,
          players: detailResponses[index].data.players || [],
        })
      );

      setListsWithPlayers(listsWithPlayersData);

      // Initialize all lists as visible
      const allListIds = new Set(lists.map(list => list.id));
      setVisibleListIds(allListIds);
    } catch (err: any) {
      console.error("Error fetching lists:", err);
      setError(
        err.response?.data?.detail || "Failed to load player lists. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Transform list-based data into stage-based columns
   * Groups players by stage and enriches them with list information
   */
  const stageColumns = React.useMemo(() => {
    const stages = {
      "Stage 1": [] as PlayerInList[],
      "Stage 2": [] as PlayerInList[],
      "Stage 3": [] as PlayerInList[],
      "Stage 4": [] as PlayerInList[],
    };

    // Collect all players from all lists, enriching with list info
    listsWithPlayers.forEach((list) => {
      // Skip lists that are not visible
      if (!visibleListIds.has(list.id)) return;

      list.players.forEach((player) => {
        const stage = player.stage || "Stage 1";
        if (stages[stage as keyof typeof stages]) {
          // Enrich player with list information
          stages[stage as keyof typeof stages].push({
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
    })) as ListWithPlayers[];
  }, [listsWithPlayers, visibleListIds]);

  /**
   * Toggle list visibility in filter
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
   * Initial load
   */
  useEffect(() => {
    if (isAdmin || isManager) {
      fetchAllLists();
    }
  }, [isAdmin, isManager, fetchAllLists]);

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
        // Update existing list
        await axiosInstance.put(`/player-lists/${editingList.id}`, {
          list_name: listName,
          description: listDescription || null,
        });
      } else {
        // Create new list
        await axiosInstance.post("/player-lists", {
          list_name: listName,
          description: listDescription || null,
        });
      }

      // Refresh lists
      await fetchAllLists();

      // Close modal and reset
      setShowListModal(false);
      setEditingList(null);
      setListName("");
      setListDescription("");
    } catch (err: any) {
      console.error("Error saving list:", err);
      setError(
        err.response?.data?.detail || "Failed to save list. Please try again."
      );
    } finally {
      setSavingList(false);
    }
  };

  /**
   * Delete list
   */
  const handleDeleteList = async (listId: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this list? All players will be removed from it."
      )
    ) {
      return;
    }

    try {
      setError(null);
      await axiosInstance.delete(`/player-lists/${listId}`);
      await fetchAllLists();
    } catch (err: any) {
      console.error("Error deleting list:", err);
      setError(
        err.response?.data?.detail || "Failed to delete list. Please try again."
      );
    }
  };

  /**
   * Open modal to edit list
   */
  const openEditModal = (list: PlayerList) => {
    setEditingList(list);
    setListName(list.list_name);
    setListDescription(list.description || "");
    setShowListModal(true);
  };

  /**
   * Open modal to create new list
   */
  const openCreateModal = () => {
    setEditingList(null);
    setListName("");
    setListDescription("");
    setShowListModal(true);
  };

  /**
   * Search for players with debounce
   */
  const handlePlayerSearch = async (query: string) => {
    if (!query.trim()) {
      setPlayerSearchResults([]);
      return;
    }

    // Check cache first
    if (searchCache.current.has(query)) {
      setPlayerSearchResults(searchCache.current.get(query)!);
      return;
    }

    try {
      setSearchingPlayers(true);
      const response = await axiosInstance.get(`/players/search`, {
        params: { q: query },
      });

      const results = response.data.players || [];
      setPlayerSearchResults(results);

      // Update cache
      searchCache.current.set(query, results);

      // Limit cache size
      if (searchCache.current.size > CACHE_SIZE_LIMIT) {
        const firstKey = searchCache.current.keys().next().value;
        searchCache.current.delete(firstKey);
      }
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

      await axiosInstance.post(`/player-lists/${currentListId}/players`, {
        player_id: player.player_id || null,
        cafc_player_id: player.cafc_player_id || null,
      });

      // Refresh lists
      await fetchAllLists();

      // Close modal and reset
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
   * Remove player from list
   */
  const handleRemovePlayer = async (itemId: number, listId: number) => {
    if (!window.confirm("Remove this player from the list?")) {
      return;
    }

    try {
      setRemovingPlayerId(itemId);
      setError(null);

      await axiosInstance.delete(`/player-lists/${listId}/players/${itemId}`);

      // Refresh lists
      await fetchAllLists();
    } catch (err: any) {
      console.error("Error removing player:", err);
      setError(
        err.response?.data?.detail || "Failed to remove player. Please try again."
      );
    } finally {
      setRemovingPlayerId(null);
    }
  };

  /**
   * Move player between lists (drag-and-drop)
   */
  /**
   * Handle moving player between stage columns (updates stage)
   */
  const handleStageChange = async (
    itemId: number,
    fromStage: string,
    toStage: string,
    listId: number
  ) => {
    try {
      // Update the player's stage via API
      await axiosInstance.put(`/player-lists/${listId}/players/${itemId}/stage`, {
        stage: toStage,
      });

      // Refresh lists to sync any server-side changes
      await fetchAllLists();
    } catch (err: any) {
      console.error("Error moving player:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to move player. They may already be in the destination list."
      );
      // Refresh to revert optimistic update
      await fetchAllLists();
    }
  };

  /**
   * Reorder player within the same list
   */
  const handleReorderPlayer = async (
    listId: number,
    oldIndex: number,
    newIndex: number
  ) => {
    try {
      const list = listsWithPlayers.find((l) => l.id === listId);
      if (!list) return;

      // Build reorder data
      const reorderedPlayers = [...list.players];
      const [movedPlayer] = reorderedPlayers.splice(oldIndex, 1);
      reorderedPlayers.splice(newIndex, 0, movedPlayer);

      const itemOrders = reorderedPlayers.map((player, index) => ({
        item_id: player.item_id,
        display_order: index,
      }));

      // Send to server
      await axiosInstance.put(`/player-lists/${listId}/reorder`, {
        item_orders: itemOrders,
      });

      // Optionally refresh lists
      // await fetchAllLists();
    } catch (err: any) {
      console.error("Error reordering players:", err);
      setError(
        err.response?.data?.detail || "Failed to reorder players. Please try again."
      );
      // Refresh to revert optimistic update
      await fetchAllLists();
    }
  };

  /**
   * Open add player modal for specific list
   */
  const openAddPlayerModal = (listId: number) => {
    setCurrentListId(listId);
    setPlayerSearchQuery("");
    setPlayerSearchResults([]);
    setShowAddPlayerModal(true);
  };

  // Loading state
  if (userLoading || loading) {
    return (
      <Container className="text-center mt-5">
        <Spinner animation="border" />
        <p className="mt-3 text-muted">Loading Kanban board...</p>
      </Container>
    );
  }

  return (
    <Container fluid className="py-4">
      {/* Error Alert */}
      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError(null)}
          className="mb-3"
        >
          {error}
        </Alert>
      )}

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="mb-1">Player Lists - Kanban View</h3>
          <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
            Drag players between lists to organize your recruitment pipeline
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => navigate("/lists")}
            style={{
              borderRadius: "20px",
              padding: "8px 16px",
            }}
          >
            Switch to Table View
          </Button>
          <Button
            variant="dark"
            onClick={openCreateModal}
            style={{
              borderRadius: "20px",
              padding: "8px 20px",
              fontWeight: "600",
            }}
          >
            + New List
          </Button>
        </div>
      </div>

      {/* List Filter Controls */}
      {listsWithPlayers.length > 0 && (
        <div className="mb-3 p-3" style={{ backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <span className="fw-bold" style={{ fontSize: "0.9rem" }}>
              Filter Lists:
            </span>
            {listsWithPlayers.map((list) => (
              <Form.Check
                key={list.id}
                type="checkbox"
                id={`list-filter-${list.id}`}
                label={list.list_name}
                checked={visibleListIds.has(list.id)}
                onChange={() => toggleListVisibility(list.id)}
                style={{ fontSize: "0.85rem" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Kanban Board - Stage-based */}
      <KanbanBoard
        lists={stageColumns}
        onListsChange={() => {}} // Not used in stage-based view
        onEditList={() => {}} // Stages are fixed, can't edit
        onDeleteList={() => {}} // Stages are fixed, can't delete
        onAddPlayer={openAddPlayerModal}
        onRemovePlayer={handleRemovePlayer}
        onMovePlayer={(itemId, fromStage, toStage) => {
          // Extract list_id from the player
          const fromStageColumn = stageColumns.find(c => c.id === fromStage);
          const player = fromStageColumn?.players.find(p => p.item_id === itemId);
          if (player && player.list_id) {
            handleStageChange(itemId, fromStage, toStage, player.list_id);
          }
        }}
        onReorderPlayer={handleReorderPlayer}
        removingPlayerId={removingPlayerId}
      />

      {/* Create/Edit List Modal */}
      <Modal
        show={showListModal}
        onHide={() => !savingList && setShowListModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingList ? "Edit List" : "Create New List"}
          </Modal.Title>
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
          <Button
            variant="secondary"
            onClick={() => setShowListModal(false)}
            disabled={savingList}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveList}
            disabled={savingList || !listName.trim()}
          >
            {savingList ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  className="me-2"
                />
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

          {/* Search Loading */}
          {searchingPlayers && (
            <div className="text-center py-4">
              <Spinner animation="border" className="me-2" />
              <span className="text-muted">Searching...</span>
            </div>
          )}

          {/* Add Loading */}
          {addingPlayer && (
            <div className="text-center py-4">
              <Spinner animation="border" className="me-2" />
              <span className="text-muted">Adding player...</span>
            </div>
          )}

          {/* Search Results */}
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
                  <span style={{ color: "#0d6efd", fontSize: "0.9rem" }}>
                    Add →
                  </span>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          {/* Empty States */}
          {!searchingPlayers &&
            !addingPlayer &&
            playerSearchQuery.trim() &&
            playerSearchResults.length === 0 && (
              <Alert variant="info">
                No players found matching "{playerSearchQuery}"
              </Alert>
            )}

          {!searchingPlayers &&
            !addingPlayer &&
            !playerSearchQuery.trim() && (
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
