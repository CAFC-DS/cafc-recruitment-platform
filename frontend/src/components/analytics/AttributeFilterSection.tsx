import React, { useState, useEffect } from "react";
import {
  Row, Col, Card, Form, Button, Table, Spinner, Badge, Alert
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../axiosInstance";
import { getPlayerProfilePathFromSource } from "../../utils/playerNavigation";
import { getAverageAttributeScoreColor, getPerformanceScoreColor } from "../../utils/colorUtils";

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
  report_id: number;
  player_name: string;
  player_id: number;
  cafc_player_id: number;
  position: string;
  performance_score: number;
  attribute_score: number;
  report_date: string;
  scout_name: string;
  report_type: string;
  scouting_type: string;
  purpose: string;
  attribute_scores: { [key: string]: number };
  selected_attributes_avg: number | null;
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

  const handleAttributeToggle = (attrName: string) => {
    if (selectedAttributes.includes(attrName)) {
      // Remove attribute
      setSelectedAttributes(selectedAttributes.filter(a => a !== attrName));
      setAttributeFilters(attributeFilters.filter(f => f.name !== attrName));
    } else {
      // Add attribute
      setSelectedAttributes([...selectedAttributes, attrName]);
      setAttributeFilters([...attributeFilters, { name: attrName, minScore: "", maxScore: "" }]);
    }
  };

  const handleScoreChange = (attrName: string, field: 'minScore' | 'maxScore', value: string) => {
    setAttributeFilters(attributeFilters.map(f =>
      f.name === attrName ? { ...f, [field]: value } : f
    ));
  };

  const handleApplyFilters = async () => {
    if (!selectedPosition || selectedAttributes.length === 0) {
      alert("Please select a position and at least one attribute");
      return;
    }

    try {
      setLoading(true);
      const params: any = {
        position: selectedPosition,
        attributes: selectedAttributes.join(','),
        months: monthFilter
      };

      // Build min and max score arrays (attributes are graded 1-10)
      const minScores = attributeFilters.map(f => f.minScore || '1');
      const maxScores = attributeFilters.map(f => f.maxScore || '10');

      params.min_scores = minScores.join(',');
      params.max_scores = maxScores.join(',');

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

  const handlePlayerClick = (playerId: number, cafcPlayerId: number) => {
    const dataSource = cafcPlayerId ? 'internal' : 'external';
    const id = cafcPlayerId || playerId;
    const path = getPlayerProfilePathFromSource(dataSource, id);
    navigate(path);
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
        report.player_name,
        report.position,
        new Date(report.report_date).toLocaleDateString(),
        report.scout_name,
        report.report_type,
        report.scouting_type || 'N/A',
        report.performance_score || 'N/A',
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
    <Card className="shadow-sm mt-4">
      <Card.Header className="bg-dark text-white">
        <h5 className="mb-0">Attribute-Based Player Search</h5>
      </Card.Header>
      <Card.Body>
        {/* Filter Controls */}
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

        {/* Attribute Selection */}
        {selectedPosition && (
          <Row className="mb-3">
            <Col>
              <Form.Label className="fw-bold">Select Attributes to Filter</Form.Label>
              {loadingAttributes ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                  <span className="ms-2">Loading attributes...</span>
                </div>
              ) : attributeError ? (
                <Alert variant="warning" className="mt-2">
                  {attributeError}
                  <br />
                  <small>This may mean there are no attributes configured for this position in the database.</small>
                </Alert>
              ) : availableAttributes.length === 0 ? (
                <Alert variant="info" className="mt-2">
                  No attributes available for this position.
                </Alert>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {availableAttributes.map((attr) => (
                    <Form.Check
                      key={attr.ATTRIBUTE_NAME}
                      type="checkbox"
                      label={attr.ATTRIBUTE_NAME}
                      checked={selectedAttributes.includes(attr.ATTRIBUTE_NAME)}
                      onChange={() => handleAttributeToggle(attr.ATTRIBUTE_NAME)}
                      style={{
                        padding: "0.5rem",
                        border: "1px solid #dee2e6",
                        borderRadius: "4px",
                        minWidth: "150px",
                        backgroundColor: selectedAttributes.includes(attr.ATTRIBUTE_NAME) ? "#e7f3ff" : "#fff"
                      }}
                    />
                  ))}
                </div>
              )}
            </Col>
          </Row>
        )}

        {/* Score Ranges for Selected Attributes */}
        {selectedAttributes.length > 0 && (
          <Row className="mb-3">
            <Col>
              <Form.Label className="fw-bold">Score Ranges (1-10)</Form.Label>
              <Row>
                {attributeFilters.map((filter) => (
                  <Col md={4} key={filter.name} className="mb-2">
                    <Card style={{ backgroundColor: "#f8f9fa" }}>
                      <Card.Body className="p-2">
                        <div className="fw-bold mb-1" style={{ fontSize: "0.875rem" }}>
                          {filter.name}
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          <Form.Control
                            type="number"
                            placeholder="Min (1)"
                            size="sm"
                            min="1"
                            max="10"
                            value={filter.minScore}
                            onChange={(e) => handleScoreChange(filter.name, 'minScore', e.target.value)}
                            style={{ width: "90px" }}
                          />
                          <span>-</span>
                          <Form.Control
                            type="number"
                            placeholder="Max (10)"
                            size="sm"
                            min="1"
                            max="10"
                            value={filter.maxScore}
                            onChange={(e) => handleScoreChange(filter.name, 'maxScore', e.target.value)}
                            style={{ width: "90px" }}
                          />
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
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
                <Table striped bordered hover size="sm">
                  <thead className="table-dark sticky-top">
                    <tr>
                      <th>Player</th>
                      <th>Position</th>
                      <th>Date</th>
                      <th>Scout</th>
                      <th>Type</th>
                      <th>Perf Score</th>
                      {selectedAttributes.map((attr) => (
                        <th key={attr}>{attr}</th>
                      ))}
                      <th>Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr
                        key={report.report_id}
                        style={{ cursor: "pointer" }}
                        onClick={() => handlePlayerClick(report.player_id, report.cafc_player_id)}
                      >
                        <td>{report.player_name}</td>
                        <td>{report.position}</td>
                        <td>{new Date(report.report_date).toLocaleDateString()}</td>
                        <td>{report.scout_name}</td>
                        <td>
                          <Badge bg="secondary" style={{ fontSize: "0.75rem" }}>
                            {report.report_type}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            style={{
                              backgroundColor: getPerformanceScoreColor(report.performance_score),
                              fontSize: "0.75rem"
                            }}
                          >
                            {report.performance_score || 'N/A'}
                          </Badge>
                        </td>
                        {selectedAttributes.map((attr) => (
                          <td key={attr}>
                            <Badge
                              style={{
                                backgroundColor: getAverageAttributeScoreColor(report.attribute_scores[attr]),
                                fontSize: "0.75rem"
                              }}
                            >
                              {report.attribute_scores[attr] || 'N/A'}
                            </Badge>
                          </td>
                        ))}
                        <td>
                          <Badge
                            style={{
                              backgroundColor: getAverageAttributeScoreColor(report.selected_attributes_avg || 0),
                              fontSize: "0.75rem"
                            }}
                          >
                            {report.selected_attributes_avg?.toFixed(1) || 'N/A'}
                          </Badge>
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
  );
};

export default AttributeFilterSection;
