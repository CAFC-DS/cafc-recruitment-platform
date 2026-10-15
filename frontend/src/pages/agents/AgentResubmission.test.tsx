import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentEditSubmissionPage from './AgentEditSubmissionPage';
import { agentRecommendationsService as service } from '../../services/agentRecommendationsService';
jest.mock('../../services/agentRecommendationsService', () => ({ agentRecommendationsService: { getMe: jest.fn(), getDetail: jest.fn(), resubmit: jest.fn() } }));
jest.mock('../../components/agents/AgentPortalShell', () => ({ __esModule: true, default: ({ children }: any) => <div>{children}</div> }));
jest.mock('../../components/agents/RecommendationForm', () => ({ __esModule: true, default: ({ onSubmit, onChange, error }: any) => <form onSubmit={onSubmit}><div>{error}</div><button type="button" onClick={() => onChange('player_name', 'Other player')}>Change identity</button><button type="submit">Resubmit</button></form> }));
jest.mock('../../utils/agentRecommendationForm', () => ({ ...jest.requireActual('../../utils/agentRecommendationForm'), validateRecommendationFormValues: () => null }));
const mocked = service as jest.Mocked<typeof service>;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getMe.mockResolvedValue({ user_id: 2 });
  mocked.getDetail.mockResolvedValue({ id: 10, player_name: 'Original player', status: 'Not Currently under Consideration', agent_status: 'Active', linked_universal_id: 'external_1' });
  mocked.resubmit.mockResolvedValue({ id: 11, player_name: 'Original player', status: 'Submitted', agent_status: 'Active' });
});
function mount() {
  render(<MemoryRouter initialEntries={['/agents/submissions/10/resubmit']}><Routes>
    <Route path="/agents/submissions/:id/resubmit" element={<AgentEditSubmissionPage resubmit />} />
    <Route path="/agents/submissions/:id" element={<div>New submission detail</div>} />
  </Routes></MemoryRouter>);
}

test('requires a change explanation and preserves player identity', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Resubmit' }));
  await screen.findByText("Explain what's changed before resubmitting.");
  expect(mocked.resubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("What's changed? *"), { target: { value: 'Available on loan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change identity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }));
  await screen.findByText('New submission detail');
  expect(mocked.resubmit).toHaveBeenCalledWith(10, expect.objectContaining({ player_name: 'Original player', linked_universal_id: 'external_1' }), 'Available on loan');
});

test('hides the form when a newer version already exists', async () => {
  mocked.getDetail.mockResolvedValue({ id: 10, player_name: 'Player', status: 'Not Currently under Consideration', agent_status: 'Active', resubmitted_as_id: 11 });
  mount();
  await screen.findByText('Only the latest NCUC or archived submission can be resubmitted.');
  expect(screen.queryByRole('button', { name: 'Resubmit' })).not.toBeInTheDocument();
});

test('explains when staff must link an older submission before resubmission', async () => {
  mocked.getDetail.mockResolvedValue({ id: 10, player_name: 'Player', status: 'Not Currently under Consideration', agent_status: 'Active' });
  mount();
  await screen.findByText('The club needs to link this submission to a player record before you can resubmit it. Please contact the recruitment team.');
  expect(screen.queryByRole('button', { name: 'Resubmit' })).not.toBeInTheDocument();
  expect(mocked.resubmit).not.toHaveBeenCalled();
});

test('allows an archived submission to be resubmitted with new details', async () => {
  mocked.getDetail.mockResolvedValue({ id: 10, player_name: 'Original player', status: 'Archived Submission', agent_status: 'Active', linked_universal_id: 'external_1' });
  mount();
  fireEvent.change(await screen.findByLabelText("What's changed? *"), { target: { value: 'Now available' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }));
  await screen.findByText('New submission detail');
  expect(mocked.resubmit).toHaveBeenCalledWith(10, expect.objectContaining({ player_name: 'Original player' }), 'Now available');
});
