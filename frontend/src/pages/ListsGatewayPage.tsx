import React from 'react';
import { Link } from 'react-router-dom';

const ListsGatewayPage: React.FC = () => {
  return (
    <div className="page-reports-cafc container-fluid py-4 page-lists-cafc">
      <div className="agent-portal-card mb-4">
        <div className="agent-portal-card-body">
          <div className="agent-portal-section-title">Lists Workspace</div>
          <div className="agent-portal-section-copy">
            Choose between the existing internal recruitment lists workflow and the external recommendations table.
          </div>
        </div>
      </div>

      <div className="agent-portal-grid two-up">
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-label">Internal Lists</div>
            <div className="agent-portal-kpi-value" style={{ fontSize: '1.8rem' }}>Recruitment Pipeline</div>
            <div className="agent-portal-kpi-copy" style={{ marginBottom: '1.5rem' }}>
              Continue with the current list management flow, including pills, pitch view, advanced filters, stage management, and kanban.
            </div>
            <Link to="/lists/internal" className="agent-auth-button" style={{ textDecoration: 'none', minWidth: 190 }}>
              Open Internal Lists
            </Link>
          </div>
        </div>

        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-label">External Recommendations</div>
            <div className="agent-portal-kpi-value" style={{ fontSize: '1.8rem' }}>Agent Intake Table</div>
            <div className="agent-portal-kpi-copy" style={{ marginBottom: '1.5rem' }}>
              Review agent-submitted recommendations in a flat, scrollable table with deal flags, salaries, notes, and a read-only detail panel.
            </div>
            <Link to="/lists/external" className="agent-auth-button" style={{ textDecoration: 'none', minWidth: 220 }}>
              Open External Recommendations
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListsGatewayPage;
