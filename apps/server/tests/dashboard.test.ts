import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { escapeRegExp, localDay, localWeekStart, streakDays, weekLabel, type DashboardSummary, type MockInterviewState } from '@aia/shared';
import { setAiProvider } from '../src/services/ai/ai.service.js';
import { seedDatabase } from '../src/seed/seed.js';
import { UserAnswerModel } from '../src/models/index.js';
import { FakeAiProvider, defaultResponders } from './fakeAi.js';
import { makeClient, registerUser } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('date maths (user time zone)', () => {
  it('buckets days and Monday-based weeks in local time', () => {
    // 2026-11-23 is a Monday. 23:30 UTC on Sunday the 22nd is already Monday in India (+5:30).
    const late = new Date('2026-11-22T23:30:00Z');
    expect(localDay(late, 330) - localDay(late, 0)).toBe(1);
    expect(weekLabel(localWeekStart(late, 330), 330)).toBe('2026-11-23');
    expect(weekLabel(localWeekStart(late, 0), 0)).toBe('2026-11-16');
    expect(weekLabel(localWeekStart(late, -480), -480)).toBe('2026-11-16'); // Los Angeles
    expect(localWeekStart(late, 330).toISOString()).toBe('2026-11-22T18:30:00.000Z');
  });

  it('counts a streak ending today or yesterday', () => {
    const now = new Date('2026-11-26T10:00:00Z');
    const days = (...ago: number[]) => ago.map((d) => new Date(now.getTime() - d * DAY));
    expect(streakDays(days(0, 1, 2, 4), now, 0)).toBe(3);
    expect(streakDays(days(1, 2), now, 0)).toBe(2); // not practised yet today: still alive
    expect(streakDays(days(2, 3), now, 0)).toBe(0);
    expect(streakDays([], now, 0)).toBe(0);
  });

  it('escapes regex characters for literal search', () => {
    expect(new RegExp(escapeRegExp('C++ (a|b)?')).test('C++ (a|b)?')).toBe(true);
    expect(new RegExp(escapeRegExp('.*')).test('anything')).toBe(false);
  });
});

let fake: FakeAiProvider;
beforeEach(async () => {
  fake = new FakeAiProvider(defaultResponders);
  setAiProvider(fake);
  await seedDatabase();
});
afterEach(() => setAiProvider(null));

async function signedIn(email = 'asha@example.com') {
  const agent = makeClient();
  const { token, user } = await registerUser(agent, { email });
  return { agent, auth: { Authorization: `Bearer ${token}` }, userId: user.id as string };
}
type S = Awaited<ReturnType<typeof signedIn>>;
const summary = async (s: S, query = '') => {
  const res = await s.agent.get(`/api/v1/dashboard/summary${query}`).set(s.auth);
  expect(res.status).toBe(200);
  return res.body.data as DashboardSummary;
};

describe('GET /dashboard/summary', () => {
  it('starts empty for a new user, with role-based recommendations', async () => {
    const s = await signedIn();
    await s.agent.patch('/api/v1/users/me/profile').set(s.auth).send({ targetRole: 'Backend Developer' });
    const d = await summary(s);
    expect(d.totals).toEqual({ questionsPractised: 0, questionsThisWeek: 0, mockInterviewsCompleted: 0, skillsScore: 0, skillsScoreChange: 0, streakDays: 0 });
    expect(d.progress).toHaveLength(8);
    expect(d.progress.every((p) => p.questionsPractised === 0 && p.averageScore === null)).toBe(true);
    expect(d.skills).toEqual({ technicalAccuracy: 0, communication: 0, structure: 0, practicalKnowledge: 0, confidence: 0 });
    expect(d.weakTopics).toEqual([]);
    expect(d.recentSessions).toEqual([]);
    expect(d.recommended).toHaveLength(4);
    const backend = ['nodejs', 'express', 'rest-apis', 'authentication', 'mongodb', 'postgresql'];
    expect(d.recommended.every((q) => backend.includes(q.categorySlug))).toBe(true);
  });

  it('reflects practice, streaks, scores, weak topics and recent sessions', async () => {
    const s = await signedIn();
    for (const q of ['What is a closure?', 'What is hoisting?']) {
      await s.agent.post('/api/v1/ai/answer').set(s.auth).send({ question: q, source: 'practice' });
    }
    // Pretend one answer was given yesterday and one the day before → 3-day streak with today's mock answer.
    const [a, b] = await UserAnswerModel.find({ userId: s.userId }).lean();
    await UserAnswerModel.collection.updateOne({ _id: a!._id }, { $set: { createdAt: new Date(Date.now() - DAY) } });
    await UserAnswerModel.collection.updateOne({ _id: b!._id }, { $set: { createdAt: new Date(Date.now() - 2 * DAY) } });

    // A mock interview with a weak answer (overall 40) in JavaScript.
    const mock = (
      await s.agent
        .post('/api/v1/mock-interviews')
        .set(s.auth)
        .send({ jobRole: 'Frontend Developer', experienceLevel: 'junior', focusAreas: ['javascript'], questionCount: 3 })
    ).body.data as MockInterviewState;
    fake.enqueue({
      scores: { technicalAccuracy: 40, communication: 40, structure: 40, practicalKnowledge: 40, confidence: 40 },
      feedback: 'Needs work.',
      strengths: ['Tried'],
      improvements: ['Explain scope'],
      improvedAnswer: 'Better.',
    });
    await s.agent
      .post(`/api/v1/mock-interviews/${mock.id}/answers`)
      .set(s.auth)
      .send({ questionId: mock.questions[0]!.id, response: 'It is about functions and stuff I think.' });
    await s.agent.post(`/api/v1/mock-interviews/${mock.id}/complete`).set(s.auth);

    const d = await summary(s);
    expect(d.totals).toMatchObject({ questionsPractised: 3, mockInterviewsCompleted: 1, skillsScore: 40, skillsScoreChange: 0, streakDays: 3 });
    expect(d.totals.questionsThisWeek).toBeGreaterThanOrEqual(1);
    expect(d.progress.reduce((n, p) => n + p.questionsPractised, 0)).toBe(3);
    expect(d.progress.at(-1)!.averageScore).toBe(40);
    expect(d.skills.technicalAccuracy).toBe(40);
    expect(d.weakTopics).toEqual([{ topic: 'JavaScript', score: 40 }]);
    expect(d.recentSessions[0]).toMatchObject({ type: 'mock', score: 40, questionCount: 3, title: 'Mock interview — Frontend Developer' });
    expect(d.recentSessions[1]).toMatchObject({ type: 'practice', questionCount: 2, title: 'Practice' });

    // Recommendations target the weak topic and skip the question already answered.
    expect(d.recommended.length).toBeGreaterThan(0);
    expect(d.recommended.every((q) => q.categorySlug === 'javascript' && q.question !== mock.questions[0]!.text)).toBe(true);
  });

  it('only counts the signed-in user and validates the time zone', async () => {
    const ravi = await signedIn('ravi@example.com');
    await ravi.agent.post('/api/v1/ai/answer').set(ravi.auth).send({ question: 'What is a closure?', source: 'practice' });
    const asha = await signedIn();
    expect((await summary(asha, '?tzOffset=330')).totals.questionsPractised).toBe(0);
    expect((await asha.agent.get('/api/v1/dashboard/summary?tzOffset=5000').set(asha.auth)).status).toBe(422);
    expect((await makeClient().get('/api/v1/dashboard/summary')).status).toBe(401);
  });
});
