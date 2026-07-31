import axiosInstance from '../axiosInstance';
import {
  AgentPlayerSearchResponse,
  AgentProfile,
  AgentRegisterPayload,
  AgentStatus,
  Recommendation,
  RecommendationFormValues,
  RecommendationStatusHistory,
  RecommendationNoteHistory,
} from '../types/recommendations';

const toFormData = (values: RecommendationFormValues, extra?: Record<string, string | boolean>) => {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      formData.append(key, value.join(','));
      return;
    }
    formData.append(key, String(value));
  });
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      formData.append(key, String(value));
    });
  }
  return formData;
};

export interface RecommendationSubmitOptions {
  // Bypasses the backend's possible_duplicate_player gate after the agent
  // has explicitly confirmed the manually-entered player is not a duplicate.
  confirmNewPlayer?: boolean;
}

export const agentRecommendationsService = {
  async register(payload: AgentRegisterPayload) {
    const response = await axiosInstance.post<AgentProfile>('/agents/register', payload);
    return response.data;
  },

  async confirmPasswordReset(payload: { token: string; new_password: string }) {
    const response = await axiosInstance.post<{ message: string }>('/agents/reset-password', payload);
    return response.data;
  },

  async getMe() {
    const response = await axiosInstance.get<AgentProfile>('/agents/me');
    return response.data;
  },

  async list() {
    const response = await axiosInstance.get<Recommendation[]>('/agents/recommendations');
    return response.data;
  },

  async submit(values: RecommendationFormValues, options?: RecommendationSubmitOptions) {
    const formData = toFormData(values, options?.confirmNewPlayer ? { confirm_new_player: true } : undefined);
    const response = await axiosInstance.post<Recommendation>('/agents/recommendations', formData);
    return response.data;
  },

  async update(id: number, values: RecommendationFormValues, options?: RecommendationSubmitOptions) {
    const formData = toFormData(values, options?.confirmNewPlayer ? { confirm_new_player: true } : undefined);
    const response = await axiosInstance.patch<Recommendation>(`/agents/recommendations/${id}`, formData);
    return response.data;
  },

  async searchPlayers(query: string, limit = 10) {
    const response = await axiosInstance.get<AgentPlayerSearchResponse>('/agents/player-search', {
      params: { query, limit },
    });
    return response.data;
  },

  async getDetail(id: number) {
    const response = await axiosInstance.get<Recommendation>(`/agents/recommendations/${id}`);
    return response.data;
  },

  async getStatusHistory(id: number) {
    const response = await axiosInstance.get<RecommendationStatusHistory[]>(`/agents/recommendations/${id}/status-history`);
    return response.data;
  },

  async getNotesHistory(id: number) {
    const response = await axiosInstance.get<RecommendationNoteHistory[]>(`/agents/recommendations/${id}/notes-history`);
    return response.data;
  },

  async updateAgentStatus(id: number, newAgentStatus: AgentStatus) {
    const response = await axiosInstance.patch<Recommendation>(`/agents/recommendations/${id}/agent-status`, {
      new_agent_status: newAgentStatus,
    });
    return response.data;
  },
};
