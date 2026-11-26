import { Types } from 'mongoose';
import {
  CATEGORY_CATALOG,
  EVALUATION_CRITERIA,
  WEAK_TOPIC_THRESHOLD,
  localWeekStart,
  streakDays,
  topicsForRole,
  weekLabel,
  type DashboardSummary,
  type EvaluationScores,
  type ProgressPoint,
  type QuestionSummary,
  type RecentSession,
  type SessionType,
  type TopicScore,
} from '@aia/shared';
import {
  InterviewQuestionModel,
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  QuestionCategoryModel,
  UserAnswerModel,
  UserProfileModel,
} from '../../models/index.js';

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 8;

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Dashboard numbers, computed live from the user's own data. Scores come from evaluated
 * answers (mock interviews); practice and assistant answers count as activity.
 */
export async function getSummary(userId: string, tzOffset: number, now = new Date()): Promise<DashboardSummary> {
  const uid = new Types.ObjectId(userId);
  const yearAgo = new Date(now.getTime() - 366 * DAY);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY);
  const thisWeek = localWeekStart(now, tzOffset);
  const firstWeek = new Date(thisWeek.getTime() - (WEEKS - 1) * 7 * DAY);

  const [questionsPractised, mockInterviewsCompleted, recent, evaluated] = await Promise.all([
    UserAnswerModel.countDocuments({ userId: uid }),
    PerformanceReportModel.countDocuments({ userId: uid }),
    UserAnswerModel.find({ userId: uid, createdAt: { $gte: yearAgo } }, { createdAt: 1 }).lean(),
    UserAnswerModel.find(
      { userId: uid, 'evaluation.overall': { $exists: true }, createdAt: { $gte: ninetyDaysAgo } },
      { createdAt: 1, topic: 1, evaluation: 1 },
    ).lean(),
  ]);
  const activity = recent.map((a) => a.createdAt as Date);

  // Weekly progress (local weeks, Monday first).
  const progress: ProgressPoint[] = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(firstWeek.getTime() + i * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const inWeek = (d: Date) => d >= start && d < end;
    return {
      week: weekLabel(start, tzOffset),
      questionsPractised: activity.filter(inWeek).length,
      averageScore: avg(evaluated.filter((a) => inWeek(a.createdAt as Date)).map((a) => a.evaluation!.overall!)),
    };
  });

  // Skills score: last 30 days vs the 30 days before.
  const window = (fromDays: number, toDays: number) =>
    evaluated
      .filter((a) => {
        const age = now.getTime() - (a.createdAt as Date).getTime();
        return age >= fromDays * DAY && age < toDays * DAY;
      })
      .map((a) => a.evaluation!.overall!);
  const current = avg(window(0, 30));
  const previous = avg(window(30, 60));

  const skills = Object.fromEntries(
    EVALUATION_CRITERIA.map((c) => [c, avg(evaluated.map((a) => a.evaluation!.scores?.[c]).filter((n): n is number => typeof n === 'number')) ?? 0]),
  ) as EvaluationScores;

  const byTopic = new Map<string, number[]>();
  for (const a of evaluated) if (a.topic) byTopic.set(a.topic, [...(byTopic.get(a.topic) ?? []), a.evaluation!.overall!]);
  const weakTopics: TopicScore[] = [...byTopic]
    .map(([topic, s]) => ({ topic, score: avg(s)! }))
    .filter((t) => t.score < WEAK_TOPIC_THRESHOLD)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const [recentSessions, recommended] = await Promise.all([loadRecentSessions(uid), recommend(userId, weakTopics)]);

  return {
    totals: {
      questionsPractised,
      questionsThisWeek: activity.filter((d) => d >= thisWeek).length,
      mockInterviewsCompleted,
      skillsScore: current ?? 0,
      skillsScoreChange: current !== null && previous !== null ? current - previous : 0,
      streakDays: streakDays(activity, now, tzOffset),
    },
    progress,
    skills,
    weakTopics,
    recentSessions,
    recommended,
  };
}

async function loadRecentSessions(uid: Types.ObjectId): Promise<RecentSession[]> {
  const sessions = await InterviewSessionModel.find({ userId: uid, $or: [{ questionCount: { $gt: 0 } }, { type: 'mock' }] })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();
  const mocks = await MockInterviewModel.find({ userId: uid, sessionId: { $in: sessions.map((s) => s._id) } }, { sessionId: 1 }).lean();
  const reports = await PerformanceReportModel.find({ userId: uid, mockInterviewId: { $in: mocks.map((m) => m._id) } }, { mockInterviewId: 1, overallScore: 1 }).lean();
  const scoreBySession = new Map(
    mocks.map((m) => [String(m.sessionId), reports.find((r) => String(r.mockInterviewId) === String(m._id))?.overallScore]),
  );
  return sessions.map((s) => {
    const score = scoreBySession.get(String(s._id));
    return {
      id: String(s._id),
      type: s.type as SessionType,
      title: s.title ?? 'Session',
      questionCount: s.questionCount ?? 0,
      ...(score !== undefined ? { score } : {}),
      startedAt: (s.startedAt as Date).toISOString(),
    };
  });
}

/** Up to four bank questions from the weakest topics (or the target role), not yet answered. */
async function recommend(userId: string, weakTopics: TopicScore[]): Promise<QuestionSummary[]> {
  const fromWeak = weakTopics.map((t) => CATEGORY_CATALOG.find((c) => c.name === t.topic)?.slug).filter((s): s is string => !!s);
  let slugs = fromWeak;
  if (!slugs.length) {
    const profile = await UserProfileModel.findOne({ userId }, { targetRole: 1 }).lean();
    slugs = topicsForRole(profile?.targetRole ?? '');
  }
  const cats = await QuestionCategoryModel.find({ slug: { $in: slugs }, isActive: true }, { slug: 1 }).lean();
  const slugById = new Map(cats.map((c) => [String(c._id), c.slug]));
  const answered = await UserAnswerModel.distinct('questionId', { userId: new Types.ObjectId(userId), questionId: { $exists: true } });
  const picks = await InterviewQuestionModel.aggregate<{
    _id: Types.ObjectId;
    categoryId: Types.ObjectId;
    question: string;
    difficulty: QuestionSummary['difficulty'];
    type: QuestionSummary['type'];
    tags: string[];
  }>([
    { $match: { categoryId: { $in: cats.map((c) => c._id) }, createdBy: null, _id: { $nin: answered } } },
    { $sample: { size: 4 } },
  ]);
  return picks.map((q) => ({
    id: String(q._id),
    categorySlug: slugById.get(String(q.categoryId)) ?? 'unknown',
    question: q.question,
    difficulty: q.difficulty,
    type: q.type,
    tags: q.tags ?? [],
    isOwn: false,
  }));
}
