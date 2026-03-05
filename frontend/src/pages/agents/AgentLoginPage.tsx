import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../App';
import logo from '../../assets/logo.png';

const AgentLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.post(
        '/token',
        new URLSearchParams({ username: email.trim().toLowerCase(), password }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      login(response.data.access_token);
      const me = await axiosInstance.get('/users/me');
      navigate(me.data.role === 'agent' ? '/agents/dashboard' : '/');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Login failed');
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-auth-page">
      <div className="agent-auth-layout">
        <div className="agent-auth-brand-panel">
          <div className="agent-auth-brand-content">
            <img src={logo} alt="Charlton Athletic FC" style={{ width: 96, height: 96, marginBottom: '1.5rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} />
            <h1 className="agent-auth-heading">Charlton Athletic FC</h1>
            <p className="agent-auth-badge">External Recommendation Portal</p>
            <p className="agent-auth-copy">
              Use your registered agent account to access submitted recommendations and track each player&apos;s review status.
            </p>
          </div>
        </div>

        <div className="agent-auth-form-panel">
          <div className="agent-auth-card">
            <div className="agent-mobile-brand">
              <img src={logo} alt="CAFC" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0F172A' }}>Charlton Athletic FC</span>
            </div>

            <h2 className="agent-auth-title">Sign in</h2>
            <p className="agent-auth-subtitle">Enter your credentials to access the external recommendation portal.</p>

            {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="agent-auth-label">Email</Form.Label>
                <Form.Control
                  className="agent-auth-input"
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label className="agent-auth-label">Password</Form.Label>
                <Form.Control
                  className="agent-auth-input"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>

              <Button type="submit" className="agent-auth-button w-100" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </Form>

            <div style={{ marginTop: '1rem', color: '#64748B', fontSize: '0.9rem' }}>
              Need access? <Link to="/agents/register" className="agent-auth-inline-link">Register here</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentLoginPage;
