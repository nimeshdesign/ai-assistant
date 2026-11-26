import { Types } from 'mongoose';
import type { AccountExport, ProfileView } from '@aia/shared';
import {
  InterviewQuestionModel,
  MockInterviewModel,
  QuestionCategoryModel,
  UserAnswerModel,
  UserModel,
  UserProfileModel,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { toAuthUser } from '../auth/auth.service.js';
import { toHistoryItem } from '../history/history.service.js';
import { getInterview, getReport } from '../mock/mock.service.js';
import { getOrCreate, toView } from '../settings/settings.routes.js';

/** Data portability: the user's account, profile, settings, history, interviews, reports and own questions. */
export async function exportAccount(userId: string): Promise<AccountExport> {
  const uid = new Types.ObjectId(userId);
  const [user, profile, settings, answers, mocks, ownQuestions, cats] = await Promise.all([
    UserModel.findById(userId),
    UserProfileModel.findOne({ userId: uid }).lean(),
    getOrCreate(userId),
    UserAnswerModel.find({ userId: uid }).sort({ createdAt: -1 }).lean(),
    MockInterviewModel.find({ userId: uid }, { _id: 1, reportId: 1 }).sort({ createdAt: -1 }).lean(),
    InterviewQuestionModel.find({ createdBy: uid }).sort({ createdAt: -1 }).lean(),
    QuestionCategoryModel.find({}, { slug: 1 }).lean(),
  ]);
  if (!user) throw ApiError.unauthorized();
  const slugById = new Map(cats.map((c) => [String(c._id), c.slug]));

  const profileView: ProfileView = {
    name: user.name,
    headline: profile?.headline ?? '',
    targetRole: profile?.targetRole ?? '',
    experienceLevel: (profile?.experienceLevel ?? 'junior') as ProfileView['experienceLevel'],
    yearsOfExperience: profile?.yearsOfExperience ?? 0,
    preferredLanguages: profile?.preferredLanguages ?? [],
  };

  return {
    exportedAt: new Date().toISOString(),
    account: toAuthUser(user),
    profile: profileView,
    settings: toView(settings!),
    history: answers.map(toHistoryItem),
    mockInterviews: await Promise.all(mocks.map((m) => getInterview(userId, String(m._id)))),
    reports: await Promise.all(mocks.filter((m) => m.reportId).map((m) => getReport(userId, String(m._id)))),
    questions: ownQuestions.map((q) => ({
      id: String(q._id),
      categorySlug: slugById.get(String(q.categoryId)) ?? 'unknown',
      question: q.question,
      difficulty: q.difficulty as AccountExport['questions'][number]['difficulty'],
      type: q.type as AccountExport['questions'][number]['type'],
      tags: q.tags ?? [],
      isOwn: true,
    })),
  };
}
