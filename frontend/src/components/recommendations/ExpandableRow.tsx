import React, { useState } from 'react';
import { RecommendationStatus, RecommendationStatusHistory } from '../../types/recommendations';

interface ExpandableRowProps {
  recommendation: any;
  colSpan: number;
  statuses: RecommendationStatus[];
  statusHistory: RecommendationStatusHistory[];
  onStatusChange: (newStatus: RecommendationStatus) => void;
  onSaveNotes: (notes: string) => void;
  updatingStatus: boolean;
  savingNotes: boolean;
}

const ExpandableRow: React.FC<ExpandableRowProps> = ({
  recommendation,
  colSpan,
  statuses,
  statusHistory,
  onStatusChange,
  onSaveNotes,
  updatingStatus,
  savingNotes,
}) => {
  const [notesDraft, setNotesDraft] = useState(recommendation.internal_notes || '');

  return (
    <tr className="expandable-row-detail">
      <td colSpan={colSpan} className="p-0">
        <div className="p-4 bg-light border-top">
          <div className="row g-4">
            {/* Left Column - Player & Agent Details */}
            <div className="col-md-6">
              <h6 className="text-uppercase fw-bold mb-3" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                Player Details
              </h6>
              <div className="mb-2">
                <span className="text-muted small">Date of Birth:</span>
                <span className="ms-2">{recommendation.player_date_of_birth || '-'}</span>
              </div>
              <div className="mb-2">
                <span className="text-muted small">Contract Expiry:</span>
                <span className="ms-2">{recommendation.confirmed_contract_expiry || '-'}</span>
              </div>
              <div className="mb-2">
                <span className="text-muted small">Contract Options:</span>
                <span className="ms-2">{recommendation.contract_options || '-'}</span>
              </div>
              <div className="mb-2">
                <span className="text-muted small">Agreement Type:</span>
                <span className="ms-2">{recommendation.agreement_type || '-'}</span>
              </div>

              <h6 className="text-uppercase fw-bold mb-3 mt-4" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                Agent Details
              </h6>
              <div className="mb-2">
                <span className="text-muted small">Email:</span>
                <span className="ms-2">{recommendation.agent_email || '-'}</span>
              </div>
              <div className="mb-2">
                <span className="text-muted small">Phone:</span>
                <span className="ms-2">{recommendation.agent_number || '-'}</span>
              </div>
            </div>

            {/* Right Column - Status & Notes */}
            <div className="col-md-6">
              <h6 className="text-uppercase fw-bold mb-3" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                Review
              </h6>

              {/* Status Dropdown */}
              <div className="mb-3">
                <label className="form-label fw-bold small">Status</label>
                <select
                  className="form-select"
                  value={recommendation.status}
                  onChange={(e) => onStatusChange(e.target.value as RecommendationStatus)}
                  disabled={updatingStatus}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {updatingStatus && (
                  <div className="text-muted small mt-1">
                    <div className="spinner-border spinner-border-sm me-1" role="status"></div>
                    Updating status...
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div className="mb-3">
                <label className="form-label fw-bold small">Internal Notes</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add internal notes here..."
                />
                <button
                  className="btn btn-dark btn-sm mt-2"
                  onClick={() => onSaveNotes(notesDraft)}
                  disabled={savingNotes}
                >
                  {savingNotes ? (
                    <>
                      <div className="spinner-border spinner-border-sm me-1" role="status"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-save me-1"></i>
                      Save Notes
                    </>
                  )}
                </button>
              </div>

              {/* Status History */}
              <div>
                <h6 className="fw-bold small mb-2 text-uppercase" style={{ letterSpacing: '0.05em' }}>
                  <i className="bi bi-clock-history me-1"></i>
                  Status History
                </h6>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {statusHistory.length === 0 ? (
                    <div className="text-center text-muted small py-2 border rounded bg-white">
                      No status changes yet.
                    </div>
                  ) : (
                    statusHistory.map((entry) => (
                      <div key={entry.id} className="border rounded p-2 bg-white">
                        <div className="fw-bold small">{entry.new_status}</div>
                        <div className="text-muted small">{new Date(entry.changed_at).toLocaleString()}</div>
                        {entry.changed_by_name && <div className="text-muted small">by {entry.changed_by_name}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Full Additional Information - Full Width */}
            <div className="col-12">
              <h6 className="text-uppercase fw-bold mb-2" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                Additional Information
              </h6>
              <div className="p-3 bg-white rounded border">
                <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                  {recommendation.additional_information || 'No additional information provided.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
};

export default ExpandableRow;
