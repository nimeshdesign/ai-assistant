import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  InterviewQuestionModel,
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  QuestionCategoryModel,
  UserAnswerModel,
  UserModel,
  UserProfileModel,
  UserSettingsModel,
  retentionExpiry,
} from '../src/models/index.js';

const makeUser = (email = 'dev@example.com') =>
  UserModel.create({ email, name: 'Dev User', passwordHash: 'hash' });

describe('database schema', () => {
  it('creates all collections with the expected names', async () => {
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'auth_sessions',
        'interview_questions',
        'interview_sessions',
        'mock_interviews',
        'performance_reports',
        'question_categories',
        'user_answers',
        'user_profiles',
        'user_settings',
        'users',
      ].sort(),
    );
  });

  describe('users', () => {
    it('normalises email, adds timestamps and hides secrets in JSON', async () => {
      const user = await makeUser('  Dev@Example.COM ');
      expect(user.email).toBe('dev@example.com');
      expect(user.createdAt).toBeInstanceOf(Date);
      const json = user.toJSON() as Record<string, unknown>;
      expect(json.id).toBeTruthy();
      expect(json).not.toHaveProperty('_id');
      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('tokenVersion');
    });

    it('enforces unique email', async () => {
      await makeUser();
      await expect(makeUser()).rejects.toMatchObject({ code: 11000 });
    });

    it('does not select passwordHash by default', async () => {
      await makeUser();
      const found = await UserModel.findOne({ email: 'dev@example.com' });
      expect(found?.passwordHash).toBeUndefined();
      const withHash = await UserModel.findOne({ email: 'dev@example.com' }).select('+passwordHash');
      expect(withHash?.passwordHash).toBe('hash');
    });

    it('rejects invalid email', async () => {
      await expect(UserModel.create({ email: 'nope', name: 'Dev', passwordHash: 'x' })).rejects.toThrow(
        /Email is invalid/,
      );
    });
  });

  it('keeps profile and settings 1:1 with a user, with sensible defaults', async () => {
    const user = await makeUser();
    await UserProfileModel.create({ userId: user._id });
    await expect(UserProfileModel.create({ userId: user._id })).rejects.toMatchObject({ code: 11000 });

    const settings = await UserSettingsModel.create({ userId: user._id });
    expect(settings.answer?.length).toBe('normal');
    expect(settings.privacy?.storeRawAudio).toBe(false);
    expect(settings.privacy?.storeScreenshots).toBe(false);
    expect(settings.permissions?.screenCapture).toBe(false);
    await expect(UserSettingsModel.create({ userId: user._id })).rejects.toMatchObject({ code: 11000 });
  });

  it('validates enums', async () => {
    const user = await makeUser();
    await expect(
      UserProfileModel.create({ userId: user._id, experienceLevel: 'wizard' as never }),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  describe('interview_questions', () => {
    it('computes a normalised content hash and blocks duplicates per owner', async () => {
      const cat = await QuestionCategoryModel.create({ slug: 'react', name: 'React', group: 'frontend' });
      const q1 = await InterviewQuestionModel.create({ categoryId: cat._id, question: 'What is a React Hook?' });
      expect(q1.contentHash).toMatch(/^[a-f0-9]{64}$/);

      // Same question with different casing / punctuation / spacing => same hash => rejected.
      await expect(
        InterviewQuestionModel.create({ categoryId: cat._id, question: '  what is a react   hook ' }),
      ).rejects.toMatchObject({ code: 11000 });

      // A different user may save the same text in their own space.
      const user = await makeUser();
      await expect(
        InterviewQuestionModel.create({ categoryId: cat._id, question: 'What is a React hook', createdBy: user._id }),
      ).resolves.toBeTruthy();
    });

    it('supports full-text search', async () => {
      const cat = await QuestionCategoryModel.create({ slug: 'node-js', name: 'Node.js', group: 'backend' });
      await InterviewQuestionModel.create([
        { categoryId: cat._id, question: 'Explain the Node.js event loop', tags: ['async'] },
        { categoryId: cat._id, question: 'What is middleware in Express?', tags: ['express'] },
      ]);
      const hits = await InterviewQuestionModel.find({ $text: { $search: 'event loop' } });
      expect(hits).toHaveLength(1);
    });

    it('rejects non-kebab category slugs', async () => {
      await expect(
        QuestionCategoryModel.create({ slug: 'React JS', name: 'React', group: 'frontend' }),
      ).rejects.toThrow(/kebab-case/);
    });
  });

  it('links session → answer → mock interview → report', async () => {
    const user = await makeUser();
    const session = await InterviewSessionModel.create({
      userId: user._id,
      type: 'mock',
      expiresAt: retentionExpiry(30),
    });
    const mock = await MockInterviewModel.create({
      userId: user._id,
      sessionId: session._id,
      jobRole: 'Frontend Developer',
      experienceLevel: 'mid',
      totalQuestions: 5,
      questions: [{ order: 0, text: 'What is the virtual DOM?', topic: 'react' }],
    });
    const answer = await UserAnswerModel.create({
      userId: user._id,
      sessionId: session._id,
      sessionType: 'mock',
      mockInterviewId: mock._id,
      questionText: 'What is the virtual DOM?',
      inputMode: 'voice',
      response: { text: 'It is an in-memory tree…', speechMetrics: { wordsPerMinute: 140, fillerWordCount: 2 } },
      evaluation: {
        scores: { technicalAccuracy: 80, communication: 75, structure: 70, practicalKnowledge: 72, confidence: 78 },
        overall: 75,
      },
    });
    const report = await PerformanceReportModel.create({
      userId: user._id,
      mockInterviewId: mock._id,
      overallScore: 75,
      scores: { technicalAccuracy: 80, communication: 75, structure: 70, practicalKnowledge: 72, confidence: 78 },
      perQuestion: [{ answerId: answer._id, questionText: answer.questionText, score: 75 }],
      weakTopics: [{ topic: 'react', score: 70 }],
    });
    await expect(
      PerformanceReportModel.create({
        userId: user._id,
        mockInterviewId: mock._id,
        overallScore: 1,
        scores: { technicalAccuracy: 1, communication: 1, structure: 1, practicalKnowledge: 1, confidence: 1 },
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const populated = await PerformanceReportModel.findById(report._id).populate('perQuestion.answerId');
    expect((populated!.perQuestion[0]!.answerId as unknown as { inputMode: string }).inputMode).toBe('voice');
    expect(session.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects scores outside 0–100', async () => {
    const user = await makeUser();
    await expect(
      PerformanceReportModel.create({
        userId: user._id,
        mockInterviewId: new mongoose.Types.ObjectId(),
        overallScore: 150,
        scores: { technicalAccuracy: 1, communication: 1, structure: 1, practicalKnowledge: 1, confidence: 1 },
      }),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('declares TTL indexes for data retention', async () => {
    for (const model of [InterviewSessionModel, UserAnswerModel]) {
      const indexes = await model.collection.indexes();
      const ttl = indexes.find((i) => i.key.expiresAt === 1);
      expect(ttl?.expireAfterSeconds).toBe(0);
    }
  });

  it('retentionExpiry treats 0 as keep forever', () => {
    expect(retentionExpiry(0)).toBeUndefined();
    const from = new Date('2026-01-01T00:00:00Z');
    expect(retentionExpiry(1, from)?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
