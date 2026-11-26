import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockInterviewState } from '@aia/shared';
import { setAiProvider } from '../src/services/ai/ai.service.js';
import { AiProviderError } from '../src/services/ai/provider.js';
import { seedDatabase } from '../src/seed/seed.js';
import {
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  UserAnswerModel,
  UserProfileModel,
} from '../src/models/index.js';
import { FakeAiProvider, defaultResponders } from './fakeAi.js';
import { makeClient, registerUser } from './helpers.js';

const ANSWER = 'A closure is a function that keeps access to variables from the scope where it was created.';

async function signedIn(email = 'asha@example.com', opts: { rateLimits?: boolean } = {}) {
  const agent = makeClient(opts);
  const { token, user } = await registerUser(agent, { email });
  return { agent, auth: { Authorization: `Bearer ${token}` }, userId: user.id as string };
}

async function start(
  s: Awaited<ReturnType<typeof signedIn>>,
  body: Record<string, unknown> = { jobRole: 'Frontend Developer', experienceLevel: 'junior', focusAreas: ['javascript', 'react'], questionCount: 3 },
) {
  const res = await s.agent.post('/api/v1/mock-interviews').set(s.auth).send(body);
  expect(res.status).toBe(201);
  return res.body.data as MockInterviewState;
}

let fake: FakeAiProvider;
beforeEach(async () => {
  fake = new FakeAiProvider(defaultResponders);
  setAiProvider(fake);
  await seedDatabase();
});
afterEach(() => setAiProvider(null));

describe('POST /mock-interviews (start)', () => {
  it('requires authentication and validates the setup', async () => {
    expect((await makeClient().post('/api/v1/mock-interviews').send({})).status).toBe(401);
    const s = await signedIn();
    const bad = await s.agent.post('/api/v1/mock-interviews').set(s.auth).send({ jobRole: 'X', experienceLevel: 'guru', questionCount: 0 });
    expect(bad.status).toBe(422);
    const unknown = await s.agent
      .post('/api/v1/mock-interviews')
      .set(s.auth)
      .send({ jobRole: 'Frontend Developer', experienceLevel: 'junior', focusAreas: ['cobol'], questionCount: 3 });
    expect(unknown.status).toBe(422);
    expect(JSON.stringify(unknown.body.error.details)).toContain('Unknown topic: cobol');
  });

  it('picks questions from the chosen topics, spread across them, without calling the AI', async () => {
    const s = await signedIn();
    const mock = await start(s, { jobRole: 'Frontend Developer', experienceLevel: 'junior', focusAreas: ['javascript', 'react'], questionCount: 4 });
    expect(mock).toMatchObject({ status: 'in_progress', currentIndex: 0, questionCount: 4, jobRole: 'Frontend Developer' });
    expect(mock.questions).toHaveLength(4);
    expect(mock.questions.every((q) => q.status === 'pending' && !q.answer)).toBe(true);
    const slugs = mock.questions.map((q) => q.categorySlug);
    expect(slugs.filter((x) => x === 'javascript')).toHaveLength(2);
    expect(slugs.filter((x) => x === 'react')).toHaveLength(2);
    expect(mock.questions.map((q) => q.topic)).toContain('React.js'); // display names, not slugs
    expect(new Set(mock.questions.map((q) => q.text)).size).toBe(4);
    expect(fake.requests).toHaveLength(0);

    const session = await InterviewSessionModel.findOne({ userId: s.userId, type: 'mock' }).lean();
    expect(session).toMatchObject({ status: 'active', questionCount: 4 });
    expect(session!.expiresAt).toBeInstanceOf(Date); // default 90-day retention
  });

  it('uses role-based topics when none are chosen, and harder questions for senior candidates', async () => {
    const s = await signedIn();
    const mock = await start(s, { jobRole: 'Backend Developer', experienceLevel: 'senior', focusAreas: [], questionCount: 5 });
    const backend = ['nodejs', 'express', 'rest-apis', 'authentication', 'mongodb', 'postgresql'];
    expect(mock.questions.every((q) => backend.includes(q.categorySlug!))).toBe(true);
    expect(mock.questions.filter((q) => q.difficulty === 'hard').length).toBeGreaterThanOrEqual(3);
  });

  it('caps the interview at the questions available', async () => {
    const s = await signedIn();
    const mock = await start(s, { jobRole: 'Dev', experienceLevel: 'mid', focusAreas: ['git'], questionCount: 10 });
    expect(mock.questions.length).toBeLessThan(10);
    expect(mock.questionCount).toBe(mock.questions.length);
  });

  it('abandons an older unfinished interview when a new one starts', async () => {
    const s = await signedIn();
    const first = await start(s);
    await start(s);
    expect((await MockInterviewModel.findById(first.id).lean())!.status).toBe('abandoned');
    const list = await s.agent.get('/api/v1/mock-interviews?status=in_progress').set(s.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).not.toBe(first.id);
  });

  it("keeps each user's interviews private", async () => {
    const asha = await signedIn('asha@example.com');
    const mock = await start(asha);
    const ravi = await signedIn('ravi@example.com');
    expect((await ravi.agent.get(`/api/v1/mock-interviews/${mock.id}`).set(ravi.auth)).status).toBe(404);
    const steal = await ravi.agent
      .post(`/api/v1/mock-interviews/${mock.id}/answers`)
      .set(ravi.auth)
      .send({ questionId: mock.questions[0]!.id, response: ANSWER });
    expect(steal.status).toBe(404);
    expect((await ravi.agent.delete(`/api/v1/mock-interviews/${mock.id}`).set(ravi.auth)).status).toBe(404);
    expect((await ravi.agent.get('/api/v1/mock-interviews').set(ravi.auth)).body.data).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('POST /mock-interviews/:id/answers', () => {
  it('evaluates the answer for the interview level and role, stores it as text, and moves on', async () => {
    const s = await signedIn();
    const mock = await start(s, { jobRole: 'React Developer', experienceLevel: 'mid', focusAreas: ['javascript'], questionCount: 3 });
    const q = mock.questions[0]!;
    const res = await s.agent.post(`/api/v1/mock-interviews/${mock.id}/answers`).set(s.auth).send({ questionId: q.id, response: ANSWER });
    expect(res.status).toBe(200);
    const state = res.body.data as MockInterviewState;
    expect(state.currentIndex).toBe(1);
    expect(state.questions[0]).toMatchObject({
      status: 'answered',
      answer: { response: ANSWER, inputMode: 'text', evaluation: { overall: 70, feedback: 'Good start.' } },
    });

    const req = fake.last();
    expect(req.name).toBe('answer_evaluation');
    expect(req.system).toContain("mid-level candidate's answer for a React Developer role");
    expect(req.user).toContain(`<question>\n${q.text}\n</question>`);
    expect(req.user).toContain(`<candidate_answer>\n${ANSWER}\n</candidate_answer>`);

    const stored = await UserAnswerModel.findOne({ mockInterviewId: mock.id }).lean();
    expect(stored).toMatchObject({ questionText: q.text, inputMode: 'text', response: { text: ANSWER } });
    expect(stored!.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects too-short answers before calling the AI, and answering twice', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const q = mock.questions[0]!;
    const url = `/api/v1/mock-interviews/${mock.id}/answers`;
    const short = await s.agent.post(url).set(s.auth).send({ questionId: q.id, response: 'idk' });
    expect(short.status).toBe(422);
    expect(fake.requests).toHaveLength(0);

    expect((await s.agent.post(url).set(s.auth).send({ questionId: q.id, response: ANSWER })).status).toBe(200);
    const again = await s.agent.post(url).set(s.auth).send({ questionId: q.id, response: ANSWER });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ANSWERED');
    expect(fake.requests).toHaveLength(1);
  });

  it('evaluates a double-submitted answer only once', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const send = () =>
      s.agent.post(`/api/v1/mock-interviews/${mock.id}/answers`).set(s.auth).send({ questionId: mock.questions[0]!.id, response: ANSWER });
    const results = await Promise.all([send(), send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(fake.requests).toHaveLength(1);
    expect(await UserAnswerModel.countDocuments({ mockInterviewId: mock.id })).toBe(1);
  });

  it('lets the user retry after an AI failure', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const body = { questionId: mock.questions[0]!.id, response: ANSWER };
    fake.enqueue(new AiProviderError('busy', 'rate limited'));
    const failed = await s.agent.post(`/api/v1/mock-interviews/${mock.id}/answers`).set(s.auth).send(body);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('AI_BUSY');
    const retry = await s.agent.post(`/api/v1/mock-interviews/${mock.id}/answers`).set(s.auth).send(body);
    expect(retry.status).toBe(200);
  });

  it('blends speech patterns into confidence for spoken answers only', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const url = `/api/v1/mock-interviews/${mock.id}/answers`;
    // Calm, steady delivery: 140 wpm, no fillers, no long pauses → speech score 100; AI wording score 65.
    const metrics = { wordsPerMinute: 140, fillerWordCount: 0, longPauseCount: 0, durationSec: 30 };
    const voice = await s.agent.post(url).set(s.auth).send({ questionId: mock.questions[0]!.id, response: ANSWER, inputMode: 'voice', speechMetrics: metrics });
    const spoken = (voice.body.data as MockInterviewState).questions[0]!.answer!;
    expect(spoken.evaluation.scores.confidence).toBe(83);
    expect(spoken.evaluation.overall).toBe(74);
    expect(spoken.speechMetrics).toEqual(metrics);

    // Typed answers ignore any metrics sent along.
    const typed = await s.agent.post(url).set(s.auth).send({ questionId: mock.questions[1]!.id, response: ANSWER, inputMode: 'text', speechMetrics: metrics });
    const t = (typed.body.data as MockInterviewState).questions[1]!.answer!;
    expect(t.evaluation.scores.confidence).toBe(65);
    expect(t.speechMetrics).toBeUndefined();
  });
});

describe('completing an interview', () => {
  it('builds and stores a report, updates profile stats, and is idempotent', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const base = `/api/v1/mock-interviews/${mock.id}`;
    await s.agent.post(`${base}/answers`).set(s.auth).send({ questionId: mock.questions[0]!.id, response: ANSWER });
    const skipped = await s.agent.post(`${base}/skip`).set(s.auth).send({ questionId: mock.questions[1]!.id });
    expect((skipped.body.data as MockInterviewState).questions[1]!.status).toBe('skipped');
    expect((skipped.body.data as MockInterviewState).currentIndex).toBe(2);

    const done = await s.agent.post(`${base}/complete`).set(s.auth);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed' });
    expect(done.body.data.reportId).toBeTruthy();

    const report = (await s.agent.get(`${base}/report`).set(s.auth)).body.data;
    expect(report).toMatchObject({
      mockInterviewId: mock.id,
      jobRole: 'Frontend Developer',
      experienceLevel: 'junior',
      overallScore: 70,
      totalQuestions: 3,
      answeredCount: 1,
      strengths: ['Correct definition'],
      improvements: ['Add an example'],
      scores: { technicalAccuracy: 80, communication: 70, structure: 60, practicalKnowledge: 75, confidence: 65 },
    });
    expect(report.summary).toContain('You answered 1 of 3 questions and skipped 1.');
    expect(report.perQuestion).toEqual([{ questionText: mock.questions[0]!.text, topic: mock.questions[0]!.topic, score: 70 }]);
    expect(report.speechMetrics).toBeUndefined();

    const profile = await UserProfileModel.findOne({ userId: s.userId }).lean();
    expect(profile!.stats).toMatchObject({ mockInterviewsCompleted: 1, averageScore: 70 });

    // Completing again returns the same result; no second report.
    expect((await s.agent.post(`${base}/complete`).set(s.auth)).body.data.reportId).toBe(done.body.data.reportId);
    expect(await PerformanceReportModel.countDocuments({ mockInterviewId: mock.id })).toBe(1);

    const late = await s.agent.post(`${base}/answers`).set(s.auth).send({ questionId: mock.questions[2]!.id, response: ANSWER });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('MOCK_NOT_IN_PROGRESS');

    const list = (await s.agent.get('/api/v1/mock-interviews').set(s.auth)).body.data;
    expect(list[0]).toMatchObject({ id: mock.id, status: 'completed', answeredCount: 1, overallScore: 70 });
  });

  it('marks an interview with no answers as abandoned, with no report', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const done = await s.agent.post(`/api/v1/mock-interviews/${mock.id}/complete`).set(s.auth);
    expect(done.body.data.status).toBe('abandoned');
    expect(done.body.data.reportId).toBeUndefined();
    expect((await s.agent.get(`/api/v1/mock-interviews/${mock.id}/report`).set(s.auth)).status).toBe(404);
  });

  it('deletes an interview with its answers, report and session', async () => {
    const s = await signedIn();
    const mock = await start(s);
    const base = `/api/v1/mock-interviews/${mock.id}`;
    await s.agent.post(`${base}/answers`).set(s.auth).send({ questionId: mock.questions[0]!.id, response: ANSWER });
    await s.agent.post(`${base}/complete`).set(s.auth);
    expect((await s.agent.delete(base).set(s.auth)).status).toBe(204);
    expect(await MockInterviewModel.countDocuments({ userId: s.userId })).toBe(0);
    expect(await UserAnswerModel.countDocuments({ userId: s.userId })).toBe(0);
    expect(await PerformanceReportModel.countDocuments({ userId: s.userId })).toBe(0);
    expect(await InterviewSessionModel.countDocuments({ userId: s.userId })).toBe(0);
    expect((await UserProfileModel.findOne({ userId: s.userId }).lean())!.stats).toMatchObject({ mockInterviewsCompleted: 0, averageScore: 0 });
  });

  it('keeps everything forever when retention is set to 0', async () => {
    const s = await signedIn();
    await s.agent.patch('/api/v1/settings/privacy').set(s.auth).send({ retentionDays: 0 });
    const mock = await start(s);
    expect((await MockInterviewModel.findById(mock.id).lean())!.expiresAt).toBeUndefined();
  });
});
