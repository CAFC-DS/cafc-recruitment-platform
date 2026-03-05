import axiosInstance from '../axiosInstance';
import {
  AgentPlayerSearchResult,
  AgentProfile,
  AgentRegisterPayload,
  Recommendation,
  RecommendationFormValues,
  RecommendationStatusHistory,
} from '../types/recommendations';

const toFormData = (values: RecommendationFormValues) => {
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
  return formData;
};

export const agentRecommendationsService = {
  async register(payload: AgentRegisterPayload) {
    const response = await axiosInstance.post<AgentProfile>('/agents/register', payload);
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

  async submit(values: RecommendationFormValues) {
    const response = await axiosInstance.post<Recommendation>('/agents/recommendations', toFormData(values), {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async searchPlayers(query: string, limit = 10) {
    const response = await axiosInstance.get<AgentPlayerSearchResult[]>('/agents/player-search', {
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
};
