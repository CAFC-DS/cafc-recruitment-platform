import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ButtonGroup,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Pagination,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import AddPlayerToListModal from "../components/AddPlayerToListModal";
import ScoutingAssessmentModal from "../components/ScoutingAssessmentModal";
import SimpleBarChart from "../components/analytics/SimpleBarChart";
import SimpleLineChart from "../components/analytics/SimpleLineChart";
import SimpleStatsCard from "../components/analytics/SimpleStatsCard";
import PlayerReportModal from "../components/PlayerReportModal";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  PersonalAnalyticsReportRow,
  PersonalAnalyticsReportSortBy,
  PersonalAnalyticsReportsResponse,
  PersonalAnalyticsResponse,
} from "../types/PersonalAnalytics";
import {
  getAttributeScoreColor,
  getFlagColor,
  getGradeColor,
  getPerformanceScoreColor,
} from "../utils/colorUtils";
import { Player } from "../types/Player";
import { getPlayerProfilePath, getPlayerProfilePathFromSource } from "../utils/playerNavigation";

const REPORTS_PAGE_SIZE = 20;

const PersonalAnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: currentUserLoading, canAccessLists } = useCurrentUser();
  const [analytics, setAnalytics] = useState<PersonalAnalyticsResponse | null>(null);
  const [reportsData, setReportsData] =
    useState<PersonalAnalyticsReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [error, setError] = useState("");
  const [months, setMonths] = useState<number>(6);
  const [position, setPosition] = useState("");
  const [reportOffset, setReportOffset] = useState(0);
  const [reportSortBy, setReportSortBy] =
    useState<PersonalAnalyticsReportSortBy>("created_at");
  const [reportSortDirection, setReportSortDirection] = useState<"asc" | "desc">(
    "desc",
  );
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [selectedPlayerForList, setSelectedPlayerForList] = useState<{
    id: number;
    name: string;
    universalId?: string;
  } | null>(null);

  useEffect(() => {
    setReportOffset(0);
  }, [months, position]);

  useEffect(() => {
    fetchAnalytics();
  }, [months, position]);

  useEffect(() => {
    fetchReports();
  }, [months, position, reportOffset, reportSortBy, reportSortDirection]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await axiosInstance.get("/users/me/analytics", {
        params: {
          months,
          position: position || undefined,
        },
      });
      setAnalytics(response.data);
    } catch (fetchError) {
      console.error("Error fetching personal analytics:", fetchError);
      setError("Failed to load personal analytics.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      setReportsLoading(true);
      const response = await axiosInstance.get("/users/me/reports", {
        params: {
          months,
          position: position || undefined,
          limit: REPORTS_PAGE_SIZE,
          offset: reportOffset,
          sort_by: reportSortBy,
          sort_direction: reportSortDirection,
        },
      });
      setReportsData(response.data);
    } catch (fetchError) {
      console.error("Error fetching personal reports:", fetchError);
    } finally {
      setReportsLoading(false);
    }
  };

  const handlePlayerClick = (playerId: number, dataSource: string) => {
    navigate(getPlayerProfilePathFromSource(dataSource, playerId));
  };

  const handleSortChange = (column: PersonalAnalyticsReportSortBy) => {
    setReportOffset(0);
    setReportSortBy((currentColumn) => {
      if (currentColumn === column) {
        setReportSortDirection((currentDirection) =>
          currentDirection === "asc" ? "desc" : "asc",
        );
        return currentColumn;
      }
      setReportSortDirection(column === "player_name" ? "asc" : "desc");
      return column;
    });
  };

  const handleOpenReportModal = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
      axiosInstance.post(`/scout_reports/${reportId}/mark-viewed`).catch(() => null);
      setReportsData((current) => {
        if (!current) return current;
        return {
          ...current,
          reports: current.reports.map((report) =>
            report.report_id === reportId
              ? { ...report, has_been_viewed: true }
              : report,
          ),
        };
      });
    } catch (fetchError) {
      console.error("Error fetching report details:", fetchError);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleEditReport = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(`/scout_reports/details/${reportId}`);
      setEditReportData(response.data);
      setEditReportId(reportId);
      setSelectedPlayer({
        player_id: response.data.player_id,
        player_name: response.data.player_name,
        universal_id: response.data.player_id,
      } as Player);
      setEditMode(true);
      setShowAssessmentModal(true);
    } catch (fetchError) {
      console.error("Error fetching report for edit:", fetchError);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDeleteReport = (reportId: number) => {
    setDeleteReportId(reportId);
    setShowDeleteModal(true);
  };

  const confirmDeleteReport = async () => {
    if (!deleteReportId) return;

    try {
      setDeleteLoading(true);
      await axiosInstance.delete(`/scout_reports/${deleteReportId}`);
      setShowDeleteModal(false);
      setDeleteReportId(null);
      await Promise.all([fetchAnalytics(), fetchReports()]);
    } catch (deleteError) {
      console.error("Error deleting report:", deleteError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAssessmentModalHide = () => {
    setShowAssessmentModal(false);
    setEditMode(false);
    setEditReportId(null);
    setEditReportData(null);
  };

  const handleAddToList = (report: PersonalAnalyticsReportRow) => {
    setSelectedPlayerForList({
      id: report.player_id,
      name: report.player_name,
      universalId: report.universal_id,
    });
    setShowAddToListModal(true);
  };

  const timelineLabels = analytics?.monthly_reports_timeline.map((point) => point.month) || [];
  const timelineDatasets = [
    {
      label: "Assessments",
      data:
        analytics?.monthly_reports_timeline.map((point) => point.assessments) || [],
      borderColor: "#15803d",
      backgroundColor: "rgba(21, 128, 61, 0.10)",
    },
    {
      label: "Flags",
      data: analytics?.monthly_reports_timeline.map((point) => point.flags) || [],
      borderColor: "#b42318",
      backgroundColor: "rgba(180, 35, 24, 0.10)",
    },
  ];

  const positionLabels = analytics?.reports_by_position.map((item) => item.position) || [];
  const positionData = analytics?.reports_by_position.map((item) => item.total) || [];

  const totalPages = useMemo(() => {
    if (!reportsData?.total) {
      return 1;
    }
    return Math.max(1, Math.ceil(reportsData.total / reportsData.limit));
  }, [reportsData]);

  const currentPage = useMemo(() => {
    if (!reportsData?.limit) {
      return 1;
    }
    return Math.floor(reportOffset / reportsData.limit) + 1;
  }, [reportOffset, reportsData]);

  const renderSortIndicator = (column: PersonalAnalyticsReportSortBy) => {
    if (reportSortBy !== column) {
      return "↕";
    }
    return reportSortDirection === "asc" ? "▲" : "▼";
  };

  const renderSortButton = (label: string, column: PersonalAnalyticsReportSortBy) => (
    <button
      type="button"
      className="personal-analytics-sort-button"
      onClick={() => handleSortChange(column)}
    >
      <span>{label}</span>
      <span className="personal-analytics-sort-indicator">
        {renderSortIndicator(column)}
      </span>
    </button>
  );

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString();
  };

  const formatScore = (value: number | null) => {
    if (value == null) return "—";
    return value.toFixed(2);
  };

  const getFlagBadge = (report: PersonalAnalyticsReportRow) => {
    if (report.is_archived && report.flag_category) {
      return (
        <span
          className="badge-grade"
          style={{
            backgroundColor: getGradeColor(report.flag_category),
            color: "white",
            fontSize: "0.8rem",
            padding: "4px 8px",
            fontWeight: "500",
          }}
          title={`Grade: ${report.flag_category}`}
        >
          {report.flag_category}
        </span>
      );
    }

    const flagColor = getFlagColor(report.flag_category || "");
    return (
      <span
        className="badge"
        style={{
          backgroundColor: flagColor,
          color: "white",
          border: "none",
          cursor: "pointer",
          fontWeight: "500",
        }}
        title={`Flag: ${report.flag_category || "Unknown"}`}
      >
        🏳️
      </span>
    );
  };

  const getReportTypeBadge = (report: PersonalAnalyticsReportRow) => {
    if (report.is_archived) {
      return null;
    }

    switch ((report.report_type || "").toLowerCase()) {
      case "flag":
      case "flag assessment":
        return getFlagBadge(report);
      case "clips":
        return <span className="badge badge-neutral-grey">Clips</span>;
      case "player assessment":
      case "player":
        return null;
      default:
        return <span className="badge badge-neutral-grey">{report.report_type}</span>;
    }
  };

  const getScoutingTypeBadge = (scoutingType: string | null) => {
    if (!scoutingType) return null;
    const icon = scoutingType.toLowerCase() === "live" ? "🏟️" : "💻";
    return (
      <span
        className="badge badge-neutral-grey"
        style={{ cursor: "pointer", fontSize: "16px" }}
        title={`Scouting Type: ${scoutingType}`}
      >
        {icon}
      </span>
    );
  };

  if (currentUserLoading || loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  const hasAnyData =
    (analytics?.summary.total_all_reports || 0) > 0 ||
    (analytics?.monthly_reports_timeline.length || 0) > 0;

  return (
    <Container className="mt-4 mb-5 personal-analytics-page">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="mb-1">Personal Analytics</h2>
          <p className="text-muted mb-0">
            {user?.firstname || user?.lastname
              ? `${user.firstname || ""} ${user.lastname || ""}`.trim()
              : user?.username || "Your"}{" "}
            scouting activity, player flags, and report history.
          </p>
        </div>
        <span
          className="badge"
          style={{ backgroundColor: "#6b7280", color: "white", padding: "0.5rem 0.85rem" }}
        >
          Self-serve scouting view
        </span>
      </div>

      <Card className="shadow-sm mb-4">
        <Card.Body className="py-3">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div className="d-flex align-items-center flex-wrap gap-3">
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small fw-semibold">Time Period</span>
                <ButtonGroup size="sm">
                  {[3, 6, 9, 12].map((value) => (
                    <Button
                      key={value}
                      variant={months === value ? "dark" : "outline-secondary"}
                      onClick={() => setMonths(value)}
                    >
                      {value}M
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small fw-semibold">Position</span>
                <Form.Select
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  size="sm"
                  style={{ width: "220px" }}
                >
                  <option value="">All Positions</option>
                  {(analytics?.position_options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Form.Select>
              </div>
            </div>
            <small className="text-muted">
              Filters apply to all widgets and your report table.
            </small>
          </div>
        </Card.Body>
      </Card>

      {!hasAnyData ? (
        <Card className="shadow-sm">
          <Card.Body className="py-5 text-center text-muted">
            There is no personal analytics data yet.
          </Card.Body>
        </Card>
      ) : (
        <>
          <Row className="mb-4 g-3 row-cols-1 row-cols-md-2 row-cols-xl-5">
            <Col>
              <SimpleStatsCard
                title="Total Reports"
                value={analytics?.summary.total_all_reports || 0}
              />
            </Col>
            <Col>
              <SimpleStatsCard
                title="Assessments"
                value={analytics?.summary.total_player_assessments || 0}
              />
            </Col>
            <Col>
              <SimpleStatsCard
                title="Flags"
                value={analytics?.summary.total_flag_reports || 0}
              />
            </Col>
            <Col>
              <SimpleStatsCard
                title="Unique Players"
                value={analytics?.summary.unique_players_assessed || 0}
              />
            </Col>
            <Col>
              <Card className="stat-card h-100">
                <Card.Body>
                  <div className="d-flex flex-column align-items-center justify-content-center text-center h-100">
                    <div className="text-muted small mb-2">Average Performance</div>
                    <div>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: getPerformanceScoreColor(
                              analytics?.summary.avg_performance_score || 0,
                            ),
                            color: "white",
                            fontWeight: 700,
                            fontSize: "1rem",
                            padding: "0.5rem 0.85rem",
                          }}
                        >
                          {formatScore(analytics?.summary.avg_performance_score || 0)}
                        </span>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="mb-4">
            <Col lg={7} className="mb-4 mb-lg-0">
              <SimpleLineChart
                title="Monthly Reports Timeline"
                labels={timelineLabels}
                datasets={timelineDatasets}
                height={380}
              />
            </Col>
            <Col lg={5}>
              <SimpleBarChart
                title="Reports by Position"
                labels={positionLabels}
                data={positionData}
                height={380}
              />
            </Col>
          </Row>

          <Row className="mb-4">
            <Col lg={4} className="mb-4 mb-lg-0">
              <Card className="shadow-sm personal-analytics-panel">
                <Card.Header className="personal-analytics-panel-header">
                  <h6 className="mb-0">
                    Top Players by Performance (
                    {analytics?.top_players_by_performance.length || 0})
                  </h6>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table hover striped responsive className="mb-0 table-sm">
                    <thead className="table-dark">
                      <tr>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Avg Score</th>
                        <th>Reports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.top_players_by_performance || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center text-muted py-3">
                            No performance data.
                          </td>
                        </tr>
                      ) : (
                        analytics?.top_players_by_performance.map((player) => (
                          <tr
                            key={`${player.player_id}-${player.position}`}
                            onClick={() =>
                              handlePlayerClick(player.player_id, player.data_source)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <td>{player.player_name}</td>
                            <td>{player.position}</td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: getPerformanceScoreColor(
                                    player.avg_performance_score,
                                  ),
                                  color: "white",
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
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4} className="mb-4 mb-lg-0">
              <Card className="shadow-sm personal-analytics-panel">
                <Card.Header className="personal-analytics-panel-header">
                  <h6 className="mb-0">
                    Top Players by Attribute (
                    {analytics?.top_players_by_attributes.length || 0})
                  </h6>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table hover striped responsive className="mb-0 table-sm">
                    <thead className="table-dark">
                      <tr>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Avg Score</th>
                        <th>Reports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.top_players_by_attributes || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center text-muted py-3">
                            No attribute data.
                          </td>
                        </tr>
                      ) : (
                        analytics?.top_players_by_attributes.map((player) => (
                          <tr
                            key={`${player.player_id}-${player.position}`}
                            onClick={() =>
                              handlePlayerClick(player.player_id, player.data_source)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <td>{player.player_name}</td>
                            <td>{player.position}</td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: getAttributeScoreColor(
                                    player.avg_attribute_score,
                                  ),
                                  color: "white",
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
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="shadow-sm personal-analytics-panel">
                <Card.Header className="personal-analytics-panel-header">
                  <h6 className="mb-0">
                    Positive Flagged Players (
                    {analytics?.positive_flagged_players.length || 0} of{" "}
                    {analytics?.total_positive_flagged_count || 0})
                  </h6>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table hover striped responsive className="mb-0 table-sm">
                    <thead className="table-dark">
                      <tr>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.positive_flagged_players || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center text-muted py-3">
                            No positive flagged players.
                          </td>
                        </tr>
                      ) : (
                        analytics?.positive_flagged_players.map((player) => (
                          <tr
                            key={`${player.player_id}-${player.position}`}
                            onClick={() =>
                              handlePlayerClick(player.player_id, player.data_source)
                            }
                            style={{ cursor: "pointer" }}
                          >
                            <td>{player.player_name}</td>
                            <td>{player.position}</td>
                            <td>
                              <span className="badge bg-success">
                                {player.flag_count}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Card className="shadow-sm">
            <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h5 className="mb-0">My Reports</h5>
                <small className="text-muted">
                  {reportsData?.total || analytics?.my_reports_total || 0} total reports
                </small>
              </div>
              <small className="text-muted">
                Click a row to open the full report.
              </small>
            </Card.Header>
            <Card.Body className="p-0">
              {reportsLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading reports...
                </div>
              ) : (
                <div className="table-responsive personal-analytics-reports-shell">
                  <Table
                    responsive
                    hover
                    striped
                    className="table-compact table-sm mb-0 align-middle personal-analytics-reports-table"
                    style={{ textAlign: "center" }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: "30px" }}></th>
                        <th>{renderSortButton("Report Date", "created_at")}</th>
                        <th>{renderSortButton("Player", "player_name")}</th>
                        <th>Age</th>
                        <th>{renderSortButton("Position", "position")}</th>
                        <th>Fixture Date</th>
                        <th>Fixture</th>
                        <th>{renderSortButton("Type", "report_type")}</th>
                        <th>{renderSortButton("Score", "performance_score")}</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportsData?.reports || []).length === 0 ? (
                        <tr>
                          <td colSpan={11} className="text-center text-muted py-4">
                            No reports found for the selected filters.
                          </td>
                        </tr>
                      ) : (
                        (reportsData?.reports || []).map(
                          (report: PersonalAnalyticsReportRow) => (
                            <tr
                              key={report.report_id}
                              style={{
                                cursor: "pointer",
                              }}
                            >
                              <td style={{ width: "30px", textAlign: "center", paddingRight: 0 }}>
                                {!report.has_been_viewed && (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: "8px",
                                      height: "8px",
                                      borderRadius: "50%",
                                      backgroundColor: "#0d6efd",
                                      boxShadow: "0 0 4px rgba(13, 110, 253, 0.4)",
                                    }}
                                    title="Unread"
                                  />
                                )}
                              </td>
                              <td>{formatDate(report.created_at)}</td>
                              <td>
                                <a
                                  href={getPlayerProfilePath(report as any)}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    navigate(getPlayerProfilePath(report as any));
                                  }}
                                  style={{
                                    textDecoration: "none",
                                    color: "#0d6efd",
                                    cursor: "pointer",
                                  }}
                                >
                                  {report.player_name}
                                </a>
                              </td>
                              <td>
                                <span className="age-text">{report.age || "N/A"}</span>
                              </td>
                              <td>
                                <span className="position-text">{report.position}</span>
                              </td>
                              <td>{formatDate(report.fixture_date)}</td>
                              <td>{report.fixture_details || "N/A"}</td>
                              <td>
                                <div className="d-flex justify-content-center align-items-center gap-1 flex-wrap">
                                  {getReportTypeBadge(report)}
                                  {report.scouting_type && (
                                    <span className="ms-1">
                                      {getScoutingTypeBadge(report.scouting_type)}
                                    </span>
                                  )}
                                  {report.is_archived && report.flag_category && (
                                    <span className="ms-1">
                                      <span
                                        className="badge-grade"
                                        style={{
                                          backgroundColor: getGradeColor(
                                            report.flag_category,
                                          ),
                                          color: "white",
                                          fontSize: "0.65rem",
                                          padding: "2px 6px",
                                          fontWeight: "500",
                                        }}
                                        title={`Grade: ${report.flag_category}`}
                                      >
                                        {report.flag_category}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="d-flex align-items-center justify-content-center gap-1">
                                  {report.performance_score != null ? (
                                    <span
                                      className={`badge ${
                                        report.performance_score === 9
                                          ? "performance-score-9"
                                          : report.performance_score === 10
                                            ? "performance-score-10"
                                            : ""
                                      }`}
                                      style={{
                                        backgroundColor: getPerformanceScoreColor(
                                          report.performance_score,
                                        ),
                                        color: "white !important",
                                        fontWeight: "bold",
                                        fontSize: "0.9rem",
                                        ...(report.performance_score !== 9 &&
                                        report.performance_score !== 10
                                          ? { border: "none" }
                                          : {}),
                                      }}
                                      title={
                                        report.is_potential
                                          ? "Potential Score"
                                          : undefined
                                      }
                                    >
                                      {report.performance_score}
                                      {report.is_potential && "*"}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="btn-group"
                                  style={{ justifyContent: "center" }}
                                >
                                  <Button
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenReportModal(report.report_id);
                                    }}
                                    disabled={loadingReportId === report.report_id}
                                    title="View Report"
                                    className="btn-action-circle btn-action-view"
                                  >
                                    {loadingReportId === report.report_id ? (
                                      <Spinner as="span" animation="border" size="sm" />
                                    ) : (
                                      "👁️"
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    title="Edit"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleEditReport(report.report_id);
                                    }}
                                    disabled={loadingReportId === report.report_id}
                                    className="btn-action-circle btn-action-edit"
                                  >
                                    {loadingReportId === report.report_id ? (
                                      <Spinner as="span" animation="border" size="sm" />
                                    ) : (
                                      "✏️"
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    title="Delete"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteReport(report.report_id);
                                    }}
                                    className="btn-action-circle btn-action-delete"
                                  >
                                    🗑️
                                  </Button>
                                  {canAccessLists && (
                                    <Button
                                      size="sm"
                                      title="Add to List"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleAddToList(report);
                                      }}
                                      className="btn-action-circle btn-action-primary"
                                    >
                                      📋
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ),
                        )
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
            <Card.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <small className="text-muted">
                Page {currentPage} of {totalPages}
              </small>
              <Pagination className="mb-0">
                <Pagination.Prev
                  disabled={currentPage <= 1}
                  onClick={() =>
                    setReportOffset(Math.max(0, reportOffset - REPORTS_PAGE_SIZE))
                  }
                />
                <Pagination.Next
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setReportOffset(reportOffset + REPORTS_PAGE_SIZE)
                  }
                />
              </Pagination>
            </Card.Footer>
          </Card>
        </>
      )}

      {selectedPlayerForList && (
        <AddPlayerToListModal
          show={showAddToListModal}
          onHide={() => {
            setShowAddToListModal(false);
            setSelectedPlayerForList(null);
          }}
          playerId={selectedPlayerForList.id}
          playerName={selectedPlayerForList.name}
          universalId={selectedPlayerForList.universalId}
        />
      )}

      <ScoutingAssessmentModal
        show={showAssessmentModal}
        onHide={handleAssessmentModalHide}
        selectedPlayer={selectedPlayer}
        onAssessmentSubmitSuccess={() => {
          fetchAnalytics();
          fetchReports();
        }}
        editMode={editMode}
        reportId={editReportId}
        existingReportData={editReportData}
      />

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000000", color: "white" }}
        >
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this scout report? This action cannot
          be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDeleteReport}
            disabled={deleteLoading}
          >
            {deleteLoading ? <Spinner animation="border" size="sm" /> : "Delete"}
          </Button>
        </Modal.Footer>
      </Modal>

      <PlayerReportModal
        show={showReportModal}
        onHide={() => {
          setShowReportModal(false);
          setSelectedReport(null);
        }}
        report={selectedReport}
      />

      {loadingReportId ? (
        <div className="personal-analytics-report-loading">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading report...
        </div>
      ) : null}

      <style>{`
        .personal-analytics-panel {
          height: 100%;
        }

        .personal-analytics-panel-header {
          background: #111827;
          color: white;
        }

        .personal-analytics-reports-shell {
          max-height: 720px;
          overflow: auto;
        }

        .personal-analytics-reports-table thead th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f8fafc;
          border-bottom: 1px solid #dbe3ee;
        }

        .personal-analytics-reports-table td,
        .personal-analytics-reports-table th {
          vertical-align: middle;
          white-space: nowrap;
        }

        .personal-analytics-sort-button {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem;
          width: 100%;
          background: transparent;
          border: none;
          padding: 0;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: inherit;
        }

        .personal-analytics-sort-indicator {
          font-size: 0.72rem;
          color: #667085;
        }

        .personal-analytics-report-loading {
          position: fixed;
          right: 20px;
          bottom: 20px;
          background: rgba(17, 24, 39, 0.92);
          color: white;
          padding: 0.75rem 1rem;
          border-radius: 999px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
          z-index: 1050;
        }
      `}</style>
    </Container>
  );
};

export default PersonalAnalyticsPage;
