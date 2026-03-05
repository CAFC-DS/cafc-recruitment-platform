import React, { useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../App';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import logo from '../../assets/logo.png';

const AgentRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    email: '',
    password: '',
    agent_name: '',
    agency: '',
    calling_code: '+44',
    phone_local: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: field === 'phone_local' ? value.replace(/\D/g, '') : value,
    }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const composedPhone = form.phone_local.trim() ? `${form.calling_code}${form.phone_local.trim()}` : '';
    if (composedPhone && !/^\+[1-9]\d{6,14}$/.test(composedPhone)) {
      setError('Phone number must be in international format (e.g. +447700900123)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await agentRecommendationsService.register({
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email,
        password: form.password,
        agent_name: form.agent_name,
        agency: form.agency,
        agent_number: composedPhone || undefined,
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
    <div className="agent-auth-page">
      <div className="agent-auth-layout">
        <div className="agent-auth-brand-panel">
          <div className="agent-auth-brand-content">
            <img src={logo} alt="Charlton Athletic FC" style={{ width: 96, height: 96, marginBottom: '1.5rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} />
            <h1 className="agent-auth-heading">Charlton Athletic FC</h1>
            <p className="agent-auth-badge">External Recommendation Portal</p>
            <p className="agent-auth-copy">
              Create an agent account once, then use it to submit player opportunities and monitor review status through the portal.
            </p>
          </div>
        </div>

        <div className="agent-auth-form-panel">
          <div className="agent-auth-card agent-auth-card-wide">
            <div className="agent-mobile-brand">
              <img src={logo} alt="CAFC" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0F172A' }}>Charlton Athletic FC</span>
            </div>

            <h2 className="agent-auth-title">Register</h2>
            <p className="agent-auth-subtitle">Create your external portal account using your agency contact details.</p>
            <div style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Your details are stored for identity verification and recommendation audit trail purposes.
            </div>
            {error ? <Alert variant="danger" className="agent-auth-alert">{error}</Alert> : null}

            <Form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <Form.Label className="agent-auth-label">First name</Form.Label>
                  <Form.Control className="agent-auth-input" value={form.firstname} onChange={(e) => handleChange('firstname', e.target.value)} required />
                </div>
                <div className="col-md-6">
                  <Form.Label className="agent-auth-label">Last name</Form.Label>
                  <Form.Control className="agent-auth-input" value={form.lastname} onChange={(e) => handleChange('lastname', e.target.value)} required />
                </div>
                <div className="col-12">
                  <Form.Label className="agent-auth-label">Email</Form.Label>
                  <Form.Control className="agent-auth-input" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
                </div>
                <div className="col-12">
                  <Form.Label className="agent-auth-label">Password</Form.Label>
                  <Form.Control className="agent-auth-input" type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} required />
                </div>
                <div className="col-md-6">
                  <Form.Label className="agent-auth-label">Agent name</Form.Label>
                  <Form.Control className="agent-auth-input" value={form.agent_name} onChange={(e) => handleChange('agent_name', e.target.value)} required />
                </div>
                <div className="col-md-6">
                  <Form.Label className="agent-auth-label">Agency</Form.Label>
                  <Form.Control className="agent-auth-input" value={form.agency} onChange={(e) => handleChange('agency', e.target.value)} />
                </div>
                <div className="col-12">
                  <Form.Label className="agent-auth-label">Phone number</Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Select
                      className="agent-auth-input"
                      style={{ maxWidth: 130 }}
                      value={form.calling_code}
                      onChange={(e) => handleChange('calling_code', e.target.value)}
                    >
                      <option value="+1">+1</option>
                      <option value="+33">+33</option>
                      <option value="+34">+34</option>
                      <option value="+39">+39</option>
                      <option value="+44">+44</option>
                      <option value="+49">+49</option>
                      <option value="+351">+351</option>
                      <option value="+61">+61</option>
                      <option value="+90">+90</option>
                    </Form.Select>
                    <Form.Control
                      className="agent-auth-input"
                      value={form.phone_local}
                      onChange={(e) => handleChange('phone_local', e.target.value)}
                      inputMode="tel"
                      pattern="[0-9]*"
                      placeholder="7700900123"
                    />
                  </div>
                  <div style={{ color: '#64748B', fontSize: '0.82rem', marginTop: '0.45rem' }}>
                    Stored as international format: {form.calling_code}{form.phone_local || '...'}
                  </div>
                </div>
              </div>

              <div className="agent-auth-actions" style={{ marginTop: '1.5rem', justifyContent: 'space-between' }}>
                <div style={{ color: '#64748B', fontSize: '0.9rem' }}>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentRegisterPage;
