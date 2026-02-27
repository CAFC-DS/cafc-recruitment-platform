import React, { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Collapse, OverlayTrigger, Popover, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  getPerformanceScoreColor,
  getContrastTextColor,
} from "../../utils/colorUtils";
import MultiListBadges from "../PlayerLists/MultiListBadges";
import { PlayerListMembership } from "../../services/playerListsService";
import { getPlayerNotes } from "../../utils/playerListPreferences";

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

interface CollapsiblePlayerBarProps {
  player: PlayerInList;
  onRemove: (itemId: number) => void;
  isRemoving: boolean;
  hasUnsavedChanges?: boolean;
  isPendingRemoval?: boolean;
  memberships?: PlayerListMembership[];
  loadingMemberships?: boolean;
  onOpenNotes?: (player: PlayerInList) => void;
  onToggleFavorite?: (universalId: string) => void;
  onToggleDecision?: (universalId: string) => void;
  onViewHistory?: (player: PlayerInList) => void;
  isFavorited?: boolean;
  isDecision?: boolean;
  fetchArchiveInfo?: (itemId: number) => Promise<any>;
}

// Archive info content component
const ArchiveInfoContent: React.FC<{
  itemId: number;
  fetchArchiveInfo: (itemId: number) => Promise<any>;
}> = ({ itemId, fetchArchiveInfo }) => {
  const [archiveData, setArchiveData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchArchiveInfo(itemId);
      setArchiveData(data);
      setLoading(false);
    };
    loadData();
  }, [itemId, fetchArchiveInfo]);

  if (loading) return <Spinner animation="border" size="sm" />;
  if (!archiveData) return <div>No archive information available</div>;

  return (
    <div style={{ fontSize: "0.85rem" }}>
      <div>
        <strong>Reason:</strong> {archiveData.reason}
      </div>
      <div>
        <strong>Date:</strong>{" "}
        {archiveData.date
          ? new Date(archiveData.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Europe/London",
            })
          : "N/A"}
      </div>
      <div>
        <strong>By:</strong> {archiveData.changedBy}
      </div>
      {archiveData.previousStage && (
        <div>
          <strong>Previous:</strong> {archiveData.previousStage}
        </div>
      )}
    </div>
  );
};

const CollapsiblePlayerBar: React.FC<CollapsiblePlayerBarProps> = React.memo(({
  player,
  onRemove,
  isRemoving,
  hasUnsavedChanges = false,
  isPendingRemoval = false,
  memberships,
  loadingMemberships,
  onOpenNotes,
  onToggleFavorite,
  onToggleDecision,
  onViewHistory,
  isFavorited = false,
  isDecision = false,
  fetchArchiveInfo,
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

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

  const handleBarClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking action buttons or links
    if ((e.target as HTMLElement).closest('.action-btn') || (e.target as HTMLElement).closest('.player-link')) {
      return;
    }
    setIsExpanded(!isExpanded);
  };

  const isArchived = player.stage === "Archived";

  const barBorderStyle = {
    border: isPendingRemoval
      ? "2px solid #ef4444"
      : hasUnsavedChanges
      ? "2px solid #f59e0b"
      : isArchived
      ? "1px dashed #9ca3af"
      : "1px solid #e5e7eb",
    opacity: isPendingRemoval ? 0.6 : isArchived ? 0.85 : 1,
    backgroundColor: isPendingRemoval
      ? "rgba(239, 68, 68, 0.05)"
      : hasUnsavedChanges
      ? "rgba(245, 158, 11, 0.05)"
      : isArchived
      ? "#f9fafb"
      : "#ffffff",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2">
      <div
        style={{
          ...barBorderStyle,
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        {/* Collapsed Bar */}
        <div
          onClick={handleBarClick}
          style={{
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minHeight: "44px",
            cursor: "pointer",
          }}
        >
          {/* Expand Icon */}
          <div style={{ width: "16px", flexShrink: 0 }}>
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              {isExpanded ? "▼" : "▶"}
            </span>
          </div>

          {/* Player Name */}
          <div
            className="player-link"
            onClick={(e) => {
              e.stopPropagation();
              navigate(getPlayerPath(player.universal_id));
            }}
            style={{
              fontWeight: "600",
              fontSize: "0.85rem",
              flex: 1,
              color: "#111827",
              textDecoration: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = "underline";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = "none";
            }}
          >
            {player.player_name}
            {getPlayerNotes(player.universal_id) && (
              <span
                style={{
                  marginLeft: "6px",
                  fontSize: "0.75rem",
                  opacity: 0.7,
                }}
                title="Has notes"
              >
                📝
              </span>
            )}
          </div>

          {/* Age */}
          <div
            style={{
              fontSize: "0.75rem",
              color: "#6b7280",
              flexShrink: 0,
            }}
          >
            {player.age || "N/A"}
          </div>

          {/* Score Badge */}
          {player.avg_performance_score !== null && (
            <Badge
              bg=""
              style={{
                backgroundColor: scoreColor,
                color: textColor,
                fontWeight: "bold",
                fontSize: "0.7rem",
                padding: "3px 8px",
                flexShrink: 0,
              }}
            >
              {player.avg_performance_score.toFixed(1)}
            </Badge>
          )}

          {/* Status Indicators */}
          {hasUnsavedChanges && !isPendingRemoval && (
            <Badge
              bg=""
              style={{
                backgroundColor: "#f59e0b",
                color: "white",
                fontSize: "0.6rem",
                padding: "2px 6px",
                flexShrink: 0,
              }}
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
                flexShrink: 0,
              }}
              title="Pending removal"
            >
              REMOVING
            </Badge>
          )}
          {isArchived && !isPendingRemoval && !hasUnsavedChanges && (
            <>
              <Badge
                bg=""
                style={{
                  backgroundColor: "#9ca3af",
                  color: "white",
                  fontSize: "0.6rem",
                  padding: "2px 6px",
                  flexShrink: 0,
                }}
                title="Archived player"
              >
                ARCHIVED
              </Badge>
              {fetchArchiveInfo && (
                <OverlayTrigger
                  trigger={["hover", "focus"]}
                  placement="top"
                  overlay={
                    <Popover id={`archive-popover-bar-${player.item_id}`} style={{ maxWidth: "300px" }}>
                      <Popover.Body>
                        <ArchiveInfoContent
                          itemId={player.item_id}
                          fetchArchiveInfo={fetchArchiveInfo}
                        />
                      </Popover.Body>
                    </Popover>
                  }
                >
                  <span
                    style={{
                      marginLeft: "4px",
                      cursor: "pointer",
                      fontSize: "0.6rem",
                      color: "#999",
                      flexShrink: 0,
                    }}
                  >
                    ⓘ
                  </span>
                </OverlayTrigger>
              )}
            </>
          )}
        </div>

        {/* Expanded Details */}
        <Collapse in={isExpanded}>
          <div style={{ borderTop: "1px solid #e5e7eb" }}>
            <div style={{ padding: "12px" }}>
              {/* Club and Position */}
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "4px" }}>
                  <strong>Club:</strong> {player.squad_name || "Unknown Club"}
                </div>
                {player.position && (
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                    <strong>Position:</strong> {player.position}
                  </div>
                )}
              </div>

              {/* Reports */}
              <div
                style={{
                  marginBottom: "12px",
                  display: "flex",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  <strong>Total Reports:</strong> {player.report_count}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  <strong>Live Reports:</strong> {player.live_reports}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  <strong>Video Reports:</strong> {player.video_reports}
                </div>
              </div>

              {/* List Memberships */}
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "6px", fontWeight: "600" }}>
                  Lists:
                </div>
                <MultiListBadges
                  universalId={player.universal_id}
                  maxVisible={5}
                  showStage={false}
                  memberships={memberships}
                  loading={loadingMemberships}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
                <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                  {/* Notes Button */}
                  {onOpenNotes && (
                    <button
                      className="action-btn btn btn-sm btn-outline-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenNotes(player);
                      }}
                      style={{
                        fontSize: "1rem",
                        padding: "4px 8px",
                        minWidth: "36px",
                      }}
                      title="Add/Edit Notes"
                    >
                      📝
                    </button>
                  )}

                  {/* Favorite Button */}
                  {onToggleFavorite && (
                    <button
                      className="action-btn btn btn-sm btn-outline-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(player.universal_id);
                      }}
                      style={{
                        fontSize: "1rem",
                        padding: "4px 8px",
                        minWidth: "36px",
                        color: isFavorited ? "#FFD700" : undefined,
                        borderColor: isFavorited ? "#FFD700" : undefined,
                      }}
                      title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    >
                      {isFavorited ? "⭐" : "☆"}
                    </button>
                  )}

                  {/* Decision Button */}
                  {onToggleDecision && (
                    <button
                      className="action-btn btn btn-sm btn-outline-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleDecision(player.universal_id);
                      }}
                      style={{
                        fontSize: "1rem",
                        padding: "4px 8px",
                        minWidth: "36px",
                        color: isDecision ? "#111827" : undefined,
                        borderColor: isDecision ? "#111827" : undefined,
                      }}
                      title={isDecision ? "Remove decision" : "Mark as decision"}
                    >
                      {isDecision ? "⬢" : "⬡"}
                    </button>
                  )}

                  {/* History Button */}
                  {onViewHistory && (
                    <button
                      className="action-btn btn btn-sm btn-outline-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewHistory(player);
                      }}
                      style={{
                        fontSize: "1rem",
                        padding: "4px 8px",
                        minWidth: "36px",
                      }}
                      title="View stage history"
                    >
                      📊
                    </button>
                  )}

                  {/* Remove Button */}
                  <button
                    className="action-btn btn btn-sm btn-outline-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(player.item_id);
                    }}
                    disabled={isRemoving}
                    style={{
                      fontSize: "1rem",
                      padding: "4px 8px",
                      minWidth: "36px",
                    }}
                    title="Remove from list"
                  >
                    {isRemoving ? "..." : "🗑️"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  );
});

CollapsiblePlayerBar.displayName = "CollapsiblePlayerBar";

export default CollapsiblePlayerBar;
