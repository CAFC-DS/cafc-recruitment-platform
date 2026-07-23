// Canonical scouting position order used across the platform (matches the
// backend ALLOWED_RECOMMENDED_POSITIONS list and the scouting template).
export const POSITION_ORDER: string[] = [
  "GK",
  "RB",
  "RWB",
  "RCB(3)",
  "RCB(2)",
  "CCB(3)",
  "LCB(2)",
  "LCB(3)",
  "LWB",
  "LB",
  "DM",
  "CM",
  "RAM",
  "AM",
  "LAM",
  "RW",
  "LW",
  "Target Man CF",
  "In Behind CF",
];

// Sort an arbitrary list of positions into the canonical order, pushing any
// unknown values to the end (alphabetically).
export const sortByPositionOrder = (a: string, b: string): number => {
  const indexA = POSITION_ORDER.indexOf(a);
  const indexB = POSITION_ORDER.indexOf(b);
  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;
  return indexA - indexB;
};

// The internal recruitment lists players sit on, named by position group.
// Matches the distinct values of backend POSITION_TO_LIST_NAME.
export const STAGE_ANALYTICS_LIST_NAMES: string[] = [
  "GK", "RB/RWB", "LB/LWB", "RCB", "LCB", "CCB", "DM/CM", "AM", "RW", "LW", "CF",
];
