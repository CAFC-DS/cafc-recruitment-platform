import React, { useState, useEffect } from "react";
import { Modal, Button, Form, Alert, Spinner } from "react-bootstrap";
import { getAllPlayerLists, addPlayerToList, PlayerList } from "../services/playerListsService";

interface AddPlayerToListModalProps {
  show: boolean;
  onHide: () => void;
  playerId: number;
  playerName: string;
  universalId?: string;
}

const STAGE_OPTIONS = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Archived"];

const AddPlayerToListModal: React.FC<AddPlayerToListModalProps> = ({
  show,
  onHide,
  playerId,
  playerName,
  universalId,
}) => {
  const [lists, setLists] = useState<PlayerList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("Stage 1");
  const [loading, setLoading] = useState(false);
  const [fetchingLists, setFetchingLists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch available lists when modal opens
  useEffect(() => {
    const fetchLists = async () => {
      if (!show) return;

      setFetchingLists(true);
      setError(null);
      try {
        const fetchedLists = await getAllPlayerLists();
        setLists(fetchedLists);
      } catch (err: any) {
        console.error("Error fetching lists:", err);
        setError("Failed to load player lists. Please try again.");
      } finally {
        setFetchingLists(false);
      }
    };

    fetchLists();
  }, [show]);

  // Reset form when modal opens
  useEffect(() => {
    if (show) {
      setSelectedListId("");
      setSelectedStage("Stage 1");
      setError(null);
      setSuccess(null);
    }
  }, [show]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedListId) {
      setError("Please select a list");
      return;
    }

    setLoading(true);

    try {
      // Construct universal ID if not provided
      const playerUniversalId = universalId || `external_${playerId}`;

      await addPlayerToList(
        parseInt(selectedListId),
        playerUniversalId,
        selectedStage
      );

      setSuccess(`${playerName} added to list successfully!`);

      // Close modal after short delay
      setTimeout(() => {
        onHide();
      }, 1500);
    } catch (err: any) {
      console.error("Error adding player to list:", err);

      // Handle specific error messages
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.response?.status === 409) {
        setError("This player is already in the selected list.");
      } else if (err.response?.status === 403) {
        setError("You don't have permission to add players to lists.");
      } else {
        setError("Failed to add player to list. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Add Player to List</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <div className="mb-3">
            <strong>Player:</strong> {playerName}
          </div>

          {fetchingLists ? (
            <div className="text-center py-4">
              <Spinner animation="border" size="sm" />
              <div className="mt-2 text-muted">Loading lists...</div>
            </div>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>
                  Select List <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  disabled={loading}
                  required
                >
                  <option value="">-- Choose a list --</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.list_name}
                    </option>
                  ))}
                </Form.Select>
                {lists.length === 0 && !fetchingLists && (
                  <Form.Text className="text-muted">
                    No lists available. Create a list first.
                  </Form.Text>
                )}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Stage</Form.Label>
                <Form.Select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  disabled={loading}
                >
                  {STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={loading || fetchingLists || !selectedListId || !!success}
          >
            {loading ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
                Adding...
              </>
            ) : (
              "Add to List"
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default AddPlayerToListModal;
