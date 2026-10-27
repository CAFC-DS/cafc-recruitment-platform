import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdvancedFilters, PlayerListFilters } from './AdvancedFilters';
const filters: PlayerListFilters = { playerName: '', position: '', club: '', competition: [], performanceScores: [], minAge: '', maxAge: '', minReports: '', maxReports: '', stages: [], archivedReasons: [], initialReasons: [], recencyMonths: '' };
const props = { compact: true, showFilters: true, setShowFilters: jest.fn(), filters, onFilterChange: jest.fn(), onClearFilters: jest.fn(), showArchived: false, onShowArchivedChange: jest.fn(), includeArchivedReports: false, onIncludeArchivedReportsChange: jest.fn(), includeFlagReports: false, onIncludeFlagReportsChange: jest.fn(), competitionOptions: [], archivedReasonOptions: [], initialReasonOptions: [] };
test('compact filters provide one search and one reset with an explicit score range', () => {
  render(<AdvancedFilters {...props} />);
  expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  expect(screen.queryByPlaceholderText('Enter player name')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', {name:'Reset filters'})).toHaveLength(1);
  expect(screen.getByRole('button', {name:'Reset filters'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Minimum performance score'), {target:{value:'6'}});
  expect(props.onFilterChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Apply filters'}));
  expect(props.onFilterChange).toHaveBeenCalledWith({...filters, performanceScores:[6,7,8,9,10]});
});
test('pitch filters defer stages to the pitch and show active criteria when collapsed', () => {
  render(<AdvancedFilters {...props} pitchView showFilters={false} filters={{...filters, club:'Charlton'}} />);
  expect(screen.getByRole('button', {name:'Filters (1)'})).toHaveAttribute('aria-expanded','false');
  expect(screen.queryByText('Stage Filter')).not.toBeInTheDocument();
});
