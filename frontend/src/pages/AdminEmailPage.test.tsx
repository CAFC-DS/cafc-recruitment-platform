import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminEmailPage from './AdminEmailPage';
import { recruitmentEmailService as service } from '../services/recruitmentEmailService';
jest.mock('../services/recruitmentEmailService', () => ({ recruitmentEmailService: Object.fromEntries(['users','preview','confirm','archivePreview','archiveApply','notifyPreview','notifyConfirm','batches','detail','retry','review'].map(k => [k, jest.fn()])) }));
const mocked = service as jest.Mocked<typeof service>;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.users.mockResolvedValue([{ id: 2, name: 'Agent A', role: 'agent', email: 'agent@example.com' }]);
  mocked.batches.mockResolvedValue([]);
});

test('previews chosen recipients before confirming a redirected test batch', async () => {
  mocked.preview.mockResolvedValue({ id: 'preview', messages: [{ key: '2', recipient: 'agent@example.com', subject: 'Update', html: '<p>hello</p>' }], skipped: [] });
  mocked.confirm.mockResolvedValue({ id: 'queued' });
  mocked.detail.mockResolvedValue({ id: 'queued', purpose: 'manual', state: 'complete', created_at: '', payload: {}, jobs: [] });
  render(<MemoryRouter><AdminEmailPage /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Agent A — agent@example.com'));
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Update' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview individual emails' }));
  await screen.findByTitle('Individual email preview');
  expect(mocked.preview).toHaveBeenCalledWith({ user_ids: [2], subject: 'Update', body: 'hello' });
  expect(mocked.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Send test batch' }));
  await waitFor(() => expect(mocked.confirm).toHaveBeenCalledWith('preview', 'test'));
});

test('selected NCUC IDs from the staff list default to waiting and under-review statuses', async () => {
  mocked.archivePreview.mockResolvedValue({ id: 'archive', rows: [{ id: 10, player: 'Player', agent_id: 2, agent_name: 'Agent', status: 'Submitted' }] });
  mocked.archiveApply.mockResolvedValue({ updated: 1 });
  render(<MemoryRouter initialEntries={['/admin/email?ids=10']}><AdminEmailPage /></MemoryRouter>);
  await screen.findByLabelText('Agent A — agent@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Preview affected players and agents' }));
  await screen.findByRole('button', { name: 'Confirm NCUC changes' });
  expect(mocked.archivePreview).toHaveBeenCalledWith({ recommendation_ids: [10], statuses: ['Submitted', 'Under Review'] });
  expect(mocked.archiveApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm NCUC changes' }));
  await screen.findByText('1 recommendations marked NCUC. No emails sent.');
  expect(mocked.notifyConfirm).not.toHaveBeenCalled();
});

test('changing wording invalidates an existing preview', async () => {
  mocked.preview.mockResolvedValue({ id: 'p', messages: [], skipped: [] });
  render(<MemoryRouter><AdminEmailPage /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Agent A — agent@example.com'));
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Update' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview individual emails' }));
  await screen.findByText('Email preview');
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Changed' } });
  expect(screen.queryByText('Email preview')).not.toBeInTheDocument();
});
