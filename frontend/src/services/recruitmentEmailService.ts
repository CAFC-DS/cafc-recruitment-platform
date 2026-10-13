import axios from '../axiosInstance';

export interface EmailMessage { key: string; recipient: string; subject: string; html: string }
export interface EmailPreview { id: string; messages: EmailMessage[]; skipped: unknown[] }
export interface ArchiveRow { id: number; player: string; agent_id: number; agent_name: string; email?: string; status: string }
export interface ArchivePreview { id: string; rows: ArchiveRow[] }
export interface EmailBatch {
  id: string; purpose: string; state: string; created_at: string;
  payload: { rows?: ArchiveRow[]; messages?: EmailMessage[]; skipped?: unknown[]; body?: string; subject?: string };
  jobs: { id: string; recipient: string; mode: string; status: string; error?: string }[];
}
export interface EmailUser { id: number; name: string; role: string; email?: string }
const base = '/admin/email';
export const recruitmentEmailService = {
  users: async () => (await axios.get<EmailUser[]>(`${base}/users`)).data,
  preview: async (payload: { user_ids?: number[]; role?: string; all_users?: boolean; subject: string; body: string }) => (await axios.post<EmailPreview>(`${base}/preview`, payload)).data,
  confirm: async (id: string, mode: string) => (await axios.post<{ id: string }>(`${base}/batches/${encodeURIComponent(id)}/confirm`, { mode })).data,
  archivePreview: async (payload: { recommendation_ids?: number[]; created_from?: string; created_to?: string; statuses: string[] }) => (await axios.post<ArchivePreview>(`${base}/ncuc/preview`, payload)).data,
  archiveApply: async (id: string) => (await axios.post<{ updated: number }>(`${base}/ncuc/${encodeURIComponent(id)}/apply`)).data,
  notifyPreview: async (id: string, subject: string, body: string) => (await axios.post<EmailPreview>(`${base}/ncuc/${encodeURIComponent(id)}/notify-preview`, { subject, body, mode: 'test' })).data,
  notifyConfirm: async (id: string, mode: string) => (await axios.post<{ id: string }>(`${base}/ncuc-notifications/${encodeURIComponent(id)}/confirm`, { mode })).data,
  batches: async () => (await axios.get<EmailBatch[]>(`${base}/batches`)).data,
  detail: async (id: string) => (await axios.get<EmailBatch>(`${base}/batches/${encodeURIComponent(id)}`)).data,
  review: async (id: string, outcome: 'sent' | 'not_sent', note: string) => (await axios.post(`${base}/jobs/${encodeURIComponent(id)}/review`, { outcome, note })).data,
  retry: async (id: string) => (await axios.post<{ requeued: number }>(`${base}/batches/${encodeURIComponent(id)}/retry`)).data,
};
