import React from "react";
import { getPerformanceScoreColor, getContrastTextColor } from "../utils/colorUtils";
import "./GradeChip.css";

interface GradeChipProps {
  /** 0-10 performance score. Color comes from the existing, unmodified
   * getPerformanceScoreColor -- this component only standardizes shape/
   * typography/spacing, it never introduces new grade colors. */
  score: number;
  size?: "sm" | "md" | "lg";
  /** Render "7/10" instead of just "7". Defaults to true. */
  showDenominator?: boolean;
  className?: string;
}

export const GradeChip: React.FC<GradeChipProps> = ({
  score,
  size = "md",
  showDenominator = true,
  className = "",
}) => {
  const backgroundColor = getPerformanceScoreColor(score);
  const color = getContrastTextColor(backgroundColor);
  const isStandout = score === 9 || score === 10; // silver / gold

  return (
    <span
      className={`grade-chip grade-chip-${size} ${isStandout ? "grade-chip-standout" : ""} ${className}`}
      style={{ backgroundColor, color }}
      title={`Performance score: ${score}/10`}
    >
      {score}
      {showDenominator && <span className="grade-chip-denominator">/10</span>}
    </span>
  );
};

export default GradeChip;
