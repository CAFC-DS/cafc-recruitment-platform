import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Form,
  Button,
  Row,
  Col,
  ListGroup,
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
import { useAuth } from "../App";
import { useViewMode } from "../contexts/ViewModeContext";
import {
  getPerformanceScoreColor,
  getFlagColor,
  getContrastTextColor,
} from "../utils/colorUtils";
import { containsAccentInsensitive } from "../utils/textNormalization";
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

  // Role-based permissions
  const [userRole, setUserRole] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");

  // Edit and delete functionality
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchScoutReports = useCallback(
    async (recency: string) => {
      setLoading(true);
      setErrorReports(null);
      try {
        const params: any = {
          page: 1,
          limit: 1000, // Load all reports for client-side filtering and pagination
        };
        if (recency !== "all") {
          params.recency_days = parseInt(recency);
        }
        const response = await axiosInstance.get("/scout_reports/all", {
          params,
        });
        let reports = response.data.reports || [];

        // Role-based filtering is now handled by the backend
        // The backend already filters scout reports by USER_ID for scout users

        setScoutReports(reports);
        setTotalReports(reports.length); // Use actual loaded reports count
      } catch (error) {
        console.error("Error fetching scout reports:", error);
        setErrorReports("Failed to load scout reports. Please try again.");
        setScoutReports([]);
        setTotalReports(0);
      } finally {
        setLoading(false);
      }
    },
    [userRole, currentUsername],
  );

  // Fetch user role and username
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await axiosInstance.get("/users/me");
      setUserRole(response.data.role || "scout");
      setCurrentUsername(response.data.username || "");
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
      fetchScoutReports(recencyFilter);
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

  useEffect(() => {
    if (token) {
      fetchUserInfo().then(() => {
        fetchScoutReports(recencyFilter);
      });
    }
  }, [token, recencyFilter, fetchScoutReports, fetchUserInfo]);


  const handleOpenReportModal = async (report_id: number) => {
    setLoadingReportId(report_id);
    try {
      const response = await axiosInstance.get(`/scout_reports/${report_id}`);
      setSelectedReport(response.data);
      setShowReportModal(true);
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
    flagType?: string,
  ) => {
    switch (reportType.toLowerCase()) {
      case "flag":
      case "flag assessment":
        return getFlagBadge(flagType);
      case "clips":
        return <span className="badge badge-neutral-grey">Clips</span>;
      case "player assessment":
      case "player":
        return null; // Remove Player Assessment badge
      default:
        return <span className="badge badge-neutral-grey">{reportType}</span>;
    }
  };

  const getFlagBadge = (flagType?: string) => {
    const flagColor = getFlagColor(flagType || "");

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
        title={`Flag: ${flagType || "Unknown"}`}
      >
        🏳️
      </span>
    );
  };

  const getFlagTypeText = (flagType?: string) => {
    const flagColor = getFlagColor(flagType || "");

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
        {flagType || "Flag"}
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

  // Filter reports based on advanced filters
  const getFilteredReports = () => {
    let filtered = scoutReports;

    // Performance score filter - individual scores
    if (performanceScores.length > 0) {
      filtered = filtered.filter((report) =>
        performanceScores.includes(report.performance_score),
      );
    }

    // Age range filter
    if (minAge || maxAge) {
      filtered = filtered.filter((report) => {
        if (!report.age) return false;
        const min = minAge ? parseInt(minAge) : 0;
        const max = maxAge ? parseInt(maxAge) : 100;
        return report.age >= min && report.age <= max;
      });
    }

    // Scout name filter
    if (scoutNameFilter) {
      filtered = filtered.filter((report) =>
        report.scout_name.toLowerCase().includes(scoutNameFilter.toLowerCase()),
      );
    }

    // Player name filter
    if (playerNameFilter) {
      filtered = filtered.filter((report) =>
        containsAccentInsensitive(report.player_name, playerNameFilter),
      );
    }

    // Report type filter
    if (reportTypeFilter) {
      filtered = filtered.filter((report) =>
        report.report_type
          .toLowerCase()
          .includes(reportTypeFilter.toLowerCase()),
      );
    }

    // Scouting type filter
    if (scoutingTypeFilter) {
      filtered = filtered.filter(
        (report) =>
          report.scouting_type.toLowerCase() ===
          scoutingTypeFilter.toLowerCase(),
      );
    }

    // Position filter
    if (positionFilter) {
      filtered = filtered.filter(
        (report) =>
          report.position_played &&
          report.position_played
            .toLowerCase()
            .includes(positionFilter.toLowerCase()),
      );
    }

    // Date range filter
    if (dateFromFilter || dateToFilter) {
      filtered = filtered.filter((report) => {
        const reportDate = new Date(report.created_at);
        const fromDate = dateFromFilter
          ? new Date(dateFromFilter)
          : new Date("1900-01-01");
        const toDate = dateToFilter
          ? new Date(dateToFilter)
          : new Date("2100-12-31");
        return reportDate >= fromDate && reportDate <= toDate;
      });
    }

    return filtered;
  };

  const filteredReports = getFilteredReports();

  // Client-side pagination for filtered results
  const getPaginatedReports = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReports.slice(startIndex, endIndex);
  };

  const paginatedReports = getPaginatedReports();
  const filteredTotalPages = Math.ceil(filteredReports.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    performanceScores,
    minAge,
    maxAge,
    scoutNameFilter,
    playerNameFilter,
    dateFromFilter,
    dateToFilter,
    reportTypeFilter,
    scoutingTypeFilter,
    positionFilter,
  ]);

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
        onAssessmentSubmitSuccess={() => fetchScoutReports(recencyFilter)}
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
        </Col>
        <Col md={4} className="text-center">
          {filteredTotalPages > 1 && (
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
                Page {currentPage} of {filteredTotalPages}
              </small>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= filteredTotalPages || loading}
              >
                ›
              </Button>
            </div>
          )}
        </Col>
        <Col md={4} className="text-end">
          <small className="text-muted">
            Showing {Math.min(paginatedReports.length, itemsPerPage)} of{" "}
            {filteredReports.length} filtered results
            {filteredReports.length !== totalReports && (
              <span> ({totalReports} total)</span>
            )}
          </small>
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

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : errorReports ? (
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
                  {paginatedReports.map((report) => (
                    <tr key={report.report_id}>
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
                          (report as any).flag_category,
                        )}
                        {report.scouting_type && (
                          <span className="ms-1">
                            {getScoutingTypeBadge(report.scouting_type)}
                          </span>
                        )}
                      </td>
                      <td>
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
                            ...(report.performance_score !== 9 && report.performance_score !== 10 ? { border: "none" } : {}),
                          }}
                        >
                          {report.performance_score}
                        </span>
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
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <Row>
              {paginatedReports.map((report) => (
                <Col
                  sm={6}
                  md={4}
                  lg={3}
                  key={report.report_id}
                  className="mb-4"
                >
                  <Card
                    className="h-100 shadow-sm hover-card"
                    style={{ borderRadius: "8px", border: "1px solid #dee2e6" }}
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
                                >
                                  {report.performance_score}
                                </span>
                              </>
                            ) : (
                              getFlagTypeText((report as any).flag_category)
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
                              (report as any).flag_category,
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
              ))}
            </Row>
          )}

          {/* Bottom Pagination */}
          {filteredTotalPages > 1 && (
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
                    Page {currentPage} of {filteredTotalPages}
                  </small>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= filteredTotalPages || loading}
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
