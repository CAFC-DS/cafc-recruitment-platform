export type RecommendationStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Added to Scouting Process'
  | 'Added to Emerging Talent Process'
  | 'Not Currently under Consideration';

export type AgreementType =
  | 'Player Agreement/Mandate'
  | 'Club Mandate'
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
  transfermarkt_link?: string;
  agreement_type?: string;
  confirmed_contract_expiry?: string;
  contract_options?: string;
  potential_deal_type?: string;
  transfer_fee?: string;
  transfer_fee_amount?: number;
  transfer_fee_currency?: string;
  current_wages_per_week?: number;
  current_wages_currency?: string;
  expected_wages_per_week?: number;
  expected_wages_currency?: string;
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
}

export interface RecommendationStatusHistory {
  id: number;
  old_status?: string;
  new_status: RecommendationStatus;
  changed_at: string;
  changed_by?: number;
  changed_by_name?: string;
}

export interface InternalRecommendation extends Recommendation {
  submitted_by_user_id?: number;
  submitted_by_username?: string;
  internal_notes?: string;
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
  expected_wages_per_week: string;
  additional_information: string;
}

export interface AgentPlayerSearchResult {
  label: string;
  name: string;
  date_of_birth?: string | null;
  avg_performance_score?: number | null;
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
