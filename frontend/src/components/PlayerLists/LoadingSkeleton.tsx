/**
 * LoadingSkeleton Component
 *
 * Displays skeleton loading states for player cards and columns.
 * Provides better UX than simple spinners.
 */

import React from "react";
import { colors, borderRadius, spacing, cardStyles } from "../../styles/playerLists.theme";

interface LoadingSkeletonProps {
  variant?: "card" | "column" | "table-row";
  count?: number;
}

const SkeletonPulse: React.FC<{ width?: string; height?: string; style?: React.CSSProperties }> = ({
  width = "100%",
  height = "16px",
  style = {},
}) => (
  <div
    style={{
      width,
      height,
      backgroundColor: colors.gray[200],
      borderRadius: borderRadius.sm,
      animation: "pulse 1.5s ease-in-out infinite",
      ...style,
    }}
  />
);

const CardSkeleton: React.FC = () => (
  <div
    style={{
      ...cardStyles.default,
      padding: spacing.md,
      marginBottom: spacing.sm,
    }}
  >
    <div className="d-flex justify-content-between align-items-start mb-2">
      <SkeletonPulse width="60%" height="18px" />
      <SkeletonPulse width="40px" height="24px" style={{ borderRadius: "12px" }} />
    </div>
    <SkeletonPulse width="40%" height="14px" style={{ marginBottom: spacing.sm }} />
    <SkeletonPulse width="80%" height="14px" style={{ marginBottom: spacing.sm }} />
    <div className="d-flex gap-2">
      <SkeletonPulse width="60px" height="20px" style={{ borderRadius: "10px" }} />
      <SkeletonPulse width="50px" height="20px" style={{ borderRadius: "10px" }} />
    </div>
  </div>
);

const ColumnSkeleton: React.FC = () => (
  <div
    style={{
      minWidth: "280px",
      width: "300px",
      backgroundColor: colors.gray[50],
      borderRadius: borderRadius.md,
      padding: spacing.md,
    }}
  >
    <SkeletonPulse width="50%" height="24px" style={{ marginBottom: spacing.lg }} />
    <CardSkeleton />
    <CardSkeleton />
    <CardSkeleton />
  </div>
);

const TableRowSkeleton: React.FC = () => (
  <tr>
    <td><SkeletonPulse width="80%" height="16px" /></td>
    <td><SkeletonPulse width="40px" height="16px" /></td>
    <td><SkeletonPulse width="60%" height="16px" /></td>
    <td><SkeletonPulse width="50px" height="16px" /></td>
    <td><SkeletonPulse width="40px" height="24px" style={{ borderRadius: "12px" }} /></td>
    <td><SkeletonPulse width="30px" height="16px" /></td>
  </tr>
);

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = "card",
  count = 3,
}) => {
  const renderSkeleton = () => {
    switch (variant) {
      case "column":
        return (
          <div className="d-flex gap-3" style={{ overflowX: "auto" }}>
            {Array.from({ length: count }).map((_, i) => (
              <ColumnSkeleton key={i} />
            ))}
          </div>
        );

      case "table-row":
        return (
          <>
            {Array.from({ length: count }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </>
        );

      case "card":
      default:
        return (
          <>
            {Array.from({ length: count }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </>
        );
    }
  };

  return (
    <>
      {renderSkeleton()}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  );
};

export default LoadingSkeleton;
