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

// Stage change tracking types
export interface StageHistoryRecord {
  id: number;
  oldStage: string | null;
  newStage: string;
  reason: string;
  description?: string;
  changedBy: number;
  changedByName?: string;
  changedAt: string;
}

export type Stage1Reason =
  | "Flagged by Data"
  | "Flagged by Live Scouting"
  | "Flagged by Video Scouting"
  | "Flagged by Internal Recommendation"
  | "Flagged by External Recommendation"
  | "Flagged by Potential Availability";

export type ArchivedReason =
  | "Cost; Salary"
  | "Cost; Transfer Fee"
  | "Availability"
  | "Moved Club"
  | "Scouting"
  | "Data"
  | "Signed"
  | "Character"
  | "Suitability"
  | "Medical";

export type StageChangeReason = Stage1Reason | ArchivedReason;
