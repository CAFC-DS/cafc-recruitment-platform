import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { Recommendation } from '../../types/recommendations';
import { getRecommendationStatusConfig } from '../../utils/agentRecommendationStatus';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        setLoading(true);
        setError(null);
        const recommendationId = Number(id);
        const detail = await agentRecommendationsService.getDetail(recommendationId);
        setItem(detail);
      } catch (err) {
        console.error(err);
        setError('Failed to load submission');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const currentStatusConfig = useMemo(
    () => getRecommendationStatusConfig(item?.status),
    [item?.status],
  );

  return (
    <AgentPortalShell
      title="Submission Detail"
      subtitle="One clear view of the current status, your submitted information and any notes shared by the club."
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
      {error ? <div className="agent-portal-banner">{error}</div> : null}

      {!loading && !error && item ? (
        <section className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div style={{ marginBottom: '1.25rem' }}>
              <div>
                <div className="agent-portal-section-title">{item.player_name}</div>
                <div className="agent-portal-section-copy">
                  A simplified view of the current review status, your submitted details and any notes shared by the club.
                </div>
              </div>
            </div>

            <div className="agent-portal-current-status-card">
              <div className="agent-portal-label">Current status</div>
              <h2 className="agent-portal-current-status-title" style={{ marginBottom: '0.35rem' }}>
                {currentStatusConfig.displayLabel}
              </h2>
              <p className="agent-portal-meta" style={{ color: '#111827' }}>
                {currentStatusConfig.summary}
              </p>
            </div>

            <div className="agent-portal-info-grid" style={{ marginTop: '1.5rem' }}>
              {[
                ['Submitted', formatDateTime(item.created_at)],
                ['Last club update', formatDateTime(item.status_updated_at || item.created_at)],
                ['Potential deal type', item.potential_deal_type || '-'],
                ['Agreement type', item.agreement_type || '-'],
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
      ) : null}
    </AgentPortalShell>
  );
};

export default AgentSubmissionDetailPage;
