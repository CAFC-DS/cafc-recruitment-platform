import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Row,
  Spinner,
  Tab,
  Table,
  Tabs,
} from "react-bootstrap";
import axios from "axios";
import axiosInstance from "../axiosInstance";
import DataClashesTab from "../components/DataClashesTab";
import InternalPlayerAuditTab from "../components/admin/InternalPlayerAuditTab";

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  firstname: string;
  lastname: string;
}

interface CreateUserForm {
  username: string;
  email: string;
  password: string;
  role: string;
  firstname: string;
  lastname: string;
}

const AdminPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>("data-quality");
  const [activeDataQualityTab, setActiveDataQualityTab] = useState<string>("internal-audit");

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [auditStats, setAuditStats] = useState({
    totalCandidates: 0,
    unresolved: 0,
    lastScanAt: "",
  });
  const [clashCount, setClashCount] = useState(0);

  const handleAuditStatsChange = useCallback(
    (stats: { totalCandidates: number; unresolved: number; lastScanAt: string }) => {
      setAuditStats(stats);
    },
    []
  );

  const handleClashSummaryChange = useCallback((total: number) => {
    setClashCount(total);
  }, []);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: "",
    email: "",
    password: "",
    role: "scout",
    firstname: "",
    lastname: "",
  });
  const [createLoading, setCreateLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await axiosInstance.get("/admin/users");
      setUsers(response.data.users || []);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to fetch users");
      } else {
        setError("Failed to fetch users");
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await axiosInstance.post("/admin/users", createForm);
      setSuccess(`User '${createForm.username}' created successfully`);
      setShowCreateModal(false);
      setCreateForm({
        username: "",
        email: "",
        password: "",
        role: "scout",
        firstname: "",
        lastname: "",
      });
      fetchUsers();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to create user");
      } else {
        setError("Failed to create user");
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleteLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await axiosInstance.delete(`/admin/users/${userToDelete.id}`);
      setSuccess(`User '${userToDelete.username}' deleted successfully`);
      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to delete user");
      } else {
        setError("Failed to delete user");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    setError(null);
    setSuccess(null);
    try {
      await axiosInstance.put(`/admin/users/${userId}/role?new_role=${newRole}`);
      setSuccess(`User role updated to '${newRole}'`);
      fetchUsers();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to update role");
      } else {
        setError("Failed to update role");
      }
    }
  };

  const runAdminAction = async (
    endpoint: string,
    successMessage: (data: any) => string,
    confirmText?: string
  ) => {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const response = await axiosInstance.post(endpoint);
      setSuccess(successMessage(response.data));
      if (endpoint.includes("roles") || endpoint.includes("users") || endpoint.includes("email")) {
        fetchUsers();
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Admin action failed");
      } else {
        setError("Admin action failed");
      }
    }
  };

  const totalUsers = users.length;
  const lastScanLabel = useMemo(() => {
    if (!auditStats.lastScanAt) return "No scan yet";
    const d = new Date(auditStats.lastScanAt);
    return Number.isNaN(d.getTime()) ? auditStats.lastScanAt : d.toLocaleString();
  }, [auditStats.lastScanAt]);

  return (
    <Container className="mt-4 admin-console">
      <div className="admin-console-header mb-4">
        <h2 className="mb-1">Admin Operations Console</h2>
        <p className="text-muted mb-0">
          Manage users, audit internal duplicates, and run controlled system operations.
        </p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Row className="g-3 mb-4">
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Users</div>
              <div className="metric-value">{totalUsers}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Internal Candidates</div>
              <div className="metric-value">{auditStats.totalCandidates}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">Unresolved Internal</div>
              <div className="metric-value">{auditStats.unresolved}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="admin-metric-card">
            <Card.Body>
              <div className="metric-title">General Clashes</div>
              <div className="metric-value">{clashCount}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-4 admin-card">
        <Card.Body className="py-2">
          <small className="text-muted">Last internal scan: {lastScanLabel}</small>
        </Card.Body>
      </Card>

      <Tabs
        id="admin-sections"
        activeKey={activeSection}
        onSelect={(key) => setActiveSection(key || "data-quality")}
        className="mb-3 admin-tabs"
      >
        <Tab eventKey="data-quality" title="Data Quality">
          <Card className="admin-card">
            <Card.Header className="admin-card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Data Quality Workbench</h5>
                <Badge bg="light" text="dark">
                  Internal-first review mode
                </Badge>
              </div>
            </Card.Header>
            <Card.Body>
              <Tabs
                id="admin-data-quality-tabs"
                activeKey={activeDataQualityTab}
                onSelect={(key) => setActiveDataQualityTab(key || "internal-audit")}
                className="mb-3"
              >
                <Tab eventKey="internal-audit" title="Internal Player Audit">
                  <InternalPlayerAuditTab
                    onStatsChange={handleAuditStatsChange}
                  />
                </Tab>
                <Tab eventKey="general-clashes" title="General Clashes">
                  <DataClashesTab onSummaryChange={handleClashSummaryChange} />
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="users" title="User Management">
          <Card className="admin-card">
            <Card.Header className="admin-card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">User Accounts & Roles</h5>
              <Button variant="light" size="sm" onClick={() => setShowCreateModal(true)}>
                Create User
              </Button>
            </Card.Header>
            <Card.Body>
              {loadingUsers ? (
                <div className="text-center py-4">
                  <Spinner animation="border" />
                  <p className="mt-2 mb-0">Loading users...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{user.username}</td>
                          <td>{`${user.firstname || ""} ${user.lastname || ""}`.trim() || "N/A"}</td>
                          <td>{user.email || "N/A"}</td>
                          <td>
                            <Badge bg="secondary">{user.role}</Badge>
                          </td>
                          <td className="d-flex gap-2">
                            <Form.Select
                              size="sm"
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              style={{ maxWidth: "180px" }}
                            >
                              <option value="scout">Scout</option>
                              <option value="loan_manager">Loan Manager</option>
                              <option value="manager">Manager</option>
                              <option value="senior_manager">Senior Manager</option>
                              <option value="admin">Admin</option>
                            </Form.Select>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => {
                                setUserToDelete(user);
                                setShowDeleteModal(true);
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="system-ops" title="System Ops">
          <Card className="admin-card">
            <Card.Header className="admin-card-header">
              <h5 className="mb-0">Maintenance & Migration Controls</h5>
            </Card.Header>
            <Card.Body>
              <Row className="g-3">
                <Col md={6}>
                  <Card className="h-100">
                    <Card.Body>
                      <h6 className="mb-2">Schema & Data Setup</h6>
                      <p className="text-muted small">
                        One-off setup and compatibility actions.
                      </p>
                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={() =>
                            runAdminAction("/admin/add-email-column", (d) => d.message)
                          }
                        >
                          Add Email Column
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-warning"
                          onClick={() =>
                            runAdminAction(
                              "/admin/setup-cafc-player-ids",
                              (d) => `CAFC setup complete: ${(d.results || []).join(", ") || d.message}`
                            )
                          }
                        >
                          Setup CAFC IDs
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-info"
                          onClick={() =>
                            runAdminAction(
                              "/admin/migrate-purpose-values",
                              (d) =>
                                `Purpose migration complete. ${d.total_updates ?? 0} rows updated.`
                            )
                          }
                        >
                          Migrate Purpose Values
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="h-100">
                    <Card.Body>
                      <h6 className="mb-2">User Role/Test Utilities</h6>
                      <p className="text-muted small">
                        Controlled user-role migration and test account generation.
                      </p>
                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline-success"
                          onClick={() =>
                            runAdminAction(
                              "/admin/migrate-roles",
                              () => "Role migration complete.",
                              "Migrate user roles to latest role naming?"
                            )
                          }
                        >
                          Migrate Roles
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() =>
                            runAdminAction(
                              "/admin/create-test-users",
                              (d) => d.message || "Test user creation complete.",
                              "Create test users for all role types?"
                            )
                          }
                        >
                          Create Test Users
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Create New User</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleCreateUser}>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>First Name</Form.Label>
              <Form.Control
                type="text"
                value={createForm.firstname}
                onChange={(e) => setCreateForm({ ...createForm, firstname: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Last Name</Form.Label>
              <Form.Control
                type="text"
                value={createForm.lastname}
                onChange={(e) => setCreateForm({ ...createForm, lastname: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                required
                minLength={8}
              />
            </Form.Group>
            <Form.Group className="mb-1">
              <Form.Label>Role</Form.Label>
              <Form.Select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                <option value="scout">Scout</option>
                <option value="loan_manager">Loan Manager</option>
                <option value="manager">Manager</option>
                <option value="senior_manager">Senior Manager</option>
                <option value="admin">Admin</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button variant="dark" onClick={handleCreateUser} disabled={createLoading}>
            {createLoading ? "Creating..." : "Create User"}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete User</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Delete <strong>{userToDelete?.username}</strong> permanently?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteUser} disabled={deleteLoading}>
            {deleteLoading ? "Deleting..." : "Delete"}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default AdminPage;
