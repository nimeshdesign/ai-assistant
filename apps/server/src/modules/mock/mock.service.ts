import { Types } from 'mongoose';
import {
  aggregateReport,
  applySpeechConfidence,
  pickMockQuestions,
  topicsForRole,
  type AnswerEvaluation,
  type Difficulty,
  type ExperienceLevel,
  type InputMode,
  type MockInterviewState,
  type MockInterviewSummary,
  type MockQuestion,
  type PerformanceReportView,
  type ReportInput,
  type SpeechMetrics,
} from '@aia/shared';
import {
  InterviewQuestionModel,
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  QuestionCategoryModel,
  UserAnswerModel,
  UserProfileModel,
  UserSettingsModel,
  retentionExpiry,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import * as ai from '../../services/ai/ai.service.js';

/** An evaluation lock older than this is treated as abandoned (e.g. the server restarted mid-call). */
const LOCK_TIMEOUT_MS = 2 * 60_000;

type MockDoc = NonNullable<Awaited<ReturnType<typeof loadOwned>>>;
type AnswerDoc = {
  _id: Types.ObjectId;
  inputMode?: string | null;
  response?: { text?: string | null; speechMetrics?: SpeechMetrics | null; durationSec?: number | null } | null;
  evaluation?: (AnswerEvaluation & { evaluatedAt?: Date | null }) | null;
  createdAt?: Date;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

async function loadOwned(userId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Mock interview not found');
  const doc = await MockInterviewModel.findOne({ _id: id, userId });
  if (!doc) throw ApiError.notFound('Mock interview not found');
  return doc;
}

async function retentionFor(userId: string) {
  const settings = await UserSettingsModel.findOne({ userId }, { 'privacy.retentionDays': 1 }).lean();
  return retentionExpiry(settings?.privacy?.retentionDays ?? 90);
}

function cleanMetrics(m: SpeechMetrics | null | undefined): SpeechMetrics | undefined {
  if (!m) return undefined;
  const out: SpeechMetrics = {};
  for (const k of ['wordsPerMinute', 'fillerWordCount', 'longPauseCount', 'durationSec'] as const) {
    if (typeof m[k] === 'number') out[k] = m[k];
  }
  return Object.keys(out).length ? out : undefined;
}

function toEvaluation(e: NonNullable<AnswerDoc['evaluation']>): AnswerEvaluation {
  return {
    scores: { ...e.scores },
    overall: e.overall,
    feedback: e.feedback ?? '',
    strengths: [...(e.strengths ?? [])],
    improvements: [...(e.improvements ?? [])],
    improvedAnswer: e.improvedAnswer ?? '',
  };
}

async function toState(doc: MockDoc): Promise<MockInterviewState> {
  const answerIds = doc.questions.map((q) => q.answerId).filter(Boolean);
  const answers = answerIds.length
    ? ((await UserAnswerModel.find({ _id: { $in: answerIds }, userId: doc.userId }).lean()) as unknown as AnswerDoc[])
    : [];
  const byId = new Map(answers.map((a) => [String(a._id), a]));

  const questions: MockQuestion[] = doc.questions.map((q) => {
    const a = q.answerId ? byId.get(String(q.answerId)) : undefined;
    const status = a?.evaluation ? 'answered' : q.skipped ? 'skipped' : 'pending';
    const speechMetrics = cleanMetrics(a?.response?.speechMetrics ? { ...a.response.speechMetrics, durationSec: a.response.durationSec ?? undefined } : undefined);
    return {
      id: String(q._id),
      order: q.order,
      text: q.text,
      topic: q.topic ?? 'General',
      ...(q.categorySlug ? { categorySlug: q.categorySlug } : {}),
      difficulty: (q.difficulty ?? 'medium') as Difficulty,
      status,
      ...(a?.evaluation
        ? {
            answer: {
              response: a.response?.text ?? '',
              inputMode: (a.inputMode ?? 'text') as InputMode,
              evaluation: toEvaluation(a.evaluation),
              ...(speechMetrics ? { speechMetrics } : {}),
              answeredAt: iso(q.answeredAt ?? a.createdAt)!,
            },
          }
        : {}),
    };
  });
  const firstPending = questions.findIndex((q) => q.status === 'pending');

  return {
    id: String(doc._id),
    jobRole: doc.jobRole,
    experienceLevel: doc.experienceLevel as ExperienceLevel,
    focusAreas: [...doc.focusAreas],
    questionCount: doc.totalQuestions,
    status: doc.status as MockInterviewState['status'],
    questions,
    currentIndex: firstPending === -1 ? questions.length : firstPending,
    startedAt: iso(doc.startedAt)!,
    ...(doc.completedAt ? { completedAt: iso(doc.completedAt) } : {}),
    ...(doc.reportId ? { reportId: String(doc.reportId) } : {}),
  };
}

// ---------- Start ----------

export async function startInterview(
  userId: string,
  setup: { jobRole: string; experienceLevel: ExperienceLevel; focusAreas: string[]; questionCount: number },
): Promise<MockInterviewState> {
  const categories = await QuestionCategoryModel.find({ isActive: true }, { slug: 1, name: 1 }).lean();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const unknown = setup.focusAreas.filter((s) => !bySlug.has(s));
  if (unknown.length) throw ApiError.validation([{ path: 'focusAreas', message: `Unknown topic: ${unknown.join(', ')}` }]);

  const topics = setup.focusAreas.length ? [...new Set(setup.focusAreas)] : topicsForRole(setup.jobRole);
  const topicIds = topics.map((s) => bySlug.get(s)?._id).filter((x): x is Types.ObjectId => !!x);
  const slugById = new Map(categories.map((c) => [String(c._id), c.slug]));

  // The shared bank plus the user's own questions (never other users' private ones).
  const pool = (
    await InterviewQuestionModel.find(
      { categoryId: { $in: topicIds }, $or: [{ createdBy: null }, { createdBy: new Types.ObjectId(userId) }] },
      { question: 1, difficulty: 1, categoryId: 1 },
    ).lean()
  ).map((q) => ({ id: q._id, text: q.question, difficulty: q.difficulty as Difficulty, categorySlug: slugById.get(String(q.categoryId))! }));

  const picked = pickMockQuestions(pool, topics, setup.experienceLevel, setup.questionCount);
  if (picked.length === 0) {
    throw new ApiError(422, 'NO_QUESTIONS', 'No questions are available for these topics yet. Try adding more topics.');
  }

  // Only one interview runs at a time: an older unfinished one is marked abandoned.
  const stale = await MockInterviewModel.find({ userId, status: 'in_progress' }, { sessionId: 1 }).lean();
  if (stale.length) {
    await MockInterviewModel.updateMany({ _id: { $in: stale.map((s) => s._id) } }, { status: 'abandoned' });
    await InterviewSessionModel.updateMany({ _id: { $in: stale.map((s) => s.sessionId) } }, { status: 'abandoned', endedAt: new Date() });
  }

  const expiresAt = await retentionFor(userId);
  const session = await InterviewSessionModel.create({
    userId,
    type: 'mock',
    title: `Mock interview — ${setup.jobRole}`,
    categoryIds: topicIds,
    config: { experienceLevel: setup.experienceLevel, questionCount: picked.length, focusAreas: topics },
    questionCount: picked.length,
    expiresAt,
  });
  const doc = await MockInterviewModel.create({
    userId,
    sessionId: session._id,
    jobRole: setup.jobRole,
    experienceLevel: setup.experienceLevel,
    focusAreas: setup.focusAreas,
    totalQuestions: picked.length,
    questions: picked.map((q, i) => ({
      order: i,
      text: q.text,
      topic: bySlug.get(q.categorySlug)?.name ?? q.categorySlug,
      categorySlug: q.categorySlug,
      difficulty: q.difficulty,
      questionId: q.id,
      askedAt: i === 0 ? new Date() : undefined,
    })),
    expiresAt,
  });
  await InterviewQuestionModel.updateMany({ _id: { $in: picked.map((q) => q.id) } }, { $inc: { timesAsked: 1 } });
  return toState(doc);
}

// ---------- Read ----------

export async function getInterview(userId: string, id: string) {
  return toState(await loadOwned(userId, id));
}

export async function listInterviews(userId: string, q: { status?: string; limit: number }): Promise<MockInterviewSummary[]> {
  const filter: Record<string, unknown> = { userId };
  if (q.status) filter.status = q.status;
  const docs = await MockInterviewModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(q.limit)
    .lean();
  const reports = await PerformanceReportModel.find(
    { userId, mockInterviewId: { $in: docs.map((d) => d._id) } },
    { mockInterviewId: 1, overallScore: 1 },
  ).lean();
  const scoreByMock = new Map(reports.map((r) => [String(r.mockInterviewId), r.overallScore]));
  return docs.map((d) => ({
    id: String(d._id),
    jobRole: d.jobRole,
    experienceLevel: d.experienceLevel as ExperienceLevel,
    status: d.status as MockInterviewSummary['status'],
    totalQuestions: d.totalQuestions,
    answeredCount: d.questions.filter((x) => x.answerId).length,
    ...(scoreByMock.has(String(d._id)) ? { overallScore: scoreByMock.get(String(d._id)) } : {}),
    ...(d.reportId ? { reportId: String(d.reportId) } : {}),
    startedAt: iso(d.startedAt)!,
    ...(d.completedAt ? { completedAt: iso(d.completedAt) } : {}),
  }));
}

// ---------- Answer / skip ----------

function findQuestion(doc: MockDoc, questionId: string) {
  const q = doc.questions.find((x) => String(x._id) === questionId);
  if (!q) throw ApiError.notFound('Question not found in this interview');
  return q;
}

function assertInProgress(doc: MockDoc) {
  if (doc.status !== 'in_progress') throw new ApiError(409, 'MOCK_NOT_IN_PROGRESS', 'This interview has already ended.');
}

function assertPending(q: ReturnType<typeof findQuestion>) {
  if (q.answerId) throw new ApiError(409, 'ALREADY_ANSWERED', 'You already answered this question.');
  if (q.skipped) throw new ApiError(409, 'ALREADY_SKIPPED', 'You skipped this question.');
}

export async function submitAnswer(
  userId: string,
  id: string,
  body: { questionId: string; response: string; inputMode: 'text' | 'voice'; speechMetrics?: SpeechMetrics },
): Promise<MockInterviewState> {
  const doc = await loadOwned(userId, id);
  assertInProgress(doc);
  assertPending(findQuestion(doc, body.questionId));

  // Claim the question atomically so a double submit can't pay for two evaluations.
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const claimed = await MockInterviewModel.updateOne(
    {
      _id: doc._id,
      status: 'in_progress',
      questions: {
        $elemMatch: {
          _id: new Types.ObjectId(body.questionId),
          answerId: { $exists: false },
          skipped: { $ne: true },
          $or: [{ lockedAt: { $exists: false } }, { lockedAt: null }, { lockedAt: { $lt: staleBefore } }],
        },
      },
    },
    { $set: { 'questions.$.lockedAt': new Date() } },
  );
  if (claimed.modifiedCount === 0) {
    throw new ApiError(409, 'ANSWER_IN_PROGRESS', 'This answer is already being evaluated.');
  }

  const q = findQuestion(doc, body.questionId);
  const speechMetrics = body.inputMode === 'voice' ? body.speechMetrics : undefined;
  let evaluation: AnswerEvaluation;
  try {
    const raw = await ai.evaluateAnswer(userId, q.text, body.response, {
      level: doc.experienceLevel as ExperienceLevel,
      jobRole: doc.jobRole,
    });
    evaluation = applySpeechConfidence(raw, speechMetrics);
  } catch (err) {
    await MockInterviewModel.updateOne(
      { _id: doc._id, 'questions._id': q._id },
      { $unset: { 'questions.$.lockedAt': 1 } },
    );
    throw err;
  }

  const answer = await UserAnswerModel.create({
    userId,
    sessionId: doc.sessionId,
    sessionType: 'mock',
    questionId: q.questionId,
    mockInterviewId: doc._id,
    questionText: q.text,
    topic: q.topic,
    categorySlug: q.categorySlug ?? undefined,
    inputMode: body.inputMode,
    response: {
      text: body.response,
      ...(speechMetrics
        ? {
            durationSec: speechMetrics.durationSec,
            speechMetrics: {
              wordsPerMinute: speechMetrics.wordsPerMinute,
              fillerWordCount: speechMetrics.fillerWordCount,
              longPauseCount: speechMetrics.longPauseCount,
            },
          }
        : {}),
    },
    evaluation: { ...evaluation, evaluatedAt: new Date() },
    expiresAt: doc.expiresAt ?? undefined,
  });

  const now = new Date();
  await MockInterviewModel.updateOne(
    { _id: doc._id, 'questions._id': q._id },
    { $set: { 'questions.$.answerId': answer._id, 'questions.$.answeredAt': now }, $unset: { 'questions.$.lockedAt': 1 } },
  );
  return advance(userId, id);
}

export async function skipQuestion(userId: string, id: string, questionId: string) {
  const doc = await loadOwned(userId, id);
  assertInProgress(doc);
  const q = findQuestion(doc, questionId);
  assertPending(q);
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const res = await MockInterviewModel.updateOne(
    {
      _id: doc._id,
      status: 'in_progress',
      questions: {
        $elemMatch: {
          _id: q._id,
          answerId: { $exists: false },
          $or: [{ lockedAt: { $exists: false } }, { lockedAt: null }, { lockedAt: { $lt: staleBefore } }],
        },
      },
    },
    { $set: { 'questions.$.skipped': true } },
  );
  if (res.modifiedCount === 0) throw new ApiError(409, 'ANSWER_IN_PROGRESS', 'This answer is already being evaluated.');
  return advance(userId, id);
}

/** Keep `currentIndex` pointing at the first pending question and stamp when it was asked. */
async function advance(userId: string, id: string) {
  const doc = await loadOwned(userId, id);
  const next = doc.questions.findIndex((q) => !q.answerId && !q.skipped);
  doc.currentIndex = next === -1 ? doc.questions.length - 1 : next;
  if (next !== -1 && !doc.questions[next]!.askedAt) doc.questions[next]!.askedAt = new Date();
  await doc.save();
  return toState(doc);
}

// ---------- Complete / delete ----------

export async function completeInterview(userId: string, id: string): Promise<MockInterviewState> {
  const doc = await loadOwned(userId, id);
  if (doc.status !== 'in_progress') return toState(doc); // already finished: idempotent

  const answers = (await UserAnswerModel.find({ userId, mockInterviewId: doc._id, evaluation: { $exists: true } }).lean()) as unknown as (AnswerDoc & {
    questionText: string;
  })[];
  const byId = new Map(answers.map((a) => [String(a._id), a]));
  const items: ReportInput[] = [];
  const itemAnswerIds: Types.ObjectId[] = [];
  for (const q of doc.questions) {
    const a = q.answerId ? byId.get(String(q.answerId)) : undefined;
    if (!a?.evaluation) continue;
    itemAnswerIds.push(a._id);
    const speechMetrics = cleanMetrics(a.response?.speechMetrics ? { ...a.response.speechMetrics, durationSec: a.response.durationSec ?? undefined } : undefined);
    items.push({ questionText: q.text, topic: q.topic ?? 'General', evaluation: toEvaluation(a.evaluation), ...(speechMetrics ? { speechMetrics } : {}) });
  }
  const skipped = doc.questions.filter((q) => q.skipped).length;
  const body = aggregateReport(items, { total: doc.totalQuestions, skipped });

  // Atomic transition: only one request gets to write the report.
  const now = new Date();
  const status = body ? 'completed' : 'abandoned';
  const moved = await MockInterviewModel.updateOne({ _id: doc._id, status: 'in_progress' }, { status, completedAt: now });
  if (moved.modifiedCount === 0) return getInterview(userId, id);
  await InterviewSessionModel.updateOne({ _id: doc.sessionId }, { status: body ? 'completed' : 'abandoned', endedAt: now });

  if (body) {
    const report = await PerformanceReportModel.create({
      userId,
      mockInterviewId: doc._id,
      jobRole: doc.jobRole,
      experienceLevel: doc.experienceLevel,
      totalQuestions: doc.totalQuestions,
      answeredCount: items.length,
      ...body,
      perQuestion: body.perQuestion.map((p, i) => ({ ...p, answerId: itemAnswerIds[i] })),
      expiresAt: doc.expiresAt ?? undefined,
    });
    await MockInterviewModel.updateOne({ _id: doc._id }, { reportId: report._id });
    await refreshProfileStats(userId);
  }
  return getInterview(userId, id);
}

export async function deleteInterview(userId: string, id: string) {
  const doc = await loadOwned(userId, id);
  await Promise.all([
    UserAnswerModel.deleteMany({ userId, mockInterviewId: doc._id }),
    PerformanceReportModel.deleteMany({ userId, mockInterviewId: doc._id }),
    InterviewSessionModel.deleteOne({ _id: doc.sessionId, userId }),
  ]);
  await MockInterviewModel.deleteOne({ _id: doc._id });
  await refreshProfileStats(userId);
}

/** Recompute the dashboard aggregates on the profile from the user's reports. */
export async function refreshProfileStats(userId: string) {
  const reports = await PerformanceReportModel.find({ userId }, { overallScore: 1, weakTopics: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();
  const averageScore = reports.length ? Math.round(reports.reduce((n, r) => n + r.overallScore, 0) / reports.length) : 0;
  // Weak topics from the five most recent reports, weakest first.
  const topicScores = new Map<string, number[]>();
  for (const r of reports.slice(0, 5)) for (const t of r.weakTopics) topicScores.set(t.topic, [...(topicScores.get(t.topic) ?? []), t.score ?? 0]);
  const weakTopics = [...topicScores]
    .map(([topic, s]) => ({ topic, score: s.reduce((a, b) => a + b, 0) / s.length }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((t) => t.topic);
  await UserProfileModel.updateOne(
    { userId },
    {
      $set: {
        'stats.mockInterviewsCompleted': reports.length,
        'stats.averageScore': averageScore,
        'stats.weakTopics': weakTopics,
        'stats.lastActiveAt': new Date(),
      },
    },
    { upsert: true },
  );
}

// ---------- Reports ----------

type ReportDoc = Awaited<ReturnType<typeof PerformanceReportModel.findOne>>;

function toReportView(r: NonNullable<ReportDoc>): PerformanceReportView {
  const o = r.toObject() as unknown as Record<string, unknown> & { scores: PerformanceReportView['scores'] };
  const sm = r.speechMetrics;
  const speechMetrics =
    sm && (sm.averageWordsPerMinute != null || sm.totalFillerWords != null || sm.totalLongPauses != null)
      ? {
          ...(sm.averageWordsPerMinute != null ? { averageWordsPerMinute: sm.averageWordsPerMinute } : {}),
          ...(sm.totalFillerWords != null ? { totalFillerWords: sm.totalFillerWords } : {}),
          ...(sm.totalLongPauses != null ? { totalLongPauses: sm.totalLongPauses } : {}),
        }
      : undefined;
  return {
    id: String(r._id),
    mockInterviewId: String(r.mockInterviewId),
    jobRole: r.jobRole ?? '',
    experienceLevel: (r.experienceLevel ?? 'junior') as ExperienceLevel,
    overallScore: r.overallScore,
    scores: { ...o.scores },
    summary: r.summary ?? '',
    strengths: [...r.strengths],
    improvements: [...r.improvements],
    weakTopics: r.weakTopics.map((t) => ({ topic: t.topic, score: t.score ?? 0 })),
    totalQuestions: r.totalQuestions ?? r.perQuestion.length,
    answeredCount: r.answeredCount ?? r.perQuestion.length,
    perQuestion: r.perQuestion.map((p) => ({ questionText: p.questionText ?? '', topic: p.topic ?? '', score: p.score ?? 0 })),
    ...(speechMetrics ? { speechMetrics } : {}),
    completedAt: iso(r.get('createdAt') as Date)!,
  };
}

export async function getReport(userId: string, mockId: string) {
  if (!Types.ObjectId.isValid(mockId)) throw ApiError.notFound('Report not found');
  const r = await PerformanceReportModel.findOne({ userId, mockInterviewId: mockId });
  if (!r) throw ApiError.notFound('Report not found');
  return toReportView(r);
}
