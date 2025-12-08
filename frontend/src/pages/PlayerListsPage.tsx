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
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";

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

  // Add Player Modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<
    PlayerSearchResult[]
  >([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
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
      await axiosInstance.post(`/player-lists/${selectedList.id}/players`, {
        player_id: player.player_id,
        cafc_player_id: player.cafc_player_id,
      });
      await fetchListDetail(selectedList.id);
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
    }
  };

  // Remove player from list
  const handleRemovePlayer = async (itemId: number) => {
    if (!selectedList) return;

    if (!window.confirm("Remove this player from the list?")) {
      return;
    }

    try {
      await axiosInstance.delete(
        `/player-lists/${selectedList.id}/players/${itemId}`
      );
      await fetchListDetail(selectedList.id);
    } catch (err: any) {
      console.error("Error removing player:", err);
      setError("Failed to remove player");
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
        <Col md={3} className="border-end">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>Player Lists</h4>
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              + New List
            </Button>
          </div>

          <ListGroup>
            {lists.length === 0 ? (
              <ListGroup.Item>
                <em>No lists yet. Create one!</em>
              </ListGroup.Item>
            ) : (
              lists.map((list) => (
                <ListGroup.Item
                  key={list.id}
                  action
                  active={selectedList?.id === list.id}
                  onClick={() => handleSelectList(list)}
                  className="d-flex justify-content-between align-items-start"
                >
                  <div className="flex-grow-1">
                    <div className="fw-bold">{list.list_name}</div>
                    <small className="text-muted">
                      {list.player_count} player
                      {list.player_count !== 1 ? "s" : ""}
                    </small>
                  </div>
                  <div className="d-flex gap-1">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(list);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </ListGroup.Item>
              ))
            )}
          </ListGroup>
        </Col>

        {/* Right Content - List Detail */}
        <Col md={9}>
          {!selectedList ? (
            <div className="text-center text-muted mt-5">
              <h5>Select a list to view details</h5>
              <p>or create a new list to get started</p>
            </div>
          ) : loadingDetail ? (
            <div className="text-center mt-5">
              <Spinner animation="border" />
            </div>
          ) : (
            <>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                  <h2>{selectedList.list_name}</h2>
                  {selectedList.description && (
                    <p className="text-muted">{selectedList.description}</p>
                  )}
                </div>
                <Button
                  variant="success"
                  onClick={() => setShowAddPlayerModal(true)}
                >
                  + Add Player
                </Button>
              </div>

              {selectedList.players.length === 0 ? (
                <Alert variant="info">
                  No players in this list yet. Click "Add Player" to get
                  started.
                </Alert>
              ) : (
                <Table striped bordered hover responsive>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player Name</th>
                      <th>Position</th>
                      <th>Club</th>
                      <th>Age</th>
                      <th>Avg Score</th>
                      <th>Reports</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedList.players.map((player, index) => (
                      <tr key={player.item_id}>
                        <td>{index + 1}</td>
                        <td>
                          <a
                            href={getPlayerPath(player.universal_id)}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(getPlayerPath(player.universal_id));
                            }}
                            style={{
                              cursor: "pointer",
                              textDecoration: "none",
                              color: "#0d6efd",
                            }}
                          >
                            {player.player_name}
                          </a>
                        </td>
                        <td>{player.position || "-"}</td>
                        <td>{player.squad_name || "-"}</td>
                        <td>{player.age !== null ? player.age : "-"}</td>
                        <td>
                          {player.avg_performance_score !== null ? (
                            <Badge
                              bg={
                                player.avg_performance_score >= 7
                                  ? "success"
                                  : player.avg_performance_score >= 5
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {player.avg_performance_score.toFixed(1)}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{player.report_count}</td>
                        <td>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemovePlayer(player.item_id)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
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
          <Button variant="secondary" onClick={() => setShowListModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveList}
            disabled={!listName.trim()}
          >
            {editingList ? "Update" : "Create"}
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
            <div className="text-center">
              <Spinner animation="border" size="sm" />
            </div>
          ) : playerSearchResults.length > 0 ? (
            <ListGroup>
              {playerSearchResults.map((player) => (
                <ListGroup.Item
                  key={player.universal_id}
                  action
                  onClick={() => handleAddPlayer(player)}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <strong>{player.player_name}</strong>
                    <div className="text-muted small">
                      {player.position && `${player.position} • `}
                      {player.squad_name || "Unknown Club"}
                      {player.age && ` • Age ${player.age}`}
                    </div>
                  </div>
                  <Button variant="primary" size="sm">
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
