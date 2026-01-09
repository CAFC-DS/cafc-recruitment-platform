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
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import IntelModal from "../components/IntelModal";
import IntelReportModal from "../components/IntelReportModal";
import ShimmerLoading from "../components/ShimmerLoading";
import { useAuth } from "../App";
import { useViewMode } from "../contexts/ViewModeContext";
import { getPlayerProfilePath } from "../utils/playerNavigation";

interface IntelReport {
  intel_id: number;
  created_at: string;
  player_name: string;
  contact_name: string;
  contact_organisation: string;
  date_of_information: string;
  confirmed_contract_expiry: string | null;
  contract_options: string | null;
  potential_deal_types: string[];
  transfer_fee: string | null;
  current_wages: string | null;
  expected_wages: string | null;
  conversation_notes: string;
  action_required: string;
  player_id: number | null;
  universal_id?: string;
  position?: string;
  squad_name?: string;
}

const IntelPage: React.FC = () => {
  const { token } = useAuth();
  const { viewMode, setViewMode, initializeUserViewMode } = useViewMode();
  const navigate = useNavigate();
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [intelReports, setIntelReports] = useState<IntelReport[]>([]);

  // Pagination and filter states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReports, setTotalReports] = useState(0);
  const [itemsPerPage] = useState(20);
  const [recencyFilter, setRecencyFilter] = useState<string>("7");
  const [loading, setLoading] = useState(false);
  const [errorReports, setErrorReports] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Advanced filters
  const [actionFilter, setActionFilter] = useState("");
  const [contactNameFilter, setContactNameFilter] = useState("");
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  // Intel report viewing
  const [showIntelReportModal, setShowIntelReportModal] = useState(false);
  const [selectedIntelId, setSelectedIntelId] = useState<number | null>(null);

  // Edit and delete functionality
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);

  const fetchIntelReports = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      setErrorReports(null);
      try {
        const params: any = {
          page,
          limit: itemsPerPage,
        };

        // Add recency filter
        if (recencyFilter !== "all") {
          params.recency_days = parseInt(recencyFilter);
        }

        const response = await axiosInstance.get("/intel_reports/all", {
          params,
        });

        setIntelReports(response.data.reports || []);
        setTotalReports(response.data.total_intel_reports || 0);
      } catch (error) {
        console.error("Error fetching intel reports:", error);
        setErrorReports("Failed to load intel reports. Please try again.");
        setIntelReports([]);
        setTotalReports(0);
      } finally {
        setLoading(false);
      }
    },
    [recencyFilter, itemsPerPage],
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
      const response = await axiosInstance.get(`/intel_reports/${reportId}`);
      setEditReportData(response.data);
      setEditReportId(reportId);
      setEditMode(true);
      setShowIntelModal(true);
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
      await axiosInstance.delete(`/intel_reports/${deleteReportId}`);
      setShowDeleteModal(false);
      setDeleteReportId(null);
      fetchIntelReports(1);
    } catch (error) {
      console.error("Error deleting intel report:", error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleIntelModalHide = () => {
    setShowIntelModal(false);
    setEditMode(false);
    setEditReportId(null);
    setEditReportData(null);
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
      return;
    }

    // Debounce text filters (500ms delay)
    const timer = setTimeout(() => {
      fetchIntelReports(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [
    token,
    recencyFilter,
    actionFilter,
    contactNameFilter,
    playerNameFilter,
    dateFromFilter,
    dateToFilter,
    currentPage,
    fetchIntelReports,
  ]);

  // Fetch when page changes (no debounce for pagination)
  useEffect(() => {
    if (token) {
      fetchIntelReports(currentPage);
    }
  }, [currentPage, token, fetchIntelReports]);

  const handleViewIntelReport = (intelId: number) => {
    setSelectedIntelId(intelId);
    setShowIntelReportModal(true);
  };

  const getActionRequiredBadge = (action: string) => {
    return <span className="badge badge-neutral-grey">{action}</span>;
  };

  const formatDealTypes = (dealTypes: string[]) => {
    if (!dealTypes || dealTypes.length === 0) return "N/A";
    return dealTypes.join(", ");
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Filter reports based on advanced filters
  const getFilteredIntelReports = () => {
    let filtered = intelReports;

    if (actionFilter) {
      filtered = filtered.filter(
        (report) =>
          report.action_required.toLowerCase() === actionFilter.toLowerCase(),
      );
    }

    if (contactNameFilter) {
      filtered = filtered.filter((report) =>
        report.contact_name
          .toLowerCase()
          .includes(contactNameFilter.toLowerCase()),
      );
    }

    if (playerNameFilter) {
      filtered = filtered.filter((report) =>
        report.player_name
          .toLowerCase()
          .includes(playerNameFilter.toLowerCase()),
      );
    }

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

  const filteredIntelReports = getFilteredIntelReports();
  const totalPages = Math.ceil(totalReports / itemsPerPage);

  return (
    <Container className="mt-4">

      <IntelModal
        show={showIntelModal}
        onHide={handleIntelModalHide}
        selectedPlayer={null}
        onIntelSubmitSuccess={() => fetchIntelReports(1)}
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
          Are you sure you want to delete this intel report? This action cannot
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
        <h3>Intel Reports</h3>
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
            Showing {Math.min(filteredIntelReports.length, itemsPerPage)} of{" "}
            {filteredIntelReports.length} filtered results
            {filteredIntelReports.length !== totalReports && (
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
            {/* Row 1: Player Name, Contact Name, Action Required */}
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
                  <Form.Label className="small fw-bold">Contact Name</Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="Enter contact name"
                    value={contactNameFilter}
                    onChange={(e) => setContactNameFilter(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">
                    Action Required
                  </Form.Label>
                  <Form.Select
                    size="sm"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                  >
                    <option value="">All Actions</option>
                    <option value="beyond us">Beyond Us</option>
                    <option value="discuss urgently">Discuss Urgently</option>
                    <option value="monitor">Monitor</option>
                    <option value="no action">No Action</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Row 2: Date Range, Clear Filters */}
            <Row className="mb-3">
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
                      setActionFilter("");
                      setContactNameFilter("");
                      setPlayerNameFilter("");
                      setDateFromFilter("");
                      setDateToFilter("");
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
                    <th>Date</th>
                    <th>Player</th>
                    <th>Contact</th>
                    <th>Contract Expiry</th>
                    <th>Deal Types</th>
                    <th>Action Required</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <ShimmerLoading variant="table" count={10} />
                  ) : intelReports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No reports found
                      </td>
                    </tr>
                  ) : (
                    filteredIntelReports.map((report) => (
                    <tr key={report.intel_id}>
                      <td>
                        {new Date(report.created_at).toLocaleDateString()}
                      </td>
                      <td>
                          <Button
                            variant="link"
                            onClick={() => navigate(getPlayerProfilePath(report as any))}
                          >
                            {report.player_name}
                          </Button>
                      </td>
                      <td>{report.contact_name}</td>
                      <td>
                        {report.confirmed_contract_expiry
                          ? new Date(
                              report.confirmed_contract_expiry,
                            ).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td>
                        {formatDealTypes(report.potential_deal_types)}
                      </td>
                      <td>{getActionRequiredBadge(report.action_required)}</td>
                      <td>
                        <div
                          className="btn-group"
                          style={{ justifyContent: "center" }}
                        >
                          <Button
                            size="sm"
                            onClick={() => handleViewIntelReport(report.intel_id)}
                            title="View Intel Report"
                            className="btn-action-circle btn-action-view"
                          >
                            👁️
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleEditReport(report.intel_id)}
                            disabled={loadingReportId === report.intel_id}
                            title="Edit"
                            className="btn-action-circle btn-action-edit"
                          >
                            {loadingReportId === report.intel_id ? (
                              <Spinner as="span" animation="border" size="sm" />
                            ) : (
                              "✏️"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeleteReport(report.intel_id)}
                            title="Delete"
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
              ) : intelReports.length === 0 ? (
                <Col xs={12}>
                  <div className="text-center text-muted py-5">
                    No reports found
                  </div>
                </Col>
              ) : (
                filteredIntelReports.map((report) => (
                <Col
                  sm={6}
                  md={4}
                  lg={3}
                  key={report.intel_id}
                  className="mb-4"
                >
                  <Card
                    className="h-100 shadow-sm hover-card"
                    style={{
                      borderRadius: "8px",
                      border: "1px solid #dee2e6",
                      position: "relative",
                    }}
                  >
                    <Card.Body className="p-3">
                      {/* Top Row - 2 columns */}
                      <Row className="mb-3 pb-2 border-bottom">
                        {/* Left: Player Info */}
                        <Col xs={6}>
                          <div>
                            {report.player_id ? (
                              <Button
                              variant="link"
                              className="p-0 text-decoration-none fw-bold d-block mb-1"
                              style={{
                                color: "#212529",
                                fontSize: "1rem",
                                textAlign: "left",
                              }}
                              onClick={() =>
                                navigate(`/player/${report.player_id}`)
                              }
                            >
                                {report.player_name}
                              </Button>
                            ) : (
                              <div
                                className="fw-bold d-block mb-1"
                                style={{
                                  color: "#212529",
                                  fontSize: "1rem",
                                }}
                              >
                                {report.player_name}
                              </div>
                            )}
                            <small className="text-muted d-block">
                              Intel Report
                            </small>
                          </div>
                        </Col>

                        {/* Right: Date Info */}
                        <Col xs={6} className="text-end">
                          <div>
                            <small className="text-muted d-block">
                              {report.contact_name}
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
                        {/* Left: Contact Info */}
                        <Col xs={6}>
                          <div>
                            <small
                              className="text-muted d-block mb-1"
                              style={{
                                fontSize: "0.75rem",
                                lineHeight: "1.2",
                              }}
                            >
                              <span className="fw-semibold">
                                Organisation:
                              </span>{" "}
                              {report.contact_organisation}
                            </small>
                            {report.confirmed_contract_expiry && (
                              <small
                                className="text-muted d-block"
                                style={{
                                  fontSize: "0.75rem",
                                  lineHeight: "1.2",
                                }}
                              >
                                <span className="fw-semibold">Contract:</span>{" "}
                                {new Date(
                                  report.confirmed_contract_expiry,
                                ).toLocaleDateString()}
                              </small>
                            )}
                          </div>
                        </Col>

                        {/* Right: Action Required */}
                        <Col xs={6} className="text-end">
                          <div>
                            <small className="text-muted fw-semibold d-block">
                              Action
                            </small>
                            {getActionRequiredBadge(report.action_required)}
                          </div>
                        </Col>
                      </Row>

                      {/* Bottom Row - Tags and Actions */}
                      <Row className="align-items-center">
                        {/* Left: Deal Info */}
                        <Col xs={6}>
                          <div className="d-flex align-items-center gap-1">
                            {report.potential_deal_types &&
                              report.potential_deal_types.length > 0 && (
                                <small className="text-muted fw-semibold me-1">
                                  {formatDealTypes(report.potential_deal_types)}
                                </small>
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
                                handleViewIntelReport(report.intel_id)
                              }
                              title="View Report"
                            >
                              👁️
                            </Button>
                            <Button
                              size="sm"
                              className="btn-action-circle btn-action-edit"
                              title="Edit"
                              onClick={() => handleEditReport(report.intel_id)}
                              disabled={loadingReportId === report.intel_id}
                            >
                              {loadingReportId === report.intel_id ? (
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
                                handleDeleteReport(report.intel_id)
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

      {/* Intel Report Modal */}
      <IntelReportModal
        show={showIntelReportModal}
        onHide={() => setShowIntelReportModal(false)}
        intelId={selectedIntelId}
      />
    </Container>
  );
};

export default IntelPage;
