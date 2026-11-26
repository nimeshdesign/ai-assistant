import { API_PREFIX } from '@aia/shared';

/** Resolve a relative API path (e.g. "/api/v1") against the current page origin. */
function resolveApiUrl(raw: string): string {
  if (/^https?:\/\//.test(raw)) return raw;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin.startsWith('http') ? new URL(raw, origin).toString().replace(/\/$/, '') : raw;
}

export const config = {
  apiUrl: resolveApiUrl((import.meta.env.VITE_API_URL as string | undefined) || API_PREFIX),
} as const;
