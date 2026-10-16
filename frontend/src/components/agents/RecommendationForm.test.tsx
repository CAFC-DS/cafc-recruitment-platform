import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecommendationForm from './RecommendationForm';
import { getInitialRecommendationFormValues } from '../../utils/agentRecommendationForm';

jest.mock('../../services/agentRecommendationsService', () => ({
  agentRecommendationsService: { searchPlayers: jest.fn() },
}));

function ResubmitForm({ positions = [] }: { positions?: string[] }) {
  const [values, setValues] = useState({
    ...getInitialRecommendationFormValues(),
    player_name: 'Example Player',
    player_date_of_birth: '2000-01-01',
    linked_universal_id: 'test-player',
    recommended_position: positions,
  });
  return <RecommendationForm
    mode="resubmit"
    values={values}
    profile={null}
    loading={false}
    onSubmit={(event) => event.preventDefault()}
    onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
  />;
}

test('resubmission allows a missing legacy position to be selected while identity stays fixed', () => {
  render(<ResubmitForm />);
  expect(screen.getByText('Recommended Position *')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Select recommended position/ }));
  fireEvent.click(screen.getByRole('button', { name: 'RB' }));
  expect(screen.getByRole('button', { name: /RB.*▾/ })).toBeInTheDocument();
  expect(screen.getByText('Example Player')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Example Player')).not.toBeInTheDocument();
});

test('resubmission preserves existing positions and allows them to be updated', () => {
  render(<ResubmitForm positions={['RB']} />);
  fireEvent.click(screen.getByRole('button', { name: /RB.*▾/ }));
  fireEvent.click(screen.getByRole('button', { name: 'LB' }));
  expect(screen.getByRole('button', { name: /RB, LB/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /RB ✓/ }));
  expect(screen.getByRole('button', { name: /LB.*▾/ })).toBeInTheDocument();
});
