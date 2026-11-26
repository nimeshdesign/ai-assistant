import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi } from './fakeApi';
import { renderApp } from './utils';

function withHistory() {
  const api = createFakeApi();
  const asha = api.seedSignedInUser();
  api.seedHistory(asha, [
    { questionText: 'What is a closure in JavaScript?', categorySlug: 'javascript', userResponse: 'It keeps outer variables.', score: 62, feedback: 'Add an example.', improvedAnswer: 'A closure is a function plus its scope.', sessionType: 'mock', mockInterviewId: '0000000000000000000000aa' },
    { questionText: 'Explain the event loop', sessionType: 'voice', inputMode: 'voice' },
    { questionText: 'What is a promise?', sessionType: 'voice', inputMode: 'voice' },
    { questionText: 'How does CSS grid work?', sessionType: 'assistant', inputMode: 'screen' },
  ]);
  return api;
}
const entries = () => within(screen.getByRole('list', { name: 'History entries' })).getAllByRole('listitem');

describe('History', () => {
  it('shows the empty state before anything is saved', async () => {
    renderApp('/history');
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
    expect(screen.queryByText(/Sample/)).not.toBeInTheDocument();
  });

  it('lists, filters and searches entries on the server', async () => {
    const api = withHistory();
    const { user } = renderApp('/history', { api });
    await screen.findByRole('list', { name: 'History entries' });
    expect(entries()).toHaveLength(4);

    await user.click(screen.getByRole('tab', { name: 'Voice' }));
    await waitFor(() => expect(entries()).toHaveLength(2));
    expect(api.calls.some((c) => c.path === '/history' && c.method === 'GET')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'All' }));
    await user.type(screen.getByRole('textbox', { name: 'Search history' }), 'closure');
    await waitFor(() => expect(entries()).toHaveLength(1));
  });

  it('shows mock feedback, bookmarks, and deletes after confirmation', async () => {
    const api = withHistory();
    const { user } = renderApp('/history', { api });
    await user.click(await screen.findByRole('button', { name: /What is a closure in JavaScript/ }));
    expect(await screen.findByText('Your answer')).toBeInTheDocument();
    expect(screen.getByText('Add an example.')).toBeInTheDocument();
    expect(screen.getByText('A closure is a function plus its scope.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View report/ })).toHaveAttribute('href', '/mock-interview/0000000000000000000000aa/report');

    const row = screen.getByRole('button', { name: /What is a closure in JavaScript/ }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Bookmark' }));
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true'));
    expect(api.history.find((h) => h.item.questionText.startsWith('What is a closure'))!.item.isBookmarked).toBe(true);

    await user.click(within(row).getByRole('button', { name: 'Delete entry' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(entries()).toHaveLength(3));
    expect(api.history).toHaveLength(3);
  });

  it('records answers asked in the app, and nothing when saving is off', async () => {
    const api = createFakeApi();
    const asha = api.seedSignedInUser();
    const { user } = renderApp('/tools', { api });
    await user.type(await screen.findByLabelText('Question'), 'What is debouncing?');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    await screen.findByText('Direct answer to: What is debouncing?');
    expect(api.history.map((h) => [h.item.sessionType, h.item.questionText])).toEqual([['practice', 'What is debouncing?']]);

    asha.settings.privacy.saveHistory = false;
    await user.clear(screen.getByLabelText('Question'));
    await user.type(screen.getByLabelText('Question'), 'What is throttling?');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    await screen.findByText('Direct answer to: What is throttling?');
    expect(api.history).toHaveLength(1);
  });

  it('clears all history', async () => {
    const api = withHistory();
    const { user } = renderApp('/history', { api });
    await screen.findByRole('list', { name: 'History entries' });
    await user.click(screen.getByRole('button', { name: /Clear history/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('validates and saves the profile to the server', async () => {
    const { user, store, api } = renderApp('/settings');
    const name = await screen.findByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(screen.getByRole('button', { name: /Save profile/ }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();

    await user.type(name, 'sha Mehta');
    await user.type(screen.getByLabelText('Preferred programming languages'), 'Go{Enter}');
    await user.click(screen.getByRole('button', { name: /Save profile/ }));
    await waitFor(() => expect(store.getState().settings.profile.preferredLanguages).toContain('Go'));
    const saved = [...api.users.values()][0]!;
    expect(saved.name).toBe('Asha Mehta');
    expect(saved.profile.preferredLanguages).toEqual(['Go']);
    expect(store.getState().auth.user?.name).toBe('Asha Mehta');
    expect(localStorage.getItem('aia.settings')).toBeNull(); // nothing account-related in localStorage
  });

  it('opens the tab from the URL and saves privacy toggles to the server', async () => {
    const { user, store, api } = renderApp('/settings?tab=privacy');
    const toggle = await screen.findByRole('switch', { name: 'Screen reading' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(store.getState().settings.permissions.screenCapture).toBe(true);
    await waitFor(() => expect([...api.users.values()][0]!.settings.permissions.screenCapture).toBe(true));
  });

  it('rolls back a change the server rejects', async () => {
    const { user, store, api } = renderApp('/settings?tab=privacy');
    api.failRoute('PATCH /settings/privacy', 500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Database is down' } });
    const toggle = await screen.findByRole('switch', { name: 'Save history' });
    await user.click(toggle);
    expect(await screen.findByText('Database is down')).toBeInTheDocument();
    await waitFor(() => expect(store.getState().settings.privacy.saveHistory).toBe(true));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('exports my data as a JSON download', async () => {
    const api = withHistory();
    const created: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (b: Blob) => (created.push(b), 'blob:export') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = renderApp('/settings?tab=privacy', { api });
    await user.click(await screen.findByRole('button', { name: /Export my data/ }));
    expect(await screen.findByText('Your data was downloaded.')).toBeInTheDocument();
    expect(clicked).toHaveBeenCalled();
    const data = JSON.parse(await created[0]!.text());
    expect(data.account.email).toBe('asha@example.com');
    expect(data.history).toHaveLength(4);
    expect(JSON.stringify(data)).not.toContain('Sup3rSecret');
    clicked.mockRestore();
  });

  it('resets settings after confirmation', async () => {
    const { user, store } = renderApp('/settings?tab=privacy');
    await user.click(await screen.findByRole('switch', { name: 'Save history' }));
    expect(store.getState().settings.privacy.saveHistory).toBe(false);
    await user.click(screen.getByRole('button', { name: /Reset all settings/ }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(store.getState().settings.privacy.saveHistory).toBe(true));
    expect(await screen.findByText('Settings reset')).toBeInTheDocument();
  });
});

describe('Screen assistant', () => {
  it('asks for consent, then captures only via the user-chosen source, and stops cleanly', async () => {
    const stopTrack = vi.fn();
    const track = { stop: stopTrack, enabled: true, addEventListener: vi.fn() };
    const fakeStream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const getDisplayMedia = vi.fn(async () => fakeStream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    // jsdom's <video> has no srcObject setter
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, set() {}, get: () => null });

    const { user, store, api } = renderApp('/assistant');
    await user.click(await screen.findByRole('button', { name: /^Start$/ }));
    expect(await screen.findByRole('dialog', { name: /Allow screen reading/ })).toBeInTheDocument();
    expect(getDisplayMedia).not.toHaveBeenCalled(); // nothing before consent

    await user.click(screen.getByRole('button', { name: 'Allow and choose screen' }));
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.permissions.screenCapture).toBe(true);
    await waitFor(() => expect([...api.users.values()][0]!.settings.permissions.screenCapture).toBe(true)); // consent saved
    expect(await screen.findByText('Screen capture on')).toBeInTheDocument(); // visible indicator

    await user.click(screen.getByRole('button', { name: /Pause/ }));
    expect(track.enabled).toBe(false);
    expect(screen.getByText('Screen capture paused')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Stop/ }));
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.queryByText(/Screen capture (on|paused)/)).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('answers typed questions', async () => {
    const { user } = renderApp('/assistant');

    await user.type(await screen.findByLabelText('Question'), 'What is middleware in Express?');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    expect(await screen.findByText('Direct answer to: What is middleware in Express?')).toBeInTheDocument();
  });

  it('answers any question through the AI from the voice page', async () => {
    const { user } = renderApp('/voice');
    await user.type(await screen.findByLabelText('Question'), 'Explain WebAssembly');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    expect(await screen.findByText('Direct answer to: Explain WebAssembly')).toBeInTheDocument();
  });
});
