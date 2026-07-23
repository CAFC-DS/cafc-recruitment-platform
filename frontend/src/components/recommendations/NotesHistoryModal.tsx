import React, { useEffect, useState } from "react";
import { Modal, Button, Spinner } from "react-bootstrap";
import { RecommendationNoteHistory } from "../../types/recommendations";

interface NotesHistoryModalProps {
  show: boolean;
  onHide: () => void;
  playerName: string;
  fetchHistory: () => Promise<RecommendationNoteHistory[]>;
  showAuthor?: boolean;
}

/**
 * NotesHistoryModal Component
 *
 * Displays the full chronological history of shared notes written on a
 * recommendation. Read-only. Fetches on open (not embedded in the main
 * recommendation payload), modeled on StageHistoryModal's pattern.
 */
const NotesHistoryModal: React.FC<NotesHistoryModalProps> = ({
  show,
  onHide,
  playerName,
  fetchHistory,
  showAuthor = true,
}) => {
  const [history, setHistory] = useState<RecommendationNoteHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory()
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error("Error fetching notes history:", err);
          setError(err.response?.data?.detail || "Failed to load note history");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString("en-GB");
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Note History{playerName ? ` - ${playerName}` : ""}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: "500px", overflowY: "auto" }}>
        {loading && (
          <div className="text-center py-5">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
            <p className="mt-2 text-muted">Loading note history...</p>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">No notes recorded yet</p>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="d-flex flex-column" style={{ gap: "0.75rem" }}>
            {history.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>
                    {formatDate(entry.created_at)}
                  </span>
                  {showAuthor && entry.created_by_name && (
                    <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                      {entry.created_by_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                  {entry.note_content || <span className="text-muted">(empty note)</span>}
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

export default NotesHistoryModal;
