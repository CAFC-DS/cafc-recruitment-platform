/**
 * MultiListBadges Component
 *
 * Displays all the lists a player belongs to as color-coded badges.
 *
 * Performance Optimization:
 * - If `memberships` prop is provided, uses it directly (batch mode - eliminates N+1 queries)
 * - If not provided, falls back to individual fetch via usePlayerListMemberships hook
 */

import React from "react";
import { Badge, Spinner } from "react-bootstrap";
import { usePlayerListMemberships } from "../../hooks/usePlayerListMemberships";
import { badgeStyles } from "../../styles/playerLists.theme";
import { PlayerListMembership } from "../../services/playerListsService";

interface MultiListBadgesProps {
  universalId: string;
  maxVisible?: number; // Maximum badges to show before collapsing
  showStage?: boolean; // Whether to show stage info on badges
  memberships?: PlayerListMembership[]; // Optional pre-fetched memberships (for batch mode)
  loading?: boolean; // Optional loading state (for batch mode)
}

const MultiListBadges: React.FC<MultiListBadgesProps> = ({
  universalId,
  maxVisible = 3,
  showStage = false,
  memberships: propMemberships,
  loading: propLoading,
}) => {
  // Use batch mode if loading prop is provided (indicates parent is managing data)
  // OR if memberships array is provided (even if empty)
  const useBatchMode = propLoading !== undefined || propMemberships !== undefined;
  const hookData = usePlayerListMemberships(useBatchMode ? "" : universalId);

  // Use prop values (batch mode) or hook values (individual fetch)
  const memberships = propMemberships ?? hookData.memberships;
  const loading = useBatchMode ? (propLoading ?? false) : hookData.loading;

  if (loading) {
    return (
      <div className="d-inline-flex align-items-center gap-1">
        <Spinner animation="border" size="sm" style={{ width: "14px", height: "14px" }} />
        <small className="text-muted">Loading lists...</small>
      </div>
    );
  }

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const visibleMemberships = memberships.slice(0, maxVisible);
  const hiddenCount = memberships.length - maxVisible;

  return (
    <div
      className="d-flex flex-wrap align-items-center gap-1"
      style={{ maxWidth: "100%" }}
    >
      {visibleMemberships.map((membership, index) => {
        return (
          <Badge
            key={membership.item_id}
            bg=""
            style={{
              backgroundColor: "#ffffff",
              color: "#000000",
              border: "1px solid #dee2e6",
              ...badgeStyles.default,
              fontSize: "0.65rem",
              maxWidth: "120px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${membership.list_name}${showStage ? ` - ${membership.stage}` : ""}`}
          >
            📋 {membership.list_name}
            {showStage && (
              <span style={{ marginLeft: "4px", opacity: 0.9 }}>
                • {membership.stage.replace("Stage ", "S")}
              </span>
            )}
          </Badge>
        );
      })}

      {hiddenCount > 0 && (
        <Badge
          bg=""
          style={{
            backgroundColor: "#ffffff",
            color: "#000000",
            border: "1px solid #dee2e6",
            ...badgeStyles.default,
            fontSize: "0.65rem",
            opacity: 0.7,
          }}
          title={`${hiddenCount} more list${hiddenCount > 1 ? "s" : ""}`}
        >
          +{hiddenCount}
        </Badge>
      )}
    </div>
  );
};

export default MultiListBadges;
