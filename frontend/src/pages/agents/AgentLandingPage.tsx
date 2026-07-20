import React from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell';

const steps = [
  {
    title: '1. Register',
    copy: 'Create an approved agent account with your agency and contact details.',
  },
  {
    title: '2. Submit',
    copy: 'Send player information and commercial context through a structured recommendation intake.',
  },
  {
    title: '3. Track',
    copy: 'Monitor recommendation status changes through the same secure Charlton portal.',
  },
];

const AgentLandingPage: React.FC = () => {
  return (
    <AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>
      <p className="agent-auth-badge" style={{ marginBottom: '1rem' }}>CAFC Recruitment</p>
      <h2 className="agent-auth-title" style={{ fontSize: '2rem' }}>External Player Recommendations</h2>
      <p className="agent-auth-subtitle" style={{ maxWidth: 560 }}>
        Register as an agent, submit a player through structural intake form, and track the review status through the platform.
      </p>

      <div className="agent-portal-inline-actions" style={{ marginBottom: '2rem' }}>
        <Link to="/agents/register" className="agent-auth-button" style={{ textDecoration: 'none', minWidth: 190 }}>
          Register
        </Link>
        <Link to="/agents/login" className="agent-portal-button-secondary">
          Log In
        </Link>
      </div>

      <div className="agent-portal-card">
        <div className="agent-portal-card-body">
          <div className="agent-portal-section-title">How the portal works</div>
          <div className="agent-portal-section-copy" style={{ marginBottom: '1.25rem' }}>
            This test release is built for controlled external intake. Agents can submit and track recommendations; internal staff manage review status inside the core scouting platform.
          </div>
          <div className="agent-portal-grid three-up">
            {steps.map((step) => (
              <div key={step.title} className="agent-portal-surface-muted">
                <div style={{ color: 'var(--color-text)', fontWeight: 800, marginBottom: '0.6rem' }}>{step.title}</div>
                <div className="agent-portal-meta">{step.copy}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default AgentLandingPage;
