import axiosInstance from '../axiosInstance';
import { AgentContact, AgentContactRecs } from '../types/agentContacts';

export const agentContactsService = {
  async list() {
    const response = await axiosInstance.get<AgentContact[]>('/internal/agent-contacts');
    return response.data;
  },

  async recentRecs(userId: number, limit = 5) {
    const response = await axiosInstance.get<AgentContactRecs>(`/internal/agent-contacts/${userId}/recommendations`, {
      params: { limit },
    });
    return response.data;
  },
};
