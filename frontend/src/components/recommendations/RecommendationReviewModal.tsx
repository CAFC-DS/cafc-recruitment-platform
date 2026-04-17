import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import SubmissionStatusBadge, { AgentStatusBadge } from '../agents/SubmissionStatusBadge';
import {
  InternalRecommendation,
  RecommendationStatus,
} from '../../types/recommendations';

interface RecommendationReviewModalProps {
  show: boolean;
  recommendation: InternalRecommendation | null;
  statuses: RecommendationStatus[];
  updatingStatus: boolean;
  savingNotes: boolean;
  message: string | null;
  error: string | null;
  onHide: () => void;
  onStatusChange: (recommendation: InternalRecommendation, newStatus: RecommendationStatus) => void;
  onSaveNotes: (recommendation: InternalRecommendation, notes: string) => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const formatNumberToken = (value: string) => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed).toLocaleString('en-GB') : trimmed;
};

const formatAmount = (amount?: number, currency?: string, fallback?: string) => {
  if (amount === undefined || amount === null) return fallback || '-';
  return `${currency || 'GBP'} ${Math.round(amount).toLocaleString('en-GB')}`;
};

const formatWeeklyAmount = (amount?: number | string, currency?: string, basis?: string) => {
  if (amount === undefined || amount === null || amount === '') return '-';
  const displayAmount = typeof amount === 'string'
    ? amount.split('-').map(formatNumberToken).join('-')
    : Math.round(amount).toLocaleString('en-GB');
  return `${currency || 'GBP'} ${displayAmount} p/w${basis ? ` ${basis.toLowerCase()}` : ''}`;
};

const formatRecommendedPositions = (recommendedPosition?: string | string[] | null) => {
  if (!recommendedPosition || (Array.isArray(recommendedPosition) && recommendedPosition.length === 0)) return '-';
  if (Array.isArray(recommendedPosition)) {
    return recommendedPosition.length ? recommendedPosition.join(', ') : '-';
  }
  const positions = recommendedPosition.split(',').map((position) => position.trim()).filter(Boolean);
  return positions.length ? positions.join(', ') : '-';
};

const formatWageBasis = (recommendation: InternalRecommendation) => {
  if (recommendation.wage_basis) return recommendation.wage_basis;

  const currentBasis = recommendation.current_wages_basis;
  const expectedBasis = recommendation.expected_wages_basis;

  if (currentBasis && expectedBasis && currentBasis !== expectedBasis) {
    return `Current: ${currentBasis}, Expected: ${expectedBasis}`;
  }

  return expectedBasis || currentBasis || '-';
};

const RecommendationReviewModal: React.FC<RecommendationReviewModalProps> = ({
  show,
  recommendation,
  statuses,
  updatingStatus,
  savingNotes,
  message,
  error,
  onHide,
  onStatusChange,
  onSaveNotes,
}) => {
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    setNotesDraft(recommendation?.internal_notes || '');
  }, [recommendation?.id, recommendation?.internal_notes]);

  if (!recommendation) {
    return null;
  }

  const detail = (label: string, value: React.ReactNode) => (
    <div className="external-review-detail">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable centered dialogClassName="external-recommendation-review-modal">
      <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
        <Modal.Title>Review Recommendation for {recommendation.player_name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {message ? <Alert variant="success" className="mb-3">{message}</Alert> : null}
        {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

        <div className="external-review-status-summary">
          <div>
            <span>Review Status</span>
            <SubmissionStatusBadge status={recommendation.status} />
          </div>
          <div>
            <span>Agent Status</span>
            <AgentStatusBadge status={recommendation.agent_status} />
          </div>
        </div>

        <div className="external-review-section">
          <div className="external-review-section-heading">
            <h6>Recommendation Details</h6>
          </div>
          <div className="external-review-detail-grid">
            {detail('Player', recommendation.player_name)}
            {detail('Recommended Position', formatRecommendedPositions(recommendation.recommended_position))}
            {detail('DOB', formatDate(recommendation.player_date_of_birth))}
            {detail('Submitted', formatDate(recommendation.submission_date || recommendation.created_at))}
            {detail('Agent', recommendation.agent_name || '-')}
            {detail('Agency', recommendation.agency || '-')}
          </div>
        </div>

        <hr className="my-4" />

        <div className="external-review-section">
          <div className="external-review-section-heading">
            <h6>Deal Information</h6>
          </div>
          <div className="external-review-detail-grid">
            {detail('Deal Type', recommendation.potential_deal_type || '-')}
            {detail('Agreement Type', recommendation.agreement_type || '-')}
            {detail('Transfer Fee', formatAmount(recommendation.transfer_fee_amount, recommendation.transfer_fee_currency, recommendation.transfer_fee))}
            {detail('Wage Basis', formatWageBasis(recommendation))}
            {detail('Current Wages', formatWeeklyAmount(recommendation.current_wages_per_week, recommendation.current_wages_currency))}
            {detail('Expected Wages', formatWeeklyAmount(recommendation.expected_wages_per_week, recommendation.expected_wages_currency))}
            {detail('Contract Expiry', formatDate(recommendation.confirmed_contract_expiry))}
            {detail('Contract Options', recommendation.contract_options || '-')}
            {recommendation.transfermarkt_link ? (
              <div className="external-review-detail external-review-detail-wide">
                <span>Transfermarkt Link</span>
                <strong>
                  <a href={recommendation.transfermarkt_link} target="_blank" rel="noreferrer">
                    {recommendation.transfermarkt_link}
                  </a>
                </strong>
              </div>
            ) : null}
          </div>
        </div>

        <hr className="my-4" />

        <Row className="g-4">
          <Col lg={5}>
            <div className="external-review-section">
              <div className="external-review-section-heading">
                <h6>Review Decision</h6>
              </div>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Review Status</Form.Label>
                <div className="d-flex align-items-center gap-2">
                  <Form.Select
                    value={recommendation.status}
                    disabled={updatingStatus}
                    onChange={(event) => onStatusChange(recommendation, event.target.value as RecommendationStatus)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </Form.Select>
                  {updatingStatus ? <Spinner animation="border" size="sm" /> : null}
                </div>
              </Form.Group>
              <div className="text-muted small">
                Use this to move the recommendation through the internal review workflow.
              </div>
            </div>
          </Col>
          <Col lg={7}>
            <div className="external-review-section">
              <div className="external-review-section-heading">
                <h6>Internal Notes</h6>
              </div>
              <Form.Group className="mb-0">
                <Form.Label className="small fw-bold">Notes for staff</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={6}
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Add internal notes here..."
                />
              </Form.Group>
            </div>
          </Col>
        </Row>

        <hr className="my-4" />

        <div className="external-review-section">
          <div className="external-review-section-heading">
            <h6>Additional Information</h6>
          </div>
          <div className="external-review-copy-block">
            {recommendation.additional_information || 'No additional information provided.'}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={savingNotes || updatingStatus}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={() => onSaveNotes(recommendation, notesDraft)}
          disabled={savingNotes}
        >
          {savingNotes ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving...
            </>
          ) : (
            'Save Notes'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default RecommendationReviewModal;
