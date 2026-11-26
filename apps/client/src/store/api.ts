import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { ApiError, AuthResponse, HealthStatus } from '@aia/shared';
import { config } from '@/lib/config';
import { credentialsReceived, signedOut } from './authSlice';

interface StateWithAuth {
  auth: { accessToken: string | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: config.apiUrl,
  credentials: 'include', // send the httpOnly refresh cookie to /auth/*
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as StateWithAuth).auth.accessToken;
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
    headers.set('x-requested-with', 'fetch'); // required by cookie-authenticated endpoints (CSRF)
    return headers;
  },
});

/**
 * Unwrap `{ success, data }` so endpoints receive the payload directly.
 * Paginated lists (`{ success, data, meta }`) arrive as `{ items, meta }`.
 */
const unwrappingBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  if (result.data && typeof result.data === 'object' && 'success' in result.data) {
    const body = result.data as { data?: unknown; meta?: unknown };
    return { ...result, data: body.meta ? { items: body.data, meta: body.meta } : body.data };
  }
  return result;
};

// One refresh at a time: concurrent 401s wait for the same refresh instead of racing
// (racing would present an already-rotated token and trip reuse detection).
let refreshing: Promise<boolean> | null = null;

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const url = typeof args === 'string' ? args : args.url;
  let result = await unwrappingBaseQuery(args, api, extra);

  if (result.error?.status === 401 && !NO_REFRESH.includes(url)) {
    refreshing ??= (async () => {
      const r = await unwrappingBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extra);
      if (r.data) {
        api.dispatch(credentialsReceived(r.data as AuthResponse));
        return true;
      }
      api.dispatch(signedOut());
      return false;
    })().finally(() => {
      refreshing = null;
    });
    if (await refreshing) result = await unwrappingBaseQuery(args, api, extra);
  }
  return result;
};

/**
 * Single RTK Query API slice. Feature endpoints are added with `api.injectEndpoints()`
 * (see authApi.ts, questionsApi.ts, aiApi.ts, mockApi.ts and historyApi.ts).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Me', 'Profile', 'Settings', 'Sessions', 'Categories', 'Questions', 'History', 'MockInterview', 'Dashboard'],
  endpoints: (build) => ({
    getHealth: build.query<HealthStatus, void>({ query: () => '/health' }),
  }),
});

export const { useGetHealthQuery } = api;

/** Turn any RTK Query / fetch error into a user-facing message. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback;
  const e = error as FetchBaseQueryError;
  if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection and try again.';
  const body = (e as { data?: unknown }).data as ApiError | undefined;
  return body?.error?.message ?? fallback;
}

/** Field-level validation errors from a 422 response, keyed by field path. */
export function fieldErrors(error: unknown): Record<string, string> {
  const details = ((error as { data?: ApiError })?.data?.error?.details ?? []) as { path: string; message: string }[];
  return Array.isArray(details) ? Object.fromEntries(details.map((d) => [d.path, d.message])) : {};
}

export function errorCode(error: unknown): string | undefined {
  return ((error as { data?: ApiError })?.data as ApiError | undefined)?.error?.code;
}
