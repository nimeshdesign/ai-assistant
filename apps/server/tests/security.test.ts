import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAiProvider } from '../src/services/ai/ai.service.js';
import { FakeAiProvider, defaultResponders } from './fakeAi.js';
import { makeClient, registerUser } from './helpers.js';

const ID = '0123456789abcdef01234567';

/** Every endpoint that touches user data. Each must refuse requests without a valid access token. */
const PROTECTED: [method: 'get' | 'post' | 'patch' | 'delete', path: string][] = [
  ['get', '/auth/me'],
  ['get', '/users/me/profile'],
  ['patch', '/users/me/profile'],
  ['patch', '/users/me/password'],
  ['delete', '/users/me'],
  ['get', '/users/me/sessions'],
  ['delete', `/users/me/sessions/${ID}`],
  ['get', '/users/me/export'],
  ['get', '/settings'],
  ['patch', '/settings/preferences'],
  ['patch', '/settings/privacy'],
  ['patch', '/settings/permissions'],
  ['get', '/categories'],
  ['get', '/questions'],
  ['post', '/questions'],
  ['delete', `/questions/${ID}`],
  ['post', '/questions/generate'],
  ['get', '/ai/status'],
  ['post', '/ai/answer'],
  ['post', '/ai/explain'],
  ['post', '/ai/analyze-code'],
  ['post', '/ai/detect-question'],
  ['post', '/ai/transcribe'],
  ['post', '/ai/speak'],
  ['post', '/ai/evaluate'],
  ['get', '/mock-interviews'],
  ['post', '/mock-interviews'],
  ['get', `/mock-interviews/${ID}`],
  ['post', `/mock-interviews/${ID}/answers`],
  ['post', `/mock-interviews/${ID}/skip`],
  ['post', `/mock-interviews/${ID}/complete`],
  ['get', `/mock-interviews/${ID}/report`],
  ['delete', `/mock-interviews/${ID}`],
  ['get', '/history'],
  ['patch', `/history/${ID}`],
  ['delete', `/history/${ID}`],
  ['delete', '/history'],
  ['get', '/dashboard/summary'],
];

let fake: FakeAiProvider;
beforeEach(() => {
  fake = new FakeAiProvider(defaultResponders);
  setAiProvider(fake);
});
afterEach(() => setAiProvider(null));

describe('authentication on every data endpoint', () => {
  it.each(PROTECTED)('%s %s → 401 without a token, and with a forged one', async (method, path) => {
    const client = makeClient();
    const none = await client[method](`/api/v1${path}`).send({});
    expect(none.status).toBe(401);
    const forged = await client[method](`/api/v1${path}`).set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').send({});
    expect(forged.status).toBe(401);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('HTTP hardening', () => {
  it('never lets API responses be cached', async () => {
    const res = await makeClient().get('/api/v1/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('keeps sensible security headers', async () => {
    const res = await makeClient().get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('only echoes well-formed request ids', async () => {
    const good = await makeClient().get('/api/v1/health').set('x-request-id', 'trace-123_abc');
    expect(good.headers['x-request-id']).toBe('trace-123_abc');
    const bad = await makeClient().get('/api/v1/health').set('x-request-id', 'a'.repeat(300));
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects oversized JSON bodies', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);
    const res = await agent
      .post('/api/v1/ai/answer')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ question: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects MongoDB operators smuggled into bodies and queries', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);
    const auth = { Authorization: `Bearer ${token}` };
    // Login with an operator instead of a password must not match any user.
    const login = await makeClient().post('/api/v1/auth/login').send({ email: 'asha@example.com', password: { $ne: 'x' } });
    expect(login.status).toBe(422);
    expect((await agent.patch(`/api/v1/history/${ID}`).set(auth).send({ isBookmarked: { $ne: false } })).status).toBe(422);
    expect((await agent.get('/api/v1/mock-interviews?status[$ne]=x').set(auth)).status).toBe(422);
    expect((await agent.post('/api/v1/mock-interviews').set(auth).send({ jobRole: 'Dev', experienceLevel: 'mid', focusAreas: [{ $gt: '' }] })).status).toBe(422);
  });

  it('returns 404 (not 500) for malformed ids', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);
    const auth = { Authorization: `Bearer ${token}` };
    for (const path of ['/mock-interviews/not-an-id', '/mock-interviews/not-an-id/report']) {
      expect((await agent.get(`/api/v1${path}`).set(auth)).status).toBe(404);
    }
    expect((await agent.delete('/api/v1/history/not-an-id').set(auth)).status).toBe(404);
  });

  it('never leaks stack traces or internals in errors', async () => {
    const res = await makeClient().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"broken"');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|SyntaxError: Unexpected/);
  });
});
