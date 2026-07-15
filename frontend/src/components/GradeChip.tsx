import React from "react";
import { getPerformanceScoreColor, getContrastTextColor } from "../utils/colorUtils";
import "./GradeChip.css";

interface GradeChipProps {
  /** 0-10 performance score. Color comes from the existing, unmodified
   * getPerformanceScoreColor -- this component only standardizes shape/
   * typography/spacing, it never introduces new grade colors. */
  score: number;
  size?: "sm" | "md" | "lg";
  /** A report carries either a performance score or a potential score,
   * never both -- matches existing convention (colorUtils.ts consumers):
   * potential scores are marked with a trailing "*" and a tooltip, plain
   * scores get neither. */
  isPotential?: boolean;
  className?: string;
}

export const GradeChip: React.FC<GradeChipProps> = ({
  score,
  size = "md",
  isPotential = false,
  className = "",
}) => {
  const backgroundColor = getPerformanceScoreColor(score);
  const color = getContrastTextColor(backgroundColor);
  const isStandout = score === 9 || score === 10; // silver / gold

  return (
    <span
      className={`grade-chip grade-chip-${size} ${isStandout ? "grade-chip-standout" : ""} ${className}`}
      style={{ backgroundColor, color }}
      title={isPotential ? "Potential Score" : undefined}
    >
      {score}
      {isPotential && <sup className="grade-chip-potential-mark">*</sup>}
    </span>
  );
};

export default GradeChip;
