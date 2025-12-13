import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../../utils/colorUtils";

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
  list_id?: number;
  report_count: number;
  avg_performance_score: number | null;
  live_reports: number;
  video_reports: number;
}

interface PlayerKanbanCardProps {
  player: PlayerInList;
  onRemove: (itemId: number) => void;
  isRemoving: boolean;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="kanban-card"
      onClick={handleCardClick}
    >
      {/* Card container with refined platform styling */}
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          padding: "12px",
          marginBottom: "8px",
          cursor: isDragging ? "grabbing" : "grab",
          boxShadow: isDragging
            ? "0 8px 16px rgba(0,0,0,0.15)"
            : "0 1px 3px rgba(0,0,0,0.05)",
          transition: "all 0.2s ease",
          userSelect: "none",
          transform: isDragging ? "scale(1.02)" : "scale(1)",
        }}
        onMouseEnter={(e) => {
          if (!isDragging) {
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.08)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        {/* Header: Player name and score */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="flex-grow-1">
            <div
              className="fw-bold"
              style={{
                fontSize: "0.9rem",
                marginBottom: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {player.player_name}
            </div>
            <small className="text-muted">
              {player.position || "Unknown"} • Age {player.age || "N/A"}
            </small>
          </div>
          {/* Performance score badge */}
          {player.avg_performance_score !== null && (
            <Badge
              bg=""
              style={{
                backgroundColor: scoreColor,
                color: textColor,
                fontWeight: "bold",
                fontSize: "0.75rem",
                padding: "4px 8px",
                marginLeft: "8px",
              }}
            >
              {player.avg_performance_score.toFixed(1)}
            </Badge>
          )}
        </div>

        {/* Player details */}
        <div className="mb-2" style={{ fontSize: "0.8rem" }}>
          <div className="text-muted mb-1" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🏟️ {player.squad_name || "Unknown Club"}
          </div>
          <div className="d-flex gap-2">
            <span className="text-muted">
              📊 {player.report_count} {player.report_count === 1 ? "report" : "reports"}
            </span>
            {player.live_reports > 0 && (
              <Badge bg="primary" style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
                👁️ {player.live_reports} live
              </Badge>
            )}
          </div>
        </div>

        {/* List name badge */}
        {player.list_name && (
          <div className="mb-2">
            <Badge
              bg=""
              style={{
                backgroundColor: "#3b82f6",
                color: "#ffffff",
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "10px",
                fontWeight: "600",
              }}
            >
              📋 {player.list_name}
            </Badge>
          </div>
        )}

        {/* Remove button */}
        <div className="d-flex justify-content-end mt-2 pt-2 border-top">
          <button
            className="remove-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(player.item_id);
            }}
            disabled={isRemoving}
            style={{
              backgroundColor: "transparent",
              border: "1px solid #dc2626",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              padding: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isRemoving ? "not-allowed" : "pointer",
              color: "#dc2626",
              fontSize: "1rem",
              opacity: isRemoving ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!isRemoving) {
                e.currentTarget.style.backgroundColor = "#dc2626";
                e.currentTarget.style.color = "white";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#dc2626";
            }}
          >
            {isRemoving ? "..." : "×"}
          </button>
        </div>
      </div>
    </div>
  );
});

PlayerKanbanCard.displayName = "PlayerKanbanCard";

export default PlayerKanbanCard;
