import { describe, expect, it } from 'vitest';
import {
  AuthSessionModel,
  InterviewSessionModel,
  UserAnswerModel,
  UserModel,
  UserProfileModel,
  UserSettingsModel,
} from '../src/models/index.js';
import { PASSWORD, csrf, makeClient, registerUser } from './helpers.js';

async function signedIn(email = 'asha@example.com') {
  const agent = makeClient();
  const { token, user } = await registerUser(agent, { email });
  const auth = { Authorization: `Bearer ${token}` };
  return { agent, auth, user };
}

describe('profile', () => {
  it('returns defaults, then applies partial updates', async () => {
    const { agent, auth } = await signedIn();
    const initial = await agent.get('/api/v1/users/me/profile').set(auth);
    expect(initial.body.data).toEqual({
      name: 'Asha Mehta',
      headline: '',
      targetRole: '',
      experienceLevel: 'junior',
      yearsOfExperience: 0,
      preferredLanguages: [],
    });

    const res = await agent
      .patch('/api/v1/users/me/profile')
      .set(auth)
      .send({ name: 'Asha M', targetRole: 'Frontend Developer', experienceLevel: 'mid', yearsOfExperience: 3, preferredLanguages: ['TypeScript'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Asha M', targetRole: 'Frontend Developer', experienceLevel: 'mid', yearsOfExperience: 3 });
    expect((await agent.get('/api/v1/auth/me').set(auth)).body.data.name).toBe('Asha M');
  });

  it.each([
    [{ experienceLevel: 'wizard' }],
    [{ yearsOfExperience: -1 }],
    [{ preferredLanguages: ['Go', 'go'] }],
    [{ email: 'hijack@example.com' }], // unknown fields are rejected, not silently ignored
  ])('rejects invalid profile updates (%o)', async (body) => {
    const { agent, auth } = await signedIn();
    const res = await agent.patch('/api/v1/users/me/profile').set(auth).send(body);
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    expect((await makeClient().get('/api/v1/users/me/profile')).status).toBe(401);
  });
});

describe('settings', () => {
  it('returns defaults with privacy-first values', async () => {
    const { agent, auth } = await signedIn();
    const res = await agent.get('/api/v1/settings').set(auth);
    expect(res.body.data.privacy).toEqual({ saveHistory: true, retentionDays: 90, storeRawAudio: false, storeScreenshots: false });
    expect(res.body.data.permissions).toEqual({ screenCapture: false, microphone: false });
    expect(res.body.data.answer.length).toBe('normal');
  });

  it('patches one field without wiping its siblings', async () => {
    const { agent, auth } = await signedIn();
    const res = await agent.patch('/api/v1/settings/preferences').set(auth).send({ theme: 'dark', answer: { length: 'short' } });
    expect(res.status).toBe(200);
    expect(res.body.data.theme).toBe('dark');
    expect(res.body.data.answer).toEqual({ style: 'conversational', length: 'short', includeCodeExamples: true, codeLanguage: 'javascript' });

    await agent.patch('/api/v1/settings/voice').set(auth).send({ rate: 1.25 });
    await agent.patch('/api/v1/settings/privacy').set(auth).send({ retentionDays: 30 });
    await agent.patch('/api/v1/settings/permissions').set(auth).send({ microphone: true });
    const after = (await agent.get('/api/v1/settings').set(auth)).body.data;
    expect(after.voice.rate).toBe(1.25);
    expect(after.voice.pitch).toBe(1);
    expect(after.privacy.retentionDays).toBe(30);
    expect(after.permissions.microphone).toBe(true);
    expect(after.answer.length).toBe('short');
  });

  it.each([
    ['/voice', { rate: 5 }],
    ['/privacy', { retentionDays: -1 }],
    ['/preferences', { answer: { length: 'huge' } }],
    ['/preferences', { userId: 'someone-else' }],
    ['/permissions', { camera: true }],
  ])('rejects invalid values on %s', async (path, body) => {
    const { agent, auth } = await signedIn();
    expect((await agent.patch(`/api/v1/settings${path}`).set(auth).send(body)).status).toBe(422);
  });

  it('keeps users isolated from each other', async () => {
    const a = await signedIn('a@example.com');
    const b = await signedIn('b@example.com');
    await a.agent.patch('/api/v1/settings/preferences').set(a.auth).send({ theme: 'dark' });
    expect((await b.agent.get('/api/v1/settings').set(b.auth)).body.data.theme).toBe('system');
  });
});

describe('password change', () => {
  it('requires the current password and signs out other devices only', async () => {
    const { agent, auth } = await signedIn();
    const other = makeClient();
    await other.post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });

    const wrong = await agent.patch('/api/v1/users/me/password').set(auth).send({ currentPassword: 'Nope1234', newPassword: 'N3wPassword!' });
    expect(wrong.status).toBe(422);

    const same = await agent.patch('/api/v1/users/me/password').set(auth).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(422);

    const ok = await agent.patch('/api/v1/users/me/password').set(auth).send({ currentPassword: PASSWORD, newPassword: 'N3wPassword!' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.otherSessionsSignedOut).toBe(1);

    expect((await other.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401); // other device out
    expect((await agent.get('/api/v1/auth/me').set(auth)).status).toBe(200); // this device still in
    const login = await makeClient().post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'N3wPassword!' });
    expect(login.status).toBe(200);
  });
});

describe('signed-in devices', () => {
  it('lists sessions and revokes another one', async () => {
    const { agent, auth } = await signedIn();
    const phone = makeClient();
    await phone.post('/api/v1/auth/login').set('User-Agent', 'PhoneBrowser/1.0').send({ email: 'asha@example.com', password: PASSWORD });

    const list = (await agent.get('/api/v1/users/me/sessions').set(auth)).body.data;
    expect(list).toHaveLength(2);
    const current = list.find((s: { current: boolean }) => s.current);
    const phoneSession = list.find((s: { userAgent: string }) => s.userAgent === 'PhoneBrowser/1.0');
    expect(current).toBeTruthy();

    expect((await agent.delete(`/api/v1/users/me/sessions/${current.id}`).set(auth)).status).toBe(400);
    expect((await agent.delete(`/api/v1/users/me/sessions/${phoneSession.id}`).set(auth)).status).toBe(204);
    expect((await phone.post('/api/v1/auth/refresh').set(csrf)).status).toBe(401);
  });

  it("cannot revoke another user's session", async () => {
    const a = await signedIn('a@example.com');
    const b = await signedIn('b@example.com');
    const bSession = (await b.agent.get('/api/v1/users/me/sessions').set(b.auth)).body.data[0];
    expect((await a.agent.delete(`/api/v1/users/me/sessions/${bSession.id}`).set(a.auth)).status).toBe(404);
  });
});

describe('account deletion', () => {
  it('requires the password, then removes the user and all their data', async () => {
    const { agent, auth, user } = await signedIn();
    const keep = await signedIn('keep@example.com');
    const session = await InterviewSessionModel.create({ userId: user.id, type: 'practice' });
    await UserAnswerModel.create({ userId: user.id, sessionId: session._id, sessionType: 'practice', questionText: 'What is a closure?' });

    expect((await agent.delete('/api/v1/users/me').set(auth).send({ password: 'wrong' })).status).toBe(422);
    expect(await UserModel.countDocuments({ _id: user.id })).toBe(1);

    expect((await agent.delete('/api/v1/users/me').set(auth).send({ password: PASSWORD })).status).toBe(204);
    for (const model of [UserProfileModel, UserSettingsModel, AuthSessionModel, InterviewSessionModel, UserAnswerModel]) {
      expect(await (model as typeof UserProfileModel).countDocuments({ userId: user.id })).toBe(0);
    }
    expect(await UserModel.countDocuments({ _id: user.id })).toBe(0);
    expect(await UserModel.countDocuments({ _id: keep.user.id })).toBe(1); // others untouched
    expect((await agent.get('/api/v1/auth/me').set(auth)).status).toBe(401);
  });
});
