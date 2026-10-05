import React, { useId, useState } from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { useTheme } from "../../contexts/ThemeContext";
import type { ClubMove } from "../../services/playerListsService";

export const formatAppearanceDate = (value: string | null): string => {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString("en-GB", { timeZone: "UTC" });
};

const ClubMoveDot: React.FC<{ move?: ClubMove | null }> = ({ move }) => {
  const { theme } = useTheme();
  const id = useId();
  const [show, setShow] = useState(false);
  if (!move) return null;
  return (
    <OverlayTrigger trigger={["hover", "focus"]} show={show} onToggle={setShow} placement="auto" rootClose overlay={
      <Popover id={`club-move-${id}`} style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
        <Popover.Header as="h3" style={{ backgroundColor: theme.colors.surface, color: theme.colors.text }}>Club move</Popover.Header>
        <Popover.Body style={{ color: theme.colors.text }}>
          <div><strong>From:</strong> {move.from_club || "Unknown"}</div>
          <div><strong>To:</strong> {move.to_club || "Unknown"}</div>
          <div>Last appearance at previous club: {formatAppearanceDate(move.last_old_club_appearance)}</div>
          <div>First appearance at new club: {formatAppearanceDate(move.first_new_club_appearance)}</div>
        </Popover.Body>
      </Popover>
    }>
      <button type="button" aria-label="View club move" className="ms-1 d-inline-flex align-items-center justify-content-center"
        onClick={(event) => { event.stopPropagation(); setShow(true); }} onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setShow(false); }}
        style={{ border: 0, padding: 4, background: "transparent", verticalAlign: "middle", cursor: "pointer" }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ec4899", boxShadow: "0 0 3px rgba(236,72,153,0.5)" }} />
      </button>
    </OverlayTrigger>
  );
};
export default ClubMoveDot;
