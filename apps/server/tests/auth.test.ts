import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AuthSessionModel, UserModel, UserProfileModel, UserSettingsModel } from '../src/models/index.js';
import { hashPassword, needsRehash, verifyPassword } from '../src/utils/password.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { PASSWORD, csrf, makeClient, refreshCookie, registerUser } from './helpers.js';

describe('password hashing', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse 1');
    const b = await hashPassword('correct horse 1');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('correct horse 1', a)).toBe(true);
    expect(await verifyPassword('wrong horse 1', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(needsRehash(a)).toBe(false);
    expect(needsRehash('scrypt$16384$8$1$a$b')).toBe(true);
  });
});

describe('POST /auth/register', () => {
  it('creates the user with profile + settings, returns an access token and sets an httpOnly refresh cookie', async () => {
    const agent = makeClient();
    const { res, user, token } = await registerUser(agent, { email: '  Asha@Example.COM ' });

    expect(user).toMatchObject({ email: 'asha@example.com', name: 'Asha Mehta', role: 'user' });
    expect(user).not.toHaveProperty('passwordHash');
    expect(token.split('.')).toHaveLength(3);
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const stored = await UserModel.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^scrypt\$/);
    expect(stored!.passwordHash).not.toContain(PASSWORD);
    expect(await UserProfileModel.countDocuments({ userId: stored!._id })).toBe(1);
    expect(await UserSettingsModel.countDocuments({ userId: stored!._id })).toBe(1);

    // Only a hash of the refresh token is stored.
    const session = await AuthSessionModel.findOne({ userId: stored!._id });
    const rawToken = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
    expect(session!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session!.tokenHash).not.toBe(rawToken);
  });

  it('rejects duplicate emails with 409', async () => {
    const agent = makeClient();
    await registerUser(agent);
    const res = await agent.post('/api/v1/auth/register').send({ name: 'Other', email: 'ASHA@example.com', password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it.each([
    [{ name: 'A', email: 'a@b.co', password: PASSWORD }, 'name'],
    [{ name: 'Asha', email: 'not-an-email', password: PASSWORD }, 'email'],
    [{ name: 'Asha', email: 'a@b.co', password: 'short1' }, 'password'],
    [{ name: 'Asha', email: 'a@b.co', password: 'nodigitshere' }, 'password'],
    [{ name: 'Asha', email: 'a@b.co', password: PASSWORD, role: 'admin' }, ''],
  ])('validates input (%o)', async (body, path) => {
    const res = await makeClient().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d: { path: string }) => d.path === path)).toBe(true);
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    await registerUser(makeClient());
    const agent = makeClient();
    const res = await agent.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(refreshCookie(res)).toBeTruthy();
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    await registerUser(makeClient());
    const wrong = await makeClient().post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'Wrong123!' });
    const unknown = await makeClient().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong123!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    expect(unknown.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  it('blocks deactivated accounts', async () => {
    await registerUser(makeClient());
    await UserModel.updateOne({ email: 'asha@example.com' }, { isActive: false });
    const res = await makeClient().post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rate-limits repeated login attempts', async () => {
    const agent = makeClient({ rateLimits: true });
    let last;
    for (let i = 0; i < 11; i++) {
      last = await agent.post('/api/v1/auth/login').send({ email: 'x@example.com', password: 'Wrong123!' });
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('access tokens & protected routes', () => {
  it('GET /auth/me requires a valid bearer token', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);

    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await agent.get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt')).body.error.code).toBe('INVALID_TOKEN');

    const ok = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.email).toBe('asha@example.com');
  });

  it('rejects tokens signed with another key or the "none" algorithm', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);
    const [header, payload] = token.split('.');
    const forgedNone = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    const tampered = `${header}.${payload}.${'A'.repeat(43)}`;
    for (const t of [forgedNone, tampered]) {
      const res = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(401);
    }
  });

  it('reports expired tokens distinctly so the client knows to refresh', async () => {
    const agent = makeClient();
    const { user } = await registerUser(agent);
    const session = await AuthSessionModel.findOne({});
    const { token } = await signAccessToken({ sub: user.id, role: 'user', sid: String(session!._id) });
    vi.useFakeTimers({ toFake: ['Date'] }); // only the clock; timers keep running
    vi.setSystemTime(Date.now() + 16 * 60 * 1000); // 16 minutes later
    try {
      const res = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('refresh token rotation', () => {
  it('requires the CSRF header', async () => {
    const agent = makeClient();
    await registerUser(agent);
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(403);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const agent = makeClient();
    const { res: first } = await registerUser(agent);
    const res = await agent.post('/api/v1/auth/refresh').set(csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(refreshCookie(res)).not.toBe(refreshCookie(first));
    expect(await AuthSessionModel.countDocuments()).toBe(1); // same session, new token
  });

  it('detects reuse of a rotated token and revokes every session', async () => {
    const agent = makeClient();
    const { res: first } = await registerUser(agent);
    const stolen = refreshCookie(first)!.split(';')[0]!;

    expect((await agent.post('/api/v1/auth/refresh').set(csrf)).status).toBe(200); // legit rotation

    // Attacker replays the old token.
    const replay = await request(createApp()).post('/api/v1/auth/refresh').set(csrf).set('Cookie', stolen);
    expect(replay.status).toBe(401);
    expect(await AuthSessionModel.countDocuments({ revokedReason: 'reuse_detected' })).toBe(1);

    // The legitimate user is signed out too, and must log in again.
    expect((await agent.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401);
  });

  it('returns 401 without a cookie', async () => {
    const res = await makeClient().post('/api/v1/auth/refresh').set(csrf);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_SESSION');
  });
});

describe('logout', () => {
  it('revokes the session: refresh fails and existing access tokens stop working', async () => {
    const agent = makeClient();
    const { token } = await registerUser(agent);
    const res = await agent.post('/api/v1/auth/logout').set(csrf);
    expect(res.status).toBe(204);
    expect(refreshCookie(res)).toMatch(/aia_rt=;/);
    expect((await agent.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401);
    const me = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.error.code).toBe('SESSION_REVOKED');
  });

  it('logout-all signs out every device', async () => {
    const laptop = makeClient();
    const { token } = await registerUser(laptop);
    const phone = makeClient();
    await phone.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });

    expect((await laptop.post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${token}`)).status).toBe(204);
    expect((await phone.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401);
    expect((await laptop.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401);
  });
});
