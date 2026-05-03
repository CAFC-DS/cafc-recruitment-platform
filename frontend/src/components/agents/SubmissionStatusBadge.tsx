import React from 'react';
import { AgentStatus, RecommendationStatus } from '../../types/recommendations';
import { getRecommendationStatusConfig } from '../../utils/agentRecommendationStatus';

const SubmissionStatusBadge: React.FC<{ status: RecommendationStatus }> = ({ status }) => {
  const config = getRecommendationStatusConfig(status);
  return (
    <span className={`agent-status-badge ${config.badgeClassName || 'agent-status-archived'}`}>
      {config.displayLabel}
    </span>
  );
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
