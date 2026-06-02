import React from 'react';
import { AgentStatus, RecommendationStatus } from '../../types/recommendations';
import { getRecommendationStatusConfig } from '../../utils/agentRecommendationStatus';

const SubmissionStatusBadge: React.FC<{ status: RecommendationStatus; short?: boolean }> = ({ status, short = false }) => {
  const config = getRecommendationStatusConfig(status);
  return (
    <span className={`agent-status-badge ${config.badgeClassName || 'agent-status-archived'}`}>
      {short ? config.shortLabel : config.displayLabel}
    </span>
  );
};

const agentStatusClassMap: Record<AgentStatus, string> = {
  Active: 'agent-availability-active',
  'No Longer Available': 'agent-availability-unavailable',
  'Player Not Interested': 'agent-availability-not-interested',
  Withdrawn: 'agent-availability-withdrawn',
};

const agentStatusDisplayMap: Record<AgentStatus, string> = {
  Active: '●',  // Green dot for active
  'No Longer Available': 'N/A',
  'Player Not Interested': 'Not Interested',
  Withdrawn: 'Withdrawn',
};

export const AgentStatusBadge: React.FC<{ status?: AgentStatus | null }> = ({ status }) => {
  const displayStatus = status || 'Active';
  const displayText = agentStatusDisplayMap[displayStatus] || displayStatus;
  return (
    <span
      className={`agent-status-badge agent-availability-badge ${agentStatusClassMap[displayStatus] || 'agent-status-archived'}`}
      title={displayStatus} // Full status on hover
    >
      {displayText}
    </span>
  );
};

export default SubmissionStatusBadge;
