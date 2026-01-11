import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Row, Col, Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../../utils/colorUtils";
import MultiListBadges from "../PlayerLists/MultiListBadges";
import { PlayerListMembership } from "../../services/playerListsService";

/**
 * PlayerInList interface matching the backend API response
 * This is the same data structure used in PlayerListsPage
 */
export interface PlayerInList {
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
  stage: string;
  list_name?: string;
  list_id?: number | string;
  report_count: number;
  avg_performance_score: number | null;
  live_reports: number;
  video_reports: number;
}

interface PlayerKanbanCardProps {
  player: PlayerInList;
  onRemove: (itemId: number) => void;
  isRemoving: boolean;
  hasUnsavedChanges?: boolean;
  isPendingRemoval?: boolean;
  memberships?: PlayerListMembership[];
  loadingMemberships?: boolean;
}

/**
 * PlayerKanbanCard Component
 *
 * A draggable card component for displaying player information in the Kanban board.
 * Optimized for performance with React.memo to prevent unnecessary re-renders.
 *
 * Features:
 * - Drag-and-drop support using @dnd-kit/sortable
 * - Click to navigate to player profile
 * - Performance score badge with dynamic colors
 * - Live watches count display
 * - Remove button with loading state
 * - Hover effects for better UX
 *
 * Integration:
 * - Uses existing colorUtils for consistent styling
 * - Reuses PlayerInList interface from existing system
 * - Matches Bootstrap design patterns used throughout the app
 */
const PlayerKanbanCard: React.FC<PlayerKanbanCardProps> = React.memo(({
  player,
  onRemove,
  isRemoving,
  hasUnsavedChanges = false,
  isPendingRemoval = false,
  memberships,
  loadingMemberships,
}) => {
  const navigate = useNavigate();

  // Setup drag-and-drop with @dnd-kit
  // Each card is identified by its item_id for unique dragging
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: player.item_id,
    data: {
      type: "player",
      player,
    },
  });

  // CSS transform for smooth dragging animation
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Get performance score color using existing utility
  const scoreColor = player.avg_performance_score
    ? getPerformanceScoreColor(player.avg_performance_score)
    : "#6b7280";
  const textColor = getContrastTextColor(scoreColor);

  // Navigate to player profile (same logic as existing system)
  const getPlayerPath = (universalId: string) => {
    if (universalId.startsWith("internal_")) {
      const cafcId = universalId.replace("internal_", "");
      return `/player-profile/${cafcId}`;
    } else if (universalId.startsWith("external_")) {
      const playerId = universalId.replace("external_", "");
      return `/player/${playerId}`;
    }
    return "/";
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the remove button
    if ((e.target as HTMLElement).closest('.remove-btn')) {
      return;
    }
    navigate(getPlayerPath(player.universal_id));
  };

  // Determine if this card is in archived stage
  const isArchived = player.stage === "Archived";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="kanban-card"
      onClick={handleCardClick}
    >
      <Card
        className={`h-100 shadow-sm ${isArchived ? 'report-card-archived' : ''}`}
        style={{
          borderRadius: "8px",
          border: isPendingRemoval
            ? "2px solid #ef4444"
            : hasUnsavedChanges
            ? "2px solid #f59e0b"
            : isArchived
            ? "1px dashed #9ca3af"
            : "1px solid #dee2e6",
          marginBottom: "10px",
          cursor: isDragging ? "grabbing" : "grab",
          boxShadow: isDragging
            ? "0 8px 16px rgba(0,0,0,0.15)"
            : isPendingRemoval
            ? "0 2px 6px rgba(239, 68, 68, 0.15)"
            : hasUnsavedChanges
            ? "0 2px 6px rgba(245, 158, 11, 0.15)"
            : undefined,
          transition: "all 0.2s ease",
          userSelect: "none",
          transform: isDragging ? "scale(1.02)" : "scale(1)",
          opacity: isPendingRemoval ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isDragging && !isArchived) {
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.08)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging && !isArchived) {
            e.currentTarget.style.boxShadow = "";
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        <Card.Body className="p-3">
          {/* Row 1: Player Info & Badges */}
          <Row className="mb-3 pb-2 border-bottom">
            <Col xs={6}>
              <div
                className="fw-bold d-block mb-1"
                style={{
                  color: "#212529",
                  fontSize: "1rem",
                  textAlign: "left",
                }}
              >
                {player.player_name}
              </div>
              <small className="text-muted d-block">
                Team: {player.squad_name || "Unknown"}
              </small>
              <small className="text-muted d-block">
                Age: {player.age || "N/A"}
              </small>
            </Col>
            <Col xs={6} className="text-end">
              <div>
                {hasUnsavedChanges && !isPendingRemoval && (
                  <Badge
                    bg=""
                    style={{
                      backgroundColor: "#f59e0b",
                      color: "white",
                      fontSize: "0.6rem",
                      padding: "2px 6px",
                      fontWeight: "600",
                    }}
                    className="d-block mb-1"
                    title="Unsaved stage change"
                  >
                    UNSAVED
                  </Badge>
                )}
                {isPendingRemoval && (
                  <Badge
                    bg=""
                    style={{
                      backgroundColor: "#ef4444",
                      color: "white",
                      fontSize: "0.6rem",
                      padding: "2px 6px",
                      fontWeight: "600",
                    }}
                    className="d-block mb-1"
                    title="Pending removal"
                  >
                    REMOVING
                  </Badge>
                )}
                {isArchived && (
                  <span className="badge-archived d-block mb-1">ARCHIVED</span>
                )}
              </div>
            </Col>
          </Row>

          {/* Row 2: Reports & Performance Score */}
          <Row className="mb-3 pb-2 border-bottom">
            <Col xs={6}>
              <small className="text-muted d-block">
                📊 {player.report_count} {player.report_count === 1 ? "report" : "reports"}
              </small>
              {player.live_reports > 0 && (
                <small className="text-muted d-block" style={{ marginTop: "4px" }}>
                  🏟️ {player.live_reports} live
                </small>
              )}
            </Col>
            <Col xs={6} className="text-end">
              {player.avg_performance_score !== null && (
                <div>
                  <small className="text-muted d-block mb-1">Average Score</small>
                  <span
                    className={`badge ${
                      player.avg_performance_score === 9 ? 'performance-score-9' :
                      player.avg_performance_score === 10 ? 'performance-score-10' : ''
                    }`}
                    style={{
                      backgroundColor: scoreColor,
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                      ...(player.avg_performance_score !== 9 && player.avg_performance_score !== 10 ? { border: "none" } : {}),
                    }}
                  >
                    {player.avg_performance_score.toFixed(1)}
                  </span>
                </div>
              )}
            </Col>
          </Row>

          {/* Row 3: Lists & Delete Button */}
          <Row className="align-items-center">
            <Col>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <MultiListBadges
                    universalId={player.universal_id}
                    maxVisible={2}
                    showStage={false}
                    memberships={memberships}
                    loading={loadingMemberships}
                  />
                </div>
                <Button
                  size="sm"
                  className="btn-action-circle btn-action-delete"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(player.item_id);
                  }}
                  disabled={isRemoving}
                >
                  {isRemoving ? "..." : "🗑️"}
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </div>
  );
});

PlayerKanbanCard.displayName = "PlayerKanbanCard";

export default PlayerKanbanCard;
