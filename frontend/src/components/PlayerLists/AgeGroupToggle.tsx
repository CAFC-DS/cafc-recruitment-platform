import React from "react";
import { ButtonGroup, Button } from "react-bootstrap";

export type AgeGroup = "u21" | "u18";

interface AgeGroupToggleProps {
  value: AgeGroup;
  onChange: (age: AgeGroup) => void;
}

/**
 * Compact U21/U18 segmented control for the emerging-talent shortlists. Rendered
 * in the page header accessory slot by the emerging-talent wrapper pages.
 */
const AgeGroupToggle: React.FC<AgeGroupToggleProps> = ({ value, onChange }) => (
  <ButtonGroup size="sm" aria-label="Emerging talent age group">
    <Button
      variant={value === "u21" ? "dark" : "outline-dark"}
      onClick={() => onChange("u21")}
    >
      U21
    </Button>
    <Button
      variant={value === "u18" ? "dark" : "outline-dark"}
      onClick={() => onChange("u18")}
    >
      U18
    </Button>
  </ButtonGroup>
);

export default AgeGroupToggle;
