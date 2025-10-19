import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Form, Card, Button, ButtonGroup, Table, OverlayTrigger, Tooltip } from "react-bootstrap";
import axiosInstance from "../../axiosInstance";
import SimpleLineChart from "./SimpleLineChart";

interface ScoutAnalytics {
  scout_stats: Array<{
    scout_name: string;
    scout_id: number;
    total_reports: number;
    avg_performance_given: number;
    avg_attribute_given: number;
    player_assessments: number;
    flags: number;
    clips: number;
    live_reports: number;
    video_reports: number;
    unique_players_reported_on: number;
    games_fixtures_covered: number;
    avg_players_per_report: number;
  }>;
  monthly_reports_timeline: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
    }>;
  };
}

const ScoutAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<ScoutAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<number>(6);
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [selectedScouts, setSelectedScouts] = useState<string[]>([]);
  const [comparisonScouts, setComparisonScouts] = useState<string[]>([]);

  // Define distinct colors for each scout
  const scoutColors = [
    { border: "#e31e24", bg: "rgba(227, 30, 36, 0.1)" },      // Red
    { border: "#2563eb", bg: "rgba(37, 99, 235, 0.1)" },      // Blue
    { border: "#16a34a", bg: "rgba(22, 163, 74, 0.1)" },      // Green
    { border: "#d97706", bg: "rgba(217, 119, 6, 0.1)" },      // Orange
    { border: "#9333ea", bg: "rgba(147, 51, 234, 0.1)" },     // Purple
    { border: "#0891b2", bg: "rgba(8, 145, 178, 0.1)" },      // Cyan
    { border: "#dc2626", bg: "rgba(220, 38, 38, 0.1)" },      // Dark Red
    { border: "#7c3aed", bg: "rgba(124, 58, 237, 0.1)" },     // Violet
    { border: "#ea580c", bg: "rgba(234, 88, 12, 0.1)" },      // Deep Orange
    { border: "#0d9488", bg: "rgba(13, 148, 136, 0.1)" }      // Teal
  ];

  useEffect(() => {
    fetchData();
  }, [monthFilter, selectedPosition]);

  // Initialize selected scouts to all scouts if empty
  useEffect(() => {
    if (data && selectedScouts.length === 0) {
      const allScouts = (data.monthly_reports_timeline?.datasets || []).map(ds => ds.label);
      if (allScouts.length > 0) {
        setSelectedScouts(allScouts);
      }
    }
  }, [data]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (monthFilter) params.months = monthFilter;
      if (selectedPosition) params.position = selectedPosition;

      const response = await axiosInstance.get("/analytics/scouts", { params });
      setData(response.data);
    } catch (error) {
      console.error("Error fetching scout analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-5">No data available</div>;
  }

  // Prepare timeline data with color coding for each scout
  const timelineLabels = data.monthly_reports_timeline?.labels || [];

  // Get all available scout names from the timeline
  const allScouts = (data.monthly_reports_timeline?.datasets || []).map(ds => ds.label);

  // Filter datasets based on selected scouts
  const filteredDatasets = (data.monthly_reports_timeline?.datasets || [])
    .filter(ds => selectedScouts.includes(ds.label))
    .map((ds, index) => {
      // Get original index to maintain consistent colors
      const originalIndex = allScouts.indexOf(ds.label);
      const colorSet = scoutColors[originalIndex % scoutColors.length];

      return {
        label: ds.label || "",
        data: ds.data || [],
        borderColor: colorSet.border,
        backgroundColor: colorSet.bg
      };
    });

  const timelineDatasets = filteredDatasets;

  // Handle scout selection toggle
  const handleScoutToggle = (scoutName: string) => {
    if (selectedScouts.includes(scoutName)) {
      setSelectedScouts(selectedScouts.filter(s => s !== scoutName));
    } else {
      setSelectedScouts([...selectedScouts, scoutName]);
    }
  };

  // Select all / Deselect all
  const handleSelectAll = () => {
    setSelectedScouts(allScouts);
  };

  const handleDeselectAll = () => {
    setSelectedScouts([]);
  };

  // Position options (hardcoded common positions)
  const positionOptions = [
    "Goalkeeper",
    "Defender",
    "Midfielder",
    "Forward",
    "Centre Back",
    "Full Back",
    "Wing Back",
    "Defensive Midfielder",
    "Central Midfielder",
    "Attacking Midfielder",
    "Winger",
    "Striker"
  ];

  return (
    <div>
      {/* Filters Section at Top */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm">
            <Card.Body className="py-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap" style={{ gap: "1rem" }}>
                <div className="d-flex align-items-center" style={{ gap: "1rem" }}>
                  <span className="text-muted" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                    Filters:
                  </span>
                  <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Time Period:</span>
                    <ButtonGroup size="sm">
                      <Button
                        variant={monthFilter === 3 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(3)}
                        style={{ minWidth: "45px" }}
                      >
                        3M
                      </Button>
                      <Button
                        variant={monthFilter === 6 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(6)}
                        style={{ minWidth: "45px" }}
                      >
                        6M
                      </Button>
                      <Button
                        variant={monthFilter === 9 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(9)}
                        style={{ minWidth: "45px" }}
                      >
                        9M
                      </Button>
                      <Button
                        variant={monthFilter === 12 ? 'dark' : 'outline-secondary'}
                        onClick={() => setMonthFilter(12)}
                        style={{ minWidth: "45px" }}
                      >
                        12M
                      </Button>
                    </ButtonGroup>
                  </div>
                  <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Position:</span>
                    <Form.Select
                      value={selectedPosition}
                      onChange={(e) => setSelectedPosition(e.target.value)}
                      size="sm"
                      style={{ width: "180px" }}
                    >
                      <option value="">All Positions</option>
                      {positionOptions.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                </div>
                <OverlayTrigger
                  placement="left"
                  overlay={
                    <Tooltip id="filters-tooltip">
                      Filters apply to: Scout Activity Timeline and Scout Performance Metrics table
                    </Tooltip>
                  }
                >
                  <span
                    className="badge bg-light text-dark"
                    style={{ cursor: 'help', fontSize: "0.75rem", padding: "0.4rem 0.6rem" }}
                  >
                    ℹ️ Filter Info
                  </span>
                </OverlayTrigger>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Scout Activity Timeline */}
      <Row className="mb-4">
        <Col>
          <Card className="mb-3 shadow-sm">
            <Card.Body className="py-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap" style={{ gap: "1rem" }}>
                <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Scout Filter:</span>
                  <Button
                    size="sm"
                    variant="outline-dark"
                    onClick={handleSelectAll}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={handleDeselectAll}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
                  {allScouts.map((scoutName, index) => {
                    const colorSet = scoutColors[index % scoutColors.length];
                    const isSelected = selectedScouts.includes(scoutName);
                    return (
                      <Button
                        key={scoutName}
                        size="sm"
                        variant={isSelected ? "dark" : "outline-secondary"}
                        onClick={() => handleScoutToggle(scoutName)}
                        style={{
                          fontSize: "0.75rem",
                          borderColor: isSelected ? colorSet.border : undefined,
                          backgroundColor: isSelected ? colorSet.border : undefined,
                          color: isSelected ? "#ffffff" : undefined,
                          fontWeight: isSelected ? 600 : 400
                        }}
                      >
                        {scoutName}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </Card.Body>
          </Card>
          <SimpleLineChart
            title="Scout Activity Timeline"
            labels={timelineLabels}
            datasets={timelineDatasets}
            height={500}
          />
        </Col>
      </Row>

      {/* Combined Totals and Averages Table */}
      {(data.scout_stats || []).length > 0 && (
        <Row className="mb-4">
          <Col>
            <Card className="shadow-sm" style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <Card.Header style={{ backgroundColor: '#212529', borderBottom: '2px solid #b91c1c', padding: '1rem 1.25rem' }}>
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0" style={{ color: '#ffffff', fontWeight: 600 }}>Combined Scout Statistics</h5>
                  <div className="d-flex gap-2">
                    {(data.scout_stats || []).map((scout) => (
                      <Button
                        key={scout.scout_name}
                        size="sm"
                        variant={comparisonScouts.includes(scout.scout_name) ? "light" : "outline-light"}
                        onClick={() => {
                          if (comparisonScouts.includes(scout.scout_name)) {
                            setComparisonScouts(comparisonScouts.filter(s => s !== scout.scout_name));
                          } else {
                            setComparisonScouts([...comparisonScouts, scout.scout_name]);
                          }
                        }}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {scout.scout_name}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card.Header>
              <Card.Body className="p-0">
                <div className="table-responsive">
                  <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: 'center' }}>
                    <thead className="table-dark">
                      <tr>
                        <th>Scout</th>
                        <th>Total Reports</th>
                        <th>Assessments</th>
                        <th>Flags</th>
                        <th>Live</th>
                        <th>Video</th>
                        <th>Unique Players</th>
                        <th>Fixtures</th>
                        <th>Avg Performance</th>
                        <th>Avg Attribute</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(comparisonScouts.length > 0
                        ? data.scout_stats.filter(s => comparisonScouts.includes(s.scout_name))
                        : data.scout_stats
                      ).map((scout, idx) => (
                        <tr key={idx}>
                          <td><strong>{scout.scout_name}</strong></td>
                          <td><span className="badge bg-dark">{scout.total_reports}</span></td>
                          <td>{scout.player_assessments}</td>
                          <td>{scout.flags}</td>
                          <td><span className="badge bg-success">{scout.live_reports}</span></td>
                          <td><span className="badge bg-info">{scout.video_reports}</span></td>
                          <td>{scout.unique_players_reported_on}</td>
                          <td>{scout.games_fixtures_covered}</td>
                          <td><span className="badge bg-secondary">{(scout.avg_performance_given ?? 0).toFixed(2)}</span></td>
                          <td><span className="badge bg-secondary">{(scout.avg_attribute_given ?? 0).toFixed(1)}</span></td>
                        </tr>
                      ))}
                      {/* Totals Row */}
                      {(comparisonScouts.length === 0) && (
                        <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 600 }}>
                          <td><strong>TOTAL</strong></td>
                          <td><span className="badge bg-dark">{data.scout_stats.reduce((sum, s) => sum + s.total_reports, 0)}</span></td>
                          <td>{data.scout_stats.reduce((sum, s) => sum + s.player_assessments, 0)}</td>
                          <td>{data.scout_stats.reduce((sum, s) => sum + s.flags, 0)}</td>
                          <td><span className="badge bg-success">{data.scout_stats.reduce((sum, s) => sum + s.live_reports, 0)}</span></td>
                          <td><span className="badge bg-info">{data.scout_stats.reduce((sum, s) => sum + s.video_reports, 0)}</span></td>
                          <td>{data.scout_stats.reduce((sum, s) => sum + s.unique_players_reported_on, 0)}</td>
                          <td>{data.scout_stats.reduce((sum, s) => sum + s.games_fixtures_covered, 0)}</td>
                          <td><span className="badge bg-secondary">{(data.scout_stats.reduce((sum, s) => sum + (s.avg_performance_given ?? 0), 0) / data.scout_stats.length).toFixed(2)}</span></td>
                          <td><span className="badge bg-secondary">{(data.scout_stats.reduce((sum, s) => sum + (s.avg_attribute_given ?? 0), 0) / data.scout_stats.length).toFixed(1)}</span></td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}


      <style>{`
        .table-compact td, .table-compact th {
          padding: 0.5rem;
          font-size: 0.9rem;
        }

        .badge {
          font-size: 0.85rem;
          padding: 0.4rem 0.6rem;
          font-weight: 500;
        }

        .shadow-sm {
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
          border-radius: 8px;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default ScoutAnalyticsTab;
