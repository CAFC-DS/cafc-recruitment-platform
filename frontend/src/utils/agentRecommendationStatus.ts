import { RecommendationStatus } from '../types/recommendations';

export const REVIEW_STATUS_ORDER: RecommendationStatus[] = [
  'Submitted',
  'Under Review',
  'Added to Emerging Talent Process',
  'Added to Scouting Process',
  'Not Currently under Consideration',
];

type ReviewStatusConfig = {
  badgeClassName: string;
  displayLabel: string;
  shortLabel: string;
  title: string;
  summary: string;
  clubAction: string;
  nextStep: string;
  agentAction: string;
  dashboardHint: string;
  isTerminal?: boolean;
};

const STATUS_CONFIG: Record<RecommendationStatus, ReviewStatusConfig> = {
  Submitted: {
    badgeClassName: 'agent-status-submitted',
    displayLabel: 'Submitted',
    shortLabel: 'Submitted',
    title: 'Submission received',
    summary: 'The player has been added to Charlton Athletic’s hold list and is waiting for the recruitment team to begin review.',
    clubAction: 'The recruitment team has logged the profile and will move it into internal review.',
    nextStep: 'If the submission matches an immediate need, the status will move to Under Review.',
    agentAction: 'No action is needed from you right now unless the club asks for more detail.',
    dashboardHint: 'Added to the hold list and queued for review.',
  },
  'Under Review': {
    badgeClassName: 'agent-status-under-review',
    displayLabel: 'Under Review',
    shortLabel: 'Under Review',
    title: 'Multi-factor assessment in progress',
    summary: 'The player is being assessed against internal criteria including data, profile fit, availability, eligibility and scouting context.',
    clubAction: 'The club is reviewing the recommendation across technical, scouting and squad-planning criteria.',
    nextStep: 'The player may move into either the Emerging Talent Process or the Scouting Process if the profile meets the threshold.',
    agentAction: 'Keep availability information current so the club is working from the latest picture.',
    dashboardHint: 'Being assessed against the club’s internal criteria.',
  },
  'Added to Emerging Talent Process': {
    badgeClassName: 'agent-status-emerging-talent',
    displayLabel: 'Added to Emerging Talent Process',
    shortLabel: 'Emerging Talent',
    title: 'Added to the Emerging Talent longlist',
    summary: 'The player has met the required criteria and is now in the Emerging Talent process for further video and or live assessment.',
    clubAction: 'The recruitment team is continuing assessment through longer-term talent tracking.',
    nextStep: 'If the player continues to impress, the club may deepen live and video work or request more information.',
    agentAction: 'Keep the player’s situation updated in case availability or contract context changes.',
    dashboardHint: 'On the Emerging Talent longlist for further assessment.',
  },
  'Added to Scouting Process': {
    badgeClassName: 'agent-status-scouting',
    displayLabel: 'Added to Scouting Process',
    shortLabel: 'Scouting Process',
    title: 'Added to the First Team scouting longlist',
    summary: 'The player has met the required criteria and is now in the First Team scouting process for deeper video and live assessment.',
    clubAction: 'The scouting team is gathering further evidence, with a minimum expectation of two live matches before a senior decision.',
    nextStep: 'If the reports meet the required standard, a member of the senior recruitment team may contact you for more information.',
    agentAction: 'Make sure your availability status remains accurate and be ready to respond if the senior team gets in touch.',
    dashboardHint: 'In deeper First Team scouting assessment.',
  },
  'Not Currently under Consideration': {
    badgeClassName: 'agent-status-not-under-consideration',
    displayLabel: 'Not Currently Under Consideration',
    shortLabel: 'Archived',
    title: 'Archived for now',
    summary: 'The player does not meet the club’s current criteria and is not under active consideration at this time.',
    clubAction: 'The profile has been archived from the active process.',
    nextStep: 'Unless the club’s needs change, no further review is expected on this submission.',
    agentAction: 'No further action is required on this submission.',
    dashboardHint: 'Archived and not under active consideration.',
    isTerminal: true,
  },
};

export const normalizeRecommendationStatus = (status?: string | null): RecommendationStatus => {
  if (status === 'Not Currently Under Consideration') {
    return 'Not Currently under Consideration';
  }

  return (status as RecommendationStatus) || 'Submitted';
};

export const getRecommendationStatusConfig = (status?: string | null) => {
  const normalizedStatus = normalizeRecommendationStatus(status);
  return {
    status: normalizedStatus,
    ...STATUS_CONFIG[normalizedStatus],
  };
};

export const getRecommendationStatusStep = (status?: string | null) =>
  REVIEW_STATUS_ORDER.indexOf(normalizeRecommendationStatus(status));
