import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Form, Card, Table, Button, ButtonGroup, OverlayTrigger, Tooltip } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../axiosInstance";
import SimpleStatsCard from "./SimpleStatsCard";
import SimpleLineChart from "./SimpleLineChart";
import SimpleBarChart from "./SimpleBarChart";
import { getPlayerProfilePathFromSource } from "../../utils/playerNavigation";
import { getPerformanceScoreColor, getAttributeScoreColor } from "../../utils/colorUtils";

interface PlayerAnalytics {
  total_player_assessments: number;
  total_all_reports: number;
  total_flag_reports: number;
  avg_performance_score: number;
  unique_players_assessed: number;
  monthly_reports_timeline: Array<{
    month: string;
    assessments: number;
    flags: number;
    total: number;
  }>;
  reports_by_position: Array<{
    position: string;
    assessments: number;
    flags: number;
    total: number;
  }>;
  top_players_by_performance: Array<{
    player_name: string;
    position: string;
    avg_performance_score: number;
    report_count: number;
    player_id: number;
    data_source: string;
  }>;
  top_players_by_attributes: Array<{
    player_name: string;
    position: string;
    avg_attribute_score: number;
    report_count: number;
    player_id: number;
    data_source: string;
  }>;
  positive_flagged_players: Array<{
    player_name: string;
    position: string;
    flag_count: number;
    most_recent_flag: string | null;
    player_id: number;
    data_source: string;
  }>;
}

interface PlayerByScore {
  player_name: string;
  position: string;
  avg_performance_score: number;
  avg_attribute_score: number;
  report_count: number;
  most_recent_report_id: number;
  player_id: number;
  data_source: string;
  latest_scout_name: string;
}

const PlayerAnalyticsTab: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PlayerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<number>(6);
  const [selectedPosition, setSelectedPosition] = useState<string>("");

  // Score threshold filters
  const [minPerformance, setMinPerformance] = useState<string>("");
  const [maxPerformance, setMaxPerformance] = useState<string>("");
  const [minAttribute, setMinAttribute] = useState<string>("");
  const [maxAttribute, setMaxAttribute] = useState<string>("");
  const [scoreFilteredPlayers, setScoreFilteredPlayers] = useState<PlayerByScore[]>([]);
  const [loadingScoreFilter, setLoadingScoreFilter] = useState(false);

  useEffect(() => {
    fetchData();
  }, [monthFilter, selectedPosition]);

  useEffect(() => {
    fetchScoreFilteredPlayers();
  }, [minPerformance, maxPerformance, minAttribute, maxAttribute, monthFilter, selectedPosition]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (monthFilter) params.months = monthFilter;
      if (selectedPosition) params.position = selectedPosition;

      const response = await axiosInstance.get("/analytics/players", { params });
      setData(response.data);
    } catch (error) {
      console.error("Error fetching player analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScoreFilteredPlayers = async () => {
    // Only fetch if at least one filter is set
    if (!minPerformance && !maxPerformance && !minAttribute && !maxAttribute) {
      setScoreFilteredPlayers([]);
      return;
    }

    try {
      setLoadingScoreFilter(true);
      const params: any = {};
      if (monthFilter) params.months = monthFilter;
      if (selectedPosition) params.position = selectedPosition;
      if (minPerformance) params.min_performance = parseFloat(minPerformance);
      if (maxPerformance) params.max_performance = parseFloat(maxPerformance);
      if (minAttribute) params.min_attribute = parseFloat(minAttribute);
      if (maxAttribute) params.max_attribute = parseFloat(maxAttribute);

      const response = await axiosInstance.get("/analytics/players/by-score", { params });
      setScoreFilteredPlayers(response.data.players || []);
    } catch (error) {
      console.error("Error fetching score filtered players:", error);
      setScoreFilteredPlayers([]);
    } finally {
      setLoadingScoreFilter(false);
    }
  };

  const handleOpenReportModal = async (reportId: number) => {
    try {
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      // You would need to implement a modal here or navigate to the report
      console.log("Report data:", response.data);
    } catch (error) {
      console.error("Error fetching report:", error);
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

  // Position ordering from scouting assessment template
  const POSITION_ORDER = [
    "GK",
    "RB",
    "RWB",
    "RCB(3)",
    "RCB(2)",
    "CCB(3)",
    "LCB(2)",
    "LCB(3)",
    "LWB",
    "LB",
    "DM",
    "CM",
    "RAM",
    "AM",
    "LAM",
    "RW",
    "LW",
    "Target Man CF",
    "In Behind CF"
  ];

  // Prepare position options
  const positionOptions = Array.from(
    new Set((data.reports_by_position || []).map((r) => r.position).filter(Boolean))
  ).sort((a, b) => {
    const indexA = POSITION_ORDER.indexOf(a);
    const indexB = POSITION_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  // Prepare timeline data
  const timelineLabels = (data.monthly_reports_timeline || []).map((d) => d.month || "");
  const timelineDatasets = [
    {
      label: "Assessments",
      data: (data.monthly_reports_timeline || []).map((d) => d.assessments || 0),
      borderColor: "#28a745",
      backgroundColor: "rgba(40, 167, 69, 0.1)"
    },
    {
      label: "Flags",
      data: (data.monthly_reports_timeline || []).map((d) => d.flags || 0),
      borderColor: "#e31e24",
      backgroundColor: "rgba(227, 30, 36, 0.1)"
    }
  ];

  // Prepare reports by position chart with proper ordering
  const sortedPositionReports = [...(data.reports_by_position || [])].sort((a, b) => {
    const indexA = POSITION_ORDER.indexOf(a.position);
    const indexB = POSITION_ORDER.indexOf(b.position);
    if (indexA === -1 && indexB === -1) return (a.position || "").localeCompare(b.position || "");
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  const positionLabels = sortedPositionReports.map((r) => r.position || "Unknown");
  const positionData = sortedPositionReports.map((r) => r.total || 0);

  // Handle player row click
  const handlePlayerClick = (playerId: number, dataSource: string) => {
    const path = getPlayerProfilePathFromSource(dataSource, playerId);
    navigate(path);
  };

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
                      These filters apply to: Summary Stats, Monthly Timeline, Top Players, and Flagged Players
                      <br /><br />
                      <strong>Note:</strong> Reports by Position chart is not affected
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

      {/* Summary Stats */}
      <Row className="mb-4">
        <Col md={3}>
          <SimpleStatsCard
            title="Total Reports"
            value={data.total_all_reports ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Assessments"
            value={data.total_player_assessments ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Flags"
            value={data.total_flag_reports ?? 0}
          />
        </Col>
        <Col md={3}>
          <SimpleStatsCard
            title="Unique Players"
            value={data.unique_players_assessed ?? 0}
          />
        </Col>
      </Row>

      {/* Monthly Timeline and Reports by Position - Side by Side */}
      <Row className="mb-4">
        <Col md={7}>
          <SimpleLineChart
            title="Monthly Reports Timeline"
            labels={timelineLabels}
            datasets={timelineDatasets}
            height={400}
          />
        </Col>
        <Col md={5}>
          <SimpleBarChart
            title="Reports by Position"
            labels={positionLabels}
            data={positionData}
            height={400}
          />
        </Col>
      </Row>

      {/* Top Players by Performance, Attributes, and Positive Flagged - 3 Columns */}
      <Row className="mb-4">
        <Col md={4}>
          <Card style={{ height: "500px", display: "flex", flexDirection: "column" }}>
            <Card.Header style={{ backgroundColor: "#000000" }} className="text-white">
              <h6 className="mb-0">🏆 Top Players by Performance</h6>
            </Card.Header>
            <Card.Body className="p-0" style={{ flex: 1, overflow: "auto" }}>
              <div className="table-responsive">
                <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: "center" }}>
                  <thead className="table-dark">
                    <tr>
                      <th>Player</th>
                      <th>Position</th>
                      <th>Avg Score</th>
                      <th>Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.top_players_by_performance || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          {selectedPosition ? "No players found for selected position" : "No data available"}
                        </td>
                      </tr>
                    ) : (
                      (data.top_players_by_performance || []).map((player, idx) => (
                        <tr
                          key={idx}
                          onClick={() => handlePlayerClick(player.player_id, player.data_source)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>{player.player_name}</td>
                          <td>{player.position}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: getPerformanceScoreColor(player.avg_performance_score),
                                color: "white",
                                fontWeight: "bold"
                              }}
                            >
                              {player.avg_performance_score.toFixed(2)}
                            </span>
                          </td>
                          <td>{player.report_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card style={{ height: "500px", display: "flex", flexDirection: "column" }}>
            <Card.Header style={{ backgroundColor: "#000000" }} className="text-white">
              <h6 className="mb-0">📊 Top Players by Attributes</h6>
            </Card.Header>
            <Card.Body className="p-0" style={{ flex: 1, overflow: "auto" }}>
              <div className="table-responsive">
                <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: "center" }}>
                  <thead className="table-dark">
                    <tr>
                      <th>Player</th>
                      <th>Position</th>
                      <th>Avg Score</th>
                      <th>Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.top_players_by_attributes || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          {selectedPosition ? "No players found for selected position" : "No data available"}
                        </td>
                      </tr>
                    ) : (
                      (data.top_players_by_attributes || []).map((player, idx) => (
                        <tr
                          key={idx}
                          onClick={() => handlePlayerClick(player.player_id, player.data_source)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>{player.player_name}</td>
                          <td>{player.position}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: getAttributeScoreColor(player.avg_attribute_score),
                                color: "white",
                                fontWeight: "bold"
                              }}
                            >
                              {player.avg_attribute_score.toFixed(2)}
                            </span>
                          </td>
                          <td>{player.report_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card style={{ height: "500px", display: "flex", flexDirection: "column" }}>
            <Card.Header style={{ backgroundColor: "#000000" }} className="text-white">
              <h6 className="mb-0">⭐ Positive Flagged Players</h6>
            </Card.Header>
            <Card.Body className="p-0" style={{ flex: 1, overflow: "auto" }}>
              <div className="table-responsive">
                <Table hover striped className="table-compact table-sm mb-0" style={{ textAlign: "center" }}>
                  <thead className="table-dark">
                    <tr>
                      <th>Player</th>
                      <th>Position</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.positive_flagged_players || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-muted">No positive flagged players</td>
                      </tr>
                    ) : (
                      (data.positive_flagged_players || []).map((player, idx) => (
                        <tr
                          key={idx}
                          onClick={() => handlePlayerClick(player.player_id, player.data_source)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>{player.player_name}</td>
                          <td>{player.position}</td>
                          <td><span className="badge bg-success">{player.flag_count}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Score Threshold Filter Section */}
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header style={{ backgroundColor: "#000000" }} className="text-white">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0">🎯 Filter Players by Score Thresholds</h6>
                {scoreFilteredPlayers.length > 0 && (
                  <span className="badge bg-light text-dark">
                    {scoreFilteredPlayers.length} {scoreFilteredPlayers.length === 1 ? 'Player' : 'Players'} Found
                  </span>
                )}
              </div>
            </Card.Header>
            <Card.Body>
              <Row className="mb-3">
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Min Performance Score</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={minPerformance}
                      onChange={(e) => setMinPerformance(e.target.value)}
                      placeholder="e.g., 7"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Max Performance Score</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={maxPerformance}
                      onChange={(e) => setMaxPerformance(e.target.value)}
                      placeholder="e.g., 10"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Min Attribute Score</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={minAttribute}
                      onChange={(e) => setMinAttribute(e.target.value)}
                      placeholder="e.g., 60"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Max Attribute Score</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={maxAttribute}
                      onChange={(e) => setMaxAttribute(e.target.value)}
                      placeholder="e.g., 100"
                    />
                  </Form.Group>
                </Col>
              </Row>

              {loadingScoreFilter ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : scoreFilteredPlayers.length > 0 ? (
                <div className="table-responsive">
                  <Table hover striped className="table-compact table-sm" style={{ textAlign: "center" }}>
                    <thead className="table-dark">
                      <tr>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Avg Performance</th>
                        <th>Avg Attribute</th>
                        <th>Reports</th>
                        <th>Scout</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreFilteredPlayers.map((player, idx) => (
                        <tr key={idx}>
                          <td>
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none"
                              onClick={() => handlePlayerClick(player.player_id, player.data_source)}
                            >
                              {player.player_name}
                            </Button>
                          </td>
                          <td>{player.position}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: getPerformanceScoreColor(player.avg_performance_score),
                                color: "white",
                                fontWeight: "bold"
                              }}
                            >
                              {player.avg_performance_score.toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: getAttributeScoreColor(player.avg_attribute_score),
                                color: "white",
                                fontWeight: "bold"
                              }}
                            >
                              {player.avg_attribute_score.toFixed(1)}
                            </span>
                          </td>
                          <td>{player.report_count}</td>
                          <td>{player.latest_scout_name}</td>
                          <td>
                            <Button
                              size="sm"
                              onClick={() => handleOpenReportModal(player.most_recent_report_id)}
                              title="View Report"
                              className="btn-action-circle btn-action-view"
                            >
                              👁️
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted text-center mb-0">
                  {minPerformance || maxPerformance || minAttribute || maxAttribute
                    ? "No players match the selected score thresholds"
                    : "Set score thresholds above to filter players"}
                </p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <style>{`
        .table-compact td, .table-compact th {
          padding: 0.5rem;
          font-size: 0.9rem;
        }
        .btn-action-circle {
          width: 32px;
          height: 32px;
          padding: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background-color: #f8f9fa;
          transition: all 0.2s;
        }
        .btn-action-view:hover {
          background-color: #007bff;
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};

export default PlayerAnalyticsTab;
