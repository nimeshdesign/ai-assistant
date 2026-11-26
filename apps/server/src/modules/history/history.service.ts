import { Types } from 'mongoose';
import {
  escapeRegExp,
  getCategory,
  type AnswerSource,
  type HistoryItem,
  type InputMode,
  type PaginationMeta,
  type SessionType,
  type StructuredAnswer,
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
import { logger } from '../../utils/logger.js';
import { refreshProfileStats } from '../mock/mock.service.js';

/** Answers asked within this gap belong to the same session (one practice run, one assistant run…). */
export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

const SESSION_TITLES: Record<AnswerSource, string> = {
  practice: 'Practice',
  assistant: 'Screen Assistant',
  voice: 'Voice Assistant',
};

// ---------- Recording ----------

/**
 * Save an AI answer to the user's history — only when "Save history" is on. Asking the same
 * question again in the same session updates the existing entry instead of adding a duplicate.
 * Never throws: a history problem must not break the answer itself.
 */
export async function recordAnswer(
  userId: string,
  entry: { source: AnswerSource; inputMode?: InputMode; question: string; questionId?: string; answer: StructuredAnswer & { model?: string } },
): Promise<void> {
  try {
    const settings = await UserSettingsModel.findOne({ userId }, { privacy: 1 }).lean();
    if (settings?.privacy?.saveHistory === false) return;
    const expiresAt = retentionExpiry(settings?.privacy?.retentionDays ?? 90);
    const now = new Date();

    let session = await InterviewSessionModel.findOneAndUpdate(
      { userId, type: entry.source, status: 'active', updatedAt: { $gte: new Date(now.getTime() - SESSION_GAP_MS) } },
      { $set: { updatedAt: now } },
      { sort: { updatedAt: -1 }, returnDocument: 'after', timestamps: false },
    );
    session ??= await InterviewSessionModel.create({
      userId,
      type: entry.source,
      title: SESSION_TITLES[entry.source],
      expiresAt,
    });

    // Category from the question bank when the question came from it.
    let categorySlug: string | undefined;
    let topic: string | undefined;
    if (entry.questionId && Types.ObjectId.isValid(entry.questionId)) {
      const q = await InterviewQuestionModel.findOne(
        { _id: entry.questionId, $or: [{ createdBy: null }, { createdBy: new Types.ObjectId(userId) }] },
        { categoryId: 1 },
      ).lean();
      const cat = q ? await QuestionCategoryModel.findById(q.categoryId, { slug: 1, name: 1 }).lean() : null;
      categorySlug = cat?.slug;
      topic = cat?.name;
    }

    const a = entry.answer;
    const question = entry.question.trim();
    const res = await UserAnswerModel.updateOne(
      { userId, sessionId: session._id, questionText: question },
      {
        $set: {
          sessionType: entry.source,
          inputMode: entry.inputMode ?? 'text',
          aiAnswer: {
            directAnswer: a.directAnswer,
            simpleExplanation: a.simpleExplanation ?? undefined,
            realWorldExample: a.realWorldExample ?? undefined,
            codeExample: a.codeExample ?? undefined,
            interviewReadyAnswer: a.interviewReadyAnswer,
            length: a.length,
            model: a.model,
            generatedAt: now,
          },
          ...(entry.questionId && Types.ObjectId.isValid(entry.questionId) ? { questionId: entry.questionId } : {}),
          ...(categorySlug ? { categorySlug, topic } : {}),
        },
        $setOnInsert: { userId, sessionId: session._id, questionText: question, ...(expiresAt ? { expiresAt } : {}) },
      },
      { upsert: true, runValidators: true },
    );
    if (res.upsertedCount) {
      await InterviewSessionModel.updateOne({ _id: session._id }, { $inc: { questionCount: 1 } }, { timestamps: false });
    }
    await UserProfileModel.updateOne({ userId }, { $set: { 'stats.lastActiveAt': now } }, { upsert: true });
  } catch (err) {
    logger.warn({ err, userId }, 'Could not save answer to history');
  }
}

// ---------- Reading ----------

type AnswerLean = Awaited<ReturnType<typeof findAnswers>>[number];
const findAnswers = (filter: Record<string, unknown>, skip: number, limit: number) =>
  UserAnswerModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();

export function toHistoryItem(a: AnswerLean): HistoryItem {
  const ai = a.aiAnswer;
  const answer: StructuredAnswer | undefined =
    ai?.directAnswer && ai.interviewReadyAnswer
      ? {
          directAnswer: ai.directAnswer,
          ...(ai.simpleExplanation ? { simpleExplanation: ai.simpleExplanation } : {}),
          ...(ai.realWorldExample ? { realWorldExample: ai.realWorldExample } : {}),
          codeExample: ai.codeExample?.code ? { language: ai.codeExample.language ?? 'text', code: ai.codeExample.code } : null,
          interviewReadyAnswer: ai.interviewReadyAnswer,
          length: (ai.length ?? 'normal') as StructuredAnswer['length'],
        }
      : undefined;
  const slug = a.categorySlug && getCategory(a.categorySlug) ? a.categorySlug : undefined;
  return {
    id: String(a._id),
    sessionId: String(a.sessionId),
    sessionType: a.sessionType as SessionType,
    questionText: a.questionText,
    ...(slug ? { categorySlug: slug } : {}),
    inputMode: (a.inputMode ?? 'text') as InputMode,
    ...(answer ? { answer } : {}),
    ...(a.response?.text ? { userResponse: a.response.text } : {}),
    ...(a.evaluation?.overall != null ? { score: a.evaluation.overall } : {}),
    ...(a.evaluation?.feedback ? { feedback: a.evaluation.feedback } : {}),
    ...(a.evaluation?.improvedAnswer ? { improvedAnswer: a.evaluation.improvedAnswer } : {}),
    ...(a.mockInterviewId ? { mockInterviewId: String(a.mockInterviewId) } : {}),
    isBookmarked: !!a.isBookmarked,
    createdAt: (a.createdAt as Date).toISOString(),
  };
}

export async function listHistory(
  userId: string,
  q: { q?: string; type: SessionType | 'all'; bookmarked?: boolean; page: number; limit: number },
): Promise<{ items: HistoryItem[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (q.type !== 'all') filter.sessionType = q.type;
  if (q.bookmarked !== undefined) filter.isBookmarked = q.bookmarked;
  const term = q.q?.trim();
  if (term) {
    // Literal, case-insensitive match on the question and the user's own answer (per-user, so scans stay small).
    const re = { $regex: escapeRegExp(term), $options: 'i' };
    filter.$or = [{ questionText: re }, { 'response.text': re }];
  }
  const [total, docs] = await Promise.all([
    UserAnswerModel.countDocuments(filter),
    findAnswers(filter, (q.page - 1) * q.limit, q.limit),
  ]);
  return {
    items: docs.map(toHistoryItem),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}

// ---------- Changing ----------

function assertId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('History entry not found');
}

export async function setBookmark(userId: string, id: string, isBookmarked: boolean): Promise<HistoryItem> {
  assertId(id);
  const doc = await UserAnswerModel.findOneAndUpdate({ _id: id, userId }, { $set: { isBookmarked } }, { returnDocument: 'after' }).lean();
  if (!doc) throw ApiError.notFound('History entry not found');
  return toHistoryItem(doc);
}

export async function deleteEntry(userId: string, id: string) {
  assertId(id);
  const doc = await UserAnswerModel.findOneAndDelete({ _id: id, userId }).lean();
  if (!doc) throw ApiError.notFound('History entry not found');
  if (doc.sessionType === 'mock') return; // the interview's report keeps its own snapshot
  const left = await UserAnswerModel.countDocuments({ sessionId: doc.sessionId });
  if (left === 0) await InterviewSessionModel.deleteOne({ _id: doc.sessionId, userId });
  else await InterviewSessionModel.updateOne({ _id: doc.sessionId }, { $set: { questionCount: left } }, { timestamps: false });
}

/** Delete saved history. "all" also removes mock interviews and their reports. */
export async function clearHistory(userId: string, type: SessionType | 'all') {
  const owner = { userId: new Types.ObjectId(userId) };
  if (type === 'all' || type === 'mock') {
    await Promise.all([
      MockInterviewModel.deleteMany(owner),
      PerformanceReportModel.deleteMany(owner),
    ]);
  }
  const byType = type === 'all' ? {} : { type };
  const answerType = type === 'all' ? {} : { sessionType: type };
  const [answers] = await Promise.all([
    UserAnswerModel.deleteMany({ ...owner, ...answerType }),
    InterviewSessionModel.deleteMany({ ...owner, ...byType }),
  ]);
  if (type === 'all' || type === 'mock') await refreshProfileStats(userId);
  return { deleted: answers.deletedCount };
}

/**
 * Apply a changed retention period to everything already stored: each document expires
 * `days` after it was created (0 = keep forever).
 */
export async function applyRetention(userId: string, days: number) {
  const owner = { userId: new Types.ObjectId(userId) };
  const update =
    days > 0
      ? [{ $set: { expiresAt: { $add: ['$createdAt', days * 24 * 60 * 60 * 1000] } } }]
      : [{ $unset: 'expiresAt' }];
  await Promise.all(
    [UserAnswerModel, InterviewSessionModel, MockInterviewModel, PerformanceReportModel].map((m) =>
      (m as typeof UserAnswerModel).updateMany(owner, update, { timestamps: false, updatePipeline: true }),
    ),
  );
}
