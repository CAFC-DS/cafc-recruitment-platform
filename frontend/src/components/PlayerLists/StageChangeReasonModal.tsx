import React, { useState, useEffect } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";

interface StageChangeReasonModalProps {
  show: boolean;
  onHide: () => void;
  playerName: string;
  targetStage: "Stage 1" | "Archived";
  reasons: string[];
  onConfirm: (reason: string, description?: string) => void;
  loading?: boolean;
  /** Pre-populate fields for editing an existing reason */
  initialReason?: string;
  initialDescription?: string;
  /** When true, displays "Edit Reason" title instead of "Adding / Archiving" */
  editMode?: boolean;
}

const MAX_DESCRIPTION_CHARS = 500;

const STAGE_2_AUTO_ADVANCE_REASONS = [
  "Flagged by Live Scouting",
  "Flagged by Video Scouting",
];

/**
 * StageChangeReasonModal Component
 *
 * Modal for selecting a reason when moving a player to Stage 1 or Archived.
 * Requires a reason selection and allows optional description.
 * For Live/Video Scouting reasons, the player is automatically placed in Stage 2.
 */
const StageChangeReasonModal: React.FC<StageChangeReasonModalProps> = ({
  show,
  onHide,
  playerName,
  targetStage,
  reasons,
  onConfirm,
  loading = false,
  initialReason,
  initialDescription,
  editMode = false,
}) => {
  const [selectedReason, setSelectedReason] = useState("");
  const [description, setDescription] = useState("");

  // Reset / pre-populate form when modal opens
  useEffect(() => {
    if (show) {
      setSelectedReason(initialReason || "");
      setDescription(initialDescription || "");
    }
  }, [show, initialReason, initialDescription]);

  const handleConfirm = () => {
    if (selectedReason) {
      onConfirm(selectedReason, description.trim() || undefined);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onHide();
    }
  };

  const remainingChars = MAX_DESCRIPTION_CHARS - description.length;
  const isOverLimit = remainingChars < 0;
  const canConfirm = selectedReason && !isOverLimit && !loading;

  const title = editMode
    ? `Edit Reason — ${playerName}`
    : targetStage === "Stage 1"
    ? `Adding ${playerName}`
    : `Archiving ${playerName}`;

  const effectiveStage =
    targetStage === "Stage 1" && selectedReason && STAGE_2_AUTO_ADVANCE_REASONS.includes(selectedReason)
      ? "Stage 2"
      : targetStage;

  const stagePlacementNote =
    !editMode && targetStage === "Stage 1" && selectedReason
      ? `This will place the player in ${effectiveStage}.`
      : null;

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
      >
        <Modal.Title>
          {editMode ? "✏️" : targetStage === "Stage 1" ? "➕" : "📦"} {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>
              Reason <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              disabled={loading}
              required
            >
              <option value="">Select a reason...</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </Form.Select>
            {stagePlacementNote && (
              <Form.Text
                style={{
                  color: effectiveStage === "Stage 2" ? "#f59e0b" : "#6b7280",
                  fontWeight: 500,
                }}
              >
                {stagePlacementNote}
              </Form.Text>
            )}
            {!stagePlacementNote && (
              <Form.Text className="text-muted">
                Please select why this player is {targetStage === "Stage 1" ? "being added" : "being archived"}.
              </Form.Text>
            )}
          </Form.Group>

          <Form.Group>
            <Form.Label>
              Additional Notes <span className="text-muted">(Optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Add any additional context or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              style={{ fontSize: "0.9rem" }}
            />
            <div className="mt-2 d-flex justify-content-end">
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
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!canConfirm}
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
              Saving...
            </>
          ) : (
            "Confirm"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default StageChangeReasonModal;
