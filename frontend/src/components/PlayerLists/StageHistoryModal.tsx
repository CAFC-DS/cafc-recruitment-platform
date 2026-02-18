import React, { useState, useEffect } from "react";
import { Modal, Button, Spinner, Badge } from "react-bootstrap";
import { StageHistoryRecord } from "../../types/Player";
import {
  getPlayerStageHistory,
  getStageChangeReasons,
  updateStageHistoryReason,
} from "../../services/playerListsService";
import { getStageBgColor, getStageTextColor } from "../../styles/playerLists.theme";
import StageChangeReasonModal from "./StageChangeReasonModal";

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
 * Allows admins/senior managers to edit the reason on any history record.
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

  // Reason lists fetched from backend
  const [stage1Reasons, setStage1Reasons] = useState<string[]>([]);
  const [archivedReasons, setArchivedReasons] = useState<string[]>([]);

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<StageHistoryRecord | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (show && listId && itemId) {
      fetchHistory();
      fetchReasons();
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

  const fetchReasons = async () => {
    try {
      const [s1, arc] = await Promise.all([
        getStageChangeReasons("stage1"),
        getStageChangeReasons("archived"),
      ]);
      setStage1Reasons(s1);
      setArchivedReasons(arc);
    } catch (err) {
      console.error("Error fetching stage reasons:", err);
    }
  };

  const handleEditClick = (record: StageHistoryRecord) => {
    setEditError(null);
    setEditingRecord(record);
  };

  const handleEditConfirm = async (reason: string, description?: string) => {
    if (!editingRecord) return;
    setEditLoading(true);
    setEditError(null);
    try {
      await updateStageHistoryReason(listId, itemId, editingRecord.id, reason, description);
      setEditingRecord(null);
      await fetchHistory();
    } catch (err: any) {
      setEditError(err.response?.data?.detail || "Failed to update reason");
    } finally {
      setEditLoading(false);
    }
  };

  const getEditReasons = (record: StageHistoryRecord): string[] => {
    if (record.newStage === "Archived") return archivedReasons;
    // Stage 2 auto-advanced records use Stage 1 reasons
    return stage1Reasons;
  };

  const getEditTargetStage = (record: StageHistoryRecord): "Stage 1" | "Archived" => {
    return record.newStage === "Archived" ? "Archived" : "Stage 1";
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
    <>
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
                    <th style={{ width: "18%" }}>Date & Time</th>
                    <th style={{ width: "15%" }}>Changed By</th>
                    <th style={{ width: "22%" }}>Stage Transition</th>
                    <th style={{ width: "15%" }}>Reason</th>
                    <th style={{ width: "22%" }}>Description</th>
                    <th style={{ width: "8%" }}></th>
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
                      <td style={{ verticalAlign: "top", textAlign: "center" }}>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          title="Edit reason"
                          onClick={() => handleEditClick(record)}
                          style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                        >
                          ✏️
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editError && (
            <div className="alert alert-danger mt-2" role="alert">
              {editError}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {editingRecord && (
        <StageChangeReasonModal
          show={!!editingRecord}
          onHide={() => setEditingRecord(null)}
          playerName={playerName}
          targetStage={getEditTargetStage(editingRecord)}
          reasons={getEditReasons(editingRecord)}
          onConfirm={handleEditConfirm}
          loading={editLoading}
          initialReason={editingRecord.reason}
          initialDescription={editingRecord.description}
          editMode
        />
      )}
    </>
  );
};

export default StageHistoryModal;
