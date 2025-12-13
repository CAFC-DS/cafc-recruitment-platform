import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Row,
  Col,
  Button,
  Spinner,
  Alert,
  Form,
  ListGroup,
  Modal,
  Table,
  Badge,
  Card,
  ButtonGroup,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useViewMode } from "../contexts/ViewModeContext";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../utils/colorUtils";

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

interface PlayerInList {
  item_id: number;
  player_id: number | null;
  cafc_player_id: number | null;
  universal_id: string;
  display_order: number;
  notes: string | null;
  added_by: number;
  created_at: string;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  squad_name: string | null;
  age: number | null;
  added_by_username: string;
  stage: string;
  list_name?: string;
  list_id?: number | string;
  report_count: number;
  avg_performance_score: number | null;
  live_reports: number;
  video_reports: number;
}

interface ListDetail {
  id: number;
  list_name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  players: PlayerInList[];
}

interface PlayerSearchResult {
  player_id: number;
  cafc_player_id: number | null;
  player_name: string;
  position: string | null;
  squad_name: string | null;
  age: number | null;
  universal_id: string;
}

const PlayerListsPage: React.FC = () => {
  const { user, loading: userLoading, isAdmin, isManager } = useCurrentUser();
  const navigate = useNavigate();
  const { viewMode, setViewMode } = useViewMode();

  // Helper function to get player profile path from universal_id
  const getPlayerPath = (universalId: string): string => {
    if (universalId.startsWith("internal_")) {
      const cafcId = universalId.replace("internal_", "");
      return `/player-profile/${cafcId}`;
    } else if (universalId.startsWith("external_")) {
      const playerId = universalId.replace("external_", "");
      return `/player/${playerId}`;
    }
    return "/";
  };

  const [lists, setLists] = useState<PlayerList[]>([]);
  const [selectedList, setSelectedList] = useState<ListDetail | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit List Modal
  const [showListModal, setShowListModal] = useState(false);
  const [editingList, setEditingList] = useState<PlayerList | null>(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Add Player Modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>("Stage 1");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<
    PlayerSearchResult[]
  >([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Table sorting state
  type SortField = 'name' | 'position' | 'club' | 'age' | 'stage' | 'score' | 'reports' | 'live';
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Check permissions
  useEffect(() => {
    if (!userLoading && !isAdmin && !isManager) {
      navigate("/");
    }
  }, [userLoading, isAdmin, isManager, navigate]);

  // Fetch all lists
  const fetchLists = useCallback(async () => {
    try {
      setLoadingLists(true);
      const response = await axiosInstance.get("/player-lists");
      setLists(response.data.lists);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching lists:", err);
      setError("Failed to load player lists");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  // Fetch list detail
  const fetchListDetail = useCallback(async (listId: number) => {
    try {
      setLoadingDetail(true);
      const response = await axiosInstance.get(`/player-lists/${listId}`);
      setSelectedList(response.data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching list detail:", err);
      setError("Failed to load list details");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Create or update list
  const handleSaveList = async () => {
    try {
      setSavingList(true);
      if (editingList) {
        // Update existing list
        await axiosInstance.put(`/player-lists/${editingList.id}`, {
          list_name: listName,
          description: listDescription,
        });
      } else {
        // Create new list
        const response = await axiosInstance.post("/player-lists", {
          list_name: listName,
          description: listDescription,
        });
        // Auto-select the newly created list
        if (response.data.list_id) {
          await fetchListDetail(response.data.list_id);
        }
      }
      await fetchLists();
      setShowListModal(false);
      setListName("");
      setListDescription("");
      setEditingList(null);
    } catch (err: any) {
      console.error("Error saving list:", err);
      setError("Failed to save list");
    } finally {
      setSavingList(false);
    }
  };

  // Delete list
  const handleDeleteList = async (listId: number) => {
    if (!window.confirm("Are you sure you want to delete this list?")) {
      return;
    }

    try {
      await axiosInstance.delete(`/player-lists/${listId}`);
      await fetchLists();
      if (selectedList?.id === listId) {
        setSelectedList(null);
      }
    } catch (err: any) {
      console.error("Error deleting list:", err);
      setError("Failed to delete list");
    }
  };

  // Search players
  const handlePlayerSearch = async (query: string) => {
    if (!query.trim()) {
      setPlayerSearchResults([]);
      return;
    }

    try {
      setSearchingPlayers(true);
      const response = await axiosInstance.get("/players/search", {
        params: { query },
      });
      setPlayerSearchResults(response.data);
    } catch (err: any) {
      console.error("Error searching players:", err);
    } finally {
      setSearchingPlayers(false);
    }
  };

  // Debounced search
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

  // Add player to list
  const handleAddPlayer = async (player: PlayerSearchResult) => {
    if (!selectedList) return;

    try {
      setAddingPlayer(true);
      await axiosInstance.post(`/player-lists/${selectedList.id}/players`, {
        player_id: player.player_id,
        cafc_player_id: player.cafc_player_id,
        stage: selectedStage,
      });
      await fetchListDetail(selectedList.id);
      await fetchLists(); // Refresh lists to update average score
      setShowAddPlayerModal(false);
      setPlayerSearchQuery("");
      setPlayerSearchResults([]);
      setSelectedStage("Stage 1"); // Reset to default
    } catch (err: any) {
      console.error("Error adding player:", err);
      if (err.response?.status === 400) {
        setError("Player is already in this list");
      } else {
        setError("Failed to add player");
      }
    } finally {
      setAddingPlayer(false);
    }
  };

  // Remove player from list
  const handleRemovePlayer = async (itemId: number) => {
    if (!selectedList) return;

    if (!window.confirm("Remove this player from the list?")) {
      return;
    }

    try {
      setRemovingPlayerId(itemId);
      await axiosInstance.delete(
        `/player-lists/${selectedList.id}/players/${itemId}`
      );
      await fetchListDetail(selectedList.id);
      await fetchLists(); // Refresh lists to update average score
    } catch (err: any) {
      console.error("Error removing player:", err);
      setError("Failed to remove player");
    } finally {
      setRemovingPlayerId(null);
    }
  };

  // Update player stage
  const handleStageChange = async (itemId: number, newStage: string) => {
    if (!selectedList) return;

    try {
      await axiosInstance.put(
        `/player-lists/${selectedList.id}/players/${itemId}/stage`,
        { stage: newStage }
      );
      await fetchListDetail(selectedList.id);
      await fetchLists(); // Refresh lists to update average score
    } catch (err: any) {
      console.error("Error updating stage:", err);
      setError("Failed to update stage");
    }
  };

  // Open create modal
  const openCreateModal = () => {
    setEditingList(null);
    setListName("");
    setListDescription("");
    setShowListModal(true);
  };

  // Open edit modal
  const openEditModal = (list: PlayerList) => {
    setEditingList(list);
    setListName(list.list_name);
    setListDescription(list.description || "");
    setShowListModal(true);
  };

  // Select list
  const handleSelectList = (list: PlayerList) => {
    fetchListDetail(list.id);
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sorted players
  const getSortedPlayers = (players: PlayerInList[]) => {
    return [...players].sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortField) {
        case 'name':
          compareA = a.player_name?.toLowerCase() || '';
          compareB = b.player_name?.toLowerCase() || '';
          break;
        case 'position':
          compareA = a.position?.toLowerCase() || '';
          compareB = b.position?.toLowerCase() || '';
          break;
        case 'club':
          compareA = a.squad_name?.toLowerCase() || '';
          compareB = b.squad_name?.toLowerCase() || '';
          break;
        case 'age':
          compareA = a.age ?? -1;
          compareB = b.age ?? -1;
          break;
        case 'stage':
          // Extract stage number for proper sorting (Stage 1-4)
          compareA = parseInt(a.stage?.replace('Stage ', '') || '1');
          compareB = parseInt(b.stage?.replace('Stage ', '') || '1');
          break;
        case 'score':
          compareA = a.avg_performance_score ?? -1;
          compareB = b.avg_performance_score ?? -1;
          break;
        case 'reports':
          compareA = a.report_count ?? 0;
          compareB = b.report_count ?? 0;
          break;
        case 'live':
          compareA = a.live_reports ?? 0;
          compareB = b.live_reports ?? 0;
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  if (userLoading || loadingLists) {
    return (
      <Container className="text-center mt-5">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <Container fluid className="py-4">
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

      <Row>
        {/* Left Sidebar - Lists */}
        <Col lg={3} md={4} className="border-end pe-4">
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h4 className="mb-0">Player Lists</h4>
              <Button
                variant="dark"
                size="sm"
                onClick={openCreateModal}
                style={{
                  borderRadius: "20px",
                  fontWeight: "600",
                  padding: "6px 16px"
                }}
              >
                + New
              </Button>
            </div>
            <div className="d-flex justify-content-center">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate("/lists/kanban")}
                style={{
                  borderRadius: "20px",
                  padding: "6px 16px",
                  fontSize: "0.8rem",
                  width: "100%"
                }}
              >
                Switch to Kanban View
              </Button>
            </div>
          </div>

          <div style={{ maxHeight: "75vh", overflowY: "auto" }}>
            <ListGroup variant="flush">
              {lists.length === 0 ? (
                <div className="text-center py-4">
                  <div style={{ fontSize: "3rem", opacity: 0.3 }}>📋</div>
                  <p className="text-muted small mt-2">
                    No lists yet.<br />Create your first one!
                  </p>
                </div>
              ) : (
                lists.map((list) => {
                  const scoreColor = list.avg_performance_score != null
                    ? getPerformanceScoreColor(list.avg_performance_score)
                    : "#6b7280";
                  const textColor = getContrastTextColor(scoreColor);
                  const creatorName = list.created_by_firstname && list.created_by_lastname
                    ? `${list.created_by_firstname} ${list.created_by_lastname}`
                    : list.created_by_username;

                  return (
                    <ListGroup.Item
                      key={list.id}
                      action
                      active={selectedList?.id === list.id}
                      onClick={() => handleSelectList(list)}
                      className="border-0 border-bottom px-2 py-3"
                      style={{
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                        backgroundColor: selectedList?.id === list.id ? "#f8f9fa" : "transparent"
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="flex-grow-1">
                          <div className="fw-bold" style={{ fontSize: "0.95rem" }}>
                            {list.list_name}
                          </div>
                          <small className="text-muted d-block">
                            {list.player_count} player{list.player_count !== 1 ? "s" : ""}
                          </small>
                          {creatorName && (
                            <small className="text-muted d-block" style={{ fontSize: "0.75rem" }}>
                              by {creatorName}
                            </small>
                          )}
                        </div>
                        {list.avg_performance_score != null && (
                          <Badge
                            bg=""
                            style={{
                              backgroundColor: scoreColor,
                              color: textColor,
                              fontWeight: "bold",
                              fontSize: "0.75rem",
                              padding: "4px 8px"
                            }}
                          >
                            {list.avg_performance_score.toFixed(1)}
                          </Badge>
                        )}
                      </div>
                      <div className="d-flex gap-1 justify-content-end">
                        <span
                          role="button"
                          className="p-1 text-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(list);
                          }}
                          style={{
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            textDecoration: "none"
                          }}
                        >
                          ✏️
                        </span>
                        <span
                          role="button"
                          className="p-1 text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteList(list.id);
                          }}
                          style={{
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            textDecoration: "none"
                          }}
                        >
                          🗑️
                        </span>
                      </div>
                    </ListGroup.Item>
                  );
                })
              )}
            </ListGroup>
          </div>
        </Col>

        {/* Right Content - List Detail */}
        <Col lg={9} md={8}>
          {!selectedList ? (
            <div className="text-center mt-5 pt-5">
              <div style={{ fontSize: "5rem", opacity: 0.2 }}>📋</div>
              <h4 className="mt-3 text-muted">Select a list to view players</h4>
              <p className="text-muted">or create a new list to get started</p>
              <Button
                variant="dark"
                onClick={openCreateModal}
                style={{ borderRadius: "20px", padding: "10px 24px" }}
              >
                Create Your First List
              </Button>
            </div>
          ) : loadingDetail ? (
            <div className="text-center mt-5 pt-5">
              <Spinner animation="border" style={{ width: "3rem", height: "3rem" }} />
              <p className="mt-3 text-muted">Loading players...</p>
            </div>
          ) : (
            <>
              {/* Header with view toggle */}
              <div className="d-flex justify-content-between align-items-start mb-4">
                <div>
                  <h2 className="mb-1">{selectedList.list_name}</h2>
                  {selectedList.description && (
                    <p className="text-muted mb-2">{selectedList.description}</p>
                  )}
                  <small className="text-muted">
                    {selectedList.players.length} player{selectedList.players.length !== 1 ? "s" : ""}
                  </small>
                </div>
                <div className="d-flex gap-2 align-items-center">
                  {/* View Mode Toggle */}
                  <ButtonGroup size="sm">
                    <Button
                      variant={viewMode === "cards" ? "dark" : "outline-dark"}
                      onClick={() => setViewMode("cards")}
                      style={{ minWidth: "70px" }}
                    >
                      Cards
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "dark" : "outline-dark"}
                      onClick={() => setViewMode("table")}
                      style={{ minWidth: "70px" }}
                    >
                      Table
                    </Button>
                  </ButtonGroup>
                  <Button
                    variant="success"
                    onClick={() => setShowAddPlayerModal(true)}
                    style={{ borderRadius: "20px", fontWeight: "600" }}
                  >
                    + Add Player
                  </Button>
                </div>
              </div>

              {selectedList.players.length === 0 ? (
                <div className="text-center py-5 mt-4">
                  <div style={{ fontSize: "4rem", opacity: 0.3 }}>⚽</div>
                  <h5 className="mt-3">No players in this list yet</h5>
                  <p className="text-muted">Add players to start building your list</p>
                  <Button
                    variant="success"
                    onClick={() => setShowAddPlayerModal(true)}
                    style={{ borderRadius: "20px", padding: "10px 24px" }}
                  >
                    + Add First Player
                  </Button>
                </div>
              ) : viewMode === "cards" ? (
                /* Cards View */
                <Row className="g-3">
                  {selectedList.players.map((player, index) => {
                    const scoreColor = player.avg_performance_score
                      ? getPerformanceScoreColor(player.avg_performance_score)
                      : "#6b7280";
                    const textColor = getContrastTextColor(scoreColor);

                    return (
                      <Col key={player.item_id} lg={4} md={6} sm={12}>
                        <Card
                          className="h-100"
                          style={{
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.08)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                          }}
                          onClick={() => navigate(getPlayerPath(player.universal_id))}
                        >
                          <Card.Body className="p-3">
                            <div className="d-flex justify-content-between align-items-start mb-3 pb-2 border-bottom">
                              <div className="flex-grow-1">
                                <h6 className="mb-1 fw-bold">{player.player_name}</h6>
                                <small className="text-muted">
                                  {player.position || "Unknown"} • Age {player.age || "N/A"}
                                </small>
                              </div>
                              <Badge
                                bg=""
                                style={{
                                  backgroundColor: scoreColor,
                                  color: textColor,
                                  fontWeight: "bold",
                                  fontSize: "0.9rem",
                                  padding: "6px 10px"
                                }}
                              >
                                {player.avg_performance_score?.toFixed(1) || "N/A"}
                              </Badge>
                            </div>

                            <div className="mb-2">
                              <small className="text-muted d-block">
                                🏟️ {player.squad_name || "Unknown Club"}
                              </small>
                              <small className="text-muted d-block">
                                📊 {player.report_count} report{player.report_count !== 1 ? "s" : ""}
                              </small>
                              <small className="text-muted d-block">
                                👁️ {player.live_reports} live {player.live_reports !== 1 ? "watches" : "watch"}
                              </small>
                            </div>

                            <div className="mb-2">
                              <Form.Select
                                size="sm"
                                value={player.stage || "Stage 1"}
                                onChange={(e) => handleStageChange(player.item_id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  backgroundColor:
                                    player.stage === "Stage 4" ? "#16a34a" :
                                    player.stage === "Stage 3" ? "#3b82f6" :
                                    player.stage === "Stage 2" ? "#f59e0b" :
                                    "#6b7280",
                                  color: "#ffffff",
                                  fontWeight: "600",
                                  fontSize: "0.75rem",
                                  border: "none",
                                  cursor: "pointer",
                                  textAlign: "center",
                                  padding: "4px 8px",
                                  borderRadius: "12px",
                                  width: "110px"
                                }}
                              >
                                <option value="Stage 1">Stage 1</option>
                                <option value="Stage 2">Stage 2</option>
                                <option value="Stage 3">Stage 3</option>
                                <option value="Stage 4">Stage 4</option>
                              </Form.Select>
                            </div>

                            <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top">
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePlayer(player.item_id);
                                }}
                                disabled={removingPlayerId === player.item_id}
                                style={{
                                  borderRadius: "50%",
                                  width: "32px",
                                  height: "32px",
                                  padding: "0",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center"
                                }}
                              >
                                {removingPlayerId === player.item_id ? (
                                  <Spinner animation="border" size="sm" style={{ width: "14px", height: "14px" }} />
                                ) : (
                                  "×"
                                )}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              ) : (
                /* Table View */
                <Table hover responsive className="shadow-sm" style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #dee2e6"
                }}>
                  <thead style={{
                    backgroundColor: "#f8f9fa",
                    borderBottom: "2px solid #dee2e6",
                    position: "sticky",
                    top: 0,
                    zIndex: 10
                  }}>
                    <tr>
                      <th style={{ width: "50px" }}>#</th>
                      <th
                        onClick={() => handleSort('name')}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        Player Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('position')}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        Position {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('club')}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        Club {sortField === 'club' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('age')}
                        style={{ width: "80px", cursor: "pointer", userSelect: "none" }}
                      >
                        Age {sortField === 'age' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('stage')}
                        style={{ width: "110px", cursor: "pointer", userSelect: "none" }}
                      >
                        Stage {sortField === 'stage' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('score')}
                        style={{ width: "100px", cursor: "pointer", userSelect: "none" }}
                      >
                        Avg Score {sortField === 'score' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('reports')}
                        style={{ width: "90px", cursor: "pointer", userSelect: "none" }}
                      >
                        Reports {sortField === 'reports' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('live')}
                        style={{ width: "100px", cursor: "pointer", userSelect: "none" }}
                      >
                        Live Watches {sortField === 'live' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{ width: "90px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedPlayers(selectedList.players).map((player, index) => {
                      const scoreColor = player.avg_performance_score
                        ? getPerformanceScoreColor(player.avg_performance_score)
                        : "#6b7280";
                      const textColor = getContrastTextColor(scoreColor);

                      return (
                        <tr
                          key={player.item_id}
                          style={{
                            cursor: "pointer",
                            transition: "background-color 0.15s ease",
                            backgroundColor: index % 2 === 0 ? "white" : "#f9fafb"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#e3f2fd";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = index % 2 === 0 ? "white" : "#f9fafb";
                          }}
                        >
                          <td className="align-middle">
                            <span className="text-muted fw-bold">{index + 1}</span>
                          </td>
                          <td className="align-middle">
                            <a
                              href={getPlayerPath(player.universal_id)}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(getPlayerPath(player.universal_id));
                              }}
                              style={{
                                cursor: "pointer",
                                textDecoration: "none",
                                color: "#000",
                                fontWeight: "600"
                              }}
                            >
                              {player.player_name}
                            </a>
                          </td>
                          <td className="align-middle">{player.position || "-"}</td>
                          <td className="align-middle">{player.squad_name || "-"}</td>
                          <td className="align-middle text-center">{player.age !== null ? player.age : "-"}</td>
                          <td className="align-middle text-center">
                            <Form.Select
                              size="sm"
                              value={player.stage || "Stage 1"}
                              onChange={(e) => handleStageChange(player.item_id, e.target.value)}
                              style={{
                                backgroundColor:
                                  player.stage === "Stage 4" ? "#16a34a" : // Dark green
                                  player.stage === "Stage 3" ? "#3b82f6" : // Blue
                                  player.stage === "Stage 2" ? "#f59e0b" : // Amber
                                  "#6b7280", // Gray for Stage 1
                                color: "#ffffff",
                                fontWeight: "600",
                                fontSize: "0.75rem",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "center",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                width: "110px",
                                margin: "0 auto"
                              }}
                            >
                              <option value="Stage 1">Stage 1</option>
                              <option value="Stage 2">Stage 2</option>
                              <option value="Stage 3">Stage 3</option>
                              <option value="Stage 4">Stage 4</option>
                            </Form.Select>
                          </td>
                          <td className="align-middle text-center">
                            {player.avg_performance_score !== null ? (
                              <Badge
                                bg=""
                                style={{
                                  backgroundColor: scoreColor,
                                  color: textColor,
                                  fontWeight: "bold",
                                  fontSize: "0.85rem",
                                  padding: "5px 10px"
                                }}
                              >
                                {player.avg_performance_score.toFixed(1)}
                              </Badge>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="align-middle text-center">{player.report_count}</td>
                          <td className="align-middle text-center">
                            <Badge
                              bg="primary"
                              style={{
                                fontSize: "0.85rem",
                                padding: "5px 10px",
                                fontWeight: "600"
                              }}
                            >
                              {player.live_reports}
                            </Badge>
                          </td>
                          <td className="align-middle text-center">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePlayer(player.item_id);
                              }}
                              disabled={removingPlayerId === player.item_id}
                              style={{
                                borderRadius: "50%",
                                width: "32px",
                                height: "32px",
                                padding: "0",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1.2rem",
                                lineHeight: 1
                              }}
                            >
                              {removingPlayerId === player.item_id ? (
                                <Spinner animation="border" size="sm" style={{ width: "14px", height: "14px" }} />
                              ) : (
                                "×"
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </Col>
      </Row>

      {/* Create/Edit List Modal */}
      <Modal show={showListModal} onHide={() => setShowListModal(false)}>
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
                placeholder="Enter list name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Optional description"
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
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
            disabled={!listName.trim() || savingList}
          >
            {savingList ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
                {editingList ? "Updating..." : "Creating..."}
              </>
            ) : (
              editingList ? "Update" : "Create"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Player Modal */}
      <Modal
        show={showAddPlayerModal}
        onHide={() => {
          setShowAddPlayerModal(false);
          setPlayerSearchQuery("");
          setPlayerSearchResults([]);
          setSelectedStage("Stage 1");
        }}
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
              placeholder="Enter player name..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              Stage <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "0.95rem"
              }}
            >
              <option value="Stage 1">Stage 1</option>
              <option value="Stage 2">Stage 2</option>
              <option value="Stage 3">Stage 3</option>
              <option value="Stage 4">Stage 4</option>
            </Form.Select>
            <Form.Text className="text-muted">
              Select the stage for this player (Stage 1 = Initial, Stage 4 = Advanced)
            </Form.Text>
          </Form.Group>

          {searchingPlayers ? (
            <div className="text-center py-4">
              <Spinner animation="border" size="sm" className="me-2" />
              <span className="text-muted">Searching...</span>
            </div>
          ) : addingPlayer ? (
            <div className="text-center py-4">
              <Spinner animation="border" className="me-2" />
              <span className="text-muted">Adding player...</span>
            </div>
          ) : playerSearchResults.length > 0 ? (
            <ListGroup>
              {playerSearchResults.map((player) => (
                <ListGroup.Item
                  key={player.universal_id}
                  action
                  onClick={() => handleAddPlayer(player)}
                  className="d-flex justify-content-between align-items-center"
                  style={{
                    cursor: addingPlayer ? "not-allowed" : "pointer",
                    opacity: addingPlayer ? 0.6 : 1
                  }}
                >
                  <div>
                    <strong>{player.player_name}</strong>
                    <div className="text-muted small">
                      {player.position && `${player.position} • `}
                      {player.squad_name || "Unknown Club"}
                      {player.age && ` • Age ${player.age}`}
                    </div>
                  </div>
                  <Badge
                    bg="primary"
                    className="px-2 py-1"
                    style={{
                      cursor: addingPlayer ? "not-allowed" : "pointer",
                      opacity: addingPlayer ? 0.6 : 1
                    }}
                  >
                    Add
                  </Badge>
                </ListGroup.Item>
              ))}
            </ListGroup>
          ) : playerSearchQuery.trim() ? (
            <Alert variant="info">No players found</Alert>
          ) : (
            <p className="text-muted text-center">
              Start typing to search for players
            </p>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default PlayerListsPage;
