import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, Collapse, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import SubmissionStatusBadge, { AgentStatusBadge } from '../components/agents/SubmissionStatusBadge';
import DealTypeBadges from '../components/recommendations/DealTypeBadges';
import RecommendationReviewModal from '../components/recommendations/RecommendationReviewModal';
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

const defaultFilters: RecommendationFilterState = {
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
};

const formatNumberToken = (value: string) => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed).toLocaleString('en-GB') : trimmed;
};

const formatWeeklyAmount = (amount?: number | string, currency?: string) => {
  if (amount === undefined || amount === null || amount === '') return '-';
  const displayAmount = typeof amount === 'string'
    ? amount.split('-').map(formatNumberToken).join('-')
    : Math.round(amount).toLocaleString('en-GB');
  return `${currency || 'GBP'} ${displayAmount} p/w`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const calculateAge = (dateOfBirth?: string | null) => {
  if (!dateOfBirth) return '-';
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return '-';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '-';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB');
};

const formatRecommendedPositions = (recommendedPosition?: string | string[] | null) => {
  if (!recommendedPosition || (Array.isArray(recommendedPosition) && recommendedPosition.length === 0)) return '-';
  if (Array.isArray(recommendedPosition)) {
    return recommendedPosition.length ? recommendedPosition.join(', ') : '-';
  }
  const positions = recommendedPosition.split(',').map((position) => position.trim()).filter(Boolean);
  return positions.length ? positions.join(', ') : '-';
};

const getPlayerProfilePath = (item: InternalRecommendation) => {
  if (item.linked_player_data_source === 'internal' && item.linked_cafc_player_id) {
    return `/player-profile/${item.linked_cafc_player_id}`;
  }
  if (item.linked_cafc_player_id && !item.linked_player_id) {
    return `/player-profile/${item.linked_cafc_player_id}`;
  }
  if (item.linked_player_id) {
    return `/player/${item.linked_player_id}`;
  }
  return null;
};

const ExternalRecommendationsListPage: React.FC = () => {
  const [filters, setFilters] = useState<RecommendationFilterState>(defaultFilters);
  const [meta, setMeta] = useState<InternalRecommendationFiltersMeta>({ statuses: [], agents: [] });
  const [items, setItems] = useState<InternalRecommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState<number | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<InternalRecommendation | null>(null);
  const [historyRecommendation, setHistoryRecommendation] = useState<InternalRecommendation | null>(null);
  const [statusHistoryMap, setStatusHistoryMap] = useState<Map<number, RecommendationStatusHistory[]>>(new Map());
  const [loadingHistoryIds, setLoadingHistoryIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const previousListControlKey = useRef(`${filters.page}|${filters.sort_by}|${filters.sort_order}`);
  const pendingFilterEdit = useRef(false);

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
      const listResponse = await internalRecommendationsService.list(nextFilters);
      setItems(listResponse.items);
      setTotal(listResponse.total);
    } catch (err) {
      console.error(err);
      setError('Failed to load external recommendations');
    } finally {
      setLoading(false);
    }
  };

  const updateFilters = (partialFilters: Partial<RecommendationFilterState>) => {
    pendingFilterEdit.current = true;
    setFilters((current) => ({
      ...current,
      ...partialFilters,
      page: 1,
    }));
  };

  const loadStatusHistory = async (itemId: number, forceRefresh = false, errorTarget: 'history' | 'modal' = 'history') => {
    if (!forceRefresh && statusHistoryMap.has(itemId)) return;
    try {
      setLoadingHistoryIds((current) => new Set(current).add(itemId));
      const history = await internalRecommendationsService.getStatusHistory(itemId);
      setStatusHistoryMap((prev) => new Map(prev).set(itemId, history));
    } catch (err) {
      console.error(err);
      if (errorTarget === 'modal') {
        setModalError('Failed to load status history');
      } else {
        setHistoryError('Failed to load status history');
      }
    } finally {
      setLoadingHistoryIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  useEffect(() => {
    const initialise = async () => {
      try {
        setLoading(true);
        setError(null);
        const [metaResponse, listResponse] = await Promise.all([
          internalRecommendationsService.getFiltersMeta(),
          internalRecommendationsService.list(filters),
        ]);
        setMeta(metaResponse);
        setItems(listResponse.items);
        setTotal(listResponse.total);
      } catch (err) {
        console.error(err);
        setError('Failed to load external recommendations');
      } finally {
        hasLoadedOnce.current = true;
        setLoading(false);
      }
    };

    initialise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasLoadedOnce.current) return;

    const currentListControlKey = `${filters.page}|${filters.sort_by}|${filters.sort_order}`;
    const listControlsChanged = previousListControlKey.current !== currentListControlKey;
    previousListControlKey.current = currentListControlKey;

    if (listControlsChanged && !pendingFilterEdit.current) {
      load(filters);
      return;
    }

    const timeout = window.setTimeout(() => {
      pendingFilterEdit.current = false;
      load(filters);
    }, 500);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.status,
    filters.agent_user_id,
    filters.created_from,
    filters.created_to,
    filters.player_name,
    filters.position,
    filters.deal_type,
    filters.page_size,
    filters.page,
    filters.sort_by,
    filters.sort_order,
  ]);

  const clearFilters = () => {
    const nextFilters = {
      ...defaultFilters,
      page_size: filters.page_size,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
    };
    pendingFilterEdit.current = true;
    setFilters(nextFilters);
  };

  const handleSort = (column: string) => {
    setFilters((current) => ({
      ...current,
      sort_by: column,
      sort_order: current.sort_by === column && current.sort_order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const openReviewModal = async (item: InternalRecommendation) => {
    setSelectedRecommendation(item);
    setModalMessage(null);
    setModalError(null);
  };

  const openHistoryModal = async (item: InternalRecommendation) => {
    setHistoryRecommendation(item);
    setHistoryError(null);
    await loadStatusHistory(item.id);
  };

  const closeReviewModal = () => {
    setSelectedRecommendation(null);
    setModalMessage(null);
    setModalError(null);
  };

  const closeHistoryModal = () => {
    setHistoryRecommendation(null);
    setHistoryError(null);
  };

  const updateSelectedRecommendation = (updatedItem: InternalRecommendation) => {
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)));
    setSelectedRecommendation((current) => (current?.id === updatedItem.id ? { ...current, ...updatedItem } : current));
  };

  const handleStatusChange = async (item: InternalRecommendation, newStatus: RecommendationStatus) => {
    if (item.status === newStatus) return;
    try {
      setUpdatingStatus(item.id);
      setError(null);
      setBanner(null);
      setModalError(null);
      setModalMessage(null);
      const response = await internalRecommendationsService.updateStatus(item.id, newStatus);
      updateSelectedRecommendation(response.item);
      if (response.item.status_history) {
        setStatusHistoryMap((prev) => new Map(prev).set(item.id, response.item.status_history || []));
      } else {
        await loadStatusHistory(item.id, true, 'modal');
      }
      setModalMessage(response.warning || 'Status updated successfully');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setModalError(err?.response?.data?.detail || 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSaveNotes = async (item: InternalRecommendation, notes: string) => {
    try {
      setSavingNotes(item.id);
      setError(null);
      setBanner(null);
      setModalError(null);
      setModalMessage(null);
      const updatedItem = await internalRecommendationsService.updateNotes(item.id, notes);
      updateSelectedRecommendation(updatedItem);
      setModalMessage('Internal notes saved');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setModalError(err?.response?.data?.detail || 'Failed to save notes');
    } finally {
      setSavingNotes(null);
    }
  };

  const SortableHeader: React.FC<{ column: string; label: string; className?: string }> = ({ column, label, className }) => {
    const isActive = filters.sort_by === column;
    return (
      <th className={className} onClick={() => handleSort(column)}>
        <div className="external-recommendations-sort-header">
          <span>{label}</span>
          {isActive ? (
            filters.sort_order === 'asc' ? (
              <i className="bi bi-chevron-up"></i>
            ) : (
              <i className="bi bi-chevron-down"></i>
            )
          ) : (
            <i className="bi bi-chevron-expand text-muted"></i>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="page-reports-cafc container-fluid py-4 page-lists-cafc external-recommendations-page">
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
            </div>
          </div>
        </div>
      </div>

      {banner ? <div className="alert alert-success alert-dismissible fade show"><i className="bi bi-check-circle me-2"></i>{banner}<button type="button" className="btn-close" onClick={() => setBanner(null)}></button></div> : null}
      {error ? <div className="alert alert-danger alert-dismissible fade show"><i className="bi bi-exclamation-triangle me-2"></i>{error}<button type="button" className="btn-close" onClick={() => setError(null)}></button></div> : null}

      <div className="agent-portal-card">
        <div className="agent-portal-card-body">
          <div className="external-recommendations-toolbar">
            <div>
              <div className="external-recommendations-result-title">Recommendation shortlist</div>
              <div className="external-recommendations-result-copy">
                {total} total recommendation{total !== 1 ? 's' : ''} • Page {filters.page} of {totalPages}
              </div>
            </div>
          </div>

          <Card className="mb-3">
            <Card.Header style={{ backgroundColor: '#000000', color: 'white' }}>
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0 text-white">
                  Advanced Filters
                  {activeFilterCount > 0 ? <span className="badge bg-light text-dark ms-2">{activeFilterCount}</span> : null}
                </h6>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  style={{ color: 'white', borderColor: 'white' }}
                >
                  {showFilters ? '▲ Hide Filters' : '▼ Show Filters'}
                </Button>
              </div>
            </Card.Header>
            <Collapse in={showFilters}>
              <Card.Body className="filter-section-improved">
                <Row className="mb-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Player Name</Form.Label>
                      <Form.Control
                        size="sm"
                        type="text"
                        value={filters.player_name}
                        onChange={(event) => updateFilters({ player_name: event.target.value })}
                        placeholder="Enter player name"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Review Status</Form.Label>
                      <Form.Select
                        size="sm"
                        value={filters.status}
                        onChange={(event) => updateFilters({ status: event.target.value as RecommendationStatus | '' })}
                      >
                        <option value="">All statuses</option>
                        {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Recommended By</Form.Label>
                      <Form.Select
                        size="sm"
                        value={filters.agent_user_id}
                        onChange={(event) => updateFilters({ agent_user_id: event.target.value })}
                      >
                        <option value="">All agents</option>
                        {meta.agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.label}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Position</Form.Label>
                      <Form.Control
                        size="sm"
                        type="text"
                        value={filters.position}
                        onChange={(event) => updateFilters({ position: event.target.value })}
                        placeholder="e.g. CM, RW"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Deal Type</Form.Label>
                      <Form.Select
                        size="sm"
                        value={filters.deal_type}
                        onChange={(event) => updateFilters({ deal_type: event.target.value })}
                      >
                        <option value="">All deal types</option>
                        <option value="Free">Free</option>
                        <option value="Permanent Transfer">Permanent Transfer</option>
                        <option value="Loan">Loan</option>
                        <option value="Loan with Option">Loan with Option</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Page Size</Form.Label>
                      <Form.Select
                        size="sm"
                        value={filters.page_size}
                        onChange={(event) => updateFilters({ page_size: Number(event.target.value) })}
                      >
                        {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold">Date Range</Form.Label>
                      <div className="range-inputs">
                        <Form.Control
                          size="sm"
                          type="date"
                          value={filters.created_from}
                          onChange={(event) => updateFilters({ created_from: event.target.value })}
                        />
                        <span className="range-separator">to</span>
                        <Form.Control
                          size="sm"
                          type="date"
                          value={filters.created_to}
                          onChange={(event) => updateFilters({ created_to: event.target.value })}
                        />
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold" style={{ visibility: 'hidden' }}>Placeholder</Form.Label>
                      <Button variant="outline-secondary" size="sm" onClick={clearFilters} className="w-100">
                        Clear All Filters
                      </Button>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-bold" style={{ visibility: 'hidden' }}>Placeholder</Form.Label>
                      <div className="text-muted small">
                        Showing {items.length} on this page ({total} total results)
                        {activeFilterCount > 0 ? ` • ${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}` : ''}
                      </div>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Collapse>
          </Card>

          <div className="external-recommendations-table-wrap">
            <table className="table table-hover align-middle mb-0 external-recommendations-table">
              <thead>
                <tr>
                  <SortableHeader column="player_name" label="Player" className="col-name" />
                  <SortableHeader column="position" label="Position" className="col-position" />
                  <th className="col-age">Age</th>
                  <SortableHeader column="date" label="Submitted" className="col-date" />
                  <SortableHeader column="agent_name" label="Agent" className="col-agent" />
                  <SortableHeader column="status" label="Review Status" className="col-status" />
                  <th className="col-status">Agent Status</th>
                  <th className="col-deal">Deal Type</th>
                  <th className="col-money">Expected Salary</th>
                  <th className="col-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-5 text-muted">Loading external recommendations...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-5 text-muted">No external recommendations found.</td></tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="cell-name">
                        <div className="external-recommendations-player-cell">
                          {getPlayerProfilePath(item) ? (
                            <Link className="fw-bold text-truncate" to={getPlayerProfilePath(item) || '#'} title="Open player profile">
                              {item.player_name}
                            </Link>
                          ) : (
                            <span className="fw-bold text-truncate">{item.player_name}</span>
                          )}
                          {item.avg_performance_score !== null && item.avg_performance_score !== undefined ? (
                            <span
                              className="external-recommendations-score-badge"
                              style={{
                                backgroundColor: getPerformanceScoreColor(item.avg_performance_score),
                                color: item.avg_performance_score >= 7 ? '#ffffff' : '#111827',
                              }}
                            >
                              {item.avg_performance_score.toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="cell-position" title={formatRecommendedPositions(item.recommended_position)}>
                        {formatRecommendedPositions(item.recommended_position)}
                      </td>
                      <td className="cell-age">{calculateAge(item.player_date_of_birth)}</td>
                      <td className="cell-date">{formatDate(item.submission_date)}</td>
                      <td className="cell-agent" title={item.agent_name || '-'}>
                        {item.agent_name || '-'}
                      </td>
                      <td className="cell-status"><SubmissionStatusBadge status={item.status} /></td>
                      <td className="cell-status"><AgentStatusBadge status={item.agent_status} /></td>
                      <td><DealTypeBadges dealTypes={item.potential_deal_type || ''} /></td>
                      <td className="cell-money">{formatWeeklyAmount(item.expected_wages_per_week, item.expected_wages_currency)}</td>
                      <td className="cell-actions">
                        <div className="external-recommendations-action-stack">
                          <Button size="sm" variant="outline-dark" onClick={() => openReviewModal(item)}>
                            Review
                          </Button>
                          <Button size="sm" variant="outline-secondary" onClick={() => openHistoryModal(item)}>
                            History
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
            <span className="text-muted small">
              Showing {items.length} on this page ({total} total)
            </span>
            <div className="btn-group">
              <Button variant="outline-secondary" size="sm" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>
                <i className="bi bi-chevron-left"></i> Previous
              </Button>
              <Button variant="outline-secondary" size="sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>
                Next <i className="bi bi-chevron-right"></i>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <RecommendationReviewModal
        show={Boolean(selectedRecommendation)}
        recommendation={selectedRecommendation}
        statuses={meta.statuses}
        updatingStatus={selectedRecommendation ? updatingStatus === selectedRecommendation.id : false}
        savingNotes={selectedRecommendation ? savingNotes === selectedRecommendation.id : false}
        message={modalMessage}
        error={modalError}
        onHide={closeReviewModal}
        onStatusChange={handleStatusChange}
        onSaveNotes={handleSaveNotes}
      />

      <Modal show={Boolean(historyRecommendation)} onHide={closeHistoryModal} size="lg" centered scrollable>
        <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
          <Modal.Title>Status History{historyRecommendation ? ` for ${historyRecommendation.player_name}` : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {historyError ? <div className="alert alert-danger">{historyError}</div> : null}
          {historyRecommendation && loadingHistoryIds.has(historyRecommendation.id) ? (
            <div className="text-muted small d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              Loading history...
            </div>
          ) : historyRecommendation && (statusHistoryMap.get(historyRecommendation.id) || []).length > 0 ? (
            <div className="external-history-table-wrap">
              <table className="table align-middle mb-0 external-history-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Changed By</th>
                    <th>Changed At</th>
                  </tr>
                </thead>
                <tbody>
                  {(statusHistoryMap.get(historyRecommendation.id) || []).map((entry) => (
                    <tr key={entry.id}>
                      <td><SubmissionStatusBadge status={entry.new_status} /></td>
                      <td>{entry.changed_by_name || '-'}</td>
                      <td>{formatDateTime(entry.changed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="external-review-empty-history">No status changes yet.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeHistoryModal}>Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ExternalRecommendationsListPage;
