import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import SubmissionStatusBadge from '../../components/agents/SubmissionStatusBadge';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { Recommendation, RecommendationStatus } from '../../types/recommendations';
import {
  getRecommendationStatusConfig,
  REVIEW_STATUS_ORDER,
} from '../../utils/agentRecommendationStatus';

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '-';

const AgentDashboardPage: React.FC = () => {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
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

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftDate = new Date(left.status_updated_at || left.created_at || 0).getTime();
        const rightDate = new Date(right.status_updated_at || right.created_at || 0).getTime();
        return rightDate - leftDate;
      }),
    [items],
  );

  const latestUpdated = useMemo(() => {
    if (!sortedItems.length) return 'No submissions yet';
    return formatDateTime(sortedItems[0].status_updated_at || sortedItems[0].created_at);
  }, [sortedItems]);

  const statusCounts = useMemo(() => {
    return items.reduce(
      (counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        return counts;
      },
      {} as Record<RecommendationStatus, number>,
    );
  }, [items]);

  const activeReviewCount = useMemo(
    () => items.filter((item) => item.status !== 'Not Currently under Consideration').length,
    [items],
  );

  return (
    <AgentPortalShell
      title="Agent Dashboard"
      subtitle="See where each recommendation sits in the club process and what each update means."
      actions={
        <Link to="/agents/submit" className="agent-auth-button" style={{ textDecoration: 'none' }}>
          Submit another player
        </Link>
      }
    >
      <div className="agent-portal-review-stack">
        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="agent-portal-section-title">At a glance</div>
                <div className="agent-portal-section-copy">
                  The dashboard now explains the club review journey in plain language so you can quickly understand whether a player is queued, being assessed, longlisted or archived.
                </div>
              </div>
              <div className="agent-portal-status-note">
                If a submission remains in review, that means the club is still assessing it and no action is required from you unless requested.
              </div>
            </div>

            <div className="agent-portal-kpi-grid" style={{ marginTop: '1.5rem' }}>
              <div className="agent-portal-kpi">
                <div className="agent-portal-label">Total submissions</div>
                <div className="agent-portal-kpi-value">{items.length}</div>
                <div className="agent-portal-kpi-copy">Recommendations you have submitted through the portal.</div>
              </div>
              <div className="agent-portal-kpi">
                <div className="agent-portal-label">Still active</div>
                <div className="agent-portal-kpi-value">{activeReviewCount}</div>
                <div className="agent-portal-kpi-copy">Profiles still in the club’s active review pipeline.</div>
              </div>
              <div className="agent-portal-kpi">
                <div className="agent-portal-label">Latest update</div>
                <div className="agent-portal-kpi-value agent-portal-kpi-value-small">{latestUpdated}</div>
                <div className="agent-portal-kpi-copy">Most recent submission activity across your dashboard.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-section-title">What each status means</div>
            <div className="agent-portal-section-copy" style={{ marginBottom: '1rem' }}>
              These are the only review stages used on the portal. Each one tells you what the club is doing now and what is likely to happen next.
            </div>

            <div className="agent-portal-status-journey">
              {REVIEW_STATUS_ORDER.map((status, index) => {
                const config = getRecommendationStatusConfig(status);
                return (
                  <article key={status} className="agent-portal-stage-card">
                    <div className="agent-portal-stage-step">Step {index + 1}</div>
                    <SubmissionStatusBadge status={status} />
                    <h3 className="agent-portal-stage-title">{config.title}</h3>
                    <p className="agent-portal-meta">{config.summary}</p>
                    <div className="agent-portal-stage-copy">
                      <strong>What this usually means:</strong> {config.dashboardHint}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'flex-start' }}>
              <div>
                <div className="agent-portal-section-title">Your submissions</div>
                <div className="agent-portal-section-copy">
                  Each card shows the player’s current stage, a plain-language explanation and the last movement on the file.
                </div>
              </div>
            </div>

            {loading ? <div className="agent-portal-empty">Loading submissions...</div> : null}
            {error ? <div className="agent-portal-banner">{error}</div> : null}

            {!loading && !error ? (
              items.length === 0 ? (
                <div className="agent-portal-empty">No submissions yet.</div>
              ) : (
                <div className="agent-portal-submission-list">
                  {sortedItems.map((item) => {
                    const config = getRecommendationStatusConfig(item.status);
                    return (
                      <article key={item.id} className="agent-portal-submission-card">
                        <div className="agent-portal-submission-header">
                          <div>
                            <div className="agent-portal-submission-title">{item.player_name}</div>
                            <div className="agent-portal-meta">
                              {item.potential_deal_type || 'Deal type not provided'}
                              {item.agreement_type ? ` • ${item.agreement_type}` : ''}
                            </div>
                          </div>
                          <SubmissionStatusBadge status={item.status} />
                        </div>

                        <div className="agent-portal-submission-grid">
                          <div className="agent-portal-info-card">
                            <div className="agent-portal-label">What is happening now</div>
                            <div className="agent-portal-meta" style={{ color: '#111827' }}>
                              {config.summary}
                            </div>
                          </div>
                          <div className="agent-portal-info-card">
                            <div className="agent-portal-label">What to expect next</div>
                            <div className="agent-portal-meta" style={{ color: '#111827' }}>
                              {config.nextStep}
                            </div>
                          </div>
                        </div>

                        <div className="agent-portal-submission-footer">
                          <div className="agent-portal-submission-meta-group">
                            <div className="agent-portal-submission-meta-item">
                              <span className="agent-portal-submission-meta-label">Submitted</span>
                              <span>{formatDate(item.created_at)}</span>
                            </div>
                            <div className="agent-portal-submission-meta-item">
                              <span className="agent-portal-submission-meta-label">Last updated</span>
                              <span>{formatDateTime(item.status_updated_at || item.created_at)}</span>
                            </div>
                            <div className="agent-portal-submission-meta-item">
                              <span className="agent-portal-submission-meta-label">Status count</span>
                              <span>{statusCounts[item.status] || 0} in this stage</span>
                            </div>
                          </div>
                          <Link to={`/agents/submissions/${item.id}`} className="agent-portal-button-secondary">
                            View full submission
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        </section>
      </div>
    </AgentPortalShell>
  );
};

export default AgentDashboardPage;
