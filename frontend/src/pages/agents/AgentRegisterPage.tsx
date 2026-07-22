import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../App';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import AuthShell from '../../components/auth/AuthShell';

const AgentRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    agent_name: '',
    agency: '',
    email: '',
    password: '',
    agent_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handlePhoneChange = (value?: string) =>
    setForm((current) => ({
      ...current,
      agent_number: value || '',
    }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedPhone = form.agent_number.trim();
    if (normalizedPhone && !isValidPhoneNumber(normalizedPhone)) {
      setError('Phone number must be in international format (e.g. +447700900123)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await agentRecommendationsService.register({
        email: form.email,
        password: form.password,
        agent_name: form.agent_name,
        agency: form.agency,
        agent_number: normalizedPhone || undefined,
      });
      const tokenResponse = await axiosInstance.post(
        '/token',
        new URLSearchParams({ username: form.email.trim().toLowerCase(), password: form.password }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      login(tokenResponse.data.access_token);
      navigate('/agents/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || 'Registration failed');
      } else {
        setError('Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>
      <h2 className="agent-auth-title">Register</h2>
      <p className="agent-auth-subtitle">Create your external portal account using your agency contact details.</p>
      <div style={{ color: 'var(--color-text)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        * Required fields
      </div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Your details are stored for identity verification and recommendation audit trail purposes.
      </div>
      {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

      <Form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-6">
            <Form.Label className="agent-auth-label">Agent name *</Form.Label>
            <Form.Control className="agent-auth-input" value={form.agent_name} onChange={(e) => handleChange('agent_name', e.target.value)} required />
          </div>
          <div className="col-md-6">
            <Form.Label className="agent-auth-label">Agency *</Form.Label>
            <Form.Control className="agent-auth-input" value={form.agency} onChange={(e) => handleChange('agency', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Email *</Form.Label>
            <Form.Control className="agent-auth-input" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Password *</Form.Label>
            <Form.Control className="agent-auth-input" type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} required />
          </div>
          <div className="col-12">
            <Form.Label className="agent-auth-label">Phone number</Form.Label>
            <PhoneInput
              defaultCountry="GB"
              international
              countryCallingCodeEditable={false}
              placeholder="Enter phone number"
              value={form.agent_number || undefined}
              onChange={handlePhoneChange}
              className="agent-auth-phone-input"
            />
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginTop: '0.45rem' }}>
              Stored as international format: {form.agent_number || '+44...'}
            </div>
          </div>
        </div>

        <div className="agent-auth-actions" style={{ marginTop: '1.5rem', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Already registered? <Link to="/agents/login" className="agent-auth-inline-link">Sign in</Link>
          </div>
          <Button type="submit" className="agent-auth-button" disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </div>
      </Form>
    </AuthShell>
  );
};

export default AgentRegisterPage;
