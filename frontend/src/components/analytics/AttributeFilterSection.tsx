import React, { useState, useEffect } from "react";
import {
  Row, Col, Card, Form, Button, Table, Spinner, Badge, Alert
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../axiosInstance";
import { getPlayerProfilePathFromSource } from "../../utils/playerNavigation";
import { getAverageAttributeScoreColor, getPerformanceScoreColor } from "../../utils/colorUtils";

// CSS for range sliders
const rangeSliderStyles = `
  .range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #000000;
    cursor: grab;
    border: 3px solid white;
    box-shadow: 0 0 0 1px #000000, 0 2px 4px rgba(0,0,0,0.2);
    position: relative;
  }

  .range-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #000000;
    cursor: grab;
    border: 3px solid white;
    box-shadow: 0 0 0 1px #000000, 0 2px 4px rgba(0,0,0,0.2);
  }

  .range-slider::-webkit-slider-thumb:hover {
    background: #333333;
    transform: scale(1.1);
  }

  .range-slider::-moz-range-thumb:hover {
    background: #333333;
    transform: scale(1.1);
  }

  .range-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
    background: #000000;
  }

  .range-slider::-moz-range-thumb:active {
    cursor: grabbing;
    background: #000000;
  }
`;

interface Attribute {
  ATTRIBUTE_NAME: string;
  ATTRIBUTE_GROUP?: string;
  DISPLAY_ORDER?: number;
}

interface AttributeFilter {
  name: string;
  minScore: string;
  maxScore: string;
}

interface PlayerReport {
  REPORT_ID: number;
  PLAYER_NAME: string;
  PLAYER_ID: number;
  CAFC_PLAYER_ID: number;
  POSITION: string;
  PERFORMANCE_SCORE: number;
  ATTRIBUTE_SCORE: number;
  REPORT_DATE: string;
  SCOUT_NAME: string;
  REPORT_TYPE: string;
  SCOUTING_TYPE: string;
  PURPOSE: string;
  attribute_scores: { [key: string]: number };
  selected_attributes_avg: number | null;
  AGE: number | null;
  FIXTURE_DATE: string | null;
  FIXTURE: string | null;
}

interface FilterResponse {
  total_reports: number;
  reports: PlayerReport[];
  filters: any;
}

const POSITION_ORDER = [
  "GK", "RB", "RWB", "RCB(3)", "RCB(2)", "CCB(3)", "LCB(2)", "LCB(3)",
  "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW",
  "Target Man CF", "In Behind CF"
];

const AttributeFilterSection: React.FC = () => {
  const navigate = useNavigate();

  // Filter states
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [availableAttributes, setAvailableAttributes] = useState<Attribute[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([]);
  const [monthFilter, setMonthFilter] = useState<number>(12);

  // Results
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [attributeError, setAttributeError] = useState<string>("");

  // Fetch available attributes when position changes
  useEffect(() => {
    if (selectedPosition) {
      fetchAvailableAttributes();
    } else {
      setAvailableAttributes([]);
      setSelectedAttributes([]);
      setAttributeFilters([]);
    }
  }, [selectedPosition]);

  const fetchAvailableAttributes = async () => {
    try {
      setLoadingAttributes(true);
      setAttributeError("");
      console.log("Fetching attributes for position:", selectedPosition);
      const response = await axiosInstance.get("/analytics/attributes/by-position", {
        params: { position: selectedPosition }
      });
      console.log("Attributes response:", response.data);
      const attrs = response.data.attributes || [];
      setAvailableAttributes(attrs);

      // Automatically select all attributes and create filters for them
      // But DO NOT auto-apply - user must click "Apply Filters"
      const attrNames = attrs.map((a: Attribute) => a.ATTRIBUTE_NAME);
      setSelectedAttributes(attrNames);
      setAttributeFilters(attrNames.map((name: string) => ({
        name,
        minScore: "1",
        maxScore: "10"
      })));

      // Clear any previous results so user knows to click Apply Filters
      setReports([]);

      if (attrs.length === 0) {
        setAttributeError(`No attributes found for position: ${selectedPosition}`);
      }
    } catch (error: any) {
      console.error("Error fetching attributes:", error);
      setAttributeError(error.response?.data?.detail || "Error loading attributes");
      setAvailableAttributes([]);
    } finally {
      setLoadingAttributes(false);
    }
  };

  const handleScoreChange = (attrName: string, field: 'minScore' | 'maxScore', value: string) => {
    setAttributeFilters(attributeFilters.map(f =>
      f.name === attrName ? { ...f, [field]: value } : f
    ));
  };

  const handleApplyFilters = async () => {
    if (!selectedPosition) {
      alert("Please select a position");
      return;
    }

    try {
      setLoading(true);

      // Only include attributes that have been explicitly filtered (not default 1-10 range)
      const filteredAttributes = attributeFilters.filter(f => {
        const minVal = parseInt(f.minScore) || 1;
        const maxVal = parseInt(f.maxScore) || 10;
        return minVal !== 1 || maxVal !== 10;
      });

      const params: any = {
        position: selectedPosition,
        months: monthFilter
      };

      // Only add attribute filters if some have been explicitly set
      if (filteredAttributes.length > 0) {
        params.attributes = filteredAttributes.map(f => f.name).join(',');
        params.min_scores = filteredAttributes.map(f => f.minScore || '1').join(',');
        params.max_scores = filteredAttributes.map(f => f.maxScore || '10').join(',');
      }

      const response = await axiosInstance.get<FilterResponse>("/analytics/players/by-attributes", { params });
      setReports(response.data.reports || []);
    } catch (error) {
      console.error("Error fetching filtered reports:", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedPosition("");
    setSelectedAttributes([]);
    setAttributeFilters([]);
    setReports([]);
  };

  const handlePlayerClick = (playerId: number | null, cafcPlayerId: number | null) => {
    const dataSource = cafcPlayerId ? 'internal' : 'external';
    const id = cafcPlayerId || playerId;
    if (id) {
      const path = getPlayerProfilePathFromSource(dataSource, id);
      navigate(path);
    }
  };

  const getScoutingTypeBadge = (scoutingType: string | null) => {
    if (!scoutingType) return 'N/A';
    const icon = scoutingType.toLowerCase() === "live" ? "🏟️" : "💻";
    return `${icon} ${scoutingType}`;
  };

  const handleExportCSV = () => {
    if (reports.length === 0) return;

    // Prepare CSV headers
    const headers = [
      "Player Name",
      "Position",
      "Report Date",
      "Scout Name",
      "Report Type",
      "Scouting Type",
      "Performance Score",
      ...selectedAttributes,
      "Selected Attributes Avg"
    ];

    // Prepare CSV rows
    const rows = reports.map(report => {
      const attributeScores = selectedAttributes.map(attr =>
        report.attribute_scores[attr] || 'N/A'
      );

      return [
        report.PLAYER_NAME,
        report.POSITION,
        new Date(report.REPORT_DATE).toLocaleDateString(),
        report.SCOUT_NAME,
        report.REPORT_TYPE,
        report.SCOUTING_TYPE || 'N/A',
        report.PERFORMANCE_SCORE || 'N/A',
        ...attributeScores,
        report.selected_attributes_avg || 'N/A'
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attribute_filtered_reports_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <style>{rangeSliderStyles}</style>
      <Card className="shadow-sm mt-4">
        <Card.Header style={{ backgroundColor: "#000000" }} className="text-white">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0">🔍 Attribute-Based Player Search</h6>
            {reports.length > 0 && (
              <span className="badge bg-light text-dark">
                {reports.length} {reports.length === 1 ? 'Report' : 'Reports'} Found
              </span>
            )}
          </div>
        </Card.Header>
      <Card.Body>
        {/* Position and Time Period Selection */}
        <Row className="mb-3">
          <Col md={3}>
            <Form.Group>
              <Form.Label className="fw-bold">Position</Form.Label>
              <Form.Select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                size="sm"
              >
                <option value="">Select Position</option>
                {POSITION_ORDER.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>

          <Col md={3}>
            <Form.Group>
              <Form.Label className="fw-bold">Time Period</Form.Label>
              <Form.Select
                value={monthFilter}
                onChange={(e) => setMonthFilter(parseInt(e.target.value))}
                size="sm"
              >
                <option value="3">Last 3 Months</option>
                <option value="6">Last 6 Months</option>
                <option value="12">Last 12 Months</option>
                <option value="24">Last 24 Months</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        {/* Attributes Section */}
        {!selectedPosition ? (
          <Alert variant="info">
            <strong>👆 Select a position</strong> to view available attributes for filtering
          </Alert>
        ) : loadingAttributes ? (
          <div className="text-center py-5">
            <Spinner animation="border" />
            <div className="mt-3">Loading attributes for {selectedPosition}...</div>
          </div>
        ) : attributeError ? (
          <Alert variant="warning">
            {attributeError}
            <br />
            <small>This may mean there are no attributes configured for this position in the database.</small>
          </Alert>
        ) : availableAttributes.length === 0 ? (
          <Alert variant="info">
            No attributes available for this position.
          </Alert>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0">Attributes for {selectedPosition}</h6>
              <Badge bg="secondary">{availableAttributes.length} attributes</Badge>
            </div>

            {/* Attribute Filters - Grid Layout (5 per row) */}
            <div style={{ maxHeight: "500px", overflowY: "auto", paddingRight: "10px" }}>
              <Row className="g-2">
                {attributeFilters.map((filter) => {
                  const minVal = parseInt(filter.minScore) || 1;
                  const maxVal = parseInt(filter.maxScore) || 10;
                  return (
                    <Col key={filter.name} style={{ flex: "0 0 20%", maxWidth: "20%" }}>
                      <Card style={{ borderTop: "3px solid #000000", fontSize: "0.8rem" }}>
                        <Card.Body className="p-2">
                          <div className="fw-bold mb-1" style={{ fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {filter.name}
                          </div>

                          {/* Number inputs for precise control */}
                          <div className="d-flex justify-content-between align-items-center mb-2" style={{ gap: "4px" }}>
                            <Form.Control
                              type="number"
                              size="sm"
                              value={minVal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val >= 1 && val <= maxVal) {
                                  handleScoreChange(filter.name, 'minScore', e.target.value);
                                }
                              }}
                              min={1}
                              max={10}
                              style={{ width: "45px", fontSize: "0.7rem", padding: "0.2rem 0.3rem", textAlign: "center" }}
                            />
                            <Badge bg="dark" style={{ fontSize: "0.7rem", flex: 1 }}>
                              {minVal} - {maxVal}
                            </Badge>
                            <Form.Control
                              type="number"
                              size="sm"
                              value={maxVal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val >= minVal && val <= 10) {
                                  handleScoreChange(filter.name, 'maxScore', e.target.value);
                                }
                              }}
                              min={1}
                              max={10}
                              style={{ width: "45px", fontSize: "0.7rem", padding: "0.2rem 0.3rem", textAlign: "center" }}
                            />
                          </div>

                          {/* Dual Range Slider Container */}
                          <div style={{ position: "relative", height: "40px", paddingTop: "10px" }}>
                            {/* Background Track */}
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "0",
                                right: "0",
                                height: "4px",
                                backgroundColor: "#e9ecef",
                                borderRadius: "2px",
                                transform: "translateY(-50%)"
                              }}
                            />
                            {/* Active Range Track */}
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: `${((minVal - 1) / 9) * 100}%`,
                                width: `${((maxVal - minVal) / 9) * 100}%`,
                                height: "4px",
                                backgroundColor: "#000000",
                                borderRadius: "2px",
                                transform: "translateY(-50%)",
                                pointerEvents: "none"
                              }}
                            />
                            {/* Max Range Slider - Render first so min can be on top when needed */}
                            <input
                              type="range"
                              className="range-slider"
                              min={1}
                              max={10}
                              value={maxVal}
                              onChange={(e) => {
                                const newMax = parseInt(e.target.value);
                                if (newMax >= minVal) {
                                  handleScoreChange(filter.name, 'maxScore', e.target.value);
                                }
                              }}
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "0",
                                width: "100%",
                                transform: "translateY(-50%)",
                                pointerEvents: "auto",
                                appearance: "none",
                                WebkitAppearance: "none",
                                background: "transparent",
                                height: "4px",
                                outline: "none",
                                zIndex: 3
                              }}
                            />
                            {/* Min Range Slider - Render second with higher z-index so it's accessible */}
                            <input
                              type="range"
                              className="range-slider"
                              min={1}
                              max={10}
                              value={minVal}
                              onChange={(e) => {
                                const newMin = parseInt(e.target.value);
                                if (newMin <= maxVal) {
                                  handleScoreChange(filter.name, 'minScore', e.target.value);
                                }
                              }}
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "0",
                                width: "100%",
                                transform: "translateY(-50%)",
                                pointerEvents: "auto",
                                appearance: "none",
                                WebkitAppearance: "none",
                                background: "transparent",
                                height: "4px",
                                outline: "none",
                                zIndex: 4
                              }}
                            />
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <Row className="mb-3">
          <Col>
            <Button
              variant="primary"
              onClick={handleApplyFilters}
              disabled={!selectedPosition || selectedAttributes.length === 0 || loading}
              className="me-2"
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Searching...
                </>
              ) : (
                "Apply Filters"
              )}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={handleClearFilters}
              disabled={loading}
            >
              Clear Filters
            </Button>
            {reports.length > 0 && (
              <Button
                variant="success"
                onClick={handleExportCSV}
                className="ms-2"
              >
                Export to CSV
              </Button>
            )}
          </Col>
        </Row>

        {/* Results Table */}
        {reports.length > 0 && (
          <Row>
            <Col>
              <Alert variant="info">
                Found {reports.length} reports matching your criteria
              </Alert>
              <div className="table-responsive" style={{ maxHeight: "600px", overflowY: "auto" }}>
                <Table
                  responsive
                  hover
                  striped
                  className="table-compact table-sm"
                  style={{ textAlign: "center" }}
                >
                  <thead className="table-dark">
                    <tr>
                      <th>Report Date</th>
                      <th>Player</th>
                      <th>Age</th>
                      <th>Position</th>
                      <th>Fixture Date</th>
                      <th>Fixture</th>
                      <th>Scout</th>
                      <th>Type</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.REPORT_ID}>
                        <td>{new Date(report.REPORT_DATE).toLocaleDateString()}</td>
                        <td>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handlePlayerClick(report.PLAYER_ID, report.CAFC_PLAYER_ID);
                            }}
                            style={{ textDecoration: "none", color: "#0d6efd" }}
                          >
                            {report.PLAYER_NAME}
                          </a>
                        </td>
                        <td>
                          <span className="age-text">{report.AGE || 'N/A'}</span>
                        </td>
                        <td>
                          <span className="position-text">{report.POSITION || 'N/A'}</span>
                        </td>
                        <td>
                          {report.FIXTURE_DATE
                            ? new Date(report.FIXTURE_DATE).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td>{report.FIXTURE || 'N/A'}</td>
                        <td>{report.SCOUT_NAME}</td>
                        <td>
                          <span style={{ fontSize: "0.85rem" }}>
                            {getScoutingTypeBadge(report.SCOUTING_TYPE)}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: getPerformanceScoreColor(report.PERFORMANCE_SCORE),
                              color: "white",
                              fontWeight: "bold",
                              fontSize: "0.9rem"
                            }}
                          >
                            {report.PERFORMANCE_SCORE || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Col>
          </Row>
        )}

        {!loading && reports.length === 0 && selectedPosition && selectedAttributes.length > 0 && (
          <Alert variant="warning">
            No reports found matching your filter criteria. Try adjusting your filters.
          </Alert>
        )}
      </Card.Body>
    </Card>
    </>
  );
};

export default AttributeFilterSection;
