import React, { useState, useEffect, useCallback } from "react";
import {
  Container,
  Form,
  Button,
  Row,
  Col,
  Card,
  Spinner,
  Badge,
  Toast,
  ToastContainer,
  Alert,
  Collapse,
  Table,
  Modal,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import IntelModal from "../components/IntelModal";
import IntelReportModal from "../components/IntelReportModal";
import ShimmerLoading from "../components/ShimmerLoading";
import { useAuth } from "../App";
import { useViewMode } from "../contexts/ViewModeContext";

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
  const [itemsPerPage] = useState(20); // Corresponds to 'limit'
  const [recencyFilter, setRecencyFilter] = useState<string>("7"); // '7', '30', '90', 'all'
  const [loading, setLoading] = useState(false);
  const [errorReports, setErrorReports] = useState<string | null>(null);

  // Intel report viewing
  const [showIntelReportModal, setShowIntelReportModal] = useState(false);
  const [selectedIntelId, setSelectedIntelId] = useState<number | null>(null);

  // Toast notifications
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<
    "success" | "danger" | "info"
  >("success");

  // Admin functionality
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [, setUserRole] = useState<string>("");
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Filter collapse state
  const [showFilters, setShowFilters] = useState(false);

  // Advanced filters for Intel
  const [actionFilter, setActionFilter] = useState("");
  const [contactNameFilter, setContactNameFilter] = useState("");
  const [playerNameFilter, setPlayerNameFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  // Edit and delete functionality
  const [editMode, setEditMode] = useState(false);
  const [editReportId, setEditReportId] = useState<number | null>(null);
  const [editReportData, setEditReportData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null);

  // Role-based permissions
  const [, setCurrentUsername] = useState("");

  // Toast helper function
  const showNotification = (
    message: string,
    variant: "success" | "danger" | "info" = "success",
  ) => {
    setToastMessage(message);
    setToastVariant(variant);
    setShowToast(true);
  };

  // Update intel table
  const updateIntelTable = async () => {
    setIsLoadingAdmin(true);
    try {
      const response = await axiosInstance.post("/admin/update-intel-table");
      showNotification(response.data.message, "success");
      fetchIntelReports(currentPage, itemsPerPage, recencyFilter); // Re-fetch with current filters
    } catch (error: any) {
      showNotification(
        error.response?.data?.detail || "Failed to update intel table",
        "danger",
      );
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  // Optimize database performance
  const optimizeDatabase = async () => {
    setIsLoadingAdmin(true);
    try {
      const response = await axiosInstance.post("/admin/optimize-database");
      showNotification(response.data.message, "success");
    } catch (error: any) {
      showNotification(
        error.response?.data?.detail || "Failed to optimize database",
        "danger",
      );
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const fetchIntelReports = useCallback(
    async (page: number, limit: number, recency: string) => {
      setLoading(true);
      setErrorReports(null);
      try {
        const params: any = {
          page,
          limit,
        };

        // Only add recency_days if it's not 'all'
        if (recency !== "all") {
          params.recency_days = parseInt(recency);
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
    [],
  );

  // Fetch user role and username for role-based filtering
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await axiosInstance.get("/users/me");
      setUserRole(response.data.role || "scout");
      setCurrentUsername(response.data.username || "");
      setShowAdminTools(response.data.role === "admin");
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

  // Handle editing intel report
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
      showNotification("Error loading report for editing", "danger");
    } finally {
      setLoadingReportId(null);
    }
  };

  // Handle deleting intel report
  const handleDeleteReport = (reportId: number) => {
    setDeleteReportId(reportId);
    setShowDeleteModal(true);
  };

  const confirmDeleteReport = async () => {
    if (!deleteReportId) return;

    try {
      setDeleteLoading(true);
      await axiosInstance.delete(`/intel_reports/${deleteReportId}`);
      showNotification("Intel report deleted successfully", "success");
      setShowDeleteModal(false);
      setDeleteReportId(null);
      // Refresh the reports list
      fetchIntelReports(currentPage, itemsPerPage, recencyFilter);
    } catch (error) {
      console.error("Error deleting intel report:", error);
      showNotification("Error deleting intel report", "danger");
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

  useEffect(() => {
    if (token) {
      fetchUserInfo().then(() => {
        fetchIntelReports(currentPage, itemsPerPage, recencyFilter);
      });
    }
  }, [
    token,
    currentPage,
    itemsPerPage,
    recencyFilter,
    fetchIntelReports,
    fetchUserInfo,
  ]);


  const getActionRequiredBadge = (action: string) => {
    switch (action) {
      case "beyond us":
        return <Badge className="badge-neutral-grey">Beyond Us</Badge>;
      case "discuss urgently":
        return <Badge className="badge-neutral-grey">Discuss Urgently</Badge>;
      case "monitor":
        return <Badge className="badge-neutral-grey">Monitor</Badge>;
      case "no action":
        return <Badge className="badge-neutral-grey">No Action</Badge>;
      default:
        return <Badge className="badge-neutral-grey">{action}</Badge>;
    }
  };

  const formatDealTypes = (dealTypes: string[]) => {
    if (!dealTypes || dealTypes.length === 0) return "N/A";
    return dealTypes.join(", ");
  };

  const handleViewIntelReport = (intelId: number) => {
    setSelectedIntelId(intelId);
    setShowIntelReportModal(true);
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Filter reports based on advanced filters
  const getFilteredIntelReports = () => {
    let filtered = intelReports;

    // Action required filter
    if (actionFilter) {
      filtered = filtered.filter(
        (report) =>
          report.action_required.toLowerCase() === actionFilter.toLowerCase(),
      );
    }

    // Contact name filter
    if (contactNameFilter) {
      filtered = filtered.filter((report) =>
        report.contact_name
          .toLowerCase()
          .includes(contactNameFilter.toLowerCase()),
      );
    }

    // Player name filter
    if (playerNameFilter) {
      filtered = filtered.filter((report) =>
        containsAccentInsensitive(report.player_name, playerNameFilter),
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

  const filteredIntelReports = getFilteredIntelReports();

  return (
    <Container className="mt-4">
      {/* Admin Tools */}
      {showAdminTools && (
        <Alert variant="info" className="mt-3">
          <Alert.Heading>🔧 Admin Tools</Alert.Heading>
          <p>
            Update the player_information table to support role-based access and
            missing columns.
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <Button
              variant="outline-primary"
              onClick={updateIntelTable}
              disabled={isLoadingAdmin}
            >
              {isLoadingAdmin ? (
                <Spinner animation="border" size="sm" />
              ) : (
                "🔧 Update Intel Table"
              )}
            </Button>
            <Button
              variant="outline-info"
              onClick={optimizeDatabase}
              disabled={isLoadingAdmin}
            >
              {isLoadingAdmin ? (
                <Spinner animation="border" size="sm" />
              ) : (
                "⚡ Optimize Database"
              )}
            </Button>
          </div>
        </Alert>
      )}

      {showIntelModal && (
        <IntelModal
          show={showIntelModal}
          onHide={handleIntelModalHide}
          selectedPlayer={null}
          onIntelSubmitSuccess={() => {
            handleIntelModalHide();
            showNotification("Intel report submitted successfully!", "success");
            fetchIntelReports(currentPage, itemsPerPage, recencyFilter); // Re-fetch with current filters
          }}
        />
      )}

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
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowIntelModal(true)}
          >
            Add Intel Report
          </Button>
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
          {Math.ceil(totalReports / itemsPerPage) > 1 && (
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
                Page {currentPage} of {Math.ceil(totalReports / itemsPerPage)}
              </small>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={
                  currentPage >= Math.ceil(totalReports / itemsPerPage) ||
                  loading
                }
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
          <Card.Body>
            <Row>
              <Col md={3}>
                <Form.Group className="mb-3">
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
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Contact Name
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="Enter contact name"
                    value={contactNameFilter}
                    onChange={(e) => setContactNameFilter(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
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
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Date Range</Form.Label>
                  <div className="d-flex gap-1">
                    <Form.Control
                      size="sm"
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                    />
                    <Form.Control
                      size="sm"
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                    />
                  </div>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col>
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
                >
                  🔄 Clear Filters
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Collapse>
      </Card>

      {loading ? (
        viewMode === "table" ? (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>Date</th>
                <th>Player</th>
                <th>Contact</th>
                <th>Organisation</th>
                <th>Action Required</th>
                <th>Deal Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <ShimmerLoading variant="table" count={10} />
            </tbody>
          </Table>
        ) : (
          <Row>
            <ShimmerLoading variant="card" count={9} />
          </Row>
        )
      ) : errorReports ? (
        <Alert variant="danger" className="text-center">
          {errorReports}
        </Alert>
      ) : intelReports.length === 0 ? (
        <Card className="text-center p-4">
          <Card.Body>
            <h5>No Intel Reports Yet</h5>
            <p className="text-muted">
              Start by selecting a player and creating an intel report, or
              adjust your filters.
            </p>
          </Card.Body>
        </Card>
      ) : viewMode === "cards" ? (
        <Row>
          {filteredIntelReports.map((report) => (
            <Col key={report.intel_id} lg={6} xl={4} className="mb-4">
              <Card
                className="h-100 shadow-sm hover-card"
                style={{ borderRadius: "12px", border: "1px solid #dee2e6" }}
              >
                <Card.Header
                  className="border-0 bg-gradient"
                  style={{
                    background:
                      "linear-gradient(135deg, #e8f4f8 0%, #d1ecf1 100%)",
                    borderRadius: "12px 12px 0 0",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      {report.player_id ? (
                        <Button
                          variant="link"
                          className="p-0 text-decoration-none fw-bold h5 mb-1"
                          style={{ color: "#212529" }}
                          onClick={() =>
                            navigate(`/player/${report.player_id}`)
                          }
                        >
                          {report.player_name}
                        </Button>
                      ) : (
                        <h5
                          className="fw-bold mb-1"
                          style={{ color: "#212529" }}
                        >
                          {report.player_name}
                        </h5>
                      )}
                      <div className="mb-2">
                        <Badge className="badge-neutral-grey">
                          🕵️ Intel Report
                        </Badge>
                      </div>
                    </div>
                    <div className="text-end">
                      <small className="text-muted d-block">
                        {new Date(report.created_at).toLocaleDateString()}
                      </small>
                      <small className="text-muted">
                        📅{" "}
                        {new Date(
                          report.date_of_information,
                        ).toLocaleDateString()}
                      </small>
                    </div>
                  </div>
                </Card.Header>
                <Card.Body className="pb-2">
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <strong className="text-muted small">CONTACT</strong>
                      <div className="text-center">
                        {getActionRequiredBadge(report.action_required)}
                      </div>
                    </div>
                    <div>
                      <div className="fw-bold">{report.contact_name}</div>
                      <small className="text-muted">
                        {report.contact_organisation}
                      </small>
                    </div>
                  </div>

                  <div className="row mb-3">
                    {report.confirmed_contract_expiry && (
                      <div className="col-6">
                        <div
                          className="text-center p-2 rounded"
                          style={{ backgroundColor: "#f8f9fa" }}
                        >
                          <div className="fw-bold text-muted small mb-1">
                            CONTRACT
                          </div>
                          <small className="fw-bold">
                            {new Date(
                              report.confirmed_contract_expiry,
                            ).toLocaleDateString()}
                          </small>
                        </div>
                      </div>
                    )}
                    {report.transfer_fee && (
                      <div className="col-6">
                        <div
                          className="text-center p-2 rounded"
                          style={{ backgroundColor: "#f8f9fa" }}
                        >
                          <div className="fw-bold text-muted small mb-1">
                            FEE
                          </div>
                          <small className="fw-bold">
                            {report.transfer_fee}
                          </small>
                        </div>
                      </div>
                    )}
                  </div>

                  {report.potential_deal_types &&
                    report.potential_deal_types.length > 0 && (
                      <div className="mb-3">
                        <small className="text-muted">
                          <strong>Deal Types:</strong>{" "}
                          {formatDealTypes(report.potential_deal_types)}
                        </small>
                      </div>
                    )}

                  {report.conversation_notes && (
                    <div className="mb-2">
                      <small className="text-muted">
                        <strong>Notes:</strong>{" "}
                        {report.conversation_notes.length > 100
                          ? `${report.conversation_notes.substring(0, 100)}...`
                          : report.conversation_notes}
                      </small>
                    </div>
                  )}
                </Card.Body>
                <Card.Footer className="bg-transparent border-0 pt-0">
                  <div className="d-grid gap-2 d-md-flex">
                    <Button
                      variant="outline-dark"
                      size="sm"
                      className="rounded-circle"
                      onClick={() => handleViewIntelReport(report.intel_id)}
                      title="View Details"
                      style={{
                        width: "32px",
                        height: "32px",
                        padding: "0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      👁️
                    </Button>
                    {report.player_id && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="rounded-pill"
                        onClick={() => navigate(`/player/${report.player_id}`)}
                        title="View Player Profile"
                      >
                        👤
                      </Button>
                    )}
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="rounded-pill"
                      onClick={() => handleEditReport(report.intel_id)}
                      disabled={loadingReportId === report.intel_id}
                      title="Edit"
                    >
                      {loadingReportId === report.intel_id ? (
                        <Spinner as="span" animation="border" size="sm" />
                      ) : (
                        "✏️"
                      )}
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      className="rounded-pill"
                      onClick={() => handleDeleteReport(report.intel_id)}
                      title="Delete"
                    >
                      🗑️
                    </Button>
                  </div>
                </Card.Footer>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <div className="table-responsive">
          <Table responsive hover className="table-modern">
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
              {filteredIntelReports.map((report) => (
                <tr key={report.intel_id} className="align-middle">
                  <td>{new Date(report.created_at).toLocaleDateString()}</td>
                  <td>
                    {report.player_id ? (
                      <Button
                        variant="link"
                        className="p-0 text-decoration-none text-start fw-bold"
                        onClick={() => navigate(`/player/${report.player_id}`)}
                      >
                        {report.player_name}
                      </Button>
                    ) : (
                      <strong>{report.player_name}</strong>
                    )}
                  </td>
                  <td>
                    <div>
                      <strong>{report.contact_name}</strong>
                      <br />
                      <small className="text-muted">
                        {report.contact_organisation}
                      </small>
                    </div>
                  </td>
                  <td>
                    <small>
                      {report.confirmed_contract_expiry
                        ? new Date(
                            report.confirmed_contract_expiry,
                          ).toLocaleDateString()
                        : "N/A"}
                    </small>
                  </td>
                  <td>
                    <small>
                      {formatDealTypes(report.potential_deal_types)}
                    </small>
                  </td>
                  <td>{getActionRequiredBadge(report.action_required)}</td>
                  <td>
                    <div className="btn-group">
                      <Button
                        variant="outline-dark"
                        size="sm"
                        onClick={() => handleViewIntelReport(report.intel_id)}
                        title="View Intel Report"
                        className="rounded-circle"
                        style={{
                          width: "32px",
                          height: "32px",
                          padding: "0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        👁️
                      </Button>
                      {report.player_id && (
                        <Button
                          variant="outline-info"
                          size="sm"
                          onClick={() =>
                            navigate(`/player/${report.player_id}`)
                          }
                          title="View Player Profile"
                        >
                          👤
                        </Button>
                      )}
                      <Button
                        variant="outline-secondary"
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
                        variant="outline-danger"
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
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Intel Report Modal */}
      <IntelReportModal
        show={showIntelReportModal}
        onHide={() => setShowIntelReportModal(false)}
        intelId={selectedIntelId}
      />

      {/* Toast Notifications */}
      <ToastContainer position="top-end" className="p-3">
        <Toast
          show={showToast}
          onClose={() => setShowToast(false)}
          delay={4000}
          autohide
          bg={toastVariant}
        >
          <Toast.Header>
            <strong className="me-auto">
              {toastVariant === "success"
                ? "✅ Success"
                : toastVariant === "danger"
                  ? "❌ Error"
                  : "ℹ️ Info"}
            </strong>
          </Toast.Header>
          <Toast.Body
            className={toastVariant === "success" ? "text-white" : ""}
          >
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      <style>{`
        .hover-card {
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        .hover-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .table-modern {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .table-modern thead th {
          background: #000000;
          color: white;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 0.85rem;
          border: none;
          padding: 1rem 0.75rem;
        }
        .table-modern tbody tr {
          transition: all 0.2s ease;
        }
        .table-modern tbody tr:hover {
          background-color: #f8f9ff;
          transform: scale(1.002);
        }
        .table-modern td {
          padding: 1rem 0.75rem;
          vertical-align: middle;
          border-top: 1px solid #e9ecef;
          text-align: left;
        }
        .table-modern th {
          text-align: left;
        }
        .table-modern .btn-link {
          text-align: left;
          justify-content: flex-start;
          padding-left: 0;
        }
        
        /* Dark mode card improvements */
        body.theme-dark .card, [data-bs-theme="dark"] .card {
          background-color: var(--bs-card-bg) !important;
          color: var(--bs-card-color) !important;
          border-color: var(--bs-card-border-color) !important;
        }
        body.theme-dark .card-header, [data-bs-theme="dark"] .card-header {
          background-color: var(--bs-card-bg) !important;
          color: var(--bs-card-color) !important;
          border-bottom-color: var(--bs-card-border-color) !important;
        }
        body.theme-dark .card-body, [data-bs-theme="dark"] .card-body {
          color: var(--bs-card-color) !important;
        }
        body.theme-dark .text-muted, [data-bs-theme="dark"] .text-muted {
          color: var(--bs-secondary-color) !important;
        }
        body.theme-dark .small.text-muted, [data-bs-theme="dark"] .small.text-muted {
          color: #d1d5db !important;
        }

        /* Charlton Athletic Badge Classes */
        .badge-cafc-red {
          background-color: #FF0000 !important;
          color: white !important;
        }
        .badge-cafc-black {
          background-color: #000000 !important;
          color: white !important;
        }
        .badge-cafc-white {
          background-color: #FFFFFF !important;
          color: #000000 !important;
          border: 1px solid #dee2e6;
        }
      `}</style>
    </Container>
  );
};

export default IntelPage;
