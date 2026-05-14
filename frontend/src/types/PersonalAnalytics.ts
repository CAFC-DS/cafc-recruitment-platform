export interface PersonalAnalyticsTimelinePoint {
  month: string;
  assessments: number;
  flags: number;
  total: number;
}

export interface PersonalAnalyticsPositionPoint {
  position: string;
  assessments: number;
  flags: number;
  total: number;
}

export interface PersonalAnalyticsRankedPlayer {
  player_name: string;
  position: string;
  report_count: number;
  player_id: number;
  data_source: string;
}

export interface PersonalAnalyticsPerformancePlayer
  extends PersonalAnalyticsRankedPlayer {
  avg_performance_score: number;
}

export interface PersonalAnalyticsAttributePlayer
  extends PersonalAnalyticsRankedPlayer {
  avg_attribute_score: number;
}

export interface PersonalAnalyticsPositiveFlaggedPlayer
  extends PersonalAnalyticsRankedPlayer {
  flag_count: number;
  most_recent_flag: string | null;
}

export interface PersonalAnalyticsReportRow {
  report_id: number;
  created_at: string | null;
  player_name: string;
  player_id: number;
  data_source: string;
  universal_id?: string;
  age: number | null;
  fixture_date: string | null;
  fixture_details: string | null;
  scout_name: string;
  report_type: string;
  position: string;
  performance_score: number | null;
  attribute_score: number | null;
  flag_category: string | null;
  scouting_type: string | null;
  is_potential: boolean;
  is_archived?: boolean;
  has_been_viewed?: boolean;
  summary: string | null;
}

export interface PersonalAnalyticsSummary {
  total_player_assessments: number;
  total_all_reports: number;
  total_flag_reports: number;
  avg_performance_score: number;
  unique_players_assessed: number;
}

export interface PersonalAnalyticsResponse {
  summary: PersonalAnalyticsSummary;
  monthly_reports_timeline: PersonalAnalyticsTimelinePoint[];
  reports_by_position: PersonalAnalyticsPositionPoint[];
  top_players_by_performance: PersonalAnalyticsPerformancePlayer[];
  top_players_by_attributes: PersonalAnalyticsAttributePlayer[];
  positive_flagged_players: PersonalAnalyticsPositiveFlaggedPlayer[];
  total_positive_flagged_count: number;
  position_options: string[];
  my_reports: PersonalAnalyticsReportRow[];
  my_reports_total: number;
  my_reports_limit: number;
  my_reports_offset: number;
}

export type PersonalAnalyticsReportSortBy =
  | "created_at"
  | "player_name"
  | "report_type"
  | "position"
  | "performance_score"
  | "attribute_score"
  | "flag_category"
  | "scouting_type";

export interface PersonalAnalyticsReportsResponse {
  reports: PersonalAnalyticsReportRow[];
  total: number;
  limit: number;
  offset: number;
  sort_by: PersonalAnalyticsReportSortBy;
  sort_direction: "asc" | "desc";
}
