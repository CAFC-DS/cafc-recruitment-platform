import React, { useState, useEffect, useCallback } from "react";
import {
  Container,
  Form,
  Button,
  Row,
  Col,
  Card,
  Spinner,
  Table,
  Collapse,
  Alert,
  Modal,
  Dropdown,
} from "react-bootstrap";
import { useNavigate, useLocation } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import PlayerReportModal from "../components/PlayerReportModal";
import AddPlayerModal from "../components/AddPlayerModal";
import AddFixtureModal from "../components/AddFixtureModal";
import ScoutingAssessmentModal from "../components/ScoutingAssessmentModal";
import ShimmerLoading from "../components/ShimmerLoading";
import { useAuth } from "../App";
import { useViewMode } from "../contexts/ViewModeContext";
import {
  getPerformanceScoreColor,
  getFlagColor,
  getGradeColor,
} from "../utils/colorUtils";
import { extractVSSScore } from "../utils/reportUtils";
import { Player } from "../types/Player";
import { getPlayerProfilePath } from "../utils/playerNavigation";

interface ScoutReport {
  report_id: number;
  created_at: string;
  player_name: string;
  age: number | null;
  fixture_date: string;
  fixture_details: string;
  home_team: string | null;
  away_team: string | null;
  position_played: string;
  performance_score: number;
  attribute_score: number;
  scout_name: string;
  report_type: string;
  scouting_type: string;
  player_id: number;
  purpose: string | null;
  universal_id?: string;
  flag_category?: string;
  is_archived?: boolean;
  summary?: string;
  has_been_viewed?: boolean;
  is_potential?: boolean;
}

const ScoutingPage: React.FC = () => {
  const { token } = useAuth();
  const { viewMode, setViewMode, initializeUserViewMode } = useViewMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showAddFixtureModal, setShowAddFixtureModal] = useState(false);
  const [scoutReports, setScoutReports] = useState<ScoutReport[]>([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);

  // New states from IntelPage
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReports, setTotalReports] = useState(0);
  const [itemsPerPage] = useState(20);
  const [recencyFilter, setRecencyFilter] = useState<string>("7");
  const [loading, setLoading] = useState(false);
  const [errorReports, setErrorReports] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Advanced filters
  const [performanceScores, setPerformanceScores] = useState<number[]>([]);
  const [scoutNameFilter, setScoutNameFilter] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState("");
  const [scoutingTypeFilter, setScoutingTypeFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  // Edit and delete functionality
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Mark all as read functionality
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);

  const fetchScoutReports = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      setErrorReports(null);
      try {
        const params: any = {
          page,
          limit: itemsPerPage, // Server-side pagination with 20 items per page
        };

        // Add recency filter
        if (recencyFilter !== "all") {
          params.recency_days = parseInt(recencyFilter);
        }

        // Add server-side filters
        if (performanceScores.length > 0) {
          params.performance_scores = performanceScores.join(",");
        }
        if (minAge) {
          params.min_age = parseInt(minAge);
        }
        if (maxAge) {
          params.max_age = parseInt(maxAge);
        }
        if (scoutNameFilter) {
          params.scout_name = scoutNameFilter;
        }
        if (playerNameFilter) {
          params.player_name = playerNameFilter;
        }
        if (reportTypeFilter) {
          params.report_types = reportTypeFilter;
        }
        if (scoutingTypeFilter) {
          params.scouting_type = scoutingTypeFilter;
        }
        if (positionFilter) {
          params.position = positionFilter;
        }
        if (dateFromFilter) {
          params.date_from = dateFromFilter;
        }
        if (dateToFilter) {
          params.date_to = dateToFilter;
        }

        const response = await axiosInstance.get("/scout_reports/all", {
          params,
        });

        // Role-based filtering is now handled by the backend
        setScoutReports(response.data.reports || []);
        setTotalReports(response.data.total_reports || 0);
      } catch (error) {
        console.error("Error fetching scout reports:", error);
        setErrorReports("Failed to load scout reports. Please try again.");
        setScoutReports([]);
        setTotalReports(0);
      } finally {
        setLoading(false);
      }
    },
    [
      recencyFilter,
      itemsPerPage,
      performanceScores,
      minAge,
      maxAge,
      scoutNameFilter,
      playerNameFilter,
      reportTypeFilter,
      scoutingTypeFilter,
      positionFilter,
      dateFromFilter,
      dateToFilter,
    ],
  );

  // Fetch user role and username
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await axiosInstance.get("/users/me");
      // Initialize user's view mode preference
      if (response.data.id || response.data.username) {
        initializeUserViewMode(
          response.data.id?.toString() || response.data.username,
        );
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  }, [initializeUserViewMode]);

  const handleEditReport = async (reportId: number) => {
    try {
      setLoadingReportId(reportId);
      const response = await axiosInstance.get(
        `/scout_reports/details/${reportId}`,
      );
      setEditReportData(response.data);
      setEditReportId(reportId);
      setSelectedPlayer({
        player_id: response.data.player_id,
        player_name: response.data.player_name,
        universal_id: response.data.player_id,
      });
      setEditMode(true);
      setShowAssessmentModal(true);
    } catch (error) {
      console.error("Error fetching report for edit:", error);
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
      fetchScoutReports(1); // Refresh current page
    } catch (error) {
      console.error("Error deleting report:", error);
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

  const handleMarkAllAsRead = async () => {
    // Check if there are any unread reports
    const unreadCount = scoutReports.filter((r) => !r.has_been_viewed).length;
    if (unreadCount === 0) {
      return; // Nothing to mark
    }

    setMarkingAllAsRead(true);
    try {
      const response = await axiosInstance.post("/scout_reports/mark-all-viewed");

      // Refresh reports to update viewed status
      await fetchScoutReports(currentPage);

      console.log(`Marked ${response.data.reports_marked} reports as read`);
    } catch (error) {
      console.error("Error marking all reports as read:", error);
      setErrorReports("Failed to mark all reports as read. Please try again.");
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  // Initial fetch on load
  useEffect(() => {
    if (token) {
      fetchUserInfo();
    }
  }, [token, fetchUserInfo]);

  // Debounced fetch when filters change
  useEffect(() => {
    if (!token) return;

    // Reset to page 1 when filters change
    if (currentPage !== 1) {
      setCurrentPage(1);
      return; // Let the page useEffect handle the fetch
    }

    // Debounce text filters (500ms delay)
    const timer = setTimeout(() => {
      fetchScoutReports(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [
    token,
    recencyFilter,
    performanceScores,
    minAge,
    maxAge,
    scoutNameFilter,
    playerNameFilter,
    reportTypeFilter,
    scoutingTypeFilter,
    positionFilter,
    dateFromFilter,
    dateToFilter,
    fetchScoutReports,
  ]);

  // Fetch when page changes (no debounce for pagination)
  useEffect(() => {
    if (token) {
      fetchScoutReports(currentPage);
    }
  }, [currentPage, token, fetchScoutReports]);


  const handleOpenReportModal = async (report_id: number) => {
    setLoadingReportId(report_id);
    try {
      const response = await axiosInstance.get(`/scout_reports/${report_id}`);
      setSelectedReport(response.data);
      setShowReportModal(true);

      // Mark as viewed (fire and forget - don't block modal opening)
      axiosInstance
        .post(`/scout_reports/${report_id}/mark-viewed`)
        .catch((err) =>
          console.warn("Failed to mark report as viewed:", err)
        );

      // Update local state to remove blue dot immediately
      setScoutReports((prev) =>
        prev.map((r) =>
          r.report_id === report_id ? { ...r, has_been_viewed: true } : r
        )
      );
    } catch (error) {
      console.error("Error fetching single scout report:", error);
    } finally {
      setLoadingReportId(null);
    }
  };

  // Note: Color functions now imported from utils/colorUtils.ts for consistency

  const getReportTypeBadge = (
    reportType: string,
    _scoutingType: string,
    report: ScoutReport,
  ) => {
    // For archived reports in card view, don't show badge in Tags section
    // (they have ARCHIVED banner at top instead)
    if (report.is_archived) {
      return null;
    }

    switch (reportType.toLowerCase()) {
      case "flag":
      case "flag assessment":
        return getFlagBadge(report);
      case "clips":
        return <span className="badge badge-neutral-grey">Clips</span>;
      case "player assessment":
      case "player":
        return null; // Remove Player Assessment badge
      default:
        return <span className="badge badge-neutral-grey">{reportType}</span>;
    }
  };

  const getFlagBadge = (report: ScoutReport) => {
    // For archived reports, show grade badge in table view
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

    // For regular flag reports, show flag emoji with color
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

  const getFlagTypeText = (report: ScoutReport) => {
    // For archived reports, show grade badge instead of regular flag badge
    if (report.is_archived && report.flag_category) {
      const vssScore = report.summary ? extractVSSScore(report.summary) : null;
      return (
        <div className="d-flex flex-column align-items-end gap-1">
          <span
            className="badge-grade"
            style={{
              backgroundColor: getGradeColor(report.flag_category),
              color: "white",
              fontSize: "0.7rem",
            }}
          >
            {report.flag_category}
          </span>
          {vssScore && (
            <span className="badge-vss" style={{ fontSize: "0.7rem" }}>
              VSS Score: {vssScore}/32
            </span>
          )}
        </div>
      );
    }

    // For regular flag reports, show flag color
    const flagColor = getFlagColor(report.flag_category || "");
    return (
      <span
        className="badge"
        style={{
          backgroundColor: flagColor,
          color: "white",
          border: "none",
          fontWeight: "500",
          fontSize: "0.9rem",
        }}
      >
        {report.flag_category || "Flag"}
      </span>
    );
  };

  const getScoutingTypeBadge = (scoutingType: string) => {
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

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Server-side pagination - reports are already filtered and paginated from backend
  const totalPages = Math.ceil(totalReports / itemsPerPage);

  // Check if we should open the draft modal from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openDraft') === 'true') {
      // Restore selected player from draft if available
      const draftStr = localStorage.getItem('scoutingAssessmentDraft');
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr);
          if (draft.selectedPlayer) {
            setSelectedPlayer({
              universal_id: draft.selectedPlayer.id,
              player_id: draft.selectedPlayer.id,
              player_name: draft.selectedPlayer.name,
              position: draft.selectedPlayer.position,
              squad_name: draft.selectedPlayer.team,
            } as Player);
          } else {
            setSelectedPlayer(null);
          }
        } catch (error) {
          console.error('Error parsing draft:', error);
          setSelectedPlayer(null);
        }
      } else {
        setSelectedPlayer(null);
      }
      setShowAssessmentModal(true);
      // Remove the parameter from URL
      navigate('/scouting', { replace: true });
    }
  }, [location.search, navigate]);

  return (
    <Container className="mt-4">

      <AddPlayerModal
        show={showAddPlayerModal}
        onHide={() => setShowAddPlayerModal(false)}
      />
      <AddFixtureModal
        show={showAddFixtureModal}
        onHide={() => setShowAddFixtureModal(false)}
      />
      <ScoutingAssessmentModal
        show={showAssessmentModal}
        onHide={handleAssessmentModalHide}
        selectedPlayer={selectedPlayer}
        onAssessmentSubmitSuccess={() => fetchScoutReports(1)}
        editMode={editMode}
        reportId={editReportId}
        existingReportData={editReportData}
      />

      {/* Delete Confirmation Modal */}
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
            {deleteLoading ? (
              <Spinner animation="border" size="sm" />
            ) : (
              "Delete"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <div className="d-flex justify-content-between align-items-center mt-4 mb-3">
        <h3>Scout Reports</h3>
        <div className="d-flex align-items-center gap-3">
          <div className="btn-group">
            <Button
              variant={viewMode === "cards" ? "secondary" : "outline-secondary"}
              size="sm"
              onClick={() => setViewMode("cards")}
              style={
                viewMode === "cards"
                  ? {
                      backgroundColor: "#000000",
                      borderColor: "#000000",
                      color: "white",
                    }
                  : { color: "#000000", borderColor: "#000000" }
              }
            >
              Cards
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "outline-secondary"}
              size="sm"
              onClick={() => setViewMode("table")}
              style={
                viewMode === "table"
                  ? {
                      backgroundColor: "#000000",
                      borderColor: "#000000",
                      color: "white",
                    }
                  : { color: "#000000", borderColor: "#000000" }
              }
            >
              Table
            </Button>
          </div>
        </div>
      </div>

      {/* Pagination and Filters Row */}
      <Row className="mb-3 align-items-center">
        <Col md={4}>
          <Form.Select
            size="sm"
            value={recencyFilter}
            onChange={(e) => {
              setRecencyFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ maxWidth: "150px" }}
          >
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </Form.Select>

          {/* Mark All as Read button - only show if there are unread reports */}
          {scoutReports.filter((r) => !r.has_been_viewed).length > 0 && (
            <Button
              size="sm"
              variant="outline-primary"
              className="mt-2"
              onClick={handleMarkAllAsRead}
              disabled={markingAllAsRead || loading}
              style={{ width: "150px" }}
            >
              {markingAllAsRead ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    className="me-1"
                  />
                  Marking...
                </>
              ) : (
                <>✓ Mark All as Read</>
              )}
            </Button>
          )}
        </Col>
        <Col md={4} className="text-center">
          {totalPages > 1 && (
            <div className="d-flex align-items-center justify-content-center">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="me-2"
              >
                ‹
              </Button>
              <small className="text-muted mx-2">
                Page {currentPage} of {totalPages}
              </small>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
              >
                ›
              </Button>
            </div>
          )}
        </Col>
        <Col md={4} className="text-end">
          <small className="text-muted">
            Showing {Math.min(scoutReports.length, itemsPerPage)} of{" "}
            {scoutReports.length} filtered results
            {scoutReports.length !== totalReports && (
              <span> ({totalReports} total)</span>
            )}
          </small>
          {scoutReports.filter((r) => !r.has_been_viewed).length > 0 && (
            <div>
              <small className="text-primary fw-semibold">
                {scoutReports.filter((r) => !r.has_been_viewed).length} unread
              </small>
            </div>
          )}
        </Col>
      </Row>

      {/* Advanced Filters */}
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
            {/* Row 1: Player Name, Position, Performance Score */}
            <Row className="mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Player Name</Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="Enter player name"
                    value={playerNameFilter}
                    onChange={(e) => setPlayerNameFilter(e.target.value)}
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
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                  />
                </Form.Group>
              </Col>
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
                      {performanceScores.length > 0
                        ? `${performanceScores.length} score${performanceScores.length > 1 ? "s" : ""} selected`
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
                            checked={performanceScores.includes(score)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPerformanceScores([
                                  ...performanceScores,
                                  score,
                                ]);
                              } else {
                                setPerformanceScores(
                                  performanceScores.filter((s) => s !== score),
                                );
                              }
                            }}
                          />
                        </div>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 2: Scout Name, Report Type, Scouting Type */}
            <Row className="mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Scout Name</Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="Enter scout name"
                    value={scoutNameFilter}
                    onChange={(e) => setScoutNameFilter(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Report Type</Form.Label>
                  <Form.Select
                    size="sm"
                    value={reportTypeFilter}
                    onChange={(e) => setReportTypeFilter(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="player assessment">Player Assessment</option>
                    <option value="flag">Flag</option>
                    <option value="clips">Clips</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">
                    Scouting Type
                  </Form.Label>
                  <Form.Select
                    size="sm"
                    value={scoutingTypeFilter}
                    onChange={(e) => setScoutingTypeFilter(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="live">Live</option>
                    <option value="video">Video</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 3: Age Range, Date Range, Clear Filters & Report Count */}
            <Row className="mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Age Range</Form.Label>
                  <div className="range-inputs">
                    <Form.Control
                      size="sm"
                      type="number"
                      placeholder="Min"
                      value={minAge}
                      onChange={(e) => setMinAge(e.target.value)}
                      min="16"
                      max="50"
                      style={{ width: "80px" }}
                    />
                    <span className="range-separator">to</span>
                    <Form.Control
                      size="sm"
                      type="number"
                      placeholder="Max"
                      value={maxAge}
                      onChange={(e) => setMaxAge(e.target.value)}
                      min="16"
                      max="50"
                      style={{ width: "80px" }}
                    />
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Date Range</Form.Label>
                  <div className="range-inputs">
                    <Form.Control
                      size="sm"
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                    />
                    <span className="range-separator">to</span>
                    <Form.Control
                      size="sm"
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                    />
                  </div>
                </Form.Group>
              </Col>
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
                    onClick={() => {
                      setPerformanceScores([]);
                      setMinAge("");
                      setMaxAge("");
                      setScoutNameFilter("");
                      setPlayerNameFilter("");
                      setDateFromFilter("");
                      setDateToFilter("");
                      setReportTypeFilter("");
                      setScoutingTypeFilter("");
                      setPositionFilter("");
                    }}
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

      {errorReports ? (
        <Alert variant="danger">{errorReports}</Alert>
      ) : (
        <>
          {viewMode === "table" ? (
            <div className="table-responsive">
              <Table
                responsive
                hover
                striped
                className="table-compact table-sm"
                style={{ textAlign: "center" }}
              >
                <thead className="table-dark">
                  <tr>
                    <th style={{ width: "30px" }}></th>
                    <th>Report Date</th>
                    <th>Player</th>
                    <th>Age</th>
                    <th>Position</th>
                    <th>Fixture Date</th>
                    <th>Fixture</th>
                    <th>Scout</th>
                    <th>Type</th>
                    <th>Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <ShimmerLoading variant="table" count={10} />
                  ) : scoutReports.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center text-muted py-4">
                        No reports found
                      </td>
                    </tr>
                  ) : (
                    scoutReports.map((report) => (
                    <tr key={report.report_id}>
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
                      <td>
                        {new Date(report.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <Button
                          variant="link"
                          onClick={() =>
                            navigate(getPlayerProfilePath(report as any))
                          }
                        >
                          {report.player_name}
                        </Button>
                      </td>
                      <td>
                        <span className="age-text">{report.age || "N/A"}</span>
                      </td>
                      <td>
                        <span className="position-text">
                          {report.position_played || "N/A"}
                        </span>
                      </td>
                      <td>
                        {report.fixture_date && report.fixture_date !== "N/A"
                          ? new Date(report.fixture_date).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td>
                        {report.fixture_details &&
                        report.fixture_details !== "N/A"
                          ? report.fixture_details
                          : "N/A"}
                      </td>
                      <td>{report.scout_name}</td>
                      <td>
                        {getReportTypeBadge(
                          report.report_type,
                          report.scouting_type,
                          report,
                        )}
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
                                backgroundColor: getGradeColor(report.flag_category),
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
                      </td>
                      <td>
                        <div className="d-flex align-items-center justify-content-center gap-1">
                          <span
                            className={`badge ${
                              report.performance_score === 9 ? 'performance-score-9' :
                              report.performance_score === 10 ? 'performance-score-10' : ''
                            }`}
                            style={{
                              backgroundColor: getPerformanceScoreColor(
                                report.performance_score,
                              ),
                              color: "white !important",
                              fontWeight: "bold",
                              fontSize: "0.9rem",
                              ...(report.performance_score !== 9 && report.performance_score !== 10 ? { border: "none" } : {}),
                            }}
                            title={report.is_potential ? "Potential Score" : undefined}
                          >
                            {report.performance_score}{report.is_potential && "*"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div
                          className="btn-group"
                          style={{ justifyContent: "center" }}
                        >
                          <Button
                            size="sm"
                            onClick={() =>
                              handleOpenReportModal(report.report_id)
                            }
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
                            onClick={() => handleEditReport(report.report_id)}
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
                            onClick={() => handleDeleteReport(report.report_id)}
                            className="btn-action-circle btn-action-delete"
                          >
                            🗑️
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </Table>
            </div>
          ) : (
            <Row>
              {loading ? (
                <ShimmerLoading variant="card" count={9} />
              ) : scoutReports.length === 0 ? (
                <Col xs={12}>
                  <div className="text-center text-muted py-5">
                    No reports found
                  </div>
                </Col>
              ) : (
                scoutReports.map((report) => (
                <Col
                  sm={6}
                  md={4}
                  lg={3}
                  key={report.report_id}
                  className="mb-4"
                >
                  <Card
                    className={`h-100 shadow-sm hover-card ${report.is_archived ? 'report-card-archived' : ''}`}
                    style={{
                      borderRadius: "8px",
                      border: "1px solid #dee2e6",
                      position: "relative",
                      borderLeft: !report.has_been_viewed ? "4px solid #0d6efd" : "4px solid transparent",
                    }}
                  >
                    <Card.Body className="p-3">
                      {/* Top Row - 2 columns */}
                      <Row className="mb-3 pb-2 border-bottom">
                        {/* Left: Player Info */}
                        <Col xs={6}>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 text-decoration-none fw-bold d-block mb-1"
                              style={{
                                color: "#212529",
                                fontSize: "1rem",
                                textAlign: "left",
                              }}
                              onClick={() =>
                                navigate(getPlayerProfilePath(report as any))
                              }
                            >
                              {report.player_name}
                            </Button>
                            <small className="text-muted d-block">
                              Position: {report.position_played || "N/A"}
                            </small>
                            <small className="text-muted d-block">
                              Age: {report.age || "N/A"}
                            </small>
                          </div>
                        </Col>

                        {/* Right: Scout Info */}
                        <Col xs={6} className="text-end">
                          <div>
                            {report.is_archived && (
                              <span className="badge-archived d-block mb-1">ARCHIVED</span>
                            )}
                            <small className="text-muted d-block">
                              {report.scout_name}
                            </small>
                            <small className="text-muted d-block">
                              Report Date:{" "}
                              {new Date(report.created_at).toLocaleDateString()}
                            </small>
                          </div>
                        </Col>
                      </Row>

                      {/* Middle Row - 2 columns */}
                      <Row className="mb-3 pb-2 border-bottom">
                        {/* Left: Fixture Info */}
                        <Col xs={6}>
                          <div>
                            {report.fixture_date &&
                            report.fixture_date !== "N/A" ? (
                              <>
                                <small
                                  className="text-muted d-block mb-1"
                                  style={{
                                    fontSize: "0.75rem",
                                    lineHeight: "1.2",
                                  }}
                                >
                                  <span className="fw-semibold">
                                    Fixture Date:
                                  </span>{" "}
                                  {new Date(
                                    report.fixture_date,
                                  ).toLocaleDateString()}
                                </small>
                                {report.fixture_details &&
                                  report.fixture_details !== "N/A" && (
                                    <small
                                      className="text-muted d-block"
                                      style={{
                                        fontSize: "0.75rem",
                                        lineHeight: "1.2",
                                      }}
                                    >
                                      <span className="fw-semibold">
                                        Fixture:
                                      </span>{" "}
                                      {report.fixture_details}
                                    </small>
                                  )}
                              </>
                            ) : (
                              <>
                                <small
                                  className="text-muted d-block mb-1"
                                  style={{
                                    fontSize: "0.75rem",
                                    lineHeight: "1.2",
                                  }}
                                >
                                  <span className="fw-semibold">
                                    Fixture Date:
                                  </span>{" "}
                                  N/A
                                </small>
                                <small
                                  className="text-muted d-block"
                                  style={{
                                    fontSize: "0.75rem",
                                    lineHeight: "1.2",
                                  }}
                                >
                                  <span className="fw-semibold">Fixture:</span>{" "}
                                  N/A
                                </small>
                              </>
                            )}
                          </div>
                        </Col>

                        {/* Right: Score */}
                        <Col xs={6} className="text-end">
                          <div>
                            {report.report_type?.toLowerCase() !== "flag" &&
                            report.report_type?.toLowerCase() !== "flag assessment" ? (
                              <>
                                <small className="text-muted fw-semibold d-block">
                                  Score
                                </small>
                                <span
                                  className={`badge ${
                                    report.performance_score === 9 ? 'performance-score-9' :
                                    report.performance_score === 10 ? 'performance-score-10' : ''
                                  }`}
                                  style={{
                                    backgroundColor: getPerformanceScoreColor(
                                      report.performance_score,
                                    ),
                                    color: "white !important",
                                    fontWeight: "bold",
                                    fontSize: "0.9rem",
                                    ...(report.performance_score !== 9 && report.performance_score !== 10 ? { border: "none" } : {}),
                                  }}
                                  title={report.is_potential ? "Potential Score" : undefined}
                                >
                                  {report.performance_score}{report.is_potential && "*"}
                                </span>
                              </>
                            ) : (
                              getFlagTypeText(report)
                            )}
                          </div>
                        </Col>
                      </Row>

                      {/* Bottom Row - Tags and Actions */}
                      <Row className="align-items-center">
                        {/* Left: Tags */}
                        <Col xs={6}>
                          <div className="d-flex align-items-center gap-1">
                            <small className="text-muted fw-semibold me-1">
                              Tags:
                            </small>
                            {getReportTypeBadge(
                              report.report_type,
                              report.scouting_type,
                              report,
                            )}
                            {report.scouting_type && (
                              <span className="ms-1">
                                {getScoutingTypeBadge(report.scouting_type)}
                              </span>
                            )}
                          </div>
                        </Col>

                        {/* Right: Actions */}
                        <Col xs={6} className="text-end">
                          <div className="d-flex justify-content-end gap-1">
                            <Button
                              size="sm"
                              className="btn-action-circle btn-action-view"
                              onClick={() =>
                                handleOpenReportModal(report.report_id)
                              }
                              disabled={loadingReportId === report.report_id}
                              title="View Report"
                            >
                              {loadingReportId === report.report_id ? (
                                <Spinner
                                  as="span"
                                  animation="border"
                                  size="sm"
                                />
                              ) : (
                                "👁️"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              className="btn-action-circle btn-action-edit"
                              title="Edit"
                              onClick={() => handleEditReport(report.report_id)}
                              disabled={loadingReportId === report.report_id}
                            >
                              {loadingReportId === report.report_id ? (
                                <Spinner
                                  as="span"
                                  animation="border"
                                  size="sm"
                                />
                              ) : (
                                "✏️"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              className="btn-action-circle btn-action-delete"
                              title="Delete"
                              onClick={() =>
                                handleDeleteReport(report.report_id)
                              }
                            >
                              🗑️
                            </Button>
                          </div>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                </Col>
              )))}
            </Row>
          )}

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <Row className="mt-3 justify-content-center">
              <Col md={6}>
                <div className="d-flex align-items-center justify-content-center">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="me-2"
                  >
                    ‹
                  </Button>
                  <small className="text-muted mx-2">
                    Page {currentPage} of {totalPages}
                  </small>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
                  >
                    ›
                  </Button>
                </div>
              </Col>
            </Row>
          )}
        </>
      )}

      <PlayerReportModal
        show={showReportModal}
        onHide={() => setShowReportModal(false)}
        report={selectedReport}
      />
    </Container>
  );
};

export default ScoutingPage;
