import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Badge,
  Alert,
  Spinner,
  Modal,
  ButtonGroup,
} from "react-bootstrap";
import axiosInstance from "../axiosInstance";
import axios from "axios";

interface Player {
  universal_id: string;
  cafc_player_id: number | null;
  player_id: number | null;
  name: string;
  firstname: string;
  lastname: string;
  data_source: string;
}

interface Match {
  universal_id: string;
  cafc_match_id: number | null;
  match_id: number | null;
  home: string;
  away: string;
  date: string;
  data_source: string;
}

interface PlayerClash {
  player1: Player;
  player2: Player;
  squad1: string;
  squad2: string;
  similarity: number;
  clash_type: "player";
}

interface FixtureClash {
  match1: Match;
  match2: Match;
  clash_type: "fixture";
}

const DataClashesTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playerClashes, setPlayerClashes] = useState<PlayerClash[]>([]);
  const [fixtureClashes, setFixtureClashes] = useState<FixtureClash[]>([]);

  // Modal states
  const [showMergePlayerModal, setShowMergePlayerModal] = useState(false);
  const [showMergeFixtureModal, setShowMergeFixtureModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedClash, setSelectedClash] = useState<
    PlayerClash | FixtureClash | null
  >(null);
  const [actionLoading, setActionLoading] = useState(false);

  // For merge operations
  const [keepId, setKeepId] = useState<string>("");
  const [removeId, setRemoveId] = useState<string>("");

  useEffect(() => {
    fetchClashes();
  }, []);

  const fetchClashes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axiosInstance.get("/admin/detect-clashes");
      setPlayerClashes(response.data.player_clashes);
      setFixtureClashes(response.data.fixture_clashes);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to fetch clashes");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMergePlayer = async (clash: PlayerClash, keepPlayer: 1 | 2) => {
    const keep = keepPlayer === 1 ? clash.player1 : clash.player2;
    const remove = keepPlayer === 1 ? clash.player2 : clash.player1;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await axiosInstance.post(
        `/admin/merge-players?keep_cafc_id=${keep.cafc_player_id}&remove_player_id=${remove.player_id || remove.cafc_player_id}`
      );
      setSuccess(`Successfully merged players: kept "${keep.name}"`);
      setShowMergePlayerModal(false);
      fetchClashes(); // Refresh
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to merge players");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergeFixture = async (
    clash: FixtureClash,
    keepMatch: 1 | 2
  ) => {
    const keep = keepMatch === 1 ? clash.match1 : clash.match2;
    const remove = keepMatch === 1 ? clash.match2 : clash.match1;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await axiosInstance.post(
        `/admin/merge-duplicate-match?keep_match_universal_id=${keep.universal_id}&remove_match_universal_id=${remove.universal_id}`
      );
      setSuccess(
        `Successfully merged fixtures: ${keep.home} vs ${keep.away}`
      );
      setShowMergeFixtureModal(false);
      fetchClashes(); // Refresh
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to merge fixtures");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (
    entityType: "player" | "match",
    universalId: string
  ) => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await axiosInstance.post(
        `/admin/delete-duplicate?entity_type=${entityType}&universal_id=${universalId}`
      );
      setSuccess(`Successfully deleted ${entityType}`);
      setShowDeleteModal(false);
      fetchClashes(); // Refresh
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(
          err.response.data.detail || `Failed to delete ${entityType}`
        );
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const getSimilarityBadgeVariant = (similarity: number) => {
    if (similarity >= 90) return "danger";
    if (similarity >= 80) return "warning";
    return "info";
  };

  if (loading) {
    return (
      <Card>
        <Card.Body className="text-center">
          <Spinner animation="border" />
          <p className="mt-2">Detecting clashes...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Summary Card */}
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5>Clash Detection Summary</h5>
              <p className="mb-0 text-muted">
                {playerClashes.length + fixtureClashes.length} potential
                clashes detected
              </p>
            </div>
            <Button variant="outline-primary" onClick={fetchClashes}>
              🔄 Refresh
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Player Clashes */}
      <Card className="mb-3">
        <Card.Header>
          <h5>👤 Player Clashes ({playerClashes.length})</h5>
          <small className="text-muted">
            Similar player names across all clubs (70%+ similarity)
          </small>
        </Card.Header>
        <Card.Body>
          {playerClashes.length === 0 ? (
            <p className="text-muted mb-0">
              ✅ No player clashes detected
            </p>
          ) : (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Player 1</th>
                  <th>Club 1</th>
                  <th>Player 2</th>
                  <th>Club 2</th>
                  <th>Similarity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {playerClashes.map((clash, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>{clash.player1.name}</strong>
                      <br />
                      <small className="text-muted">
                        {clash.player1.data_source === "internal"
                          ? `CAFC ID: ${clash.player1.cafc_player_id}`
                          : `External ID: ${clash.player1.player_id}`}
                      </small>
                    </td>
                    <td>{clash.squad1}</td>
                    <td>
                      <strong>{clash.player2.name}</strong>
                      <br />
                      <small className="text-muted">
                        {clash.player2.data_source === "internal"
                          ? `CAFC ID: ${clash.player2.cafc_player_id}`
                          : `External ID: ${clash.player2.player_id}`}
                      </small>
                    </td>
                    <td>{clash.squad2}</td>
                    <td>
                      <Badge
                        bg={getSimilarityBadgeVariant(clash.similarity)}
                      >
                        {clash.similarity}%
                      </Badge>
                    </td>
                    <td>
                      <ButtonGroup size="sm">
                        <Button
                          variant="primary"
                          onClick={() => {
                            setSelectedClash(clash);
                            setShowMergePlayerModal(true);
                          }}
                        >
                          Merge
                        </Button>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Fixture Clashes */}
      <Card className="mb-3">
        <Card.Header>
          <h5>⚽ Fixture Clashes ({fixtureClashes.length})</h5>
          <small className="text-muted">
            Same teams on the same date with different IDs
          </small>
        </Card.Header>
        <Card.Body>
          {fixtureClashes.length === 0 ? (
            <p className="text-muted mb-0">
              ✅ No fixture clashes detected
            </p>
          ) : (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Date</th>
                  <th>Match 1 ID</th>
                  <th>Match 2 ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fixtureClashes.map((clash, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>
                        {clash.match1.home} vs {clash.match1.away}
                      </strong>
                    </td>
                    <td>{clash.match1.date}</td>
                    <td>
                      <small className="text-muted">
                        {clash.match1.data_source === "internal"
                          ? `CAFC: ${clash.match1.cafc_match_id}`
                          : `Ext: ${clash.match1.match_id}`}
                      </small>
                    </td>
                    <td>
                      <small className="text-muted">
                        {clash.match2.data_source === "internal"
                          ? `CAFC: ${clash.match2.cafc_match_id}`
                          : `Ext: ${clash.match2.match_id}`}
                      </small>
                    </td>
                    <td>
                      <ButtonGroup size="sm">
                        <Button
                          variant="primary"
                          onClick={() => {
                            setSelectedClash(clash);
                            setShowMergeFixtureModal(true);
                          }}
                        >
                          Merge
                        </Button>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Merge Player Modal */}
      <Modal
        show={showMergePlayerModal}
        onHide={() => setShowMergePlayerModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Merge Duplicate Players</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedClash && "player1" in selectedClash && (
            <>
              <Alert variant="info">
                Choose which player record to keep. All reports from the other
                player will be reassigned to the kept player.
              </Alert>
              <div className="d-flex justify-content-around">
                <div>
                  <h6>Player 1</h6>
                  <p>
                    <strong>{selectedClash.player1.name}</strong>
                    <br />
                    <small>
                      {selectedClash.player1.data_source === "internal"
                        ? `CAFC ID: ${selectedClash.player1.cafc_player_id}`
                        : `External ID: ${selectedClash.player1.player_id}`}
                    </small>
                  </p>
                  <Button
                    variant="success"
                    onClick={() => handleMergePlayer(selectedClash, 1)}
                    disabled={actionLoading}
                  >
                    Keep This
                  </Button>
                </div>
                <div className="text-center align-self-center">
                  <h3>→</h3>
                </div>
                <div>
                  <h6>Player 2</h6>
                  <p>
                    <strong>{selectedClash.player2.name}</strong>
                    <br />
                    <small>
                      {selectedClash.player2.data_source === "internal"
                        ? `CAFC ID: ${selectedClash.player2.cafc_player_id}`
                        : `External ID: ${selectedClash.player2.player_id}`}
                    </small>
                  </p>
                  <Button
                    variant="success"
                    onClick={() => handleMergePlayer(selectedClash, 2)}
                    disabled={actionLoading}
                  >
                    Keep This
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowMergePlayerModal(false)}
          >
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Merge Fixture Modal */}
      <Modal
        show={showMergeFixtureModal}
        onHide={() => setShowMergeFixtureModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Merge Duplicate Fixtures</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedClash && "match1" in selectedClash && (
            <>
              <Alert variant="info">
                Choose which fixture record to keep. All reports from the other
                fixture will be reassigned to the kept fixture.
              </Alert>
              <div className="d-flex justify-content-around">
                <div>
                  <h6>Match 1</h6>
                  <p>
                    <strong>
                      {selectedClash.match1.home} vs{" "}
                      {selectedClash.match1.away}
                    </strong>
                    <br />
                    <small>{selectedClash.match1.date}</small>
                    <br />
                    <small>
                      {selectedClash.match1.data_source === "internal"
                        ? `CAFC ID: ${selectedClash.match1.cafc_match_id}`
                        : `External ID: ${selectedClash.match1.match_id}`}
                    </small>
                  </p>
                  <Button
                    variant="success"
                    onClick={() => handleMergeFixture(selectedClash, 1)}
                    disabled={actionLoading}
                  >
                    Keep This
                  </Button>
                </div>
                <div className="text-center align-self-center">
                  <h3>→</h3>
                </div>
                <div>
                  <h6>Match 2</h6>
                  <p>
                    <strong>
                      {selectedClash.match2.home} vs{" "}
                      {selectedClash.match2.away}
                    </strong>
                    <br />
                    <small>{selectedClash.match2.date}</small>
                    <br />
                    <small>
                      {selectedClash.match2.data_source === "internal"
                        ? `CAFC ID: ${selectedClash.match2.cafc_match_id}`
                        : `External ID: ${selectedClash.match2.match_id}`}
                    </small>
                  </p>
                  <Button
                    variant="success"
                    onClick={() => handleMergeFixture(selectedClash, 2)}
                    disabled={actionLoading}
                  >
                    Keep This
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowMergeFixtureModal(false)}
          >
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default DataClashesTab;
