import React from "react";
import { Button } from "react-bootstrap";

/**
 * Filters are remembered between visits, so the collapsed filter header has to
 * show when results are narrowed and offer a way out without opening the panel.
 */
export const ActiveFilterBadge: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <span
      className="badge bg-light text-dark ms-2"
      aria-label={`${count} active ${count === 1 ? "filter" : "filters"}`}
      title={`${count} active ${count === 1 ? "filter" : "filters"}`}
    >
      {count}
    </span>
  ) : null;

export const ClearFiltersButton: React.FC<{ count: number; onClear: () => void }> = ({ count, onClear }) =>
  count > 0 ? (
    <Button variant="link" size="sm" className="text-white p-0" onClick={onClear}>
      Clear all
    </Button>
  ) : null;
