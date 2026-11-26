import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryItem, MockInterviewState } from '@aia/shared';
import { setAiProvider } from '../src/services/ai/ai.service.js';
import { seedDatabase } from '../src/seed/seed.js';
import {
  InterviewQuestionModel,
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  UserAnswerModel,
} from '../src/models/index.js';
import { FakeAiProvider, defaultResponders } from './fakeAi.js';
import { makeClient, registerUser } from './helpers.js';

async function signedIn(email = 'asha@example.com') {
  const agent = makeClient();
  const { token, user } = await registerUser(agent, { email });
  return { agent, auth: { Authorization: `Bearer ${token}` }, userId: user.id as string };
}
type S = Awaited<ReturnType<typeof signedIn>>;

const ask = (s: S, question: string, extra: Record<string, unknown> = { source: 'assistant' }) =>
  s.agent.post('/api/v1/ai/answer').set(s.auth).send({ question, ...extra });
const history = async (s: S, query = '') => {
  const res = await s.agent.get(`/api/v1/history${query}`).set(s.auth);
  expect(res.status).toBe(200);
  return res.body as { data: HistoryItem[]; meta: { total: number; totalPages: number; page: number } };
};

async function finishedMock(s: S) {
  const start = await s.agent
    .post('/api/v1/mock-interviews')
    .set(s.auth)
    .send({ jobRole: 'Frontend Developer', experienceLevel: 'junior', focusAreas: ['javascript'], questionCount: 3 });
  const mock = start.body.data as MockInterviewState;
  await s.agent
    .post(`/api/v1/mock-interviews/${mock.id}/answers`)
    .set(s.auth)
    .send({ questionId: mock.questions[0]!.id, response: 'A closure keeps access to the variables around it.' });
  await s.agent.post(`/api/v1/mock-interviews/${mock.id}/complete`).set(s.auth);
  return mock;
}

beforeEach(async () => {
  setAiProvider(new FakeAiProvider(defaultResponders));
  await seedDatabase();
});
afterEach(() => setAiProvider(null));

describe('recording answers', () => {
  it('saves answers to history only when the page says where they were asked', async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?', {}); // e.g. an internal call: not recorded
    expect((await history(s)).meta.total).toBe(0);

    const q = await InterviewQuestionModel.findOne({ question: 'What is a closure in JavaScript?' }).lean();
    expect((await ask(s, q!.question, { source: 'practice', questionId: String(q!._id) })).status).toBe(200);
    expect((await ask(s, 'Explain the event loop', { source: 'voice', inputMode: 'voice' })).status).toBe(200);

    const { data } = await history(s);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ sessionType: 'voice', inputMode: 'voice', questionText: 'Explain the event loop', isBookmarked: false });
    expect(data[1]).toMatchObject({ sessionType: 'practice', categorySlug: 'javascript', inputMode: 'text' });
    expect(data[1]!.answer).toMatchObject({ directAnswer: expect.stringContaining('closure'), interviewReadyAnswer: expect.any(String) });
  });

  it('groups a run of answers into one session and does not duplicate repeated questions', async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?');
    await ask(s, 'What is a closure?', { source: 'assistant', regenerate: true });
    await ask(s, 'What is hoisting?');
    await ask(s, 'What is a promise?', { source: 'practice' });
    expect((await history(s)).meta.total).toBe(3);
    const sessions = await InterviewSessionModel.find({ userId: s.userId }).sort({ type: 1 }).lean();
    expect(sessions.map((x) => [x.type, x.questionCount])).toEqual([
      ['assistant', 2],
      ['practice', 1],
    ]);
  });

  it('saves nothing when "Save history" is off', async () => {
    const s = await signedIn();
    await s.agent.patch('/api/v1/settings/privacy').set(s.auth).send({ saveHistory: false });
    expect((await ask(s, 'What is a closure?')).status).toBe(200);
    expect(await UserAnswerModel.countDocuments({ userId: s.userId })).toBe(0);
    expect(await InterviewSessionModel.countDocuments({ userId: s.userId })).toBe(0);
  });

  it('does not attach other users’ private questions', async () => {
    const ravi = await signedIn('ravi@example.com');
    const created = await ravi.agent
      .post('/api/v1/questions')
      .set(ravi.auth)
      .send({ categorySlug: 'react', question: 'Ravi private: how do portals work?', difficulty: 'medium', type: 'conceptual', tags: [] });
    const asha = await signedIn();
    await ask(asha, 'How do portals work?', { source: 'practice', questionId: created.body.data.id });
    const [item] = (await history(asha)).data;
    expect(item!.categorySlug).toBeUndefined();
  });
});

describe('GET /history', () => {
  it('searches literally, filters by type and bookmark, and paginates', async () => {
    const s = await signedIn();
    for (const q of ['What is C++ used for?', 'Explain closures', 'Explain hoisting', 'What is a React hook?']) await ask(s, q);
    await ask(s, 'Explain the event loop', { source: 'voice' });

    expect((await history(s, '?q=c%2B%2B')).data.map((h) => h.questionText)).toEqual(['What is C++ used for?']);
    expect((await history(s, '?q=.*')).meta.total).toBe(0); // regex characters are literal
    expect((await history(s, '?q=EXPLAIN')).meta.total).toBe(3);
    expect((await history(s, '?type=voice')).meta.total).toBe(1);

    const page = await history(s, '?limit=2&page=2');
    expect(page.data).toHaveLength(2);
    expect(page.meta).toMatchObject({ total: 5, totalPages: 3, page: 2 });

    const target = (await history(s, '?q=hoisting')).data[0]!;
    const marked = await s.agent.patch(`/api/v1/history/${target.id}`).set(s.auth).send({ isBookmarked: true });
    expect(marked.body.data.isBookmarked).toBe(true);
    expect((await history(s, '?bookmarked=true')).data.map((h) => h.id)).toEqual([target.id]);
  });

  it('rejects unknown or operator-shaped query parameters', async () => {
    const s = await signedIn();
    expect((await s.agent.get('/api/v1/history?type=admin').set(s.auth)).status).toBe(422);
    expect((await s.agent.get('/api/v1/history?q[$ne]=x').set(s.auth)).status).toBe(422);
    expect((await s.agent.get('/api/v1/history?limit=1000').set(s.auth)).status).toBe(422);
  });

  it('includes mock-interview answers with their score, feedback and interview', async () => {
    const s = await signedIn();
    const mock = await finishedMock(s);
    const [item] = (await history(s, '?type=mock')).data;
    expect(item).toMatchObject({
      sessionType: 'mock',
      score: 70,
      feedback: 'Good start.',
      improvedAnswer: 'A closure is…',
      mockInterviewId: mock.id,
      userResponse: 'A closure keeps access to the variables around it.',
      categorySlug: 'javascript',
    });
  });
});

describe('deleting history', () => {
  it('deletes one entry, and its session once empty', async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?');
    const [item] = (await history(s)).data;
    expect((await s.agent.delete(`/api/v1/history/${item!.id}`).set(s.auth)).status).toBe(204);
    expect((await history(s)).meta.total).toBe(0);
    expect(await InterviewSessionModel.countDocuments({ userId: s.userId })).toBe(0);
    expect((await s.agent.delete(`/api/v1/history/${item!.id}`).set(s.auth)).status).toBe(404);
  });

  it("can't touch another user's entries", async () => {
    const asha = await signedIn();
    await ask(asha, 'What is a closure?');
    const [item] = (await history(asha)).data;
    const ravi = await signedIn('ravi@example.com');
    expect((await ravi.agent.patch(`/api/v1/history/${item!.id}`).set(ravi.auth).send({ isBookmarked: true })).status).toBe(404);
    expect((await ravi.agent.delete(`/api/v1/history/${item!.id}`).set(ravi.auth)).status).toBe(404);
    expect((await ravi.agent.delete('/api/v1/history').set(ravi.auth)).status).toBe(200);
    expect((await history(asha)).meta.total).toBe(1);
  });

  it('clears one type, or everything including mock interviews and reports', async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?');
    await finishedMock(s);
    const cleared = await s.agent.delete('/api/v1/history?type=assistant').set(s.auth);
    expect(cleared.body.data).toEqual({ deleted: 1 });
    expect((await history(s)).data.map((h) => h.sessionType)).toEqual(['mock']);

    await s.agent.delete('/api/v1/history').set(s.auth);
    expect((await history(s)).meta.total).toBe(0);
    expect(await MockInterviewModel.countDocuments({ userId: s.userId })).toBe(0);
    expect(await PerformanceReportModel.countDocuments({ userId: s.userId })).toBe(0);
    const profile = (await s.agent.get('/api/v1/dashboard/summary').set(s.auth)).body.data;
    expect(profile.totals).toMatchObject({ questionsPractised: 0, mockInterviewsCompleted: 0 });
  });
});

describe('retention and export', () => {
  it('re-applies a changed retention period to stored data', async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?');
    await finishedMock(s);
    expect((await s.agent.patch('/api/v1/settings/privacy').set(s.auth).send({ retentionDays: 7 })).status).toBe(200);
    const answer = await UserAnswerModel.findOne({ userId: s.userId }).lean();
    expect(answer!.expiresAt!.getTime() - (answer!.createdAt as Date).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const report = await PerformanceReportModel.findOne({ userId: s.userId }).lean();
    expect(report!.expiresAt!.getTime() - (report!.createdAt as Date).getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    expect((await s.agent.patch('/api/v1/settings/privacy').set(s.auth).send({ retentionDays: 0 })).status).toBe(200);
    for (const m of [UserAnswerModel, InterviewSessionModel, MockInterviewModel, PerformanceReportModel] as const) {
      expect(await (m as typeof UserAnswerModel).countDocuments({ userId: s.userId, expiresAt: { $exists: true } })).toBe(0);
    }
  });

  it("exports the user's own data without secrets", async () => {
    const s = await signedIn();
    await ask(s, 'What is a closure?');
    await finishedMock(s);
    const ravi = await signedIn('ravi@example.com');
    await ask(ravi, 'Ravi secret question?');

    const res = await s.agent.get('/api/v1/users/me/export').set(s.auth);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const data = res.body.data;
    expect(data.account.email).toBe('asha@example.com');
    expect(data.history).toHaveLength(2);
    expect(data.mockInterviews).toHaveLength(1);
    expect(data.reports).toHaveLength(1);
    expect(data.settings.privacy).toMatchObject({ saveHistory: true });
    const raw = JSON.stringify(data);
    expect(raw).not.toMatch(/passwordHash|tokenHash|scrypt|Ravi secret/);
  });
});
