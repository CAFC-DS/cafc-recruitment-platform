import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SubmissionStatusBadge from '../components/agents/SubmissionStatusBadge';
import { internalRecommendationsService } from '../services/internalRecommendationsService';
import {
  InternalRecommendation,
  InternalRecommendationFiltersMeta,
  RecommendationStatus,
  RecommendationStatusHistory,
} from '../types/recommendations';

interface RecommendationFilterState {
  status: RecommendationStatus | '';
  agent_user_id: string;
  created_from: string;
  created_to: string;
  player_name: string;
  page: number;
  page_size: number;
}

const formatAmount = (amount?: number, currency?: string, fallback?: string) => {
  if (amount === undefined || amount === null) return fallback || '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')}`;
};

const formatWeeklyAmount = (amount?: number, currency?: string) => {
  if (amount === undefined || amount === null) return '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')} p/w`;
};

const getDealFlags = (potentialDealType?: string) => {
  const selected = new Set(
    (potentialDealType || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return {
    free: selected.has('Free') ? 'Yes' : '',
    perm: selected.has('Permanent Transfer') ? 'Yes' : '',
    loan: selected.has('Loan') ? 'Yes' : '',
    loanPlus: selected.has('Loan with Option') ? 'Yes' : '',
  };
};

const ExternalRecommendationsListPage: React.FC = () => {
  const [filters, setFilters] = useState<RecommendationFilterState>({
    status: '',
    agent_user_id: '',
    created_from: '',
    created_to: '',
    player_name: '',
    page: 1,
    page_size: 25,
  });
  const [meta, setMeta] = useState<InternalRecommendationFiltersMeta>({ statuses: [], agents: [] });
  const [items, setItems] = useState<InternalRecommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selected, setSelected] = useState<InternalRecommendation | null>(null);
  const [statusHistory, setStatusHistory] = useState<RecommendationStatusHistory[]>([]);
  const [notesDraft, setNotesDraft] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.page_size)), [total, filters.page_size]);

  const load = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const [metaResponse, listResponse] = await Promise.all([
        meta.statuses.length ? Promise.resolve(meta) : internalRecommendationsService.getFiltersMeta(),
        internalRecommendationsService.list(nextFilters),
      ]);
      setMeta(metaResponse);
      setItems(listResponse.items);
      setTotal(listResponse.total);
      if (selected) {
        const refreshed = listResponse.items.find((item) => item.id === selected.id);
        if (refreshed) {
          setSelected(refreshed);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load external recommendations');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (itemId: number) => {
    try {
      setDetailLoading(true);
      const [detail, history] = await Promise.all([
        internalRecommendationsService.getDetail(itemId),
        internalRecommendationsService.getStatusHistory(itemId),
      ]);
      setSelected(detail);
      setNotesDraft(detail.internal_notes || '');
      setStatusHistory(history);
    } catch (err) {
      console.error(err);
      setError('Failed to load recommendation detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page]);

  useEffect(() => {
    if (reviewMode && selected) {
      loadDetail(selected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewMode]);

  const applyFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    await load(nextFilters);
  };

  const openDetail = async (item: InternalRecommendation) => {
    setSelected(item);
    setNotesDraft(item.internal_notes || '');
    if (reviewMode) {
      await loadDetail(item.id);
    }
  };

  const handleStatusChange = async (newStatus: RecommendationStatus) => {
    if (!selected) return;
    try {
      setUpdatingStatus(true);
      setError(null);
      setBanner(null);
      const response = await internalRecommendationsService.updateStatus(selected.id, newStatus);
      setSelected(response.item);
      setNotesDraft(response.item.internal_notes || notesDraft);
      setStatusHistory(response.item.status_history || []);
      setBanner(response.warning || 'Status updated successfully');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    try {
      setSavingNotes(true);
      setError(null);
      setBanner(null);
      const updated = await internalRecommendationsService.updateNotes(selected.id, notesDraft);
      setSelected(updated);
      setStatusHistory(updated.status_history || statusHistory);
      setBanner('Internal notes saved');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className={`page-reports-cafc container-fluid py-4 page-lists-cafc external-recommendations-page ${reviewMode ? 'review-mode' : ''}`}>
      <div className="agent-portal-card mb-4">
        <div className="agent-portal-card-body">
          <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="agent-portal-section-title">External Recommendations</div>
              <div className="agent-portal-section-copy">
                Scrollable intake table for agent-submitted recommendations with deal flags, fee, and salary context.
              </div>
            </div>
            <div className="agent-portal-inline-actions">
              <Link to="/lists" className="agent-portal-button-secondary">Back to Lists</Link>
              <button
                className={`btn ${reviewMode ? 'btn-dark' : 'btn-outline-dark'}`}
                onClick={() => setReviewMode((current) => !current)}
                type="button"
              >
                {reviewMode ? 'Exit Review Mode' : 'Review Mode'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {banner ? <div className="alert alert-success">{banner}</div> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="row g-4">
        <div className={reviewMode ? 'col-12 col-xxl-9' : 'col-12'}>
          <div className="agent-portal-card">
            <div className="agent-portal-card-body">
              <form onSubmit={applyFilters} className="agent-portal-filter-bar mb-4">
                <div>
                  <label className="agent-portal-label">Name</label>
                  <input className="agent-portal-input" value={filters.player_name} onChange={(e) => setFilters((current) => ({ ...current, player_name: e.target.value }))} />
                </div>
                <div>
                  <label className="agent-portal-label">Status</label>
                  <select className="agent-portal-select" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as RecommendationStatus | '' }))}>
                    <option value="">All statuses</option>
                    {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div>
                  <label className="agent-portal-label">Recommended By</label>
                  <select className="agent-portal-select" value={filters.agent_user_id} onChange={(e) => setFilters((current) => ({ ...current, agent_user_id: e.target.value }))}>
                    <option value="">All agents</option>
                    {meta.agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="agent-portal-label">From</label>
                  <input type="date" className="agent-portal-input" value={filters.created_from} onChange={(e) => setFilters((current) => ({ ...current, created_from: e.target.value }))} />
                </div>
                <div>
                  <label className="agent-portal-label">To</label>
                  <input type="date" className="agent-portal-input" value={filters.created_to} onChange={(e) => setFilters((current) => ({ ...current, created_to: e.target.value }))} />
                </div>
                <div>
                  <label className="agent-portal-label">Page Size</label>
                  <select className="agent-portal-select" value={filters.page_size} onChange={(e) => setFilters((current) => ({ ...current, page_size: Number(e.target.value), page: 1 }))}>
                    {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
                <div className="agent-portal-inline-actions" style={{ alignSelf: 'end' }}>
                  <button className="btn btn-primary" type="submit">Apply</button>
                </div>
              </form>

              <div className={`table-responsive external-recommendations-table-wrap ${reviewMode ? 'review-scroll-active' : ''}`}>
                <table className="agent-portal-table external-recommendations-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Transfermarkt</th>
                      <th>Recommended By</th>
                      <th>Status</th>
                      <th>Agency / Organisation</th>
                      <th>Free</th>
                      <th>Perm</th>
                      <th>Loan</th>
                      <th>Loan +</th>
                      <th>Fee</th>
                      <th>Current Salary</th>
                      <th>Expected Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={13} className="agent-portal-empty">Loading external recommendations...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={13} className="agent-portal-empty">No external recommendations found.</td></tr>
                    ) : (
                      items.map((item) => {
                        const dealFlags = getDealFlags(item.potential_deal_type);
                        return (
                          <tr key={item.id} onClick={() => openDetail(item)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#111827' }}>{item.player_name}</div>
                            </td>
                            <td>{item.submission_date ? new Date(item.submission_date).toLocaleDateString() : item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                            <td>{item.transfermarkt_link ? <a href={item.transfermarkt_link} target="_blank" rel="noreferrer">Open</a> : '-'}</td>
                            <td>{item.agent_name || '-'}</td>
                            <td><SubmissionStatusBadge status={item.status} /></td>
                            <td>{item.agency || '-'}</td>
                            <td>{dealFlags.free}</td>
                            <td>{dealFlags.perm}</td>
                            <td>{dealFlags.loan}</td>
                            <td>{dealFlags.loanPlus}</td>
                            <td>{formatAmount(item.transfer_fee_amount, item.transfer_fee_currency, item.transfer_fee)}</td>
                            <td>{formatWeeklyAmount(item.current_wages_per_week, item.current_wages_currency)}</td>
                            <td>{formatWeeklyAmount(item.expected_wages_per_week, item.expected_wages_currency)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginTop: '1.5rem' }}>
                <span className="agent-portal-meta">Page {filters.page} of {totalPages}</span>
                <div className="btn-group">
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {reviewMode ? (
          <div className="col-12 col-xxl-3">
            <div className="card h-100 shadow-sm border-0 rounded-4 overflow-hidden">
              <div className="card-header cafc-section-header-black">Review Panel</div>
              <div className="card-body">
                {!selected ? (
                  <div className="agent-portal-empty">Select a recommendation to review status history, update status, and save internal notes.</div>
                ) : detailLoading ? (
                  <div className="agent-portal-empty">Loading recommendation detail...</div>
                ) : (
                  <div className="agent-portal-review-stack">
                    <div>
                      <h2 className="h4 mb-1 text-dark">{selected.player_name}</h2>
                      <div className="agent-portal-meta">{selected.agent_name} {selected.agency ? `- ${selected.agency}` : ''}</div>
                    </div>

                    <div className="agent-portal-info-card">
                      <label className="agent-portal-label">Status</label>
                      <select
                        className="agent-portal-select"
                        value={selected.status}
                        onChange={(e) => handleStatusChange(e.target.value as RecommendationStatus)}
                        disabled={updatingStatus}
                      >
                        {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      {updatingStatus ? <div className="agent-portal-meta" style={{ marginTop: '0.5rem' }}>Updating status...</div> : null}
                    </div>

                    <div className="agent-portal-info-card">
                      <label className="agent-portal-label">Internal Notes</label>
                      <textarea className="agent-portal-textarea" rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                      <button className="btn btn-dark btn-sm mt-3" onClick={handleSaveNotes} disabled={savingNotes}>{savingNotes ? 'Saving...' : 'Save Notes'}</button>
                    </div>

                    <div>
                      <div className="agent-portal-label">Status History</div>
                      <div className="agent-portal-review-stack">
                        {statusHistory.length === 0 ? (
                          <div className="agent-portal-empty">No status changes yet.</div>
                        ) : (
                          statusHistory.map((entry) => (
                            <div key={entry.id} className="agent-portal-surface-muted">
                              <div style={{ fontWeight: 700, color: '#111827' }}>{entry.new_status}</div>
                              <div className="agent-portal-meta">{new Date(entry.changed_at).toLocaleString()}</div>
                              {entry.changed_by_name ? <div className="agent-portal-meta">Updated by {entry.changed_by_name}</div> : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="col-12">
            <div className="agent-portal-card">
              <div className="agent-portal-card-body py-3">
                {!selected ? (
                  <div className="agent-portal-meta">Select a row to preview additional notes.</div>
                ) : (
                  <div>
                    <div className="agent-portal-label mb-2">Additional Notes • {selected.player_name}</div>
                    <div className="agent-portal-meta" style={{ whiteSpace: 'pre-wrap', color: '#111827' }}>
                      {selected.additional_information || '-'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExternalRecommendationsListPage;
