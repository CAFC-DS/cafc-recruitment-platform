import React from 'react';
import { act, render, screen } from '@testing-library/react';
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

describe('saved scout app filters', () => {
  const ORIGIN = 'https://storage.example.test';
  const tokenFor = (userId: number) => `x.${btoa(JSON.stringify({ user_id: userId }))}.y`;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', tokenFor(7));
    mockedGet.mockResolvedValue({ data: { url: `${ORIGIN}/signed?X-Amz=1`, built_at: null } });
  });
  afterEach(() => localStorage.clear());

  const frameWindow = async () => {
    const frame = (await screen.findByTitle('CAFC scout app')) as HTMLIFrameElement;
    const win = frame.contentWindow as Window;
    const post = jest.spyOn(win, 'postMessage').mockImplementation(() => undefined);
    return { win, post };
  };
  const send = (source: Window | null, data: unknown, origin = ORIGIN) =>
    act(() => { window.dispatchEvent(new MessageEvent('message', { source, origin, data })); });

  test('answers the frame with null before anything is saved', async () => {
    render(<ScoutAppPage />);
    const { win, post } = await frameWindow();
    send(win, { type: 'cafc-scout:ready', version: 1 });
    expect(post).toHaveBeenCalledWith({ type: 'cafc-scout:filters', version: 1, filters: null }, ORIGIN);
  });

  test('keeps filters the frame saves for the next load, per account', async () => {
    const filters = { positions: ['winger'], minutes: 1500, leagues: ['Championship'] };
    const { unmount } = render(<ScoutAppPage />);
    const first = await frameWindow();
    send(first.win, { type: 'cafc-scout:save', version: 1, filters });
    expect(JSON.parse(localStorage.getItem('persisted:v1:7:scoutApp:filters') as string)).toEqual(filters);
    unmount();

    render(<ScoutAppPage />); // a reload
    const second = await frameWindow();
    send(second.win, { type: 'cafc-scout:ready', version: 1 });
    expect(second.post).toHaveBeenCalledWith({ type: 'cafc-scout:filters', version: 1, filters }, ORIGIN);
  });

  test('ignores messages from other windows, other origins and bad payloads', async () => {
    render(<ScoutAppPage />);
    const { win, post } = await frameWindow();
    send(window, { type: 'cafc-scout:save', filters: { minutes: 1 } });
    send(win, { type: 'cafc-scout:save', filters: { minutes: 2 } }, 'https://evil.example');
    send(win, { type: 'cafc-scout:save', filters: ['not', 'an', 'object'] });
    send(win, { type: 'cafc-scout:ready' }, 'https://evil.example');
    expect(localStorage.getItem('persisted:v1:7:scoutApp:filters')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
