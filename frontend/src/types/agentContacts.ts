import { RecommendationStatus } from './recommendations';
import type { ListDataScore } from '../services/playerListsService';

export interface AgentContact {
  agent_user_id: number;
  name: string;
  agency: string | null;
  email: string | null;
  phone: string | null;
  rec_count: number;
  last_rec_at: string | null;
  details_from_latest_rec: boolean;
  avg_performance_score?: number | null;
  performance_scored_count?: number;
  avg_data_score?: number | null;
  data_scored_count?: number;
}

export interface AgentContactRec {
  id: number;
  player_name: string;
  recommended_position: string | null;
  player_date_of_birth: string | null;
  submitted_at: string;
  status: RecommendationStatus;
  avg_performance_score?: number | null;
  data_score?: ListDataScore | null;
}

export interface AgentContactRecs {
  total: number;
  items: AgentContactRec[];
}
