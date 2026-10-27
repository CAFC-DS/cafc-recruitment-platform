import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ListLoadingStatus from './ListLoadingStatus';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

test('refresh preserves context and explains a slower request', () => {
  const { rerender } = render(<ListLoadingStatus loading />);
  expect(screen.getByRole('status')).toHaveTextContent('previous results remain visible');
  act(() => { jest.advanceTimersByTime(8000); });
  expect(screen.getByRole('status')).toHaveTextContent('taking longer than usual');
  rerender(<ListLoadingStatus loading={false} />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  rerender(<ListLoadingStatus loading />);
  expect(screen.getByRole('status')).not.toHaveTextContent('taking longer');
});

test('first load and retry have meaningful labels', () => {
  const retry = jest.fn();
  const { rerender } = render(<ListLoadingStatus loading initial />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your recruitment lists');
  rerender(<ListLoadingStatus loading={false} error="Network error" onRetry={retry} />);
  expect(screen.getByRole('status')).toHaveTextContent('could not be updated');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
