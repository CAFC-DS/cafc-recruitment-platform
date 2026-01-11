import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import KanbanColumn, { ListWithPlayers, PlayerList } from "./KanbanColumn";
import PlayerKanbanCard, { PlayerInList } from "./PlayerKanbanCard";
import { PlayerListMembership } from "../../services/playerListsService";

interface KanbanBoardProps {
  lists: ListWithPlayers[];
  onListsChange: (lists: ListWithPlayers[]) => void;
  onEditList: (list: PlayerList) => void;
  onDeleteList: (listId: number | string) => void;
  onAddPlayer: (listId: number | string) => void;
  onRemovePlayer: (itemId: number, listId: number | string) => Promise<void>;
  onMovePlayer: (
    playerId: number,
    fromListId: number | string,
    toListId: number | string
  ) => Promise<void>;
  onReorderPlayer: (
    listId: number | string,
    oldIndex: number,
    newIndex: number
  ) => Promise<void>;
  removingPlayerId: number | null;
  pendingStageChanges?: Map<number, { fromStage: string; toStage: string; listId: number }>;
  pendingRemovals?: Map<number, number>;
  batchMemberships?: Record<string, PlayerListMembership[]>;
  loadingMemberships?: boolean;
}

/**
 * KanbanBoard Component
 *
 * The main Kanban board container that orchestrates drag-and-drop functionality
 * across multiple columns (lists).
 *
 * Features:
 * - Drag players between columns (lists)
 * - Reorder players within the same column
 * - Optimistic UI updates with server sync
 * - Keyboard and pointer sensors for accessibility
 * - Visual drag overlay during dragging
 * - Horizontal scrolling for many columns
 *
 * Performance Optimizations:
 * - Memoized sensors to prevent re-creation on every render
 * - Optimistic updates: UI changes immediately, syncs with server in background
 * - Efficient collision detection with closestCorners algorithm
 *
 * Integration:
 * - Uses existing ListWithPlayers interface from backend
 * - Calls parent callbacks for server operations
 * - Preserves all existing data structures
 */
const KanbanBoard: React.FC<KanbanBoardProps> = ({
  lists,
  onListsChange,
  onEditList,
  onDeleteList,
  onAddPlayer,
  onRemovePlayer,
  onMovePlayer,
  onReorderPlayer,
  removingPlayerId,
  pendingStageChanges,
  pendingRemovals,
  batchMemberships,
  loadingMemberships,
}) => {
  // Track the active player being dragged for the DragOverlay
  const [activePlayer, setActivePlayer] = useState<PlayerInList | null>(null);
  const [activeColumn, setActiveColumn] = useState<number | string | null>(null);
  const [originalColumn, setOriginalColumn] = useState<number | string | null>(null); // Track original column before drag

  // Setup sensors for drag-and-drop
  // PointerSensor: Mouse and touch dragging
  // KeyboardSensor: Accessibility for keyboard users
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum 8px movement to start dragging (prevents accidental drags)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /**
   * Custom collision detection that prioritizes column droppables
   * This ensures empty or sparse columns are easier to drop into
   */
  const customCollisionDetection: CollisionDetection = (args) => {
    // First, try pointerWithin for column droppables (list-*)
    const pointerCollisions = pointerWithin(args);
    const columnCollisions = pointerCollisions.filter((collision) =>
      typeof collision.id === "string" && collision.id.startsWith("list-")
    );

    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // If no column collision, try rectIntersection for better area detection
    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) {
      return rectCollisions;
    }

    // Finally fall back to closestCenter
    return closestCenter(args);
  };

  /**
   * Handler for drag start
   * Captures the player being dragged for the overlay
   */
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;

    if (activeData?.type === "player") {
      setActivePlayer(activeData.player);
      // Find which column this player belongs to
      const sourceList = lists.find((list) =>
        list.players.some((p) => p.item_id === active.id)
      );
      if (sourceList) {
        setActiveColumn(sourceList.id);
        setOriginalColumn(sourceList.id); // Capture original column before any optimistic updates
      }
    }
  };

  /**
   * Handler for drag over
   * Performs optimistic UI updates as the player is dragged over different areas
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // If dragging over the same element, do nothing
    if (activeId === overId) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only handle player dragging
    if (activeData?.type !== "player") return;

    // Find source and destination lists
    const activeListId = lists.findIndex((list) =>
      list.players.some((p) => p.item_id === activeId)
    );
    const overListId = typeof overId === "string" && overId.startsWith("list-")
      ? lists.findIndex((list) => `list-${list.id}` === overId)
      : lists.findIndex((list) => list.players.some((p) => p.item_id === overId));

    if (activeListId === -1 || overListId === -1) return;
    if (activeListId === overListId) return; // Reordering within same list handled by SortableContext

    // Optimistic update: move player to new list immediately in UI
    const newLists = [...lists];
    const [movedPlayer] = newLists[activeListId].players.splice(
      newLists[activeListId].players.findIndex((p) => p.item_id === activeId),
      1
    );

    // Add to destination list
    if (overData?.type === "player") {
      // Insert at specific position
      const overIndex = newLists[overListId].players.findIndex(
        (p) => p.item_id === overId
      );
      newLists[overListId].players.splice(overIndex, 0, movedPlayer);
    } else {
      // Add to end of list
      newLists[overListId].players.push(movedPlayer);
    }

    // Update player counts
    newLists[activeListId].player_count = newLists[activeListId].players.length;
    newLists[overListId].player_count = newLists[overListId].players.length;

    onListsChange(newLists);
  };

  /**
   * Handler for drag end
   * Finalizes the drag operation and syncs with server
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    console.log("🎯 handleDragEnd called:", { activeId: active.id, overId: over?.id, originalColumn });

    setActivePlayer(null);
    setActiveColumn(null);

    if (!over) {
      console.log("⚠️ No over - drag cancelled");
      setOriginalColumn(null);
      return;
    }

    const activeId = active.id;
    const overId = over.id;

    const activeData = active.data.current;
    console.log("📦 Active data:", activeData);

    if (activeData?.type !== "player") {
      console.log("⚠️ Not a player drag");
      setOriginalColumn(null);
      return;
    }

    // Use originalColumn to find where the drag started (before optimistic updates)
    const activeListIndex = originalColumn !== null
      ? lists.findIndex((list) => list.id === originalColumn)
      : lists.findIndex((list) => list.players.some((p) => p.item_id === activeId));

    const overListIndex = typeof overId === "string" && overId.startsWith("list-")
      ? lists.findIndex((list) => `list-${list.id}` === overId)
      : lists.findIndex((list) => list.players.some((p) => p.item_id === overId));

    console.log("📍 List indices:", { activeListIndex, overListIndex, originalColumn });
    console.log("📋 Lists:", lists.map(l => ({ id: l.id, name: l.list_name, playerCount: l.players.length })));

    if (activeListIndex === -1) {
      console.log("⚠️ Active list not found");
      setOriginalColumn(null);
      return;
    }

    const activeList = lists[activeListIndex];
    const activePlayerIndex = activeList.players.findIndex(
      (p) => p.item_id === activeId
    );

    console.log("🎮 Active list:", { id: activeList.id, name: activeList.list_name });

    // Case 1: Reordering within the same list
    if (activeListIndex === overListIndex && activeId !== overId) {
      console.log("📝 Case 1: Reordering within same list");
      const overPlayerIndex = activeList.players.findIndex(
        (p) => p.item_id === overId
      );

      if (overPlayerIndex !== -1 && activePlayerIndex !== overPlayerIndex) {
        const newLists = [...lists];
        newLists[activeListIndex].players = arrayMove(
          activeList.players,
          activePlayerIndex,
          overPlayerIndex
        );

        onListsChange(newLists);

        // Sync with server
        try {
          await onReorderPlayer(
            activeList.id,
            activePlayerIndex,
            overPlayerIndex
          );
        } catch (error) {
          console.error("Failed to reorder player:", error);
          // Could revert optimistic update here if needed
        }
      }
    }
    // Case 2: Moving between different lists
    else if (overListIndex !== -1 && activeListIndex !== overListIndex) {
      console.log("🔄 Case 2: Moving between different lists");
      const fromListId = activeList.id;
      const toListId = lists[overListIndex].id;
      const playerId = activeId as number;

      console.log("📤 Calling onMovePlayer:", { playerId, fromListId, toListId });

      // Sync with server (optimistic update already done in handleDragOver)
      try {
        await onMovePlayer(playerId, fromListId, toListId);
        console.log("✅ onMovePlayer completed successfully");
      } catch (error) {
        console.error("❌ Failed to move player:", error);
        // Could revert optimistic update here if needed
      }
    } else {
      console.log("⚠️ No case matched - drag not processed", {
        overListIndex,
        activeListIndex,
        overListIndexValid: overListIndex !== -1,
        differentLists: activeListIndex !== overListIndex,
      });
    }

    // Clear original column state
    setOriginalColumn(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Horizontal scrollable container for columns */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          overflowX: "auto",
          overflowY: "hidden",
          padding: "20px 24px",
          minHeight: "calc(100vh - 180px)",
        }}
        className="kanban-board-container"
      >
        {lists.map((list) => (
          <KanbanColumn
            key={list.id}
            list={list}
            onEditList={onEditList}
            onDeleteList={onDeleteList}
            onAddPlayer={onAddPlayer}
            onRemovePlayer={(itemId) => onRemovePlayer(itemId, list.id)}
            removingPlayerId={removingPlayerId}
            isOver={activeColumn === list.id && activePlayer !== null}
            pendingStageChanges={pendingStageChanges}
            pendingRemovals={pendingRemovals}
            batchMemberships={batchMemberships}
            loadingMemberships={loadingMemberships}
          />
        ))}

        {/* Empty state when no lists */}
        {lists.length === 0 && (
          <div
            className="text-center text-muted"
            style={{
              width: "100%",
              padding: "80px 20px",
            }}
          >
            <div style={{ fontSize: "4rem", opacity: 0.2, marginBottom: "16px" }}>
              📋
            </div>
            <h5 className="mb-2">No lists yet</h5>
            <p style={{ fontSize: "0.9rem" }}>
              Create your first list to start organizing players
            </p>
          </div>
        )}
      </div>

      {/* Drag Overlay: Shows a copy of the card being dragged */}
      <DragOverlay>
        {activePlayer && (
          <div style={{ opacity: 0.95, cursor: "grabbing", transform: "rotate(2deg)" }}>
            <PlayerKanbanCard
              player={activePlayer}
              onRemove={() => {}}
              isRemoving={false}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default KanbanBoard;
