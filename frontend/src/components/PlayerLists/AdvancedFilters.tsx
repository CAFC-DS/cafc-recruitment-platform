import React from "react";
import { Card, Collapse, Button, Row, Col, Form, Dropdown } from "react-bootstrap";

export interface PlayerListFilters {
  playerName: string;
  position: string;
  club: string;
  performanceScores: number[];
  minAge: string;
  maxAge: string;
  minReports: string;
  maxReports: string;
  stages: string[];
  recencyMonths: string;
}

interface AdvancedFiltersProps {
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filters: PlayerListFilters;
  onFilterChange: (filters: Partial<PlayerListFilters>) => void;
  onClearFilters: () => void;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
  includeArchivedReports: boolean;
  onIncludeArchivedReportsChange: (include: boolean) => void;
}

const STAGE_OPTIONS = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Archived"];

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  showFilters,
  setShowFilters,
  filters,
  onFilterChange,
  onClearFilters,
  showArchived,
  onShowArchivedChange,
  includeArchivedReports,
  onIncludeArchivedReportsChange,
}) => {
  return (
    <Card className="mb-3">
      <Card.Header style={{ backgroundColor: "#000000", color: "white" }}>
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 text-white">🔍 Advanced Filters</h6>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            style={{ color: "white", borderColor: "white" }}
          >
            {showFilters ? "▲ Hide Filters" : "▼ Show Filters"}
          </Button>
        </div>
      </Card.Header>
      <Collapse in={showFilters}>
        <Card.Body className="filter-section-improved">
          {/* Row 1: Player Name, Position, Club */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Player Name</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Enter player name"
                  value={filters.playerName}
                  onChange={(e) => onFilterChange({ playerName: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Position</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="e.g. GK, CM, ST"
                  value={filters.position}
                  onChange={(e) => onFilterChange({ position: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Club</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Enter club name"
                  value={filters.club}
                  onChange={(e) => onFilterChange({ club: e.target.value })}
                />
              </Form.Group>
            </Col>
          </Row>

          {/* Row 2: Performance Score, Age Range, Last Reported */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">
                  Performance Score
                </Form.Label>
                <Dropdown>
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.performanceScores.length > 0
                      ? `${filters.performanceScores.length} score${filters.performanceScores.length > 1 ? "s" : ""} selected`
                      : "Select scores"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu
                    className="p-2"
                    style={{ minWidth: "200px" }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                      <div key={score} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`perf-${score}`}
                          label={`${score}`}
                          checked={filters.performanceScores.includes(score)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                performanceScores: [...filters.performanceScores, score],
                              });
                            } else {
                              onFilterChange({
                                performanceScores: filters.performanceScores.filter((s) => s !== score),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Age Range</Form.Label>
                <div className="range-inputs">
                  <Form.Control
                    size="sm"
                    type="number"
                    placeholder="Min"
                    value={filters.minAge}
                    onChange={(e) => onFilterChange({ minAge: e.target.value })}
                    min="16"
                    max="50"
                    style={{ width: "80px" }}
                  />
                  <span className="range-separator">to</span>
                  <Form.Control
                    size="sm"
                    type="number"
                    placeholder="Max"
                    value={filters.maxAge}
                    onChange={(e) => onFilterChange({ maxAge: e.target.value })}
                    min="16"
                    max="50"
                    style={{ width: "80px" }}
                  />
                </div>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Last Reported</Form.Label>
                <Form.Select
                  size="sm"
                  value={filters.recencyMonths}
                  onChange={(e) => onFilterChange({ recencyMonths: e.target.value })}
                >
                  <option value="">All Time</option>
                  <option value="1">Last 1 Month</option>
                  <option value="3">Last 3 Months</option>
                  <option value="6">Last 6 Months</option>
                  <option value="12">Last 12 Months</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          {/* Row 3: Stage Filter, Report Count, Show Archived */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Stage Filter</Form.Label>
                <Dropdown>
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.stages.length > 0
                      ? `${filters.stages.length} stage${filters.stages.length > 1 ? "s" : ""} selected`
                      : "All stages"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu
                    className="p-2"
                    style={{ minWidth: "200px" }}
                  >
                    {STAGE_OPTIONS.map((stage) => (
                      <div key={stage} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`stage-${stage}`}
                          label={stage}
                          checked={filters.stages.includes(stage)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                stages: [...filters.stages, stage],
                              });
                            } else {
                              onFilterChange({
                                stages: filters.stages.filter((s) => s !== stage),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Report Count</Form.Label>
                <div className="range-inputs">
                  <Form.Control
                    size="sm"
                    type="number"
                    placeholder="Min"
                    value={filters.minReports}
                    onChange={(e) => onFilterChange({ minReports: e.target.value })}
                    min="0"
                    style={{ width: "80px" }}
                  />
                  <span className="range-separator">to</span>
                  <Form.Control
                    size="sm"
                    type="number"
                    placeholder="Max"
                    value={filters.maxReports}
                    onChange={(e) => onFilterChange({ maxReports: e.target.value })}
                    min="0"
                    style={{ width: "80px" }}
                  />
                </div>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Include Options</Form.Label>
                <Dropdown>
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {showArchived || includeArchivedReports
                      ? `${[showArchived && "Archived players", includeArchivedReports && "Archived reports"].filter(Boolean).join(", ")}`
                      : "None selected"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu
                    className="p-2"
                    style={{ minWidth: "250px" }}
                  >
                    <div className="px-2 py-1">
                      <Form.Check
                        type="checkbox"
                        id="show-archived-checkbox"
                        label="Include archived players"
                        checked={showArchived}
                        onChange={(e) => onShowArchivedChange(e.target.checked)}
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Form.Check
                        type="checkbox"
                        id="include-archived-reports-checkbox"
                        label="Include archived reports in counts"
                        checked={includeArchivedReports}
                        onChange={(e) => onIncludeArchivedReportsChange(e.target.checked)}
                      />
                    </div>
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
          </Row>

          {/* Row 4: Clear Filters */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label
                  className="small fw-bold"
                  style={{ visibility: "hidden" }}
                >
                  Placeholder
                </Form.Label>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={onClearFilters}
                  className="w-100"
                >
                  🔄 Clear All Filters
                </Button>
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Collapse>
    </Card>
  );
};
