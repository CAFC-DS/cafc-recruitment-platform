import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Row, Col } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../../utils/colorUtils";
import MultiListBadges from "../PlayerLists/MultiListBadges";
import { PlayerListMembership } from "../../services/playerListsService";

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
  onViewHistory?: (player: PlayerInList) => void;
  isRemoving: boolean;
  hasUnsavedChanges?: boolean;
  isPendingRemoval?: boolean;
  memberships?: PlayerListMembership[];
  loadingMemberships?: boolean;
}

const PlayerKanbanCard: React.FC<PlayerKanbanCardProps> = React.memo(({
  player,
  onRemove,
  onViewHistory,
  isRemoving,
  hasUnsavedChanges = false,
  isPendingRemoval = false,
  memberships,
  loadingMemberships,
}) => {
  const navigate = useNavigate();

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    boxShadow: isDragging ? "0 8px 16px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.05)",
    userSelect: "none" as const,
  };

  const scoreColor = player.avg_performance_score
    ? getPerformanceScoreColor(player.avg_performance_score)
    : "#6b7280";
  const textColor = getContrastTextColor(scoreColor);

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
    if ((e.target as HTMLElement).closest('.remove-btn') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    navigate(getPlayerPath(player.universal_id));
  };

  const isArchived = player.stage === "Archived";

  const cardBorderStyle = {
    border: isPendingRemoval
      ? "2px solid #ef4444"
      : hasUnsavedChanges
      ? "2px solid #f59e0b"
      : isArchived
      ? "1px dashed #9ca3af"
      : "1px solid #e5e7eb",
    opacity: isPendingRemoval ? 0.6 : isArchived ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="kanban-card mb-2 shadow-sm"
        style={cardBorderStyle}
        onClick={handleCardClick}
      >
        <Card.Body className="p-2">
          {/* Row 1: Player Info and Score */}
          <Row className="mb-2 pb-2 border-bottom">
            <Col>
              <div className="fw-bold" style={{ fontSize: "0.9rem" }}>
                {player.player_name}
              </div>
              <small className="text-muted d-block">
                {player.squad_name || "Unknown Club"}
              </small>
              <small className="text-muted d-block">
                Age: {player.age || "N/A"}
              </small>
            </Col>
          </Row>

          {/* Row 2: Report Counts and Score */}
          <Row className="mb-2 pb-2 border-bottom align-items-center">
            <Col xs={8}>
              <div className="d-flex flex-column">
                <small className="text-muted">
                  Reports: {player.report_count}
                </small>
                <small className="text-muted">
                  Live Reports: {player.live_reports}
                </small>
              </div>
            </Col>
            <Col xs={4} className="text-end">
              {player.avg_performance_score !== null && (
                <>
                  <small className="text-muted fw-semibold d-block">Score</small>
                  <Badge
                    bg=""
                    style={{
                      backgroundColor: scoreColor,
                      color: textColor,
                      fontWeight: "bold",
                      fontSize: "0.8rem",
                    }}
                  >
                    {player.avg_performance_score.toFixed(1)}
                  </Badge>
                </>
              )}
            </Col>
          </Row>

          {/* Row 3: List Memberships */}
          <Row className="mb-2">
            <Col>
              <MultiListBadges
                universalId={player.universal_id}
                maxVisible={3}
                showStage={false}
                memberships={memberships}
                loading={loadingMemberships}
              />
            </Col>
          </Row>

          {/* Status Badges and Action Buttons */}
          <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
            <div className="d-flex gap-1">
              {hasUnsavedChanges && !isPendingRemoval && (
                <Badge bg="warning" text="dark" title="Unsaved stage change">
                  Unsaved
                </Badge>
              )}
              {isPendingRemoval && (
                <Badge bg="danger" title="Pending removal">
                  Removing
                </Badge>
              )}
              {isArchived && !isPendingRemoval && !hasUnsavedChanges && (
                <Badge bg="secondary" title="Archived player">
                  Archived
                </Badge>
              )}
            </div>
            <div className="d-flex gap-1">
              {onViewHistory && (
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewHistory(player);
                  }}
                  title="View stage history"
                  style={{
                    borderRadius: "50%",
                    width: "28px",
                    height: "28px",
                    padding: "0",
                    lineHeight: "1",
                    fontSize: "0.85rem",
                  }}
                >
                  📊
                </button>
              )}
              <button
                className="remove-btn btn btn-outline-danger btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(player.item_id);
                }}
                disabled={isRemoving}
                style={{
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  padding: "0",
                  lineHeight: "1",
                }}
              >
                {isRemoving ? "..." : "×"}
              </button>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
});

PlayerKanbanCard.displayName = "PlayerKanbanCard";

export default PlayerKanbanCard;
