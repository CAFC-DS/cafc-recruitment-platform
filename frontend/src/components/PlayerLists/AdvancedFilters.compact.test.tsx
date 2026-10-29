import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdvancedFilters, PlayerListFilters } from './AdvancedFilters';
const filters: PlayerListFilters = { playerName: '', position: '', club: '', competition: [], performanceScores: [], minAge: '', maxAge: '', minReports: '', maxReports: '', stages: [], archivedReasons: [], initialReasons: [], recencyMonths: '' };
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() })) });
});
beforeEach(() => jest.clearAllMocks());
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


test('Enter applies a draft and reset stays available when applied fields are cleared', () => {
  const onClearFilters = jest.fn();
  render(<AdvancedFilters {...props} filters={{...filters, club:'Charlton'}} onClearFilters={onClearFilters} />);
  expect(screen.getByRole('button', {name:'Apply filters'})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Club'), {target:{value:''}});
  expect(screen.getByRole('status')).toHaveTextContent('Changes ready to apply');
  expect(screen.getByRole('button', {name:'Reset filters'})).toBeEnabled();
  fireEvent.submit(screen.getByLabelText('Club').closest('form')!);
  expect(props.onFilterChange).toHaveBeenCalledWith(filters);
  fireEvent.click(screen.getByRole('button', {name:'Reset filters'}));
  expect(onClearFilters).toHaveBeenCalledTimes(1);
});


test('applied chips remove a single criterion without clearing the others', () => {
  render(<AdvancedFilters {...props} showFilters={false} filters={{...filters, club:'Charlton', minAge:'18'}} />);
  fireEvent.click(screen.getByRole('button', { name:'Remove filter Club: Charlton' }));
  expect(props.onFilterChange).toHaveBeenCalledWith({club:''});
  expect(screen.getByRole('button', { name:'Remove filter Age 18–Any' })).toBeInTheDocument();
});

test('drawer Apply closes the editor and keeps staged criteria together', () => {
  render(<AdvancedFilters {...props} />);
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Filters');
  fireEvent.change(screen.getByLabelText('Club'), {target:{value:'Charlton'}});
  fireEvent.change(screen.getByLabelText('Minimum age'), {target:{value:'18'}});
  expect(props.onFilterChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Apply filters'}));
  expect(props.onFilterChange).toHaveBeenCalledWith({...filters,club:'Charlton',minAge:'18'});
  expect(props.setShowFilters).toHaveBeenCalledWith(false);
});


test('inclusion checkboxes start with favourites on and summer transfers off and apply together', () => {
  render(<AdvancedFilters {...props} />);
  expect(screen.getByLabelText('Include favourites')).toBeChecked();
  expect(screen.getByLabelText('Include summer transfers')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Include favourites'));
  fireEvent.click(screen.getByLabelText('Include summer transfers'));
  expect(props.onFilterChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Apply filters'}));
  expect(props.onFilterChange).toHaveBeenCalledWith({...filters,includeFavourites:false,includeSummerTransfers:true});
});

test('reset restores default inclusions and applied inclusion chips can be removed', () => {
  const view = render(<AdvancedFilters {...props} filters={{...filters,includeFavourites:false,includeSummerTransfers:true}} />);
  fireEvent.click(screen.getByRole('button', {name:'Reset filters'}));
  expect(screen.getByLabelText('Include favourites')).toBeChecked();
  expect(screen.getByLabelText('Include summer transfers')).not.toBeChecked();
  view.unmount();
  render(<AdvancedFilters {...props} showFilters={false} filters={{...filters,includeFavourites:false,includeSummerTransfers:true}} />);
  fireEvent.click(screen.getByRole('button', {name:'Remove filter Favourites excluded'}));
  expect(props.onFilterChange).toHaveBeenCalledWith({includeFavourites:true});
  fireEvent.click(screen.getByRole('button', {name:'Remove filter Summer transfers included'}));
  expect(props.onFilterChange).toHaveBeenCalledWith({includeSummerTransfers:false});
});
