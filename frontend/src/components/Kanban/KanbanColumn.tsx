import React, { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "react-bootstrap";
import CollapsiblePlayerBar, { PlayerInList } from "./CollapsiblePlayerBar";
import {
  getStageBgColor,
  colors,
} from "../../styles/playerLists.theme";
import { PlayerListMembership } from "../../services/playerListsService";

/**
 * PlayerList interface matching the backend API summary
 */
export interface PlayerList {
  id: number | string; // number for real lists, string for stage columns
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
  onDeleteList: (listId: number | string) => void;
  onAddPlayer: (listId: number | string) => void;
  onRemovePlayer: (itemId: number) => void;
  removingPlayerId: number | null;
  isOver?: boolean;
  pendingStageChanges?: Map<number, { fromStage: string; toStage: string; listId: number }>;
  pendingRemovals?: Map<number, number>;
  batchMemberships?: Record<string, PlayerListMembership[]>;
  loadingMemberships?: boolean;
  onOpenNotes?: (player: PlayerInList) => void;
  onToggleFavorite?: (universalId: string) => void;
  onToggleDecision?: (universalId: string) => void;
  onViewHistory?: (player: PlayerInList) => void;
  playerFavorites?: Set<string>;
  playerDecisions?: Set<string>;
  fetchArchiveInfo?: (itemId: number) => Promise<any>;
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
  pendingStageChanges,
  pendingRemovals,
  batchMemberships,
  loadingMemberships,
  onOpenNotes,
  onToggleFavorite,
  onToggleDecision,
  onViewHistory,
  playerFavorites,
  playerDecisions,
  fetchArchiveInfo,
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

  // Get average score color (not currently displayed in column header)
  // const scoreColor = list.avg_performance_score
  //   ? getPerformanceScoreColor(list.avg_performance_score)
  //   : "#6b7280";

  // Determine if this is a stage column by checking if list_name is a stage
  const isStageColumn = list.list_name.startsWith("Stage ");
  const isArchivedColumn = list.list_name === "Archived";

  // Get stage color if this is a stage column (using theme helper)
  const stageColor = (isStageColumn || isArchivedColumn) ? getStageBgColor(list.list_name) : colors.primary;

  return (
    <div
      style={{
        flex: 1,
        minWidth: "280px",
        maxWidth: "350px",
        backgroundColor: "#f9fafb",
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 180px)",
        border: isOver ? `2px solid ${stageColor}` : isArchivedColumn ? "1px dashed #9ca3af" : "1px solid #e5e7eb",
        transition: "all 0.2s ease",
        boxShadow: isOver ? `0 4px 12px ${stageColor}33` : "0 1px 3px rgba(0,0,0,0.08)",
        opacity: isArchivedColumn ? 0.7 : 1,
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: "18px 16px",
          borderBottom: "2px solid #e5e7eb",
          backgroundColor: "white",
          borderRadius: "10px 10px 0 0",
          ...((isStageColumn || isArchivedColumn) && {
            borderTop: `4px solid ${stageColor}`,
          }),
        }}
      >
        {/* List name and count */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="flex-grow-1">
            <h5 className="fw-bold mb-1" style={{
              fontSize: "1.1rem",
              letterSpacing: "-0.01em",
              ...((isStageColumn || isArchivedColumn) && { color: stageColor }),
            }}>
              {list.list_name}
            </h5>
            <small className="text-muted">
              {list.player_count} {list.player_count === 1 ? "player" : "players"}
            </small>
          </div>
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

        {/* Actions: Edit and Delete (only for list columns, not stages or archived) */}
        {!isStageColumn && !isArchivedColumn && (
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
              variant="success"
              size="sm"
              onClick={() => onAddPlayer(list.id)}
              style={{
                fontSize: "0.75rem",
                padding: "6px 12px",
                borderRadius: "20px",
                fontWeight: "600",
              }}
            >
              + Add Player
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable Cards Area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px",
          minHeight: "200px", // Ensure adequate droppable area even when empty
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
            // Player bars (collapsible)
            list.players.map((player) => (
              <CollapsiblePlayerBar
                key={player.item_id}
                player={player}
                onRemove={onRemovePlayer}
                isRemoving={removingPlayerId === player.item_id}
                hasUnsavedChanges={pendingStageChanges?.has(player.item_id) || false}
                isPendingRemoval={pendingRemovals?.has(player.item_id) || false}
                memberships={batchMemberships?.[player.universal_id]}
                loadingMemberships={loadingMemberships}
                onOpenNotes={onOpenNotes}
                onToggleFavorite={onToggleFavorite}
                onToggleDecision={onToggleDecision}
                onViewHistory={onViewHistory}
                isFavorited={playerFavorites?.has(player.universal_id) || false}
                isDecision={playerDecisions?.has(player.universal_id) || false}
                fetchArchiveInfo={fetchArchiveInfo}
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
