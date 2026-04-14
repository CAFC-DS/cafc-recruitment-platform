import React from 'react';

interface ExpandableRowProps {
  recommendation: any;
  colSpan: number;
}

const ExpandableRow: React.FC<ExpandableRowProps> = ({ recommendation, colSpan }) => {
  return (
    <tr className="expandable-row-detail">
      <td colSpan={colSpan} className="p-0">
        <div className="p-4 bg-light border-top">
          <div className="row g-3">
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
            </div>

            <div className="col-md-6">
              <h6 className="text-uppercase fw-bold mb-3" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
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

            {recommendation.internal_notes && (
              <div className="col-12">
                <h6 className="text-uppercase fw-bold mb-2" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                  Internal Notes
                </h6>
                <div className="p-3 bg-warning bg-opacity-10 rounded border border-warning">
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                    {recommendation.internal_notes}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

export default ExpandableRow;
