import React, { useState, useEffect, useRef, useCallback } from "react";
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
  is_potential?: boolean;
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

  // Infinite scroll state for Scout Reports
  const [scoutReportsOffset, setScoutReportsOffset] = useState(0);
  const [hasMoreScoutReports, setHasMoreScoutReports] = useState(true);
  const [loadingMoreScoutReports, setLoadingMoreScoutReports] = useState(false);
  const scoutReportsObserver = useRef<IntersectionObserver | null>(null);

  // Infinite scroll state for Flag Reports
  const [flagReportsOffset, setFlagReportsOffset] = useState(0);
  const [hasMoreFlagReports, setHasMoreFlagReports] = useState(true);
  const [loadingMoreFlagReports, setLoadingMoreFlagReports] = useState(false);
  const flagReportsObserver = useRef<IntersectionObserver | null>(null);

  // Reset state and fetch initial data when token or recency filter changes
  useEffect(() => {
    if (token) {
      // Reset reports and offsets
      setRecentScoutReports([]);
      setRecentFlagReports([]);
      setScoutReportsOffset(0);
      setFlagReportsOffset(0);
      setHasMoreScoutReports(true);
      setHasMoreFlagReports(true);
      fetchDashboardData();
    }
  }, [token, recencyFilter]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch user info
      const userResponse = await axiosInstance.get("/users/me");
      setUserRole(userResponse.data.role || "scout");

      // Fetch initial scout reports using new endpoint with infinite scroll support
      const scoutUrl = recencyFilter === "all"
        ? `/scout_reports/recent?report_type=Player Assessment&limit=20&offset=0`
        : `/scout_reports/recent?report_type=Player Assessment&limit=20&offset=0&recency_days=${recencyFilter}`;
      const scoutResponse = await axiosInstance.get(scoutUrl);
      const scoutReports = scoutResponse.data.reports || [];
      setRecentScoutReports(scoutReports);
      setHasMoreScoutReports(scoutResponse.data.has_more || false);
      setScoutReportsOffset(20); // Set offset for next load

      // Fetch initial flag reports using new endpoint
      const flagUrl = recencyFilter === "all"
        ? `/scout_reports/recent?report_type=Flag&limit=20&offset=0`
        : `/scout_reports/recent?report_type=Flag&limit=20&offset=0&recency_days=${recencyFilter}`;
      const flagResponse = await axiosInstance.get(flagUrl);
      const flagReports = flagResponse.data.reports || [];
      setRecentFlagReports(flagReports);
      setHasMoreFlagReports(flagResponse.data.has_more || false);
      setFlagReportsOffset(20); // Set offset for next load

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

  // Load more scout reports (infinite scroll)
  const loadMoreScoutReports = useCallback(async () => {
    if (loadingMoreScoutReports || !hasMoreScoutReports) return;

    try {
      setLoadingMoreScoutReports(true);
      const url = recencyFilter === "all"
        ? `/scout_reports/recent?report_type=Player Assessment&limit=20&offset=${scoutReportsOffset}`
        : `/scout_reports/recent?report_type=Player Assessment&limit=20&offset=${scoutReportsOffset}&recency_days=${recencyFilter}`;

      const response = await axiosInstance.get(url);
      const newReports = response.data.reports || [];

      setRecentScoutReports((prev) => [...prev, ...newReports]);
      setHasMoreScoutReports(response.data.has_more || false);
      setScoutReportsOffset((prev) => prev + 20);
    } catch (error) {
      console.error("Error loading more scout reports:", error);
    } finally {
      setLoadingMoreScoutReports(false);
    }
  }, [loadingMoreScoutReports, hasMoreScoutReports, scoutReportsOffset, recencyFilter]);

  // Load more flag reports (infinite scroll)
  const loadMoreFlagReports = useCallback(async () => {
    if (loadingMoreFlagReports || !hasMoreFlagReports) return;

    try {
      setLoadingMoreFlagReports(true);
      const url = recencyFilter === "all"
        ? `/scout_reports/recent?report_type=Flag&limit=20&offset=${flagReportsOffset}`
        : `/scout_reports/recent?report_type=Flag&limit=20&offset=${flagReportsOffset}&recency_days=${recencyFilter}`;

      const response = await axiosInstance.get(url);
      const newReports = response.data.reports || [];

      setRecentFlagReports((prev) => [...prev, ...newReports]);
      setHasMoreFlagReports(response.data.has_more || false);
      setFlagReportsOffset((prev) => prev + 20);
    } catch (error) {
      console.error("Error loading more flag reports:", error);
    } finally {
      setLoadingMoreFlagReports(false);
    }
  }, [loadingMoreFlagReports, hasMoreFlagReports, flagReportsOffset, recencyFilter]);

  // Intersection Observer callback for scout reports (detect scroll to bottom)
  const lastScoutReportElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMoreScoutReports) return;
      if (scoutReportsObserver.current) scoutReportsObserver.current.disconnect();

      scoutReportsObserver.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMoreScoutReports) {
          loadMoreScoutReports();
        }
      });

      if (node) scoutReportsObserver.current.observe(node);
    },
    [loadingMoreScoutReports, hasMoreScoutReports, loadMoreScoutReports]
  );

  // Intersection Observer callback for flag reports (detect scroll to bottom)
  const lastFlagReportElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMoreFlagReports) return;
      if (flagReportsObserver.current) flagReportsObserver.current.disconnect();

      flagReportsObserver.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMoreFlagReports) {
          loadMoreFlagReports();
        }
      });

      if (node) flagReportsObserver.current.observe(node);
    },
    [loadingMoreFlagReports, hasMoreFlagReports, loadMoreFlagReports]
  );

  // Note: Color functions now imported from utils/colorUtils.ts for consistency across the platform

  if (loading) {
    return (
      <Container className="mt-4">
        {/* Welcome Header Shimmer */}
        <div className="mb-4">
          <div className="shimmer-line mb-3" style={{ width: "300px", height: "36px" }}></div>
          <div className="shimmer-line" style={{ width: "400px", height: "20px" }}></div>
        </div>

        {/* 1x3 Grid Dashboard Shimmer */}
        <Row className="g-4">
          {/* Three shimmer cards */}
          {Array.from({ length: 3 }).map((_, idx) => (
            <Col md={4} key={`shimmer-card-${idx}`}>
              <Card className="h-100">
                <Card.Header className="bg-light border-bottom">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="shimmer-line" style={{ width: "200px", height: "24px" }}></div>
                    <div className="shimmer-line" style={{ width: "80px", height: "32px", borderRadius: "4px" }}></div>
                  </div>
                </Card.Header>
                <Card.Body style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {Array.from({ length: 5 }).map((_, itemIdx) => (
                    <div key={`shimmer-item-${itemIdx}`} className="border-bottom pb-2 mb-2">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="d-flex align-items-start">
                          <div className="shimmer-line me-2 mt-1" style={{ width: "32px", height: "32px", borderRadius: "50%" }}></div>
                          <div>
                            <div className="shimmer-line mb-2" style={{ width: "150px", height: "20px" }}></div>
                            <div className="shimmer-line" style={{ width: "100px", height: "16px" }}></div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="mb-1">
                            <div className="shimmer-line" style={{ width: "60px", height: "24px", borderRadius: "12px", marginLeft: "auto", marginBottom: "4px" }}></div>
                          </div>
                          <div className="shimmer-line" style={{ width: "80px", height: "16px", marginLeft: "auto" }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
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

        {/* 1x3 Grid Dashboard */}
        <Row className="g-4">
          {/* Recent Scout Reports */}
          <Col md={4}>
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
                {recentScoutReports.length === 0 && !loadingMoreScoutReports ? (
                  <p className="text-muted text-center">
                    No recent scout reports
                  </p>
                ) : (
                  <>
                    {recentScoutReports.map((report, index) => {
                      const isLastElement = index === recentScoutReports.length - 1;
                      return (
                        <div
                          key={report.report_id}
                          ref={isLastElement ? lastScoutReportElementRef : null}
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
                          {report.is_archived && (
                            <span className="badge-archived d-block mb-1">ARCHIVED</span>
                          )}
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
                              title={report.is_potential ? "Potential Score" : undefined}
                            >
                              {report.performance_score}{report.is_potential && "*"}
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
                      );
                    })}
                    {/* Show shimmer loading while loading more */}
                    {loadingMoreScoutReports && (
                      <>
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <div key={`shimmer-${idx}`} className="border-bottom pb-2 mb-2">
                            <div className="d-flex justify-content-between align-items-start">
                              <div className="d-flex align-items-start">
                                <div className="shimmer-line me-2 mt-1" style={{ width: "32px", height: "32px", borderRadius: "50%" }}></div>
                                <div>
                                  <div className="shimmer-line mb-2" style={{ width: "150px", height: "20px" }}></div>
                                  <div className="shimmer-line" style={{ width: "100px", height: "16px" }}></div>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="mb-1 d-flex gap-1 justify-content-end">
                                  <div className="shimmer-line" style={{ width: "40px", height: "24px", borderRadius: "12px" }}></div>
                                  <div className="shimmer-line" style={{ width: "40px", height: "24px", borderRadius: "12px" }}></div>
                                </div>
                                <div className="shimmer-line" style={{ width: "80px", height: "16px", marginLeft: "auto" }}></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Recent Flag Reports */}
          <Col md={4}>
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
                {recentFlagReports.length === 0 && !loadingMoreFlagReports ? (
                  <p className="text-muted text-center">
                    No recent flag reports
                  </p>
                ) : (
                  <>
                    {recentFlagReports.map((report, index) => {
                      const vssScore = report.summary ? extractVSSScore(report.summary) : null;
                      const isLastElement = index === recentFlagReports.length - 1;
                      return (
                      <div
                        key={report.report_id}
                        ref={isLastElement ? lastFlagReportElementRef : null}
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
                    })}
                    {/* Show shimmer loading while loading more */}
                    {loadingMoreFlagReports && (
                      <>
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <div key={`shimmer-${idx}`} className="border-bottom pb-2 mb-2">
                            <div className="d-flex justify-content-between align-items-start">
                              <div className="d-flex align-items-start">
                                <div className="shimmer-line me-2 mt-1" style={{ width: "32px", height: "32px", borderRadius: "50%" }}></div>
                                <div>
                                  <div className="shimmer-line mb-2" style={{ width: "150px", height: "20px" }}></div>
                                  <div className="shimmer-line" style={{ width: "100px", height: "16px" }}></div>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="mb-1">
                                  <div className="shimmer-line" style={{ width: "80px", height: "24px", borderRadius: "12px", marginLeft: "auto", marginBottom: "4px" }}></div>
                                </div>
                                <div className="shimmer-line" style={{ width: "80px", height: "16px", marginLeft: "auto" }}></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Top Attribute Scores */}
          <Col md={4}>
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
