import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { safeNext } from '@/features/auth/guards';
import { describeDevice } from '@/features/settings/AccountSettings';
import { createFakeApi, TEST_PASSWORD } from './fakeApi';
import { renderApp } from './utils';

const signedOutApp = (path: string) => {
  const api = createFakeApi();
  api.seedUser(); // account exists, but this browser has no session cookie
  return renderApp(path, { signedIn: false, api });
};

describe('route protection', () => {
  it('sends signed-out visitors to the login page', async () => {
    const { router } = signedOutApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('returns to the requested page after signing in', async () => {
    const { user, router } = signedOutApp('/history?type=voice');
    await screen.findByLabelText('Email');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/history?type=voice')}`);

    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/history');
  });

  it('ignores redirect targets outside the app (open-redirect protection)', () => {
    expect(safeNext('/settings?tab=account')).toBe('/settings?tab=account');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });

  it('keeps signed-in users away from the login page', async () => {
    const { router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('login', () => {
  it('validates on the client without calling the API', async () => {
    const { user, api } = signedOutApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/auth/login')).toBe(false);
  });

  it('shows a generic error for wrong credentials', async () => {
    const { user } = signedOutApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Wrong1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('can reveal the password', async () => {
    const { user } = signedOutApp('/login');
    const field = await screen.findByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});

describe('registration', () => {
  it('shows live password rules and creates the account', async () => {
    const { user, router, api } = renderApp('/register', { signedIn: false });
    await user.type(await screen.findByLabelText('Full name'), 'Ravi Kumar');
    await user.type(screen.getByLabelText('Email'), 'ravi@example.com');
    await user.type(screen.getByLabelText('Password'), 'abc');

    const rules = screen.getByRole('list', { name: 'Password requirements' });
    expect(within(rules).getByText(/At least 8 characters/)).toHaveTextContent('(not met)');
    expect(within(rules).getByText(/A letter/)).toHaveTextContent('(met)');

    await user.type(screen.getByLabelText('Password'), 'defgh1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back, Ravi' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect([...api.users.values()].map((u) => u.email)).toContain('ravi@example.com');
  });

  it('shows a field error when the email is already registered', async () => {
    const api = createFakeApi();
    api.seedUser();
    const { user } = renderApp('/register', { signedIn: false, api });
    await user.type(await screen.findByLabelText('Full name'), 'Asha Again');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Another123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
  });
});

describe('session handling', () => {
  it('restores the session from the refresh cookie on page load', async () => {
    const { api } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back, Asha' })).toBeInTheDocument();
    expect(api.calls[0]).toMatchObject({ method: 'POST', path: '/auth/refresh' });
  });

  it('refreshes an expired access token once and retries the request transparently', async () => {
    const { user, api } = renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    api.expireAccessTokens();
    const before = api.calls.filter((c) => c.path === '/auth/refresh').length;

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('tab', { name: /Account & security/ }));
    expect(await screen.findByText('This device')).toBeInTheDocument(); // sessions request succeeded after refresh

    const refreshes = api.calls.filter((c) => c.path === '/auth/refresh').length - before;
    expect(refreshes).toBe(1);
  });

  it('signs the user out when the session can no longer be refreshed', async () => {
    const { user, api, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    api.expireAccessTokens();
    // Revoke the session server-side (e.g. signed out from another device).
    await api.fetch('http://localhost/api/v1/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'fetch' } });

    // Load something not yet cached, so a request hits the 401 → refresh path.
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('tab', { name: /Account & security/ }));
    await screen.findByLabelText('Email');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('signs out from the user menu and clears account data', async () => {
    const { user, router, store, api } = renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    await user.click(screen.getByRole('button', { name: 'Account menu for Asha Mehta' }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

    await screen.findByLabelText('Email');
    expect(router.state.location.pathname).toBe('/login');
    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, accessToken: null });
    expect(store.getState().settings.profile.name).toBe('');
    expect(api.hasCookie).toBe(false);
  });
});

describe('account & security', () => {
  it('saves the theme to the account', async () => {
    const { user, api } = renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    await user.click(screen.getByRole('button', { name: 'Change theme' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Dark/ }));
    await waitFor(() => expect([...api.users.values()][0]!.settings.theme).toBe('dark'));
  });

  it("applies the account's saved theme after sign-in", async () => {
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.theme = 'dark';
    renderApp('/', { api });
    await screen.findByRole('heading', { name: 'Welcome back, Asha' });
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('changes the password', async () => {
    const { user, api } = renderApp('/settings?tab=account');
    await user.type(await screen.findByLabelText('Current password'), 'wrong-one');
    await user.type(screen.getByLabelText('New password'), 'Brand1New');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Current password'));
    await user.type(screen.getByLabelText('Current password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect([...api.users.values()][0]!.password).toBe('Brand1New');
  });

  it('deletes the account after password confirmation', async () => {
    const { user, api, router } = renderApp('/settings?tab=account');
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(dialog).getByLabelText('Password'), 'nope');
    await user.click(within(dialog).getByRole('button', { name: /Delete account permanently/ }));
    expect(await within(dialog).findByText('Password is incorrect')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Password'));
    await user.type(within(dialog).getByLabelText('Password'), TEST_PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: /Delete account permanently/ }));
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(router.state.location.pathname).toBe('/register');
    expect(api.users.size).toBe(0);
  });

  it('describes devices from their user agent', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/140 Safari/537')).toEqual({ label: 'Chrome on Windows', mobile: false });
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18) Mobile Safari/604')).toEqual({ label: 'Safari on iOS', mobile: true });
    expect(describeDevice('')).toEqual({ label: 'Unknown device', mobile: false });
  });
});
