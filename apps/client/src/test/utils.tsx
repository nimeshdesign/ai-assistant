import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { makeStore, type RootState } from '@/store';
import { routes } from '@/router';
import { createFakeApi, type FakeApi } from './fakeApi';

/**
 * Render the full app (auth bootstrap + shell + routes) at a path, backed by an in-memory
 * fake API. By default the browser already holds a valid refresh cookie, so the app
 * restores the session on load exactly like a returning user.
 */
export function renderApp(
  path = '/',
  {
    signedIn = true,
    api = createFakeApi(),
    preloadedState,
    wrapFetch,
  }: {
    signedIn?: boolean;
    api?: FakeApi;
    preloadedState?: Partial<RootState>;
    /** Intercept requests before they reach the fake API (e.g. to simulate network errors). */
    wrapFetch?: (fetchImpl: FakeApi['fetch']) => FakeApi['fetch'];
  } = {},
) {
  if (signedIn && api.users.size === 0) api.seedSignedInUser();
  vi.stubGlobal('fetch', vi.fn(wrapFetch ? wrapFetch(api.fetch) : api.fetch));

  const user = userEvent.setup();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const store = makeStore(preloadedState);
  const utils = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...utils, user, router, store, api };
}
