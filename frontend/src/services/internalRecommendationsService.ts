import axiosInstance from '../axiosInstance';
import {
  InternalBulkStatusUpdateItem,
  InternalBulkStatusUpdateResponse,
  InternalRecommendation,
  InternalRecommendationFiltersMeta,
  InternalRecommendationsResponse,
  InternalStatusUpdateResponse,
  RecommendationStatus,
  RecommendationStatusHistory,
} from '../types/recommendations';

export const internalRecommendationsService = {
  async list(params: {
    status?: RecommendationStatus | '';
    agent_user_id?: string;
    created_from?: string;
    created_to?: string;
    player_name?: string;
    position?: string;
    deal_type?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    page?: number;
    page_size?: number;
  }) {
    const cleanedParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    );
    const response = await axiosInstance.get<InternalRecommendationsResponse>('/internal/recommendations', { params: cleanedParams });
    return response.data;
  },

  async getFiltersMeta() {
    const response = await axiosInstance.get<InternalRecommendationFiltersMeta>('/internal/recommendations/filters/meta');
    return response.data;
  },

  async getDetail(id: number) {
    const response = await axiosInstance.get<InternalRecommendation>(`/internal/recommendations/${id}`);
    return response.data;
  },

  async updateStatus(id: number, newStatus: RecommendationStatus) {
    const response = await axiosInstance.patch<InternalStatusUpdateResponse>(`/internal/recommendations/${id}/status`, {
      new_status: newStatus,
    });
    return response.data;
  },

  async bulkUpdateStatus(updates: InternalBulkStatusUpdateItem[]) {
    const response = await axiosInstance.patch<InternalBulkStatusUpdateResponse>('/internal/recommendations/status/bulk', {
      updates,
    });
    return response.data;
  },

  async saveReview(id: number, newStatus: RecommendationStatus, sharedNotes: string) {
    const response = await axiosInstance.patch<InternalStatusUpdateResponse>(`/internal/recommendations/${id}/review`, {
      new_status: newStatus,
      shared_notes: sharedNotes,
    });
    return response.data;
  },

  async updateNotes(id: number, sharedNotes: string) {
    const response = await axiosInstance.patch<InternalRecommendation>(`/internal/recommendations/${id}/notes`, {
      shared_notes: sharedNotes,
    });
    return response.data;
  },

  async getStatusHistory(id: number) {
    const response = await axiosInstance.get<RecommendationStatusHistory[]>(`/internal/recommendations/${id}/status-history`);
    return response.data;
  },
  async exportCsv() {
    const response = await axiosInstance.get('/internal/recommendations/export.csv', {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};
