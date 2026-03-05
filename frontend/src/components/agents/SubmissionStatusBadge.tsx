import React from 'react';
import { RecommendationStatus } from '../../types/recommendations';

const statusClassMap: Record<string, string> = {
  Submitted: 'agent-status-submitted',
  'Under Review': 'agent-status-under-review',
  'Added to Scouting Process': 'agent-status-shortlisted',
  'Added to Emerging Talent Process': 'agent-status-signed',
  'Not Currently under Consideration': 'agent-status-not-for-us',
};

const SubmissionStatusBadge: React.FC<{ status: RecommendationStatus }> = ({ status }) => {
  return <span className={`agent-status-badge ${statusClassMap[status] || 'agent-status-archived'}`}>{status}</span>;
};

export default SubmissionStatusBadge;
