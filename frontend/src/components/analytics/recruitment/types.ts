export const STAGES = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"];
export const COLORS: Record<string, string> = {
  "New entrants": "#64748b",
  "List additions": "#4f8a9c",
  "Stage 1": "#6b7280",
  "Stage 2": "var(--recruitment-analytics-stage-2-bg, #b7790b)",
  "Stage 3": "var(--recruitment-analytics-stage-3-bg, #2563eb)",
  "Stage 4": "var(--recruitment-analytics-stage-4-bg, #15803d)",
  "Stage 5": "#7c3aed",
  Archived: "#b91c1c",
};
export interface PlayerRow {
  player_id: string;
  name: string;
  club: string;
  country: string;
  competition: string;
  position: string;
  stage: string;
  reports: number;
  reports_all: number;
  in_market: boolean;
  senior: boolean;
}
export interface Movement {
  player_id: string;
  name: string;
  club: string;
  position: string;
  from: string;
  to: string;
  date: string;
  scout: string;
  category: string;
}
export interface ReportRow {
  id: number;
  player_id: string;
  name: string;
  scout: string;
  senior: boolean;
  date: string;
  mode: string;
  fixture: string | null;
  fixture_label: string | null;
  fixture_date: string | null;
}
export interface Link {
  from: string;
  to: string;
  value: number;
}
export interface Country {
  name: string;
  covered: number;
  total: number;
  stages: Record<string, number>;
}
export interface AnalyticsData {
  summary: {
    fixtures: number;
    live: number;
    video: number;
    both: number;
    players: number;
    reports: number;
    senior_players: number;
    senior_coverage: number | null;
    new: number;
    progressed: number;
    archived: number;
  };
  market: {
    players: number;
    covered_players: number;
    teams: number;
    covered_teams: number;
    covered_without_club: number;
  };
  competitions: {
    name: string;
    teams: number;
    covered_teams: number;
    players: number;
    covered_players: number;
  }[];
  stage_counts: Record<string, number>;
  links: Link[];
  events: Movement[];
  players: PlayerRow[];
  reports: ReportRow[];
  teams: {
    name: string;
    competition: string;
    covered: number;
    total: number;
  }[];
  positions: {
    name: string;
    players: number;
    covered: number;
    total: number;
  }[];
  countries: Country[];
  seniors: { id: number; name: string; reports: number; players: number }[];
  timeline: { month: string; reports: number; live: number; video: number }[];
  options: {
    competitions: string[];
    countries: string[];
    positions: string[];
    clubs: string[];
    scouts: [string, string][];
  };
  start_date: string;
  end_date: string;
}
/** Plain-English names for the two ways a player joins a list. */
export const SOURCE_LABELS: Record<string, string> = {
  "New entrants": "First time on a list",
  "List additions": "Re-added to a list",
};
export const SOURCE_DEFINITIONS: Record<string, string> = {
  "New entrants": "The player's first ever entry on any first-team list.",
  "List additions":
    "A player who had been on a list before, added again (re-listed or put on another position list).",
};
export const flowLabel = (name: string) => SOURCE_LABELS[name] || name;
export const number = (n: number) => n.toLocaleString("en-GB");
export const percentage = (a: number, b: number) =>
  b ? `${((100 * a) / b).toFixed(1)}%` : "—";
const POSITION_LABELS: Record<string, string> = {
  GOALKEEPER: "Goalkeeper",
  CENTRAL_DEFENDER: "Centre-back",
  LEFT_WINGBACK_DEFENDER: "Left-back / wing-back",
  RIGHT_WINGBACK_DEFENDER: "Right-back / wing-back",
  DEFENSE_MIDFIELD: "Defensive midfield",
  CENTRAL_MIDFIELD: "Central midfield",
  ATTACKING_MIDFIELD: "Attacking midfield",
  LEFT_WINGER: "Left winger",
  RIGHT_WINGER: "Right winger",
  CENTER_FORWARD: "Centre-forward",
};
/** Warehouse position codes (e.g. CENTER_FORWARD) as readable labels. */
export const positionLabel = (code: string) =>
  POSITION_LABELS[code] ||
  code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");
export const playerPath = (id: string) =>
  id.startsWith("internal_")
    ? `/player-profile/${id.slice(9)}`
    : `/player/${id.slice(9)}`;
