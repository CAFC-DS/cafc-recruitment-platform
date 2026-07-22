/**
 * EmptyState Component
 *
 * Displays a friendly empty state message with optional action button.
 */

import React from "react";
import { Button } from "react-bootstrap";
import { ClipboardList } from "lucide-react";
import { colors, spacing } from "../../styles/playerLists.theme";

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  actionLabel,
  onAction,
  icon = <ClipboardList size={56} />,
}) => {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center"
      style={{
        padding: spacing.xxl,
        textAlign: "center",
        minHeight: "300px",
      }}
    >
      <div
        style={{
          marginBottom: spacing.lg,
          opacity: 0.5,
        }}
      >
        {icon}
      </div>

      <h4
        style={{
          color: colors.gray[700],
          marginBottom: spacing.sm,
          fontWeight: "600",
        }}
      >
        {title}
      </h4>

      <p
        style={{
          color: colors.gray[500],
          marginBottom: spacing.xl,
          maxWidth: "400px",
        }}
      >
        {message}
      </p>

      {actionLabel && onAction && (
        <Button
          variant="dark"
          onClick={onAction}
          style={{
            borderRadius: "20px",
            fontWeight: "600",
            padding: "8px 24px",
          }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
