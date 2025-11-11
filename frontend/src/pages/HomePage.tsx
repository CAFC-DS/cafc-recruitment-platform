import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Spinner,
  Alert,
  Form,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { useAuth } from "../App";
import { useCurrentUser } from "../hooks/useCurrentUser";
import PlayerReportModal from "../components/PlayerReportModal";
import {
  getPerformanceScoreColor,
  getAttributeScoreColor,
  getFlagColor,
  getGradeColor,
} from "../utils/colorUtils";
import { extractVSSScore } from "../utils/reportUtils";

interface ScoutReport {
  report_id: number;
  created_at: string;
  player_name: string;
  performance_score: number;
  attribute_score: number;
  report_type: string;
  scout_name: string;
  player_id: number;
  flag_category?: string;
  is_archived?: boolean;
  summary?: string;
}

interface IntelReport {
  intel_id: number;
  created_at: string;
  player_name: string;
  contact_name: string;
  action_required: string;
  player_id: number | null;
}

const HomePage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [userRole, setUserRole] = useState("");
  const [recentScoutReports, setRecentScoutReports] = useState<ScoutReport[]>(
    [],
  );
  const [recentFlagReports, setRecentFlagReports] = useState<ScoutReport[]>([]);
  const [recentIntelReports, setRecentIntelReports] = useState<IntelReport[]>(
    [],
  );
  const [topAttributeReports, setTopAttributeReports] = useState<ScoutReport[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);
  const [databaseMetadata, setDatabaseMetadata] = useState<any>(null);
  const [recencyFilter, setRecencyFilter] = useState("7"); // Default to 7 days

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token, recencyFilter]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch user info
      const userResponse = await axiosInstance.get("/users/me");
      setUserRole(userResponse.data.role || "scout");

      // Fetch recent scout reports with recency filter
      // Don't send recency_days parameter if "all" is selected
      // Optimized: Fetch only 50 most recent reports for "Recent Reports" sections (95% cost reduction)
      const scoutUrl = recencyFilter === "all"
        ? `/scout_reports/all?page=1&limit=50`
        : `/scout_reports/all?page=1&limit=50&recency_days=${recencyFilter}`;
      const scoutResponse = await axiosInstance.get(scoutUrl);
      const scoutReports =
        scoutResponse.data.reports || scoutResponse.data || [];

      // Role-based filtering is handled by backend - no need for client-side filtering
      const filteredScoutReports = Array.isArray(scoutReports)
        ? scoutReports
        : [];

      // Separate flag reports from player assessment reports
      // Show 10 most recent for dashboard overview (click "View All" for complete list)
      const flagReports = filteredScoutReports
        .filter(
          (report) =>
            report.report_type?.toLowerCase() === "flag" ||
            report.report_type?.toLowerCase() === "flag assessment",
        )
        .slice(0, 10);

      // Only show Player Assessment reports (exclude Flags and Clips)
      // Show 10 most recent for dashboard overview (click "View All" for complete list)
      const playerAssessmentReports = filteredScoutReports
        .filter(
          (report) =>
            report.report_type?.toLowerCase() === "player assessment" ||
            report.report_type?.toLowerCase() === "player_assessment",
        )
        .slice(0, 10);

      setRecentScoutReports(playerAssessmentReports);
      setRecentFlagReports(flagReports);

      // Fetch recent intel reports (last 5) - role-based filtering will be done on server
      const intelResponse = await axiosInstance.get(
        "/intel_reports/all?page=1&limit=5",
      );
      const intelReports =
        intelResponse.data.reports || intelResponse.data || [];

      // For now, intel reports don't have scout_name field, so we show all for scouts
      // TODO: Add created_by field to intel reports for proper filtering
      setRecentIntelReports(Array.isArray(intelReports) ? intelReports : []);

      // Fetch top attribute reports using dedicated endpoint (sorted by attribute score, not recency)
      // This ensures we get the ACTUAL top 10 highest attribute scores in the selected time period
      const topAttributesUrl = recencyFilter === "all"
        ? `/scout_reports/top-attributes?limit=10`
        : `/scout_reports/top-attributes?limit=10&recency_days=${recencyFilter}`;
      const topAttributesResponse = await axiosInstance.get(topAttributesUrl);
      const topReports = topAttributesResponse.data.reports || [];
      setTopAttributeReports(Array.isArray(topReports) ? topReports : []);

      // Fetch database metadata
      try {
        const metadataResponse = await axiosInstance.get("/database/metadata");
        setDatabaseMetadata(metadataResponse.data);
      } catch (metadataError) {
        console.error("Error fetching database metadata:", metadataError);
        // Non-critical, don't fail the whole dashboard
      }
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);

      // Handle authentication errors specifically
      if (error.response?.status === 401 || error.response?.status === 422) {
        setError("Authentication failed. Please log in again.");
        // Clear token and redirect will be handled by axios interceptor
      } else {
        setError("Failed to load dashboard data");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReportModal = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(`/scout_reports/${reportId}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
    } catch (error) {
      console.error("Error fetching report details:", error);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleCloseReportModal = () => {
    setShowReportModal(false);
    setSelectedReport(null);
  };

  // Note: Color functions now imported from utils/colorUtils.ts for consistency across the platform

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading dashboard...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <>
      <Container className="mt-4">
        {/* Welcome Header */}
        <div className="mb-4">
          <h1 className="text-dark">
            Welcome, {user?.firstname} {user?.lastname}
          </h1>
          <Row>
            <Col md={8}>
              <p className="text-muted mb-2">
                Charlton Athletic Recruitment Platform Dashboard
              </p>
              <div className="d-flex align-items-center gap-2">
                <small className="text-muted">Show reports from:</small>
                <Form.Select
                  size="sm"
                  value={recencyFilter}
                  onChange={(e) => setRecencyFilter(e.target.value)}
                  style={{ width: "auto" }}
                >
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="all">All Time</option>
                </Form.Select>
              </div>
            </Col>
            <Col md={4}>
              {/* Database Status Info - positioned on the right */}
              {databaseMetadata && !databaseMetadata.error && (
                <div className="d-flex flex-column gap-1 mt-2">
                  {databaseMetadata.players_table && (
                    <small className="text-muted d-flex align-items-center justify-content-end">
                      👥 Players:{" "}
                      {databaseMetadata.players_table.count?.toLocaleString() ||
                        "0"}{" "}
                      records
                      {databaseMetadata.players_table.last_updated && (
                        <span className="ms-1">
                          (Updated:{" "}
                          {new Date(
                            databaseMetadata.players_table.last_updated,
                          ).toLocaleDateString()}
                          )
                        </span>
                      )}
                    </small>
                  )}
                  {databaseMetadata.matches_table && (
                    <small className="text-muted d-flex align-items-center justify-content-end">
                      ⚽ Matches:{" "}
                      {databaseMetadata.matches_table.count?.toLocaleString() ||
                        "0"}{" "}
                      records
                      {databaseMetadata.matches_table.last_updated && (
                        <span className="ms-1">
                          (Updated:{" "}
                          {new Date(
                            databaseMetadata.matches_table.last_updated,
                          ).toLocaleDateString()}
                          )
                        </span>
                      )}
                    </small>
                  )}
                </div>
              )}
            </Col>
          </Row>
        </div>

        {/* 2x2 Grid Dashboard */}
        <Row className="g-4">
          {/* Top Left: Recent Scout Reports */}
          <Col md={6}>
            <Card className="h-100">
              <Card.Header className="bg-light border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0 d-flex align-items-center">
                    ⚽{" "}
                    {userRole === "scout"
                      ? "Your Recent Scout Reports"
                      : "Recent Scout Reports"}{" "}
                    ({recentScoutReports.length})
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip>
                          Shows the 10 most recent Player Assessment reports within the selected time period. Click "View All" to see the complete list with advanced filters.
                        </Tooltip>
                      }
                    >
                      <span className="ms-2" style={{ cursor: "help", fontSize: "0.85rem", color: "#6c757d" }}>
                        ℹ️
                      </span>
                    </OverlayTrigger>
                  </h5>
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => navigate("/scouting")}
                  >
                    View All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body style={{ maxHeight: "300px", overflowY: "auto" }}>
                {recentScoutReports.length === 0 ? (
                  <p className="text-muted text-center">
                    No recent scout reports
                  </p>
                ) : (
                  recentScoutReports.map((report) => (
                    <div
                      key={report.report_id}
                      className="border-bottom pb-2 mb-2"
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="d-flex align-items-start">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleOpenReportModal(report.report_id)
                            }
                            disabled={loadingReportId === report.report_id}
                            title="View Report"
                            className="btn-action-circle btn-action-view me-2 mt-1"
                          >
                            {loadingReportId === report.report_id ? (
                              <Spinner as="span" animation="border" size="sm" />
                            ) : (
                              "👁️"
                            )}
                          </Button>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none text-start fw-bold"
                              style={{ color: "inherit" }}
                              onClick={() =>
                                navigate(`/player/${report.player_id}`)
                              }
                            >
                              {report.player_name}
                            </Button>
                            <div className="small text-muted">
                              by {report.scout_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="mb-1">
                            <span
                              className={`badge me-1 ${
                                report.performance_score === 9 ? 'performance-score-9' :
                                report.performance_score === 10 ? 'performance-score-10' : ''
                              }`}
                              style={{
                                backgroundColor: getPerformanceScoreColor(
                                  report.performance_score,
                                ),
                                color: "white",
                                fontWeight: "bold",
                                ...(report.performance_score !== 9 && report.performance_score !== 10 ? { border: "none" } : {}),
                              }}
                            >
                              {report.performance_score}
                            </span>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: getAttributeScoreColor(
                                  report.attribute_score,
                                ),
                                color: "white",
                                fontWeight: "bold",
                                border: "none",
                              }}
                            >
                              {report.attribute_score}
                            </span>
                          </div>
                          <div className="small text-muted">
                            {new Date(report.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Top Right: Recent Flag Reports */}
          <Col md={6}>
            <Card className="h-100">
              <Card.Header className="bg-light border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0 d-flex align-items-center">
                    🏳️{" "}
                    {userRole === "scout"
                      ? "Your Recent Flag Reports"
                      : "Recent Flag Reports"}{" "}
                    ({recentFlagReports.length})
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip>
                          Shows all Flag reports within the selected time period, sorted by most recent first. Flags are quick assessments marked as Positive, Neutral, or Negative.
                        </Tooltip>
                      }
                    >
                      <span className="ms-2" style={{ cursor: "help", fontSize: "0.85rem", color: "#6c757d" }}>
                        ℹ️
                      </span>
                    </OverlayTrigger>
                  </h5>
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => navigate("/scouting")}
                  >
                    View All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body style={{ maxHeight: "300px", overflowY: "auto" }}>
                {recentFlagReports.length === 0 ? (
                  <p className="text-muted text-center">
                    No recent flag reports
                  </p>
                ) : (
                  recentFlagReports.map((report) => {
                    const vssScore = report.summary ? extractVSSScore(report.summary) : null;
                    return (
                    <div
                      key={report.report_id}
                      className={`border-bottom pb-2 mb-2 ${report.is_archived ? 'report-card-archived' : ''}`}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="d-flex align-items-start">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleOpenReportModal(report.report_id)
                            }
                            disabled={loadingReportId === report.report_id}
                            title="View Report"
                            className="btn-action-circle btn-action-view me-2 mt-1"
                          >
                            {loadingReportId === report.report_id ? (
                              <Spinner as="span" animation="border" size="sm" />
                            ) : (
                              "👁️"
                            )}
                          </Button>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none text-start fw-bold"
                              style={{ color: "inherit" }}
                              onClick={() =>
                                navigate(`/player/${report.player_id}`)
                              }
                            >
                              {report.player_name}
                            </Button>
                            <div className="small text-muted">
                              by {report.scout_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="mb-1">
                            {report.is_archived && (
                              <span className="badge-archived me-1">ARCHIVED</span>
                            )}
                            {report.is_archived && report.flag_category ? (
                              <span
                                className="badge-grade me-1"
                                style={{
                                  backgroundColor: getGradeColor(report.flag_category),
                                }}
                              >
                                {report.flag_category}
                              </span>
                            ) : (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: getFlagColor(
                                    report.flag_category || "neutral",
                                  ),
                                  color: "white",
                                  fontWeight: "bold",
                                }}
                              >
                                {report.flag_category === "Positive"
                                  ? "Positive"
                                  : report.flag_category === "Negative"
                                    ? "Negative"
                                    : report.flag_category === "Neutral"
                                      ? "Neutral"
                                      : "Not specified"}
                              </span>
                            )}
                            {report.is_archived && vssScore && (
                              <span className="badge-vss ms-1">VSS: {vssScore}/32</span>
                            )}
                          </div>
                          <div className="small text-muted">
                            {new Date(report.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  }))
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Bottom Left: Top Attribute Scores */}
          <Col md={6}>
            <Card className="h-100">
              <Card.Header className="bg-light border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0 d-flex align-items-center">
                    🏆{" "}
                    {userRole === "scout"
                      ? "Your Highest Attribute Scores"
                      : "Highest Attribute Scores"}{" "}
                    ({topAttributeReports.length})
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip>
                          Shows the top 10 Player Assessment reports ranked by total attribute score (highest to lowest). Click "View All" to see the complete list.
                        </Tooltip>
                      }
                    >
                      <span className="ms-2" style={{ cursor: "help", fontSize: "0.85rem", color: "#6c757d" }}>
                        ℹ️
                      </span>
                    </OverlayTrigger>
                  </h5>
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => navigate("/scouting")}
                  >
                    View All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body style={{ maxHeight: "300px", overflowY: "auto" }}>
                {topAttributeReports.length === 0 ? (
                  <p className="text-muted text-center">
                    No reports with attribute scores
                  </p>
                ) : (
                  topAttributeReports.map((report, index) => (
                    <div
                      key={report.report_id}
                      className="border-bottom pb-2 mb-2"
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="d-flex align-items-center">
                          <span className="badge bg-secondary me-2">
                            #{index + 1}
                          </span>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleOpenReportModal(report.report_id)
                            }
                            disabled={loadingReportId === report.report_id}
                            title="View Report"
                            className="btn-action-circle btn-action-view me-2"
                          >
                            {loadingReportId === report.report_id ? (
                              <Spinner as="span" animation="border" size="sm" />
                            ) : (
                              "👁️"
                            )}
                          </Button>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none text-start fw-bold"
                              style={{ color: "inherit" }}
                              onClick={() =>
                                navigate(`/player/${report.player_id}`)
                              }
                            >
                              {report.player_name}
                            </Button>
                            <div className="small text-muted">
                              by {report.scout_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="mb-1">
                            <span
                              className="badge fs-6"
                              style={{
                                backgroundColor: getAttributeScoreColor(
                                  report.attribute_score,
                                ),
                                color: "white",
                                fontWeight: "bold",
                                border: "none",
                              }}
                            >
                              {report.attribute_score}
                            </span>
                          </div>
                          <div className="small text-muted">
                            {new Date(report.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Bottom Right: Recent Intel Reports */}
          <Col md={6}>
            <Card className="h-100">
              <Card.Header className="bg-light border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0 d-flex align-items-center">
                    🕵️{" "}
                    {userRole === "scout"
                      ? "Your Recent Intel Reports"
                      : "Recent Intel Reports"}{" "}
                    ({recentIntelReports.length})
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip>
                          Shows the 5 most recent Intel reports. Intel reports contain transfer and contract information from various contacts. This section is not affected by the time filter.
                        </Tooltip>
                      }
                    >
                      <span className="ms-2" style={{ cursor: "help", fontSize: "0.85rem", color: "#6c757d" }}>
                        ℹ️
                      </span>
                    </OverlayTrigger>
                  </h5>
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => navigate("/intel")}
                  >
                    View All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body style={{ maxHeight: "300px", overflowY: "auto" }}>
                {recentIntelReports.length === 0 ? (
                  <div className="text-center">
                    <p className="text-muted">No intel reports yet</p>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => navigate("/intel")}
                    >
                      Create First Intel Report
                    </Button>
                  </div>
                ) : (
                  recentIntelReports.map((report) => (
                    <div
                      key={report.intel_id}
                      className="border-bottom pb-2 mb-2"
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          {report.player_id ? (
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none text-start fw-bold"
                              style={{ color: "inherit" }}
                              onClick={() =>
                                navigate(`/player/${report.player_id}`)
                              }
                            >
                              {report.player_name}
                            </Button>
                          ) : (
                            <span className="fw-bold">
                              {report.player_name}
                            </span>
                          )}
                          <div className="small text-muted">
                            by {report.contact_name}
                          </div>
                        </div>
                        <div className="text-end">
                          <span className="badge badge-neutral-grey">
                            {report.action_required}
                          </span>
                          <div className="small text-muted">
                            {new Date(report.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Player Report Modal */}
      <PlayerReportModal
        show={showReportModal}
        onHide={handleCloseReportModal}
        report={selectedReport}
      />
    </>
  );
};

export default HomePage;
