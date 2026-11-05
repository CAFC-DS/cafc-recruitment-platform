import React from 'react';
import { render, screen } from '@testing-library/react';
import axiosInstance from '../axiosInstance';
import ScoutAppPage from './ScoutAppPage';

jest.mock('../axiosInstance', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../App', () => ({ useAuth: () => ({ token: 'test-token' }) }));

const mockedGet = axiosInstance.get as jest.Mock;

afterEach(() => mockedGet.mockReset());

test('shows the published scout app in an iframe with its build date', async () => {
  mockedGet.mockResolvedValue({
    data: { url: 'https://storage.example.test/signed', built_at: '2026-11-01T09:42:00Z' },
  });

  render(<ScoutAppPage />);

  const frame = await screen.findByTitle('CAFC scout app');
  expect(frame.tagName).toBe('IFRAME');
  expect(frame).toHaveAttribute('src', 'https://storage.example.test/signed');
  expect(screen.getByText(/Data as of 1 Nov 2026/)).toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledWith('/scout-app/link');
});

test('explains when nothing has been published yet', async () => {
  mockedGet.mockRejectedValue({
    response: { status: 503, data: { detail: 'The scout app has not been published yet.' } },
  });

  render(<ScoutAppPage />);

  expect(await screen.findByText('The scout app has not been published yet.')).toBeInTheDocument();
  expect(screen.queryByTitle('CAFC scout app')).not.toBeInTheDocument();
});

test('keeps the same iframe and link while hidden on another tab', async () => {
  mockedGet.mockResolvedValue({ data: { url: 'https://storage.example.test/signed', built_at: null } });

  const { rerender } = render(<ScoutAppPage active />);
  const frame = await screen.findByTitle('CAFC scout app');

  rerender(<ScoutAppPage active={false} />);
  rerender(<ScoutAppPage active />);

  expect(screen.getByTitle('CAFC scout app')).toBe(frame);
  expect(mockedGet).toHaveBeenCalledTimes(1);
});

test('retries a failed link when coming back to the tab', async () => {
  mockedGet.mockRejectedValueOnce({ response: { data: { detail: 'Not available yet.' } } });
  mockedGet.mockResolvedValueOnce({ data: { url: 'https://storage.example.test/signed', built_at: null } });

  const { rerender } = render(<ScoutAppPage active />);
  await screen.findByText('Not available yet.');

  rerender(<ScoutAppPage active={false} />);
  rerender(<ScoutAppPage active />);

  expect(await screen.findByTitle('CAFC scout app')).toBeInTheDocument();
  expect(screen.queryByText('Not available yet.')).not.toBeInTheDocument();
});
