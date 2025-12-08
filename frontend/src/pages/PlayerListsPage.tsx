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
  report_count: number;
  avg_performance_score: number | null;
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
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<
    PlayerSearchResult[]
  >([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      });
      await fetchListDetail(selectedList.id);
      await fetchLists(); // Refresh lists to update average score
      setShowAddPlayerModal(false);
      setPlayerSearchQuery("");
      setPlayerSearchResults([]);
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
          <div className="d-flex justify-content-between align-items-center mb-3">
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
                  const scoreColor = list.avg_performance_score
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
                        {list.avg_performance_score !== null && (
                          <Badge
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
                        <Button
                          variant="link"
                          size="sm"
                          className="p-1 text-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(list);
                          }}
                          style={{ fontSize: "0.85rem" }}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-1 text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteList(list.id);
                          }}
                          style={{ fontSize: "0.85rem" }}
                        >
                          🗑️
                        </Button>
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
                          className="h-100 shadow-sm"
                          style={{
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                            border: "1px solid #e5e7eb"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-4px)";
                            e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
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
                <Table hover responsive className="shadow-sm" style={{ backgroundColor: "white" }}>
                  <thead style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                    <tr>
                      <th style={{ width: "50px" }}>#</th>
                      <th>Player Name</th>
                      <th>Position</th>
                      <th>Club</th>
                      <th style={{ width: "80px" }}>Age</th>
                      <th style={{ width: "100px" }}>Avg Score</th>
                      <th style={{ width: "90px" }}>Reports</th>
                      <th style={{ width: "90px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedList.players.map((player, index) => {
                      const scoreColor = player.avg_performance_score
                        ? getPerformanceScoreColor(player.avg_performance_score)
                        : "#6b7280";
                      const textColor = getContrastTextColor(scoreColor);

                      return (
                        <tr
                          key={player.item_id}
                          style={{
                            cursor: "pointer",
                            transition: "background-color 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f8f9fa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
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
                            {player.avg_performance_score !== null ? (
                              <Badge
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
                  <Button variant="primary" size="sm" disabled={addingPlayer}>
                    Add
                  </Button>
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
