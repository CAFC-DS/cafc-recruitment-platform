import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Col, Collapse, Form, Modal, OverlayTrigger, Row, Spinner, Toast, ToastContainer, Tooltip } from 'react-bootstrap';
import { ArrowLeft, ChevronDown, ChevronsUpDown, ChevronUp, CircleHelp, History, ListFilter, Mail, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import SubmissionStatusBadge from '../components/agents/SubmissionStatusBadge';
import { dealTypeShortLabel } from '../components/recommendations/DealTypeBadges';
import RecommendationReviewModal from '../components/recommendations/RecommendationReviewModal';
import { internalRecommendationsService } from '../services/internalRecommendationsService';
import { getRecommendationStatusConfig } from '../utils/agentRecommendationStatus';
import GradeChip from '../components/GradeChip';
import ListDataScore from '../components/PlayerLists/ListDataScore';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTheme } from '../contexts/ThemeContext';
import './ExternalRecommendationsListPage.css';
import {
  InternalRecommendation,
  InternalRecommendationFiltersMeta,
  RecommendationStatus,
  RecommendationStatusHistory,
} from '../types/recommendations';

type RecommendationQueue = 'needs_decision' | 'all';

interface ActiveFilter {
  key: string;
  label: string;
  clear: Partial<RecommendationFilterState>;
}

const NEEDS_DECISION_STATUSES: RecommendationStatus[] = ['Submitted', 'Under Review'];

interface RecommendationFilterState {
  queue: RecommendationQueue;
  status: RecommendationStatus | '';
  agent_user_id: string;
  created_from: string;
  created_to: string;
  player_name: string;
  position: string;
  age_min: string;
  age_max: string;
  deal_type: string;
  transfer_fee_min: string;
  transfer_fee_max: string;
  expected_salary_min: string;
  expected_salary_max: string;
  page: number;
  page_size: number;
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

const defaultFilters: RecommendationFilterState = {
  queue: 'needs_decision',
  status: '',
  agent_user_id: '',
  created_from: '',
  created_to: '',
  player_name: '',
  position: '',
  age_min: '',
  age_max: '',
  deal_type: '',
  transfer_fee_min: '',
  transfer_fee_max: '',
  expected_salary_min: '',
  expected_salary_max: '',
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
};

// The queue is a view of the status filter: an explicit status always wins.
const toListRequest = ({ queue, ...filters }: RecommendationFilterState) => ({
  ...filters,
  status: filters.status || (queue === 'needs_decision' ? NEEDS_DECISION_STATUSES.join(',') : ''),
});

const statusRowLabel = (status: RecommendationStatus) => (
  status === 'Under Review' ? 'Under Review' : getRecommendationStatusConfig(status).shortLabel
);

const formatDealAndFee = (dealTypes: string | undefined, fee: string) => {
  const deals = (dealTypes || '').split(',').map((type) => type.trim()).filter(Boolean).map(dealTypeShortLabel).join(', ');
  const parts = [deals, fee === '-' ? '' : fee].filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
};

const formatNumberToken = (value: string) => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed).toLocaleString('en-GB') : trimmed;
};

const formatWeeklyAmount = (amount?: number | string, currency?: string, basis?: string) => {
  if (amount === undefined || amount === null || amount === '') return '-';
  const displayAmount = typeof amount === 'string'
    ? amount.split('-').map(formatNumberToken).join('-')
    : Math.round(amount).toLocaleString('en-GB');
  return `${currency || 'GBP'} ${displayAmount} p/w${basis ? ` ${basis.toLowerCase()}` : ''}`;
};

const formatTransferFeeAmount = (
  amount?: number | string,
  currency?: string,
  fallback?: string | null,
) => {
  if (amount === undefined || amount === null || amount === '') {
    return fallback || '-';
  }
  const displayAmount = typeof amount === 'string'
    ? amount.split('-').map(formatNumberToken).join('-')
    : Math.round(amount).toLocaleString('en-GB');
  return `${currency || 'GBP'} ${displayAmount}`;
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
  const { isIntelReviewer, user } = useCurrentUser();
  const { theme } = useTheme();
  const canSelect = user?.role === 'admin';
  const statusPillStyle = (status: RecommendationStatus) => {
    const { color, darkColor } = getRecommendationStatusConfig(status);
    const colors = theme.isDark ? darkColor : color;
    return { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border };
  };
  const [ncucSelected, setNcucSelected] = useState<number[]>([]);
  const [filters, setFilters] = useState<RecommendationFilterState>(defaultFilters);
  const [meta, setMeta] = useState<InternalRecommendationFiltersMeta>({ statuses: [], agents: [] });
  const [items, setItems] = useState<InternalRecommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [queueCounts, setQueueCounts] = useState<{ needs_decision: number; all: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingReview, setSavingReview] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusKey, setShowStatusKey] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<InternalRecommendation | null>(null);
  const [historyRecommendation, setHistoryRecommendation] = useState<InternalRecommendation | null>(null);
  const [statusHistoryMap, setStatusHistoryMap] = useState<Map<number, RecommendationStatusHistory[]>>(new Map());
  const [loadingHistoryIds, setLoadingHistoryIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingStatusChanges, setPendingStatusChanges] = useState<Map<number, RecommendationStatus>>(new Map());
  const [savingPendingStatusChanges, setSavingPendingStatusChanges] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'danger'>('success');
  const hasLoadedOnce = useRef(false);
  const previousListControlKey = useRef(`${filters.queue}|${filters.page}|${filters.sort_by}|${filters.sort_order}`);
  const pendingFilterEdit = useRef(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.page_size)), [total, filters.page_size]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.agent_user_id) count++;
    if (filters.player_name) count++;
    if (filters.position) count++;
    if (filters.age_min) count++;
    if (filters.age_max) count++;
    if (filters.deal_type) count++;
    if (filters.created_from) count++;
    if (filters.created_to) count++;
    if (filters.transfer_fee_min) count++;
    if (filters.transfer_fee_max) count++;
    if (filters.expected_salary_min) count++;
    if (filters.expected_salary_max) count++;
    return count;
  }, [filters]);

  const load = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const listResponse = await internalRecommendationsService.list(toListRequest(nextFilters));
      setItems(listResponse.items);
      setTotal(listResponse.total);
      setQueueCounts(listResponse.queue_counts || null);
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
          internalRecommendationsService.list(toListRequest(filters)),
        ]);
        setMeta(metaResponse);
        setItems(listResponse.items);
        setTotal(listResponse.total);
        setQueueCounts(listResponse.queue_counts || null);
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

    const currentListControlKey = `${filters.queue}|${filters.page}|${filters.sort_by}|${filters.sort_order}`;
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
    filters.queue,
    filters.status,
    filters.agent_user_id,
    filters.created_from,
    filters.created_to,
    filters.player_name,
    filters.position,
    filters.age_min,
    filters.age_max,
    filters.deal_type,
    filters.transfer_fee_min,
    filters.transfer_fee_max,
    filters.expected_salary_min,
    filters.expected_salary_max,
    filters.page_size,
    filters.page,
    filters.sort_by,
    filters.sort_order,
  ]);

  const clearFilters = () => {
    const nextFilters = {
      ...defaultFilters,
      queue: filters.queue,
      page_size: filters.page_size,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
    };
    pendingFilterEdit.current = true;
    setFilters(nextFilters);
  };

  const selectQueue = (queue: RecommendationQueue) => {
    setFilters((current) => ({ ...current, queue, status: '', page: 1 }));
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
    // Only the list endpoint carries data_score, so a single-item response must not blank it.
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem, data_score: item.data_score } : item)));
    setSelectedRecommendation((current) => (current?.id === updatedItem.id ? { ...current, ...updatedItem } : current));
  };

  const queueStatusChange = (recommendationId: number, currentStatus: RecommendationStatus, newStatus: RecommendationStatus) => {
    setPendingStatusChanges((current) => {
      const next = new Map(current);
      if (newStatus === currentStatus) {
        next.delete(recommendationId);
      } else {
        next.set(recommendationId, newStatus);
      }
      return next;
    });
  };

  const discardPendingStatusChanges = () => {
    setPendingStatusChanges(new Map());
  };

  const savePendingStatusChanges = async () => {
    if (!pendingStatusChanges.size) return;
    try {
      setSavingPendingStatusChanges(true);
      setError(null);
      setBanner(null);
      const updates = Array.from(pendingStatusChanges.entries()).map(([recommendationId, newStatus]) => ({
        recommendation_id: recommendationId,
        new_status: newStatus,
      }));
      const response = await internalRecommendationsService.bulkUpdateStatus(updates);
      const failedIds = new Set(response.failures.map((failure) => failure.recommendation_id));
      const successfulUpdates = new Map(
        updates
          .filter((update) => !failedIds.has(update.recommendation_id))
          .map((update) => [update.recommendation_id, update.new_status] as const),
      );

      if (successfulUpdates.size > 0) {
        setItems((current) =>
          current.map((item) => {
            const nextStatus = successfulUpdates.get(item.id);
            return nextStatus ? { ...item, status: nextStatus } : item;
          }),
        );
      }

      setPendingStatusChanges((current) => {
        const next = new Map<number, RecommendationStatus>();
        current.forEach((status, recommendationId) => {
          if (failedIds.has(recommendationId)) {
            next.set(recommendationId, status);
          }
        });
        return next;
      });

      let refreshFailed = false;
      try {
        await load(filters);
      } catch (refreshError) {
        refreshFailed = true;
        console.error('Status changes saved but recommendation list refresh failed:', refreshError);
      }

      setToastMessage(
        refreshFailed
          ? response.failed
            ? `Saved ${response.updated} status change${response.updated === 1 ? '' : 's'}. ${response.failed} failed. The page may need a refresh.`
            : `Saved ${response.updated} status change${response.updated === 1 ? '' : 's'}. The page may need a refresh.`
          : response.failed
            ? `Saved ${response.updated} status change${response.updated === 1 ? '' : 's'}. ${response.failed} failed.`
            : `Saved ${response.updated} status change${response.updated === 1 ? '' : 's'}.`,
      );
      setToastVariant(response.failed || refreshFailed ? 'danger' : 'success');
      setShowToast(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to save status changes');
    } finally {
      setSavingPendingStatusChanges(false);
    }
  };

  const handleSubmitReview = async (item: InternalRecommendation, newStatus: RecommendationStatus, sharedNotes: string) => {
    try {
      setSavingReview(item.id);
      setError(null);
      setBanner(null);
      setModalError(null);
      setModalMessage(null);
      const response = await internalRecommendationsService.saveReview(item.id, newStatus, sharedNotes);
      updateSelectedRecommendation(response.item);
      if (response.item.status_history) {
        setStatusHistoryMap((prev) => new Map(prev).set(item.id, response.item.status_history || []));
      } else {
        await loadStatusHistory(item.id, true, 'modal');
      }
      await load(filters);
      setToastMessage(response.warning || 'Review changes saved successfully');
      setToastVariant('success');
      setShowToast(true);
      closeReviewModal();
    } catch (err: any) {
      console.error(err);
      setModalError(err?.response?.data?.detail || 'Failed to save review');
    } finally {
      setSavingReview(null);
    }
  };

  const renderSort = (column: string, label: string) => {
    const isActive = filters.sort_by === column || (column === 'date' && filters.sort_by === 'created_at');
    const Icon = !isActive ? ChevronsUpDown : filters.sort_order === 'asc' ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        className={`rec-queue-sort${isActive ? ' is-active' : ''}`}
        onClick={() => handleSort(column)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    );
  };

  const activeFilters = ([
    filters.player_name ? { key: 'player', label: `Player: ${filters.player_name}`, clear: { player_name: '' } } : null,
    filters.status ? { key: 'status', label: getRecommendationStatusConfig(filters.status).displayLabel, clear: { status: '' } } : null,
    filters.agent_user_id ? { key: 'agent', label: meta.agents.find((agent) => String(agent.user_id) === filters.agent_user_id)?.label || 'Agent', clear: { agent_user_id: '' } } : null,
    filters.position ? { key: 'position', label: `Position: ${filters.position}`, clear: { position: '' } } : null,
    filters.deal_type ? { key: 'deal', label: filters.deal_type, clear: { deal_type: '' } } : null,
    filters.age_min || filters.age_max ? { key: 'age', label: `Age ${filters.age_min || 'any'} to ${filters.age_max || 'any'}`, clear: { age_min: '', age_max: '' } } : null,
    filters.created_from || filters.created_to ? { key: 'date', label: `Submitted ${filters.created_from || 'any'} to ${filters.created_to || 'any'}`, clear: { created_from: '', created_to: '' } } : null,
    filters.transfer_fee_min || filters.transfer_fee_max ? { key: 'fee', label: `Fee ${filters.transfer_fee_min || 'any'} to ${filters.transfer_fee_max || 'any'}`, clear: { transfer_fee_min: '', transfer_fee_max: '' } } : null,
    filters.expected_salary_min || filters.expected_salary_max ? { key: 'salary', label: `Salary ${filters.expected_salary_min || 'any'} to ${filters.expected_salary_max || 'any'}`, clear: { expected_salary_min: '', expected_salary_max: '' } } : null,
  ] as Array<ActiveFilter | null>).filter((entry): entry is ActiveFilter => entry !== null);

  const columnCount = canSelect ? 7 : 6;

  return (
    <div className="page-reports-cafc container-fluid py-3 page-lists-cafc rec-queue">
      <header className="rec-queue-heading">
        <div>
          <h1>External Recommendations</h1>
          <p>Players agents have put forward for review.</p>
        </div>
        <Link to="/lists" className="rec-queue-back"><ArrowLeft size={15} aria-hidden="true" />Back to Lists</Link>
      </header>

      {banner ? <div className="alert alert-success alert-dismissible fade show"><i className="bi bi-check-circle me-2"></i>{banner}<button type="button" className="btn-close" onClick={() => setBanner(null)}></button></div> : null}
      {error ? <div className="alert alert-danger alert-dismissible fade show"><i className="bi bi-exclamation-triangle me-2"></i>{error}<button type="button" className="btn-close" onClick={() => setError(null)}></button></div> : null}

      <div className="rec-queue-toolbar">
        <div className="rec-queue-tabs" role="group" aria-label="Which recommendations to show">
          <button type="button" className={filters.queue === 'needs_decision' ? 'is-active' : ''} aria-pressed={filters.queue === 'needs_decision'} onClick={() => selectQueue('needs_decision')}>
            Needs decision{queueCounts ? <span>{queueCounts.needs_decision}</span> : null}
          </button>
          <button type="button" className={filters.queue === 'all' ? 'is-active' : ''} aria-pressed={filters.queue === 'all'} onClick={() => selectQueue('all')}>
            All{queueCounts ? <span>{queueCounts.all}</span> : null}
          </button>
        </div>
        <div className="rec-queue-tools">
          {canSelect && ncucSelected.length > 0 ? (
            <Link className="rec-queue-tool is-action" to={`/admin/email?ids=${ncucSelected.join(',')}`}>
              <Mail size={15} aria-hidden="true" />Email users / mark {ncucSelected.length} NCUC
            </Link>
          ) : null}
          <button type="button" className={`rec-queue-tool${showStatusKey ? ' is-open' : ''}`} aria-expanded={showStatusKey} onClick={() => setShowStatusKey(!showStatusKey)}>
            <CircleHelp size={15} aria-hidden="true" />Status key
          </button>
          <button type="button" className={`rec-queue-tool${showFilters ? ' is-open' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            <ListFilter size={15} aria-hidden="true" />Filters{activeFilterCount > 0 ? <span className="rec-queue-tool-count">{activeFilterCount}</span> : null}
          </button>
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="rec-queue-active-filters">
          {activeFilters.map((entry) => (
            <button type="button" key={entry.key} onClick={() => updateFilters(entry.clear)} aria-label={`Remove filter ${entry.label}`}>
              {entry.label}<X size={13} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="is-clear" onClick={clearFilters}>Clear all</button>
        </div>
      ) : null}

      <Collapse in={showStatusKey}>
        <div>
          <div className="rec-queue-panel rec-queue-key">
            {meta.statuses.map((status) => (
              <span key={status}>
                <span className="rec-queue-status" style={statusPillStyle(status)}>{statusRowLabel(status)}</span>
                {statusRowLabel(status) !== getRecommendationStatusConfig(status).displayLabel ? <span>{getRecommendationStatusConfig(status).displayLabel}</span> : null}
              </span>
            ))}
          </div>
        </div>
      </Collapse>

      <Collapse in={showFilters}>
        <div>
          <div className="rec-queue-panel">
            <Row className="g-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Player Name</Form.Label>
                  <Form.Control size="sm" type="text" value={filters.player_name} onChange={(event) => updateFilters({ player_name: event.target.value })} placeholder="Enter player name" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Review Status</Form.Label>
                  <Form.Select
                    size="sm"
                    value={filters.status}
                    onChange={(event) => updateFilters({ status: event.target.value as RecommendationStatus | '', queue: event.target.value ? 'all' : filters.queue })}
                  >
                    <option value="">All statuses</option>
                    {meta.statuses.map((status) => <option key={status} value={status}>{getRecommendationStatusConfig(status).displayLabel}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Recommended By</Form.Label>
                  <Form.Select size="sm" value={filters.agent_user_id} onChange={(event) => updateFilters({ agent_user_id: event.target.value })}>
                    <option value="">All agents</option>
                    {meta.agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.label}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Position</Form.Label>
                  <Form.Control size="sm" type="text" value={filters.position} onChange={(event) => updateFilters({ position: event.target.value })} placeholder="e.g. CM, RW" />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Deal Type</Form.Label>
                  <Form.Select size="sm" value={filters.deal_type} onChange={(event) => updateFilters({ deal_type: event.target.value })}>
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
                  <Form.Label className="small fw-bold">Age</Form.Label>
                  <div className="range-inputs">
                    <Form.Control size="sm" type="number" min="0" max="100" value={filters.age_min} onChange={(event) => updateFilters({ age_min: event.target.value })} placeholder="Min" aria-label="Minimum age" />
                    <span className="range-separator">to</span>
                    <Form.Control size="sm" type="number" min="0" max="100" value={filters.age_max} onChange={(event) => updateFilters({ age_max: event.target.value })} placeholder="Max" aria-label="Maximum age" />
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Date Range</Form.Label>
                  <div className="range-inputs">
                    <Form.Control size="sm" type="date" value={filters.created_from} onChange={(event) => updateFilters({ created_from: event.target.value })} aria-label="Submitted from" />
                    <span className="range-separator">to</span>
                    <Form.Control size="sm" type="date" value={filters.created_to} onChange={(event) => updateFilters({ created_to: event.target.value })} aria-label="Submitted to" />
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Transfer Fee</Form.Label>
                  <div className="range-inputs">
                    <Form.Control size="sm" type="number" min="0" step="1000" value={filters.transfer_fee_min} onChange={(event) => updateFilters({ transfer_fee_min: event.target.value })} placeholder="Min" aria-label="Minimum transfer fee" />
                    <span className="range-separator">to</span>
                    <Form.Control size="sm" type="number" min="0" step="1000" value={filters.transfer_fee_max} onChange={(event) => updateFilters({ transfer_fee_max: event.target.value })} placeholder="Max" aria-label="Maximum transfer fee" />
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Expected Salary</Form.Label>
                  <div className="range-inputs">
                    <Form.Control size="sm" type="number" min="0" step="1000" value={filters.expected_salary_min} onChange={(event) => updateFilters({ expected_salary_min: event.target.value })} placeholder="Min p/w" aria-label="Minimum salary per week" />
                    <span className="range-separator">to</span>
                    <Form.Control size="sm" type="number" min="0" step="1000" value={filters.expected_salary_max} onChange={(event) => updateFilters({ expected_salary_max: event.target.value })} placeholder="Max p/w" aria-label="Maximum salary per week" />
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-bold">Page Size</Form.Label>
                  <Form.Select size="sm" value={filters.page_size} onChange={(event) => updateFilters({ page_size: Number(event.target.value) })}>
                    {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </div>
        </div>
      </Collapse>

      <div className="rec-queue-table-wrap">
        <table className="rec-queue-table">
          <thead>
            <tr>
              {canSelect ? <th className="col-select"><span className="visually-hidden">Select</span></th> : null}
              <th className="col-player">{renderSort('player_name', 'Player')}</th>
              <th className="col-position">{renderSort('position', 'Position')}</th>
              <th className="col-submitted"><span className="rec-queue-sort-pair">{renderSort('agent_name', 'Agent')}{renderSort('date', 'Submitted')}</span></th>
              <th className="col-cost">Deal &amp; cost</th>
              <th className="col-status">{renderSort('status', 'Status')}</th>
              <th className="col-actions"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="rec-queue-message"><Spinner animation="border" size="sm" className="me-2" />Loading recommendations...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="rec-queue-message">
                  {activeFilterCount > 0 ? (
                    <>No recommendations match these filters.<button type="button" onClick={clearFilters}>Clear filters</button></>
                  ) : filters.queue === 'needs_decision' ? (
                    <>Nothing is waiting for a decision.<button type="button" onClick={() => selectQueue('all')}>See all recommendations</button></>
                  ) : (
                    'No recommendations yet.'
                  )}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const queuedStatus = pendingStatusChanges.get(item.id);
                const displayedStatus = queuedStatus || item.status;
                const statusConfig = getRecommendationStatusConfig(displayedStatus);
                const statusColors = statusPillStyle(displayedStatus);
                const positions = formatRecommendedPositions(item.recommended_position);
                const age = calculateAge(item.player_date_of_birth);
                const dealAndFee = formatDealAndFee(item.potential_deal_type, formatTransferFeeAmount(item.transfer_fee_amount, item.transfer_fee_currency, item.transfer_fee));
                const salary = formatWeeklyAmount(item.expected_wages_per_week, item.expected_wages_currency, item.wage_basis || item.expected_wages_basis);
                const profilePath = getPlayerProfilePath(item);
                return (
                  <tr key={item.id} className={queuedStatus ? 'is-pending' : undefined}>
                    {canSelect ? (
                      <td className="cell-select">
                        <Form.Check
                          aria-label={`Select ${item.player_name} for NCUC`}
                          checked={ncucSelected.includes(item.id)}
                          onChange={(event) => setNcucSelected(event.target.checked ? [...ncucSelected, item.id] : ncucSelected.filter((id) => id !== item.id))}
                        />
                      </td>
                    ) : null}
                    <td>
                      <div className="rec-queue-player">
                        {profilePath ? (
                          <Link to={profilePath} title="Open player profile">{item.player_name}</Link>
                        ) : (
                          <span className="rec-queue-player-name">{item.player_name}</span>
                        )}
                        {item.avg_performance_score !== null && item.avg_performance_score !== undefined ? (
                          <GradeChip score={item.avg_performance_score} decimals={1} size="sm" />
                        ) : null}
                        {item.data_score ? <ListDataScore score={item.data_score} size="sm" /> : null}
                      </div>
                      {item.previous_recommendation_id ? (
                        <OverlayTrigger
                          placement="top"
                          overlay={(
                            <Tooltip id={`resubmission-${item.id}`}>
                              {item.resubmission_changes ? <div><strong>What's changed:</strong> {item.resubmission_changes}</div> : null}
                              <div>Open previous submission #{item.previous_recommendation_id}</div>
                            </Tooltip>
                          )}
                        >
                          <button
                            type="button"
                            className="rec-queue-resubmission"
                            onClick={() => internalRecommendationsService.getDetail(item.previous_recommendation_id!).then(openReviewModal).catch(() => setError('Could not load previous submission'))}
                          >
                            Resubmission
                          </button>
                        </OverlayTrigger>
                      ) : null}
                    </td>
                    <td>
                      <div className="rec-queue-line" title={positions}>{positions}</div>
                      <div className="rec-queue-sub">{age === '-' ? 'Age unknown' : `Age ${age}`}</div>
                    </td>
                    <td>
                      <div className="rec-queue-line" title={item.agent_name || undefined}>{item.agent_name || '-'}</div>
                      <div className="rec-queue-sub">{formatDate(item.submission_date)}</div>
                    </td>
                    <td className="cell-cost">
                      <div className="rec-queue-line" title={dealAndFee}>{dealAndFee}</div>
                      <div className="rec-queue-sub" title={salary}>{salary}</div>
                    </td>
                    <td>
                      {isIntelReviewer ? (
                        <span className="rec-queue-status" style={statusColors} title={statusConfig.displayLabel}>
                          {statusRowLabel(displayedStatus)}
                        </span>
                      ) : (
                        <div className="rec-queue-status is-editable" style={statusColors} title={statusConfig.displayLabel}>
                          <Form.Select
                            size="sm"
                            aria-label={`Review status for ${item.player_name}`}
                            value={displayedStatus}
                            onChange={(event) => queueStatusChange(item.id, item.status, event.target.value as RecommendationStatus)}
                            disabled={savingPendingStatusChanges}
                          >
                            {meta.statuses.map((status) => <option key={status} value={status}>{statusRowLabel(status)}</option>)}
                          </Form.Select>
                          <ChevronDown size={13} aria-hidden="true" />
                        </div>
                      )}
                      {queuedStatus ? <div className="rec-queue-unsaved">Unsaved</div> : null}
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="rec-queue-review" onClick={() => openReviewModal(item)} aria-label={`${isIntelReviewer ? 'View' : 'Review'} ${item.player_name}`}>
                        {isIntelReviewer ? 'View' : 'Review'}
                      </button>
                      <OverlayTrigger placement="top" overlay={<Tooltip id={`history-tooltip-${item.id}`}>Status history</Tooltip>}>
                        <button type="button" className="rec-queue-history" onClick={() => openHistoryModal(item)} aria-label={`Open history for ${item.player_name}`}>
                          <History size={15} aria-hidden="true" />
                        </button>
                      </OverlayTrigger>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rec-queue-footer">
        <span>{loading ? 'Loading...' : `${total} recommendation${total !== 1 ? 's' : ''} · Page ${filters.page} of ${totalPages}`}</span>
        <div className="btn-group">
          <Button variant="outline-secondary" size="sm" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>
            Previous
          </Button>
          <Button variant="outline-secondary" size="sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>
            Next
          </Button>
        </div>
      </div>

      <RecommendationReviewModal
        show={Boolean(selectedRecommendation)}
        recommendation={selectedRecommendation}
        statuses={meta.statuses}
        savingReview={selectedRecommendation ? savingReview === selectedRecommendation.id : false}
        message={modalMessage}
        error={modalError}
        onHide={closeReviewModal}
        onSubmitReview={handleSubmitReview}
        readOnly={isIntelReviewer}
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

      <ToastContainer position="top-end" className="p-3" style={{ position: 'fixed', zIndex: 9999 }}>
        <Toast
          show={showToast}
          onClose={() => setShowToast(false)}
          delay={3000}
          autohide
          bg={toastVariant}
        >
          <Toast.Header>
            <strong className="me-auto">
              {toastVariant === 'success' ? 'Success' : 'Error'}
            </strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === 'danger' ? 'text-white' : ''}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      {pendingStatusChanges.size > 0 ? (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: 1000,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '16px',
            backgroundColor: 'var(--color-surface)',
            padding: '12px 16px',
            border: '2px solid var(--color-text)',
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
            {pendingStatusChanges.size} unsaved change{pendingStatusChanges.size > 1 ? 's' : ''}
          </span>
          <Button variant="outline-secondary" size="sm" onClick={discardPendingStatusChanges} disabled={savingPendingStatusChanges}>
            Discard
          </Button>
          <Button variant="dark" size="sm" onClick={savePendingStatusChanges} disabled={savingPendingStatusChanges}>
            {savingPendingStatusChanges
              ? 'Saving...'
              : `Save ${pendingStatusChanges.size} Change${pendingStatusChanges.size > 1 ? 's' : ''}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ExternalRecommendationsListPage;
