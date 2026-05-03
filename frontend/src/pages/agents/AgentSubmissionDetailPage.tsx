import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import SubmissionStatusBadge, { AgentStatusBadge } from '../../components/agents/SubmissionStatusBadge';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentStatus, Recommendation, RecommendationStatusHistory } from '../../types/recommendations';
import {
  getRecommendationStatusConfig,
  getRecommendationStatusStep,
  REVIEW_STATUS_ORDER,
} from '../../utils/agentRecommendationStatus';

const AGENT_STATUSES: AgentStatus[] = [
  'Active',
  'No Longer Available',
  'Player Not Interested',
  'Withdrawn',
];

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '-';

const formatCurrency = (value?: number | string, currency?: string, basis?: string) => {
  if (value === undefined || value === null) return '-';
  const basisLabel = basis ? ` ${basis.toLowerCase()}` : '';
  if (typeof value === 'string') return `${currency || 'GBP'} ${value} p/w${basisLabel}`;
  return `${currency || 'GBP'} ${Math.round(value).toLocaleString('en-GB')} p/w${basisLabel}`;
};

const formatAmountCurrency = (amount?: number, currency?: string, fallback?: string) => {
  if (amount === undefined || amount === null) return fallback || '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')}`;
};

const formatTransferFee = (item: Recommendation) => {
  if (
    item.transfer_fee_min !== undefined &&
    item.transfer_fee_min !== null &&
    item.transfer_fee_max !== undefined &&
    item.transfer_fee_max !== null
  ) {
    const minLabel = Math.round(item.transfer_fee_min).toLocaleString('en-GB');
    const maxLabel = Math.round(item.transfer_fee_max).toLocaleString('en-GB');
    return `${item.transfer_fee_currency || 'GBP'} ${minLabel}${item.transfer_fee_min === item.transfer_fee_max ? '' : `-${maxLabel}`}`;
  }
  return formatAmountCurrency(item.transfer_fee_amount, item.transfer_fee_currency, item.transfer_fee);
};

const AgentSubmissionDetailPage: React.FC = () => {
  const { id } = useParams();
  const [item, setItem] = useState<Recommendation | null>(null);
  const [history, setHistory] = useState<RecommendationStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingAgentStatus, setUpdatingAgentStatus] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        setLoading(true);
        setError(null);
        const recommendationId = Number(id);
        const [detail, statusHistory] = await Promise.all([
          agentRecommendationsService.getDetail(recommendationId),
          agentRecommendationsService.getStatusHistory(recommendationId),
        ]);
        setItem(detail);
        setHistory(statusHistory);
      } catch (err) {
        console.error(err);
        setError('Failed to load submission');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleAgentStatusChange = async (newStatus: AgentStatus) => {
    if (!item || !id) return;
    try {
      setUpdatingAgentStatus(true);
      setError(null);
      setSuccessMessage(null);
      const updatedItem = await agentRecommendationsService.updateAgentStatus(Number(id), newStatus);
      setItem(updatedItem);
      setSuccessMessage('Availability status updated successfully');
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to update availability status');
    } finally {
      setUpdatingAgentStatus(false);
    }
  };

  const currentStatusConfig = useMemo(
    () => getRecommendationStatusConfig(item?.status),
    [item?.status],
  );

  const currentStatusStep = useMemo(
    () => getRecommendationStatusStep(item?.status),
    [item?.status],
  );

  return (
    <AgentPortalShell
      title="Submission Detail"
      subtitle="A clearer view of the player’s review stage, what it means and what happens next."
      actions={
        <Link to="/agents/dashboard" className="agent-portal-button-secondary">
          Back to dashboard
        </Link>
      }
    >
      {loading ? (
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-empty">Loading submission...</div>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <div className="agent-portal-banner agent-portal-banner-success" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </div>
      ) : null}
      {error ? <div className="agent-portal-banner">{error}</div> : null}

      {!loading && !error && item ? (
        <div className="agent-portal-review-stack">
          <section className="agent-portal-card">
            <div className="agent-portal-card-body">
              <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div className="agent-portal-section-title">{item.player_name}</div>
                  <div className="agent-portal-section-copy">
                    Track the current club review stage and keep the player’s availability up to date.
                  </div>
                </div>
                <div className="agent-status-pill-stack">
                  <div className="agent-status-pill-group">
                    <span className="agent-status-pill-label">Club review</span>
                    <SubmissionStatusBadge status={item.status} />
                  </div>
                  <div className="agent-status-pill-group">
                    <span className="agent-status-pill-label">Player availability</span>
                    <AgentStatusBadge status={item.agent_status} />
                  </div>
                </div>
              </div>

              <div className="agent-portal-detail-hero">
                <div className="agent-portal-current-status-card">
                  <div className="agent-portal-step-chip">
                    Step {Math.max(currentStatusStep + 1, 1)} of {REVIEW_STATUS_ORDER.length}
                  </div>
                  <h2 className="agent-portal-current-status-title">{currentStatusConfig.title}</h2>
                  <p className="agent-portal-meta" style={{ color: '#111827' }}>
                    {currentStatusConfig.summary}
                  </p>
                  <div className="agent-portal-detail-callouts">
                    <div className="agent-portal-info-card">
                      <div className="agent-portal-label">What the club is doing</div>
                      <div className="agent-portal-meta" style={{ color: '#111827' }}>
                        {currentStatusConfig.clubAction}
                      </div>
                    </div>
                    <div className="agent-portal-info-card">
                      <div className="agent-portal-label">What happens next</div>
                      <div className="agent-portal-meta" style={{ color: '#111827' }}>
                        {currentStatusConfig.nextStep}
                      </div>
                    </div>
                    <div className="agent-portal-info-card">
                      <div className="agent-portal-label">What you should do</div>
                      <div className="agent-portal-meta" style={{ color: '#111827' }}>
                        {currentStatusConfig.agentAction}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="agent-portal-process-card">
                  <div className="agent-portal-section-title">Review journey</div>
                  <div className="agent-portal-section-copy" style={{ marginBottom: '1rem' }}>
                    Completed steps are marked, your current step is highlighted, and future steps stay visible so the process is easier to follow.
                  </div>

                  <div className="agent-portal-progress-list">
                    {REVIEW_STATUS_ORDER.map((status, index) => {
                      const config = getRecommendationStatusConfig(status);
                      const stepState =
                        index < currentStatusStep
                          ? 'complete'
                          : index === currentStatusStep
                            ? 'current'
                            : 'upcoming';

                      return (
                        <div key={status} className={`agent-portal-progress-item ${stepState}`}>
                          <div className="agent-portal-progress-marker" aria-hidden="true">
                            {index < currentStatusStep ? '✓' : index + 1}
                          </div>
                          <div>
                            <div className="agent-portal-progress-title">{config.displayLabel}</div>
                            <div className="agent-portal-meta">{config.dashboardHint}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="agent-portal-info-grid" style={{ marginTop: '1.5rem' }}>
                {[
                  ['Submitted', formatDateTime(item.created_at)],
                  ['Last club update', formatDateTime(item.status_updated_at || item.created_at)],
                  ['Potential deal type', item.potential_deal_type || '-'],
                  ['Agreement type', item.agreement_type || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="agent-portal-info-card">
                    <div className="agent-portal-label">{label}</div>
                    <div className="agent-portal-meta" style={{ color: '#111827' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="agent-portal-detail-grid">
            <section className="agent-portal-card">
              <div className="agent-portal-card-body">
                <div className="agent-portal-section-title">Player and deal details</div>
                <div className="agent-portal-section-copy" style={{ marginBottom: '1rem' }}>
                  Key commercial and profile information from the original submission.
                </div>

                <div className="agent-portal-info-grid">
                  {[
                    ['Date of birth', formatDate(item.player_date_of_birth)],
                    ['Recommended position', Array.isArray(item.recommended_position) ? item.recommended_position.join(', ') : item.recommended_position || '-'],
                    ['Transfer fee', formatTransferFee(item)],
                    ['Current wages', formatCurrency(item.current_wages_per_week, item.current_wages_currency, item.wage_basis || item.current_wages_basis)],
                    ['Expected wages', formatCurrency(item.expected_wages_per_week, item.expected_wages_currency, item.wage_basis || item.expected_wages_basis)],
                    ['Contract expiry', formatDate(item.confirmed_contract_expiry)],
                    ['Contract options', item.contract_options || '-'],
                    ['Transfermarkt link', item.transfermarkt_link || '-'],
                  ].map(([label, value]) => (
                    <div key={label} className="agent-portal-info-card">
                      <div className="agent-portal-label">{label}</div>
                      <div className="agent-portal-meta" style={{ color: '#111827', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="agent-portal-surface-muted" style={{ marginTop: '1.5rem' }}>
                  <div className="agent-portal-label">Additional information provided</div>
                  <div className="agent-portal-meta" style={{ whiteSpace: 'pre-wrap', color: '#111827' }}>
                    {item.additional_information || 'No additional information provided.'}
                  </div>
                </div>

                <div
                  className="agent-portal-surface-muted agent-portal-notes-panel"
                  style={{ marginTop: '1.5rem' }}
                >
                  <div className="agent-portal-label">Shared notes from the club</div>
                  <div className="agent-portal-meta" style={{ whiteSpace: 'pre-wrap', color: '#111827' }}>
                    {item.shared_notes || 'No shared notes yet.'}
                  </div>
                </div>
              </div>
            </section>

            <section className="agent-portal-card">
              <div className="agent-portal-card-body">
                <div className="agent-portal-section-title">Availability and history</div>
                <div className="agent-portal-section-copy" style={{ marginBottom: '1rem' }}>
                  Keep the player’s market status current and review the timeline of club status changes.
                </div>

                <div className="agent-portal-surface-muted" style={{ marginBottom: '1rem' }}>
                  <div className="agent-portal-label">Player availability</div>
                  <div className="agent-portal-meta" style={{ marginBottom: '0.75rem', color: '#111827' }}>
                    Update this if the player becomes unavailable, loses interest or is withdrawn from consideration.
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <select
                      className="agent-portal-select"
                      value={item.agent_status}
                      onChange={(e) => handleAgentStatusChange(e.target.value as AgentStatus)}
                      disabled={updatingAgentStatus}
                      style={{ maxWidth: '280px' }}
                    >
                      {AGENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {updatingAgentStatus ? (
                      <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Updating...</span>
                      </div>
                    ) : null}
                  </div>
                  {item.agent_status_updated_at ? (
                    <div className="agent-portal-meta" style={{ marginTop: '0.5rem' }}>
                      Last availability update: {formatDateTime(item.agent_status_updated_at)}
                    </div>
                  ) : null}
                </div>

                <div className="agent-portal-section-title" style={{ marginBottom: '0.75rem' }}>
                  Club status history
                </div>
                <div className="agent-portal-review-stack">
                  {history.length === 0 ? (
                    <div className="agent-portal-empty">
                      No status changes have been recorded yet. The submission remains in its opening stage.
                    </div>
                  ) : (
                    history.map((entry) => {
                      const entryConfig = getRecommendationStatusConfig(entry.new_status);
                      return (
                        <div key={entry.id} className="agent-portal-history-card">
                          <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                            <SubmissionStatusBadge status={entry.new_status} />
                            <div className="agent-portal-meta">{formatDateTime(entry.changed_at)}</div>
                          </div>
                          <div className="agent-portal-history-title">{entryConfig.title}</div>
                          {entry.old_status ? (
                            <div className="agent-portal-meta">
                              Moved from {getRecommendationStatusConfig(entry.old_status).displayLabel}
                            </div>
                          ) : (
                            <div className="agent-portal-meta">Initial submission status</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </AgentPortalShell>
  );
};

export default AgentSubmissionDetailPage;
