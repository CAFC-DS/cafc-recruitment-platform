import React, { useState, useEffect } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";

interface PlayerNotesModalProps {
  show: boolean;
  onHide: () => void;
  playerName: string;
  universalId: string;
  currentNotes: string;
  onSave: (universalId: string, notes: string) => void;
}

const MAX_CHARS = 500;

/**
 * PlayerNotesModal Component
 *
 * Modal for adding/editing notes for a player in a list.
 * Notes are stored globally in localStorage (visible to all users).
 */
const PlayerNotesModal: React.FC<PlayerNotesModalProps> = ({
  show,
  onHide,
  playerName,
  universalId,
  currentNotes,
  onSave,
}) => {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Update notes when modal opens or currentNotes changes
  useEffect(() => {
    if (show) {
      setNotes(currentNotes);
    }
  }, [show, currentNotes]);

  const handleSave = () => {
    setSaving(true);
    // Simulate async save (localStorage is actually synchronous)
    setTimeout(() => {
      onSave(universalId, notes);
      setSaving(false);
    }, 100);
  };

  const handleClose = () => {
    if (!saving) {
      onHide();
    }
  };

  const remainingChars = MAX_CHARS - notes.length;
  const isOverLimit = remainingChars < 0;

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
      >
        <Modal.Title>
          📝 Notes for {playerName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group>
            <Form.Label>
              Add your notes about this player
              <span className="text-muted ms-2" style={{ fontSize: "0.85rem" }}>
                (visible to all users)
              </span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              placeholder="Enter notes here... (e.g., strengths, weaknesses, scouting observations, next steps)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              style={{ fontSize: "0.9rem" }}
            />
            <div className="mt-2 d-flex justify-content-between align-items-center">
              <span
                className="text-muted"
                style={{ fontSize: "0.75rem" }}
              >
                {notes.trim() === "" ? "No notes yet" : ""}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: isOverLimit ? "#dc3545" : "#6b7280",
                  fontWeight: isOverLimit ? "bold" : "normal",
                }}
              >
                {remainingChars} characters remaining
              </span>
            </div>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || isOverLimit}
        >
          {saving ? (
            <>
              <Spinner
                as="span"
                animation="border"
                size="sm"
                className="me-2"
              />
              Saving...
            </>
          ) : (
            "Save Notes"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PlayerNotesModal;
