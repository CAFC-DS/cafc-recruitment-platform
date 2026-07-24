export type RecommendationStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Added / Already in First Team Scouting Process'
  | 'Added / Already in Emerging Talent Process'
  | 'Not Currently under Consideration';

export type AgentStatus =
  | 'Active'
  | 'No Longer Available'
  | 'Player Not Interested'
  | 'Withdrawn';

export type AgreementType =
  | 'Exclusive/Registered Player Agreement'
  | 'Mandate (Player)'
  | 'Mandate (Selling Club)'
  | 'None';

export type ContractOption =
  | 'None'
  | '+1 Club'
  | '+1 Player'
  | '+1 Mutual'
  | '+2 Club'
  | '+2 Player'
  | '+2 Mutual'
  | 'Other';

export type PotentialDealType =
  | 'Free'
  | 'Permanent Transfer'
  | 'Loan'
  | 'Loan with Option';

export type WageBasis = 'Gross' | 'Net';

export interface AgentProfile {
  user_id: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  agent_name?: string;
  agency?: string;
  agent_number?: string;
}

export interface Recommendation {
  id: number;
  player_name: string;
  linked_player_id?: number | null;
  linked_cafc_player_id?: number | null;
  linked_player_data_source?: string | null;
  player_date_of_birth?: string;
  recommended_position?: string | string[];
  transfermarkt_link?: string;
  agreement_type?: string;
  confirmed_contract_expiry?: string;
  contract_options?: string;
  potential_deal_type?: string;
  transfer_fee?: string;
  transfer_fee_amount?: number;
  transfer_fee_currency?: string;
  transfer_fee_min?: number;
  transfer_fee_max?: number;
  current_wages_per_week?: number | string;
  current_wages_per_week_min?: number;
  current_wages_per_week_max?: number;
  current_wages_currency?: string;
  wage_basis?: WageBasis;
  current_wages_basis?: WageBasis;
  expected_wages_per_week?: number | string;
  expected_wages_per_week_min?: number;
  expected_wages_per_week_max?: number;
  expected_wages_currency?: string;
  expected_wages_basis?: WageBasis;
  additional_information?: string;
  supporting_file_name?: string;
  created_at?: string;
  updated_at?: string;
  submission_date?: string;
  status: RecommendationStatus;
  status_updated_at?: string;
  agent_name?: string;
  agency?: string;
  agent_email?: string;
  agent_number?: string;
  avg_performance_score?: number | null;
  agent_status: AgentStatus;
  agent_status_updated_at?: string;
  shared_notes?: string;
  linked_universal_id?: string | null;
}

export interface RecommendationStatusHistory {
  id: number;
  old_status?: string;
  new_status: RecommendationStatus;
  changed_at: string;
  changed_by?: number;
  changed_by_name?: string;
}

export interface RecommendationNoteHistory {
  id: number;
  note_content: string;
  created_at: string;
  created_by?: number;
  created_by_name?: string;
}

export interface InternalRecommendation extends Recommendation {
  submitted_by_user_id?: number;
  submitted_by_username?: string;
  status_updated_by?: number;
  status_updated_by_name?: string;
  supporting_file_content_type?: string;
  supporting_file_size_bytes?: number;
  status_history?: RecommendationStatusHistory[];
}

export interface InternalRecommendationsResponse {
  items: InternalRecommendation[];
  page: number;
  page_size: number;
  total: number;
}

export interface InternalRecommendationFiltersMeta {
  statuses: RecommendationStatus[];
  agents: Array<{ user_id: number; label: string }>;
}

export interface InternalStatusUpdateResponse {
  item: InternalRecommendation;
  warning?: string | null;
}

export interface InternalBulkStatusUpdateResponse {
  requested: number;
  updated: number;
  failed: number;
  failures: Array<{
    recommendation_id: number;
    reason: string;
  }>;
}

export interface InternalBulkStatusUpdateItem {
  recommendation_id: number;
  new_status: RecommendationStatus;
}

export interface RecommendationFormValues {
  agent_name: string;
  agency: string;
  agent_email: string;
  agent_number: string;
  submission_date: string;
  player_name: string;
  player_date_of_birth?: string;
  recommended_position: string[];
  transfermarkt_link: string;
  agreement_type: AgreementType[];
  confirmed_contract_expiry: string;
  contract_options: ContractOption[];
  potential_deal_type: PotentialDealType[];
  transfer_fee: string;
  current_wages_per_week: string;
  wage_basis: WageBasis;
  current_wages_basis: WageBasis;
  expected_wages_per_week: string;
  expected_wages_basis: WageBasis;
  additional_information: string;
  linked_universal_id?: string | null;
  player_manual_entry?: boolean;
}

export interface AgentPlayerSearchResult {
  label: string;
  name: string;
  date_of_birth?: string | null;
  avg_performance_score?: number | null;
  universal_id?: string | null;
  similarity?: number | null;
  squad_name?: string | null;
  position?: string | null;
}

export interface AgentPlayerSearchResponse {
  results: AgentPlayerSearchResult[];
  suggestions: AgentPlayerSearchResult[];
}

export interface AgentRegisterPayload {
  firstname?: string;
  lastname?: string;
  email: string;
  password: string;
  agent_name: string;
  agency?: string;
  agent_number?: string;
}
