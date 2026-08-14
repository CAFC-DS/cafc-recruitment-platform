import React from "react";
import { Video } from "lucide-react";
import { IconBuildingStadium } from "@tabler/icons-react";

interface ScoutingTypeBadgeProps {
  scoutingType?: string | null;
  count?: number;
  size?: "sm" | "md";
}

/** A consistently coloured, icon-first indicator for scouting method. */
const ScoutingTypeBadge: React.FC<ScoutingTypeBadgeProps> = ({
  scoutingType,
  count,
  size = "sm",
}) => {
  const type = scoutingType?.trim().toLowerCase();
  if (type !== "live" && type !== "video") return null;

  const isLive = type === "live";
  const label = isLive ? "Live" : "Video";
  // Neutral colours avoid colliding with the application's semantic stage,
  // score, and alert palette; the icon silhouette identifies the method.
  const color = isLive ? "#181a1f" : "#374151";
  const iconSize = size === "md" ? 20 : 15;

  return (
    <span
      className="d-inline-flex align-items-center gap-1"
      title={`${label} scouting${count !== undefined ? `: ${count} report${count === 1 ? "" : "s"}` : ""}`}
      aria-label={`${label} scouting${count !== undefined ? `: ${count} reports` : ""}`}
      style={{
        color,
        fontSize: size === "md" ? "0.85rem" : "0.75rem",
        fontWeight: 700,
        filter: isLive ? undefined : "drop-shadow(0 1px 0 rgba(255,255,255,0.85))",
      }}
    >
      {isLive ? <IconBuildingStadium size={iconSize} stroke={2} /> : <Video size={iconSize} strokeWidth={2} />}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
};

export default ScoutingTypeBadge;
