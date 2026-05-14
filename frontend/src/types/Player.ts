/**
 * Comprehensive Player type definitions for the recruitment platform
 * This serves as the single source of truth for all Player-related types
 */

// Main Player interface combining all fields from different components
export interface Player {
  // Universal ID system for collision-free identification
  universal_id?: string;

  // Legacy ID fields for backwards compatibility
  player_id?: number | null;
  cafc_player_id?: number | null;

  // Basic player information
  player_name?: string;
  first_name?: string;
  last_name?: string;

  // Demographics
  age?: number | null;
  birth_date?: string | null;
  birthdate?: string | null; // Alternative field name

  // Team and position
  squad_name?: string;
  position?: string;

  // Statistics and reporting
  scout_reports_count?: number;
  intel_reports_count?: number;
  last_report_date?: string | null;

  // Recruitment status
  recruitment_status?: string;

  // Data source information
  data_source?: string;

  // Additional fields that may be present in API responses
  team?: string;
  club?: string;
  current_team?: string;
  pos?: string;
  name?: string;
  playername?: string;
  fullname?: string;
  full_name?: string;
  id?: number;
}

// Specific interface for player profiles with additional fields
export interface PlayerProfile extends Player {
  scout_reports?: any[];
  intel_reports?: any[];
  notes?: any[];
}

export interface FlowHistoryEvent {
  id: string;
  event_type:
    | "list_added"
    | "stage_changed"
    | "recommendation_submitted"
    | "recommendation_status_changed"
    | "recommendation_agent_status_changed";
  event_at: string | null;
  title: string;
  subtitle?: string | null;
  actor_name?: string | null;
  source_table: string;
  list_name?: string | null;
  old_stage?: string | null;
  new_stage?: string | null;
  reason?: string | null;
  description?: string | null;
  recommendation_status?: string | null;
  agent_status?: string | null;
  agent_name?: string | null;
  agency?: string | null;
}

export interface PlayerFlowHistoryResponse {
  player_id: string;
  total_events: number;
  events: FlowHistoryEvent[];
}

// Interface for player search results
export interface PlayerSearchResult extends Player {
  // Search-specific fields can be added here
}

// Interface for player attributes
export interface PlayerAttributes {
  player_id?: number;
  universal_id?: string;
  player_position?: string;
  attribute_group?: string;
  attribute_groups?: { [key: string]: AttributeData[] };
  total_reports?: number;
  total_attributes?: number;
}

// Supporting interface for attribute data
export interface AttributeData {
  name: string;
  average_score: number;
  report_count: number;
  display_order: number;
  // Alternative field names for compatibility
  attribute_name?: string;
  avg_score?: number;
}

export interface PlayerTechnicalChildMetric {
  metric_id: number;
  metric_name: string;
  metric_label: string;
  parent_metric: string;
  value: number | null;
  percentile: number | null;
  z_score: number | null;
  invert: boolean;
  is_direct_kpi: boolean;
}

export interface PlayerTechnicalParentMetric {
  parent_metric: string;
  score: number | null;
  percentile: number | null;
  child_count: number;
  is_relevant: boolean;
  child_metrics: PlayerTechnicalChildMetric[];
}

export interface PlayerTechnicalDataEntry {
  entry_id: string;
  position: string;
  season: string;
  competition_name: string;
  iteration_id: number;
  player_name: string;
  match_count: number;
  avg_match_share: number;
  parent_metrics: PlayerTechnicalParentMetric[];
}

export interface PlayerTechnicalMetricsResponse {
  available: boolean;
  message: string | null;
  player_id: string;
  positions: string[];
  entries: PlayerTechnicalDataEntry[];
}

export type PlayerTechnicalVisibilityMode = "relevant" | "all";

export type PlayerTechnicalSortColumn =
  | "metric_label"
  | "value"
  | "percentile"
  | "z_score";

export interface PlayerTechnicalSortState {
  column: PlayerTechnicalSortColumn;
  direction: "asc" | "desc";
}

// Stage change tracking types
export interface StageHistoryRecord {
  id: number;
  oldStage: string | null;
  newStage: string;
  reason: string;
  description?: string;
  changedBy: number;
  changedByName?: string;
  changedAt: string | null;
}

export type Stage1Reason =
  | "Flagged by Data"
  | "Flagged by Live Scouting"
  | "Flagged by Video Scouting"
  | "Flagged by Internal Recommendation"
  | "Flagged by External Recommendation"
  | "Flagged by Potential Availability"
  | "Flagged by Age";

export type ArchivedReason =
  | "Cost; Salary"
  | "Cost; Transfer Fee"
  | "Availability"
  | "Extended Contract"
  | "Moved Club"
  | "Scouting"
  | "Data"
  | "Signed"
  | "Character"
  | "Suitability"
  | "Medical";

export type StageChangeReason = Stage1Reason | ArchivedReason;
