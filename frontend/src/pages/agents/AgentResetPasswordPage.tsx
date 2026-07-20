import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import AuthShell from '../../components/auth/AuthShell';

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
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal">
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

          <div style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Remembered it? <Link to="/agents/login" className="agent-auth-inline-link">Back to sign in</Link>
          </div>
        </>
      )}
    </AuthShell>
  );
};

export default AgentResetPasswordPage;
