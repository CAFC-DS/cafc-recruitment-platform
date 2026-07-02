import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import logo from '../../assets/logo.png';

const AgentResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is invalid. Please request a new one from Charlton Athletic.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      await agentRecommendationsService.confirmPasswordReset({ token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Password reset failed');
      } else {
        setError('An unexpected error occurred');
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
              Choose a new password for your agent account to regain access to the portal.
            </p>
          </div>
        </div>

        <div className="agent-auth-form-panel">
          <div className="agent-auth-card">
            <div className="agent-mobile-brand">
              <img src={logo} alt="CAFC" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0F172A' }}>Charlton Athletic FC</span>
            </div>

            <h2 className="agent-auth-title">Set a new password</h2>

            {success ? (
              <>
                <Alert variant="success" className="agent-auth-alert">
                  Your password has been reset. You can now sign in with your new password.
                </Alert>
                <Link to="/agents/login" className="agent-auth-button w-100 d-inline-block text-center text-decoration-none">
                  Go to sign in
                </Link>
              </>
            ) : (
              <>
                <p className="agent-auth-subtitle">Enter a new password for your agent account.</p>
                {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label className="agent-auth-label">New password</Form.Label>
                    <Form.Control
                      className="agent-auth-input"
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <Form.Text className="text-muted">Minimum 8 characters</Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-4">
                    <Form.Label className="agent-auth-label">Confirm new password</Form.Label>
                    <Form.Control
                      className="agent-auth-input"
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </Form.Group>

                  <Button type="submit" className="agent-auth-button w-100" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Resetting...
                      </>
                    ) : (
                      'Reset password'
                    )}
                  </Button>
                </Form>

                <div style={{ marginTop: '1rem', color: '#64748B', fontSize: '0.9rem' }}>
                  Remembered it? <Link to="/agents/login" className="agent-auth-inline-link">Back to sign in</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentResetPasswordPage;
