import React, { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, Button } from "react-bootstrap";
import PlayerKanbanCard, { PlayerInList } from "./PlayerKanbanCard";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../../utils/colorUtils";

/**
 * PlayerList interface matching the backend API summary
 */
export interface PlayerList {
  id: number;
  list_name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  created_by_username: string;
  created_by_firstname: string | null;
  created_by_lastname: string | null;
  player_count: number;
  avg_performance_score: number | null;
}

/**
 * ListWithPlayers extends PlayerList with actual player data
 */
export interface ListWithPlayers extends PlayerList {
  players: PlayerInList[];
}

interface KanbanColumnProps {
  list: ListWithPlayers;
  onEditList: (list: PlayerList) => void;
  onDeleteList: (listId: number) => void;
  onAddPlayer: (listId: number) => void;
  onRemovePlayer: (itemId: number) => void;
  removingPlayerId: number | null;
  isOver?: boolean;
}

/**
 * KanbanColumn Component
 *
 * A vertical column in the Kanban board representing a player list.
 * Acts as a droppable area for draggable player cards.
 *
 * Features:
 * - Droppable area using @dnd-kit
 * - Sortable context for reordering cards within the column
 * - Column header with list metadata and actions
 * - Scrollable content area for many cards
 * - Add player button
 * - Visual feedback when dragging over
 *
 * Integration:
 * - Uses existing PlayerList and PlayerInList interfaces
 * - Matches Bootstrap design patterns
 * - Reuses color utilities for consistent styling
 *
 * Performance:
 * - Memoized card IDs for efficient SortableContext
 * - Only re-renders when props change
 */
const KanbanColumn: React.FC<KanbanColumnProps> = React.memo(({
  list,
  onEditList,
  onDeleteList,
  onAddPlayer,
  onRemovePlayer,
  removingPlayerId,
  isOver = false,
}) => {
  // Setup droppable area with @dnd-kit
  const { setNodeRef } = useDroppable({
    id: `list-${list.id}`,
    data: {
      type: "column",
      listId: list.id,
    },
  });

  // Memoize player IDs for SortableContext to prevent unnecessary re-renders
  const playerIds = useMemo(
    () => list.players.map((player) => player.item_id),
    [list.players]
  );

  // Get average score color
  const scoreColor = list.avg_performance_score
    ? getPerformanceScoreColor(list.avg_performance_score)
    : "#6b7280";
  const textColor = getContrastTextColor(scoreColor);

  return (
    <div
      style={{
        minWidth: "320px",
        maxWidth: "320px",
        backgroundColor: "#f9fafb",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 200px)",
        border: isOver ? "2px solid #3b82f6" : "1px solid #e5e7eb",
        transition: "border-color 0.2s ease",
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "white",
          borderRadius: "8px 8px 0 0",
        }}
      >
        {/* List name and count */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="flex-grow-1">
            <h6 className="fw-bold mb-1" style={{ fontSize: "0.95rem" }}>
              {list.list_name}
            </h6>
            <small className="text-muted">
              {list.player_count} {list.player_count === 1 ? "player" : "players"}
            </small>
          </div>
          {/* Average score badge */}
          {list.avg_performance_score !== null && (
            <Badge
              style={{
                backgroundColor: scoreColor,
                color: textColor,
                fontWeight: "bold",
                fontSize: "0.75rem",
                padding: "4px 8px",
                marginLeft: "8px",
              }}
            >
              {list.avg_performance_score.toFixed(1)}
            </Badge>
          )}
        </div>

        {/* Description (if exists) */}
        {list.description && (
          <p
            className="text-muted mb-2"
            style={{
              fontSize: "0.75rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {list.description}
          </p>
        )}

        {/* Actions: Edit and Delete */}
        <div className="d-flex gap-1 justify-content-between align-items-center mt-2">
          <div className="d-flex gap-1">
            <span
              role="button"
              className="p-1 text-secondary"
              onClick={() => onEditList(list)}
              style={{
                fontSize: "0.85rem",
                cursor: "pointer",
                textDecoration: "none",
              }}
              title="Edit list"
            >
              ✏️
            </span>
            <span
              role="button"
              className="p-1 text-danger"
              onClick={() => onDeleteList(list.id)}
              style={{
                fontSize: "0.85rem",
                cursor: "pointer",
                textDecoration: "none",
              }}
              title="Delete list"
            >
              🗑️
            </span>
          </div>

          {/* Add Player Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => onAddPlayer(list.id)}
            style={{
              fontSize: "0.75rem",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
          >
            + Add Player
          </Button>
        </div>
      </div>

      {/* Scrollable Cards Area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px",
        }}
      >
        <SortableContext items={playerIds} strategy={verticalListSortingStrategy}>
          {list.players.length === 0 ? (
            // Empty state
            <div
              className="text-center text-muted"
              style={{
                padding: "40px 20px",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontSize: "2rem", opacity: 0.3, marginBottom: "8px" }}>
                📋
              </div>
              <div>No players yet</div>
              <div style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                Click "Add Player" to get started
              </div>
            </div>
          ) : (
            // Player cards
            list.players.map((player) => (
              <PlayerKanbanCard
                key={player.item_id}
                player={player}
                onRemove={onRemovePlayer}
                isRemoving={removingPlayerId === player.item_id}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
});

KanbanColumn.displayName = "KanbanColumn";

export default KanbanColumn;
