import { RecommendationStatus } from './recommendations';

export interface AgentContact {
  agent_user_id: number;
  name: string;
  agency: string | null;
  email: string | null;
  phone: string | null;
  rec_count: number;
  last_rec_at: string | null;
  details_from_latest_rec: boolean;
}

export interface AgentContactRec {
  id: number;
  player_name: string;
  recommended_position: string | null;
  player_date_of_birth: string | null;
  submitted_at: string;
  status: RecommendationStatus;
}

export interface AgentContactRecs {
  total: number;
  items: AgentContactRec[];
}
