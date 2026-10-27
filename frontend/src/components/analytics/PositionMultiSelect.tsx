import React, { useState } from "react";
import { Dropdown, Form } from "react-bootstrap";

interface PositionMultiSelectProps {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
  size?: "sm" | "lg";
  width?: string | number;
  /** Optional wording and extras; defaults keep the original position filter. */
  allLabel?: string;
  noun?: [singular: string, plural: string];
  optionLabel?: (option: string) => string;
  searchable?: boolean;
  presets?: { label: string; values: string[] }[];
  idPrefix?: string;
}

/**
 * Multi-select position filter rendered as a checkbox list inside a Bootstrap
 * dropdown. Mirrors the pattern used in PlayerLists/AdvancedFilters so the look
 * and feel stays consistent across the app.
 */
const PositionMultiSelect: React.FC<PositionMultiSelectProps> = ({
  selected,
  options,
  onChange,
  size = "sm",
  width = 200,
  allLabel = "All Positions",
  noun = ["position", "positions"],
  optionLabel = (option: string) => option,
  searchable = false,
  presets = [],
  idPrefix = "position-filter",
}) => {
  const [query, setQuery] = useState("");
  const toggleLabel =
    selected.length === 0
      ? allLabel
      : `${selected.length} ${selected.length > 1 ? noun[1] : noun[0]} selected`;
  const shown = searchable
    ? options.filter((o) =>
        optionLabel(o).toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options;

  const handleToggle = (option: string, checked: boolean) => {
    if (checked) {
      onChange([...selected, option]);
    } else {
      onChange(selected.filter((item) => item !== option));
    }
  };

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        variant="light"
        size={size}
        className="text-start border d-flex align-items-center justify-content-between"
        style={{
          width,
          backgroundColor: "#ffffff",
          color: "#212529",
          borderColor: "#ced4da",
        }}
      >
        {toggleLabel}
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="p-2"
        renderOnMount
        popperConfig={{ strategy: "fixed" }}
        style={{ maxHeight: "300px", overflowY: "auto", minWidth: "220px", zIndex: 2000 }}
      >
        {searchable && (
          <div className="px-2 pb-2">
            <Form.Control
              size="sm"
              type="search"
              placeholder={`Search ${noun[1]}`}
              aria-label={`Search ${noun[1]}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        {(selected.length > 0 || presets.length > 0) && (
          <div className="px-2 pb-2 mb-1 border-bottom d-flex gap-3">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none"
                onClick={() => onChange(p.values)}
              >
                {p.label}
              </button>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none"
                onClick={() => onChange([])}
              >
                Clear all
              </button>
            )}
          </div>
        )}
        {shown.map((option) => (
          <div key={option} className="px-2 py-1">
            <Form.Check
              type="checkbox"
              id={`${idPrefix}-${option}`}
              label={optionLabel(option)}
              checked={selected.includes(option)}
              onChange={(event) => handleToggle(option, event.target.checked)}
            />
          </div>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default PositionMultiSelect;
