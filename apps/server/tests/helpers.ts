import request from 'supertest';
import { createApp, type AppOptions } from '../src/app.js';

export const PASSWORD = 'Sup3rSecret!';

/** A supertest agent keeps cookies between requests, like a browser. */
export function makeClient(opts: AppOptions = {}) {
  return request.agent(createApp(opts));
}

export async function registerUser(
  agent: ReturnType<typeof makeClient>,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const body = { name: 'Asha Mehta', email: 'asha@example.com', password: PASSWORD, ...overrides };
  const res = await agent.post('/api/v1/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken as string, user: res.body.data.user, res };
}

export function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('aia_rt='));
}

export const csrf = { 'X-Requested-With': 'fetch' };
