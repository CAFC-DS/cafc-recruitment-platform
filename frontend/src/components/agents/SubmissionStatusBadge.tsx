import React from 'react';
import { AgentStatus, RecommendationStatus } from '../../types/recommendations';

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

const agentStatusClassMap: Record<AgentStatus, string> = {
  Active: 'agent-availability-active',
  'No Longer Available': 'agent-availability-unavailable',
  'Player Not Interested': 'agent-availability-not-interested',
  Withdrawn: 'agent-availability-withdrawn',
};

export const AgentStatusBadge: React.FC<{ status?: AgentStatus | null }> = ({ status }) => {
  const displayStatus = status || 'Active';
  return (
    <span className={`agent-status-badge agent-availability-badge ${agentStatusClassMap[displayStatus] || 'agent-status-archived'}`}>
      {displayStatus}
    </span>
  );
};

export default SubmissionStatusBadge;
