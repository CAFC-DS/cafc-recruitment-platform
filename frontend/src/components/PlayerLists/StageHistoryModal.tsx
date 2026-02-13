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
          <div className="table-responsive">
            <table className="table table-hover" style={{ fontSize: "0.85rem" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <th style={{ width: "20%" }}>Date & Time</th>
                  <th style={{ width: "15%" }}>Changed By</th>
                  <th style={{ width: "25%" }}>Stage Transition</th>
                  <th style={{ width: "15%" }}>Reason</th>
                  <th style={{ width: "25%" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td style={{ verticalAlign: "top" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        {formatDate(record.changedAt)}
                      </div>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        {record.changedByName || `User #${record.changedBy}`}
                      </div>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      {renderStageTransition(record)}
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <span style={{ fontSize: "0.85rem" }}>{record.reason}</span>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      {record.description ? (
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#4b5563",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {record.description}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: "0.85rem" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
