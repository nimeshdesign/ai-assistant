import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from './fakeApi';
import { renderApp } from './utils';

describe('App shell', () => {
  it('renders navigation and the API status', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    const nav = screen.getByRole('complementary', { name: 'Primary' });
    for (const label of ['Dashboard', 'Practice', 'Mock Interview', 'Screen Assistant', 'Voice Assistant', 'History', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(await screen.findByText('API online')).toBeInTheDocument();
  });

  it('shows offline state when the API is unreachable', async () => {
    renderApp('/', {
      wrapFetch: (real) => async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith('/health')) throw new TypeError('Failed to fetch');
        return real(input, init);
      },
    });
    expect(await screen.findByText('API offline')).toBeInTheDocument();
  });

  it('navigates between modules (lazy-loaded)', async () => {
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'History' }));
    expect(router.state.location.pathname).toBe('/history');
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('switches to dark theme and persists the choice', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Change theme' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Dark/ }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('aia.theme')).toBe('dark');
  });

  it('opens the command menu with Ctrl+K and navigates', async () => {
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' });
    await user.type(within(dialog).getByRole('combobox'), 'settings');
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/settings');
  });
});

describe('Dashboard', () => {
  it('shows real stats, the local time zone and recommendations', async () => {
    const api = createFakeApi();
    const asha = api.seedSignedInUser();
    api.seedHistory(asha, [{ questionText: 'What is a closure?' }, { questionText: 'What is hoisting?' }, { questionText: 'Explain CSS grid' }]);
    renderApp('/', { api });
    expect(await screen.findByText('3 this week')).toBeInTheDocument();
    expect(screen.getByText('1 day')).toBeInTheDocument(); // practised today (singular)
    expect(screen.getByRole('link', { name: /What is a closure in JavaScript/ })).toBeInTheDocument();
    expect(screen.queryByText(/Sample/)).not.toBeInTheDocument();
    // Weeks are bucketed in the browser's time zone.
    const call = api.calls.find((c) => c.path === '/dashboard/summary');
    expect(call).toBeDefined();
    // Accessible data table behind the chart; with nothing scored yet it shows activity.
    expect(screen.getByRole('table', { name: 'Weekly learning progress' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Questions' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows empty states for a brand-new account', async () => {
    renderApp('/');
    expect(await screen.findByText('0 this week')).toBeInTheDocument();
    expect(screen.getByText('0 days')).toBeInTheDocument();
  });

  it('greets the signed-in user by first name', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back, Asha' })).toBeInTheDocument();
  });
});
