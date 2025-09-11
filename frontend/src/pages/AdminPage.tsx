import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Button, Modal, Form, Alert, Spinner, Badge } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';
import axios from 'axios';

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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    email: '',
    password: '',
    role: 'scout',
    firstname: '',
    lastname: ''
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/admin/users');
      setUsers(response.data.users);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to fetch users');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await axiosInstance.post('/admin/users', createForm);
      setSuccess(`User '${createForm.username}' created successfully`);
      setShowCreateModal(false);
      setCreateForm({ username: '', email: '', password: '', role: 'scout', firstname: '', lastname: '' });
      fetchUsers(); // Refresh the list
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to create user');
      } else {
        setError('An unexpected error occurred');
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
      fetchUsers(); // Refresh the list
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to delete user');
      } else {
        setError('An unexpected error occurred');
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
      fetchUsers(); // Refresh the list
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to update role');
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  const addEmailColumn = async () => {
    setError(null);
    setSuccess(null);

    try {
      const response = await axiosInstance.post('/admin/add-email-column');
      setSuccess(response.data.message);
      fetchUsers(); // Refresh the list
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to add email column');
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  const setupCafcPlayerIds = async () => {
    setError(null);
    setSuccess(null);

    try {
      const response = await axiosInstance.post('/admin/setup-cafc-player-ids');
      setSuccess(`CAFC Player ID system setup completed! Results: ${response.data.results.join(', ')}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to setup CAFC Player IDs');
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  const migratePurposeValues = async () => {
    setError(null);
    setSuccess(null);

    try {
      const response = await axiosInstance.post('/admin/migrate-purpose-values');
      setSuccess(`Purpose values migration completed! ${response.data.message}. Total updates: ${response.data.total_updates}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Failed to migrate purpose values');
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'danger';
      case 'manager': return 'warning';
      case 'scout': return 'info';
      default: return 'secondary';
    }
  };

  return (
    <Container className="mt-4">
      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h4>👥 User Management</h4>
            <div>
              <Button 
                variant="outline-secondary" 
                onClick={addEmailColumn}
                className="me-2"
                size="sm"
              >
                Add Email Column
              </Button>
              <Button 
                variant="outline-warning" 
                onClick={setupCafcPlayerIds}
                className="me-2"
                size="sm"
              >
                🔄 Setup CAFC Player IDs
              </Button>
              <Button 
                variant="outline-info" 
                onClick={migratePurposeValues}
                className="me-2"
                size="sm"
              >
                📋 Migrate Purpose Values
              </Button>
              <Button 
                variant="primary" 
                onClick={() => setShowCreateModal(true)}
              >
                ➕ Create User
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}
          
          {loading ? (
            <div className="text-center">
              <Spinner animation="border" />
              <p className="mt-2">Loading users...</p>
            </div>
          ) : (
            <Table striped bordered hover responsive>
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
                    <td>{user.firstname} {user.lastname}</td>
                    <td>{user.email}</td>
                    <td>
                      <Badge bg={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="d-inline-block me-2"
                        style={{ width: 'auto' }}
                      >
                        <option value="scout">Scout</option>
                        <option value="manager">Manager</option>
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
                        🗑️ Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Create User Modal */}
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
                onChange={(e) => setCreateForm({...createForm, username: e.target.value})}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>First Name</Form.Label>
              <Form.Control
                type="text"
                value={createForm.firstname}
                onChange={(e) => setCreateForm({...createForm, firstname: e.target.value})}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Last Name</Form.Label>
              <Form.Control
                type="text"
                value={createForm.lastname}
                onChange={(e) => setCreateForm({...createForm, lastname: e.target.value})}
                required
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                required
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                required
                minLength={8}
              />
              <Form.Text className="text-muted">
                Minimum 8 characters
              </Form.Text>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                value={createForm.role}
                onChange={(e) => setCreateForm({...createForm, role: e.target.value})}
              >
                <option value="scout">Scout</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleCreateUser}
            disabled={createLoading}
          >
            {createLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Creating...
              </>
            ) : (
              'Create User'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete user <strong>{userToDelete?.username}</strong>?
          <br />
          <small className="text-muted">This action cannot be undone.</small>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={handleDeleteUser}
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              'Delete User'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default AdminPage;