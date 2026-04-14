import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SubmissionStatusBadge from '../components/agents/SubmissionStatusBadge';
import DealTypeBadges from '../components/recommendations/DealTypeBadges';
import NotesPreview from '../components/recommendations/NotesPreview';
import ExpandableRow from '../components/recommendations/ExpandableRow';
import QuickActionMenu from '../components/recommendations/QuickActionMenu';
import { internalRecommendationsService } from '../services/internalRecommendationsService';
import { getPerformanceScoreColor } from '../utils/colorUtils';
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
  position: string;
  deal_type: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

const formatAmount = (amount?: number, currency?: string, fallback?: string) => {
  if (amount === undefined || amount === null) return fallback || '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')}`;
};

const formatWeeklyAmount = (amount?: number, currency?: string) => {
  if (amount === undefined || amount === null) return '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')} p/w`;
};

const ExternalRecommendationsListPage: React.FC = () => {
  const [filters, setFilters] = useState<RecommendationFilterState>({
    status: '',
    agent_user_id: '',
    created_from: '',
    created_to: '',
    player_name: '',
    position: '',
    deal_type: '',
    page: 1,
    page_size: 25,
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [meta, setMeta] = useState<InternalRecommendationFiltersMeta>({ statuses: [], agents: [] });
  const [items, setItems] = useState<InternalRecommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selected, setSelected] = useState<InternalRecommendation | null>(null);
  const [statusHistory, setStatusHistory] = useState<RecommendationStatusHistory[]>([]);
  const [notesDraft, setNotesDraft] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.page_size)), [total, filters.page_size]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.agent_user_id) count++;
    if (filters.player_name) count++;
    if (filters.position) count++;
    if (filters.deal_type) count++;
    if (filters.created_from) count++;
    if (filters.created_to) count++;
    return count;
  }, [filters]);

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
  }, [filters.page, filters.sort_by, filters.sort_order]);

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

  const clearFilters = () => {
    setFilters({
      ...filters,
      status: '',
      agent_user_id: '',
      created_from: '',
      created_to: '',
      player_name: '',
      position: '',
      deal_type: '',
      page: 1,
    });
  };

  const handleSort = (column: string) => {
    setFilters((current) => ({
      ...current,
      sort_by: column,
      sort_order: current.sort_by === column && current.sort_order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleRowExpansion = (id: number) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  const SortableHeader: React.FC<{ column: string; label: string; className?: string }> = ({ column, label, className }) => {
    const isActive = filters.sort_by === column;
    return (
      <th className={className} onClick={() => handleSort(column)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div className="d-flex align-items-center gap-1">
          <span>{label}</span>
          {isActive ? (
            filters.sort_order === 'asc' ? (
              <i className="bi bi-chevron-up" style={{ fontSize: '0.7rem' }}></i>
            ) : (
              <i className="bi bi-chevron-down" style={{ fontSize: '0.7rem' }}></i>
            )
          ) : (
            <i className="bi bi-chevron-expand text-muted" style={{ fontSize: '0.6rem', opacity: 0.4 }}></i>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className={`page-reports-cafc container-fluid py-4 page-lists-cafc external-recommendations-page ${reviewMode ? 'review-mode' : ''}`}>
      <div className="agent-portal-card mb-4">
        <div className="agent-portal-card-body">
          <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="agent-portal-section-title">External Recommendations</div>
              <div className="agent-portal-section-copy">
                Agent-submitted player recommendations with comprehensive details and review workflow.
              </div>
            </div>
            <div className="agent-portal-inline-actions">
              <Link to="/lists" className="agent-portal-button-secondary">Back to Lists</Link>
              <button
                className={`btn btn-lg ${reviewMode ? 'btn-dark' : 'btn-outline-dark'}`}
                onClick={() => setReviewMode((current) => !current)}
                type="button"
              >
                <i className={`bi ${reviewMode ? 'bi-x-circle' : 'bi-pencil-square'} me-2`}></i>
                {reviewMode ? 'Exit Review Mode' : 'Review Mode'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {banner ? <div className="alert alert-success alert-dismissible fade show"><i className="bi bi-check-circle me-2"></i>{banner}<button type="button" className="btn-close" onClick={() => setBanner(null)}></button></div> : null}
      {error ? <div className="alert alert-danger alert-dismissible fade show"><i className="bi bi-exclamation-triangle me-2"></i>{error}<button type="button" className="btn-close" onClick={() => setError(null)}></button></div> : null}

      <div className="row g-4">
        <div className={reviewMode ? 'col-12 col-xxl-9' : 'col-12'}>
          <div className="agent-portal-card">
            <div className="agent-portal-card-body">
              <form onSubmit={applyFilters}>
                <div className="agent-portal-filter-bar mb-3">
                  <div>
                    <label className="agent-portal-label">Name</label>
                    <input className="agent-portal-input" value={filters.player_name} onChange={(e) => setFilters((current) => ({ ...current, player_name: e.target.value }))} placeholder="Search by name..." />
                  </div>
                  <div>
                    <label className="agent-portal-label">Status</label>
                    <select className="agent-portal-select" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as RecommendationStatus | '' }))}>
                      <option value="">All statuses</option>
                      {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
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
                  <div className="agent-portal-inline-actions" style={{ alignSelf: 'end', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${showAdvancedFilters ? 'btn-secondary' : 'btn-outline-secondary'}`}
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    >
                      <i className="bi bi-funnel me-1"></i>
                      Advanced
                      {activeFilterCount > 0 && <span className="badge bg-danger ms-2">{activeFilterCount}</span>}
                    </button>
                    <button className="btn btn-primary" type="submit">
                      <i className="bi bi-search me-1"></i>
                      Apply
                    </button>
                  </div>
                </div>

                {showAdvancedFilters && (
                  <div className="agent-portal-filter-bar mb-3 p-3 bg-light rounded">
                    <div>
                      <label className="agent-portal-label">Recommended By</label>
                      <select className="agent-portal-select" value={filters.agent_user_id} onChange={(e) => setFilters((current) => ({ ...current, agent_user_id: e.target.value }))}>
                        <option value="">All agents</option>
                        {meta.agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="agent-portal-label">Position</label>
                      <input className="agent-portal-input" value={filters.position} onChange={(e) => setFilters((current) => ({ ...current, position: e.target.value }))} placeholder="e.g. CM, RW..." />
                    </div>
                    <div>
                      <label className="agent-portal-label">Deal Type</label>
                      <select className="agent-portal-select" value={filters.deal_type} onChange={(e) => setFilters((current) => ({ ...current, deal_type: e.target.value }))}>
                        <option value="">All deal types</option>
                        <option value="Free">Free</option>
                        <option value="Permanent Transfer">Permanent Transfer</option>
                        <option value="Loan">Loan</option>
                        <option value="Loan with Option">Loan with Option</option>
                      </select>
                    </div>
                    <div className="agent-portal-inline-actions" style={{ alignSelf: 'end' }}>
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={clearFilters}>
                        <i className="bi bi-x-circle me-1"></i>
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
              </form>

              <div className="table-responsive" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                <table className="table table-hover align-middle mb-0">
                  <thead className="sticky-top" style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <tr>
                      <th style={{ width: '30px' }}></th>
                      <SortableHeader column="player_name" label="Name" />
                      <SortableHeader column="position" label="Position" />
                      <SortableHeader column="age" label="Age" />
                      <SortableHeader column="date" label="Date" />
                      <SortableHeader column="agent_name" label="Recommended By" />
                      <SortableHeader column="agency" label="Agency" />
                      <SortableHeader column="status" label="Status" />
                      <th>Deal Type</th>
                      <th>Additional Notes</th>
                      <th className="text-end">Fee</th>
                      <th className="text-end">Current Salary</th>
                      <th className="text-end">Expected Salary</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={14} className="text-center py-5 text-muted">Loading external recommendations...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={14} className="text-center py-5 text-muted">No external recommendations found.</td></tr>
                    ) : (
                      <>
                        {items.map((item) => {
                          const isExpanded = expandedRows.has(item.id);
                          return (
                            <React.Fragment key={item.id}>
                              <tr
                                className={selected?.id === item.id ? 'table-active' : ''}
                                style={{ cursor: 'pointer' }}
                              >
                                <td onClick={() => toggleRowExpansion(item.id)}>
                                  <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'} text-muted`} style={{ fontSize: '0.9rem' }}></i>
                                </td>
                                <td onClick={() => openDetail(item)}>
                                  <div className="d-flex align-items-center gap-2">
                                    <span className="fw-bold">{item.player_name}</span>
                                    {item.avg_performance_score !== null && item.avg_performance_score !== undefined ? (
                                      <span
                                        className="badge rounded-pill"
                                        style={{
                                          backgroundColor: getPerformanceScoreColor(item.avg_performance_score),
                                          color: item.avg_performance_score >= 7 ? '#ffffff' : '#111827',
                                          fontSize: '0.7rem',
                                        }}
                                      >
                                        {item.avg_performance_score.toFixed(1)}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td onClick={() => openDetail(item)}>
                                  {item.recommended_position ? (
                                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary" style={{ fontSize: '0.75rem' }}>
                                      {item.recommended_position}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td onClick={() => openDetail(item)}>{item.player_age || '-'}</td>
                                <td onClick={() => openDetail(item)} className="text-muted small">{item.submission_date ? new Date(item.submission_date).toLocaleDateString() : '-'}</td>
                                <td onClick={() => openDetail(item)}>{item.agent_name || '-'}</td>
                                <td onClick={() => openDetail(item)}>{item.agency || '-'}</td>
                                <td onClick={() => openDetail(item)}>
                                  {reviewMode ? (
                                    <select
                                      className="form-select form-select-sm"
                                      value={item.status}
                                      onChange={(e) => {
                                        setSelected(item);
                                        handleStatusChange(e.target.value as RecommendationStatus);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      disabled={updatingStatus && selected?.id === item.id}
                                    >
                                      {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                                    </select>
                                  ) : (
                                    <SubmissionStatusBadge status={item.status} />
                                  )}
                                </td>
                                <td onClick={() => openDetail(item)}>
                                  <DealTypeBadges dealTypes={item.potential_deal_type || ''} />
                                </td>
                                <td onClick={() => openDetail(item)}>
                                  <NotesPreview notes={item.additional_information || ''} maxLength={60} />
                                </td>
                                <td onClick={() => openDetail(item)} className="text-end">{formatAmount(item.transfer_fee_amount, item.transfer_fee_currency, item.transfer_fee)}</td>
                                <td onClick={() => openDetail(item)} className="text-end">{formatWeeklyAmount(item.current_wages_per_week, item.current_wages_currency)}</td>
                                <td onClick={() => openDetail(item)} className="text-end">{formatWeeklyAmount(item.expected_wages_per_week, item.expected_wages_currency)}</td>
                                <td>
                                  <QuickActionMenu
                                    onViewDetails={() => {
                                      openDetail(item);
                                      toggleRowExpansion(item.id);
                                    }}
                                    onChangeStatus={() => {
                                      openDetail(item);
                                      setReviewMode(true);
                                    }}
                                    onViewHistory={() => {
                                      openDetail(item);
                                      setReviewMode(true);
                                    }}
                                  />
                                </td>
                              </tr>
                              {isExpanded && <ExpandableRow recommendation={item} colSpan={14} />}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <span className="text-muted small">
                  Page {filters.page} of {totalPages} • {total} total recommendation{total !== 1 ? 's' : ''}
                </span>
                <div className="btn-group">
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>
                    <i className="bi bi-chevron-left"></i> Previous
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>
                    Next <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {reviewMode && (
          <div className="col-12 col-xxl-3">
            <div className="card h-100 shadow-sm border-0 rounded-4 overflow-hidden sticky-top" style={{ top: '20px' }}>
              <div className="card-header bg-dark text-white py-3">
                <h5 className="mb-0 d-flex align-items-center">
                  <i className="bi bi-clipboard-check me-2"></i>
                  Review Panel
                </h5>
              </div>
              <div className="card-body">
                {!selected ? (
                  <div className="text-center text-muted py-5">
                    <i className="bi bi-hand-index-thumb display-4 d-block mb-3"></i>
                    <p>Select a recommendation to review status, update notes, and view history.</p>
                  </div>
                ) : detailLoading ? (
                  <div className="text-center text-muted py-5">
                    <div className="spinner-border spinner-border-sm mb-2" role="status"></div>
                    <p>Loading details...</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    <div>
                      <h6 className="fw-bold mb-1">{selected.player_name}</h6>
                      <p className="text-muted small mb-0">{selected.agent_name} {selected.agency ? `• ${selected.agency}` : ''}</p>
                    </div>

                    <div className="border rounded p-3 bg-light">
                      <label className="form-label fw-bold small mb-2">Status</label>
                      <select
                        className="form-select"
                        value={selected.status}
                        onChange={(e) => handleStatusChange(e.target.value as RecommendationStatus)}
                        disabled={updatingStatus}
                      >
                        {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      {updatingStatus && <div className="text-muted small mt-2"><div className="spinner-border spinner-border-sm me-1" role="status"></div>Updating...</div>}
                    </div>

                    <div className="border rounded p-3">
                      <label className="form-label fw-bold small mb-2">Internal Notes</label>
                      <textarea className="form-control" rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                      <button className="btn btn-dark btn-sm mt-2 w-100" onClick={handleSaveNotes} disabled={savingNotes}>
                        {savingNotes ? (
                          <><div className="spinner-border spinner-border-sm me-1" role="status"></div>Saving...</>
                        ) : (
                          <><i className="bi bi-save me-1"></i>Save Notes</>
                        )}
                      </button>
                    </div>

                    <div>
                      <h6 className="fw-bold small mb-2 text-uppercase" style={{ letterSpacing: '0.05em' }}>
                        <i className="bi bi-clock-history me-1"></i>
                        Status History
                      </h6>
                      <div className="d-flex flex-column gap-2">
                        {statusHistory.length === 0 ? (
                          <div className="text-center text-muted small py-3 border rounded">No status changes yet.</div>
                        ) : (
                          statusHistory.map((entry) => (
                            <div key={entry.id} className="border rounded p-2 bg-light">
                              <div className="fw-bold small">{entry.new_status}</div>
                              <div className="text-muted small">{new Date(entry.changed_at).toLocaleString()}</div>
                              {entry.changed_by_name && <div className="text-muted small">by {entry.changed_by_name}</div>}
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
        )}
      </div>
    </div>
  );
};

export default ExternalRecommendationsListPage;
