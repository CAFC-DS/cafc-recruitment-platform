import React from "react";
import { Flag } from "lucide-react";
import { getFlagColor, getContrastTextColor } from "../utils/colorUtils";
import "./GradeChip.css";

interface FlagChipProps {
  /** "positive" | "neutral" | "negative" (or any getFlagColor-supported
   * value). Colors the chip's background via the existing, unmodified
   * getFlagColor -- this component only standardizes shape/sizing, matching
   * GradeChip's pill so scores and flags read as one badge family. */
  sentiment: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICON_SIZE: Record<NonNullable<FlagChipProps["size"]>, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

export const FlagChip: React.FC<FlagChipProps> = ({
  sentiment,
  size = "md",
  className = "",
}) => {
  const backgroundColor = getFlagColor(sentiment);
  const color = getContrastTextColor(backgroundColor);

  return (
    <span
      className={`grade-chip grade-chip-${size} ${className}`}
      style={{ backgroundColor, color }}
      title={`Flag: ${sentiment}`}
    >
      <Flag size={ICON_SIZE[size]} fill={color} stroke={color} />
    </span>
  );
};

export default FlagChip;
