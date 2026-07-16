import React from "react";
import { getGradeColor, getContrastTextColor } from "../utils/colorUtils";
import "./GradeLabelChip.css";

interface GradeLabelChipProps {
  /** Legacy categorical archived-report grade label (e.g. "Outstanding/Above
   * Level", "Target", "Monitor", "Scout", "No Action"). Color comes from the
   * existing, unmodified getGradeColor -- this component only standardizes
   * shape/typography, it never introduces new grade colors. */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const GradeLabelChip: React.FC<GradeLabelChipProps> = ({
  label,
  size = "md",
  className = "",
}) => {
  const backgroundColor = getGradeColor(label);
  const color = getContrastTextColor(backgroundColor);
  const parts = label.split("/");

  return (
    <span
      className={`grade-label-chip grade-label-chip-${size} ${className}`}
      style={{ backgroundColor, color }}
      title={`Grade: ${label}`}
    >
      {parts.length > 1
        ? parts.map((part, index) => (
            <React.Fragment key={index}>
              {part.trim()}
              {index < parts.length - 1 && "/"}
              {index < parts.length - 1 && <br />}
            </React.Fragment>
          ))
        : label}
    </span>
  );
};

export default GradeLabelChip;
