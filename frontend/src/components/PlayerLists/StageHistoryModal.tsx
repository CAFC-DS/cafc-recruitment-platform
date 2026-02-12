import React, { useState, useEffect } from "react";
import { Modal, Button, Spinner, Badge } from "react-bootstrap";
import { StageHistoryRecord } from "../../types/Player";
import { getPlayerStageHistory } from "../../services/playerListsService";
import { getStageBgColor, getStageTextColor } from "../../styles/playerLists.theme";

interface StageHistoryModalProps {
  show: boolean;
  onHide: () => void;
  listId: number;
  itemId: number;
  playerName: string;
}

/**
 * StageHistoryModal Component
 *
 * Displays a timeline of stage changes for a player in a list.
 * Shows date, user, stage transition, reason, and description for each change.
 */
const StageHistoryModal: React.FC<StageHistoryModalProps> = ({
  show,
  onHide,
  listId,
  itemId,
  playerName,
}) => {
  const [history, setHistory] = useState<StageHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (show && listId && itemId) {
      fetchHistory();
    }
  }, [show, listId, itemId]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPlayerStageHistory(listId, itemId);
      setHistory(data);
    } catch (err: any) {
      console.error("Error fetching stage history:", err);
      setError(err.response?.data?.detail || "Failed to load stage history");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderStageTransition = (record: StageHistoryRecord) => {
    if (!record.oldStage) {
      // Initial addition
      return (
        <div className="d-flex align-items-center gap-2">
          <Badge
            style={{
              backgroundColor: getStageBgColor(record.newStage),
              color: getStageTextColor(record.newStage),
              fontSize: "0.85rem",
            }}
          >
            → {record.newStage}
          </Badge>
        </div>
      );
    }

    // Stage change
    return (
      <div className="d-flex align-items-center gap-2">
        <Badge
          style={{
            backgroundColor: getStageBgColor(record.oldStage),
            color: getStageTextColor(record.oldStage),
            fontSize: "0.85rem",
          }}
        >
          {record.oldStage}
        </Badge>
        <span style={{ fontSize: "0.9rem", color: "#6b7280" }}>→</span>
        <Badge
          style={{
            backgroundColor: getStageBgColor(record.newStage),
            color: getStageTextColor(record.newStage),
            fontSize: "0.85rem",
          }}
        >
          {record.newStage}
        </Badge>
      </div>
    );
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ backgroundColor: "#000000", color: "white" }}
      >
        <Modal.Title>
          📊 Stage History - {playerName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: "500px", overflowY: "auto" }}>
        {loading && (
          <div className="text-center py-5">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
            <p className="mt-2 text-muted">Loading stage history...</p>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">No stage changes recorded</p>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="timeline">
            {history.map((record, index) => (
              <div
                key={record.id}
                className="timeline-item mb-4 pb-3"
                style={{
                  borderBottom: index < history.length - 1 ? "1px solid #e5e7eb" : "none",
                }}
              >
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <strong style={{ fontSize: "0.9rem" }}>
                      {formatDate(record.changedAt)}
                    </strong>
                    <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                      by {record.changedByName || `User #${record.changedBy}`}
                    </div>
                  </div>
                  {renderStageTransition(record)}
                </div>

                <div className="mt-2">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span
                      className="badge bg-secondary"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Reason
                    </span>
                    <span style={{ fontSize: "0.85rem" }}>{record.reason}</span>
                  </div>

                  {record.description && (
                    <div
                      className="mt-2 p-2"
                      style={{
                        backgroundColor: "#f9fafb",
                        borderLeft: "3px solid #d1d5db",
                        fontSize: "0.85rem",
                        color: "#4b5563",
                      }}
                    >
                      {record.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default StageHistoryModal;
