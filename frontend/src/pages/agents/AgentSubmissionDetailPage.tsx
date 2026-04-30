import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import SubmissionStatusBadge, { AgentStatusBadge } from '../../components/agents/SubmissionStatusBadge';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentStatus, Recommendation, RecommendationStatusHistory } from '../../types/recommendations';

const AGENT_STATUSES: AgentStatus[] = [
  'Active',
  'No Longer Available',
  'Player Not Interested',
  'Withdrawn',
];

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
  if (item.transfer_fee_min !== undefined && item.transfer_fee_min !== null && item.transfer_fee_max !== undefined && item.transfer_fee_max !== null) {
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

  return (
    <AgentPortalShell title="Submission Detail" subtitle="View your submitted recommendation and update its availability.">
      {loading ? (
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-empty">Loading submission...</div>
          </div>
        </div>
      ) : null}
      {successMessage ? <div className="agent-portal-banner agent-portal-banner-success" style={{ marginBottom: '1rem' }}>{successMessage}</div> : null}
      {error ? <div className="agent-portal-banner">{error}</div> : null}
      {!loading && !error && item ? (
        <div className="agent-portal-detail-grid">
          <section className="agent-portal-card">
            <div className="agent-portal-card-body">
              <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div className="agent-portal-section-title">{item.player_name}</div>
                  <div className="agent-portal-section-copy">Submitted recommendation record and commercial details.</div>
                </div>
                <div className="agent-status-pill-stack">
                  <div className="agent-status-pill-group">
                    <span className="agent-status-pill-label">Review</span>
                    <SubmissionStatusBadge status={item.status} />
                  </div>
                  <div className="agent-status-pill-group">
                    <span className="agent-status-pill-label">Availability</span>
                    <AgentStatusBadge status={item.agent_status} />
                  </div>
                </div>
              </div>

              <div className="agent-portal-info-grid">
                {[
                  ['Submitted date', item.created_at ? new Date(item.created_at).toLocaleString() : '-'],
                  ['Last updated', item.status_updated_at ? new Date(item.status_updated_at).toLocaleString() : '-'],
                  ['Agreement type', item.agreement_type || '-'],
                  ['Potential deal type', item.potential_deal_type || '-'],
                  ['Transfer fee', formatTransferFee(item)],
                  ['Current wages', formatCurrency(item.current_wages_per_week, item.current_wages_currency, item.wage_basis || item.current_wages_basis)],
                  ['Expected wages', formatCurrency(item.expected_wages_per_week, item.expected_wages_currency, item.wage_basis || item.expected_wages_basis)],
                  ['Contract expiry', item.confirmed_contract_expiry ? new Date(item.confirmed_contract_expiry).toLocaleDateString() : '-'],
                  ['Transfermarkt link', item.transfermarkt_link || '-'],
                  ['Contract options', item.contract_options || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="agent-portal-info-card">
                    <div className="agent-portal-label">{label}</div>
                    <div className="agent-portal-meta" style={{ color: '#111827' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="agent-portal-surface-muted" style={{ marginTop: '1.5rem' }}>
                <div className="agent-portal-label">Additional Information</div>
                <div className="agent-portal-meta" style={{ whiteSpace: 'pre-wrap', color: '#111827' }}>
                  {item.additional_information || 'No additional information provided.'}
                </div>
              </div>

              <div className="agent-portal-surface-muted" style={{ marginTop: '1.5rem' }}>
                <div className="agent-portal-label">Player Availability</div>
                <div className="agent-portal-meta" style={{ marginBottom: '0.75rem', color: '#111827' }}>
                  Update the availability status of this recommendation. This helps the club understand if the player is still available.
                </div>
                <div className="d-flex align-items-center gap-2">
                  <select
                    className="form-select form-select-sm"
                    value={item.agent_status}
                    onChange={(e) => handleAgentStatusChange(e.target.value as AgentStatus)}
                    disabled={updatingAgentStatus}
                    style={{ maxWidth: '250px' }}
                  >
                    {AGENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  {updatingAgentStatus && (
                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                      <span className="visually-hidden">Updating...</span>
                    </div>
                  )}
                </div>
                {item.agent_status_updated_at && (
                  <div className="agent-portal-meta" style={{ marginTop: '0.5rem' }}>
                    Last updated: {new Date(item.agent_status_updated_at).toLocaleString()}
                  </div>
                )}
              </div>

            </div>
          </section>

          <section className="agent-portal-card">
            <div className="agent-portal-card-body">
              <div className="agent-portal-section-title">Internal Review Status</div>
              <div className="agent-portal-section-copy" style={{ marginBottom: '1rem' }}>
                Track the status progression recorded against your submission and any shared notes left by the club.
              </div>
              <div
                className="agent-portal-surface-muted"
                style={{
                  marginBottom: '1rem',
                  borderLeft: '4px solid #c1121f',
                  background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)',
                }}
              >
                <div className="agent-portal-label" style={{ color: '#9a3412', marginBottom: '0.4rem' }}>
                  Shared Notes From The Club
                </div>
                <div className="agent-portal-meta" style={{ whiteSpace: 'pre-wrap', color: '#111827' }}>
                  {item.shared_notes || 'No shared notes yet.'}
                </div>
              </div>
              <div className="agent-portal-review-stack">
                {history.length === 0 ? (
                  <div className="agent-portal-empty">No status changes yet. Your submission remains at its initial state.</div>
                ) : (
                  history.map((entry) => (
                    <div key={entry.id} className="agent-portal-surface-muted">
                      <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                        <div style={{ fontWeight: 800, color: '#111827' }}>{entry.new_status}</div>
                        <div className="agent-portal-meta">{new Date(entry.changed_at).toLocaleString()}</div>
                      </div>
                      {entry.old_status ? <div className="agent-portal-meta">Updated from {entry.old_status}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AgentPortalShell>
  );
};

export default AgentSubmissionDetailPage;
