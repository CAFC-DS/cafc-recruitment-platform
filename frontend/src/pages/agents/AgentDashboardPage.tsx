import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import SubmissionStatusBadge from '../../components/agents/SubmissionStatusBadge';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { Recommendation } from '../../types/recommendations';

const AgentDashboardPage: React.FC = () => {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setItems(await agentRecommendationsService.list());
      } catch (err) {
        console.error(err);
        setError('Failed to load submissions');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const latestUpdated = useMemo(() => {
    if (!items.length) return 'No submissions yet';
    const latest = [...items]
      .map((item) => item.status_updated_at || item.created_at)
      .filter(Boolean)
      .sort()
      .pop();
    return latest ? new Date(latest).toLocaleString() : 'No submissions yet';
  }, [items]);

  return (
    <AgentPortalShell
      title="Agent Dashboard"
      subtitle="Track every submission and monitor review progress."
      actions={<Link to="/agents/submit" className="agent-auth-button" style={{ textDecoration: 'none' }}>Submit another player</Link>}
    >
      <div className="agent-portal-review-stack">
        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-section-title">Overview</div>
            <div className="agent-portal-kpi-value">{items.length}</div>
            <div className="agent-portal-kpi-copy">
              submission{items.length !== 1 ? 's' : ''} in the portal. You can view submitted player details and track status progression for each recommendation.
            </div>
            <div className="agent-portal-info-grid" style={{ marginTop: '1.5rem' }}>
              <div className="agent-portal-info-card">
                <div className="agent-portal-label">Latest activity</div>
                <div className="agent-portal-meta">{latestUpdated}</div>
              </div>
              <div className="agent-portal-info-card">
                <div className="agent-portal-label">Portal mode</div>
                <div className="agent-portal-meta">Read-only after submission. Uploads and automated emails are disabled for testing.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <div className="agent-portal-section-title">Recommendation Tracker</div>
                <div className="agent-portal-section-copy">Review submitted players, current status, and last update timestamps.</div>
              </div>
            </div>

            {loading ? <div className="agent-portal-empty">Loading submissions...</div> : null}
            {error ? <div className="agent-portal-banner">{error}</div> : null}
            {!loading && !error ? (
              <div className="table-responsive">
                <table className="agent-portal-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="agent-portal-empty">No submissions yet.</td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#111827' }}>{item.player_name}</div>
                            <div className="agent-portal-meta">{item.potential_deal_type || 'No deal type provided'}</div>
                          </td>
                          <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                          <td><SubmissionStatusBadge status={item.status} /></td>
                          <td>{item.status_updated_at ? new Date(item.status_updated_at).toLocaleString() : '-'}</td>
                          <td className="text-end">
                            <Link to={`/agents/submissions/${item.id}`} className="agent-portal-button-secondary">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AgentPortalShell>
  );
};

export default AgentDashboardPage;
