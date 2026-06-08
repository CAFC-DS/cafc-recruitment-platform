import React from "react";
import { Dropdown, Form } from "react-bootstrap";

interface PositionMultiSelectProps {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
  size?: "sm" | "lg";
  width?: string | number;
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
}) => {
  const toggleLabel =
    selected.length === 0
      ? "All Positions"
      : `${selected.length} position${selected.length > 1 ? "s" : ""} selected`;

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
        {selected.length > 0 && (
          <div className="px-2 pb-2 mb-1 border-bottom">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-decoration-none"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>
        )}
        {options.map((option) => (
          <div key={option} className="px-2 py-1">
            <Form.Check
              type="checkbox"
              id={`position-filter-${option}`}
              label={option}
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
