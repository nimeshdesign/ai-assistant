import express, { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Types } from 'mongoose';
import {
  aiAnswerRequestSchema,
  analyzeCodeRequestSchema,
  detectQuestionRequestSchema,
  evaluateRequestSchema,
  explainRequestSchema,
  generateQuestionsSchema,
  MAX_AUDIO_BYTES,
  normalizeQuestionText,
  speakRequestSchema,
  TRANSCRIBE_MIME_TYPES,
  type QuestionSummary,
} from '@aia/shared';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { InterviewQuestionModel, QuestionCategoryModel } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/http.js';
import * as ai from '../../services/ai/ai.service.js';
import { recordAnswer } from '../history/history.service.js';

/** Per-user limit on AI calls (cost control). Keyed by user id, so it applies across devices. */
export function createAiLimiter(enabled: boolean): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: 5 * 60_000,
    limit: env.AI_RATE_LIMIT_PER_5MIN,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `ai:${req.user!.id}`,
    handler: (_req, _res, next) =>
      next(new ApiError(429, 'AI_RATE_LIMITED', "You've made a lot of AI requests in a short time. Please wait a few minutes.")),
  });
}

export function createAiRouter(aiLimiter: RequestHandler) {
  const router = Router();
  router.use(requireAuth);

  router.get('/status', (_req, res) => sendSuccess(res, ai.aiStatus()));

  router.post('/answer', aiLimiter, async (req, res) => {
    const { question, length, regenerate, source, inputMode, questionId } = aiAnswerRequestSchema.parse(req.body);
    const answer = await ai.generateAnswer(req.user!.id, question, { length, regenerate });
    // Saved to history only when the page says where it was asked and "Save history" is on.
    if (source) await recordAnswer(req.user!.id, { source, inputMode, question, questionId, answer });
    sendSuccess(res, answer);
  });

  router.post('/explain', aiLimiter, async (req, res) => {
    const { concept, level } = explainRequestSchema.parse(req.body);
    sendSuccess(res, await ai.explainConcept(req.user!.id, concept, level));
  });

  router.post('/analyze-code', aiLimiter, async (req, res) => {
    const { code, language, task } = analyzeCodeRequestSchema.parse(req.body);
    sendSuccess(res, await ai.analyzeCode(req.user!.id, code, language, task));
  });

  router.post('/detect-question', aiLimiter, async (req, res) => {
    const { text } = detectQuestionRequestSchema.parse(req.body);
    sendSuccess(res, await ai.detectQuestion(req.user!.id, text));
  });

  /**
   * Speech-to-text. Body = the raw recording (Content-Type audio/webm, audio/ogg, …).
   * The audio is held in memory only for this request — never written to disk or stored.
   */
  router.post(
    '/transcribe',
    aiLimiter,
    express.raw({ type: (req) => /^audio\//.test(String(req.headers['content-type'] ?? '')), limit: MAX_AUDIO_BYTES }),
    async (req, res) => {
      const mimeType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!(TRANSCRIBE_MIME_TYPES as readonly string[]).includes(mimeType)) {
        throw new ApiError(415, 'UNSUPPORTED_AUDIO', `Unsupported audio format. Use one of: ${TRANSCRIBE_MIME_TYPES.join(', ')}`);
      }
      const audio = req.body as Buffer;
      if (!Buffer.isBuffer(audio) || audio.length < 1000) {
        throw new ApiError(422, 'AUDIO_TOO_SHORT', 'The recording is too short. Hold the button a little longer.');
      }
      sendSuccess(res, await ai.transcribeAudio(req.user!.id, audio, mimeType));
    },
  );

  /** Natural-sounding read-aloud. Returns MP3 bytes. */
  router.post('/speak', aiLimiter, async (req, res) => {
    const { text, voice, speed } = speakRequestSchema.parse(req.body);
    const { audio, mimeType } = await ai.speakText(req.user!.id, text, { voice, speed });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(mimeType).send(audio);
  });

  router.post('/evaluate', aiLimiter, async (req, res) => {
    const { question, answer } = evaluateRequestSchema.parse(req.body);
    sendSuccess(res, await ai.evaluateAnswer(req.user!.id, question, answer));
  });

  return router;
}

/**
 * POST /questions/generate — AI writes new practice questions for a category.
 * They're saved as the user's own private questions (source: ai_generated), skipping duplicates.
 */
export const generateQuestionsHandler: RequestHandler = async (req, res) => {
  const { categorySlug, difficulty, count } = generateQuestionsSchema.parse(req.body);
  const userId = req.user!.id;
  const category = await QuestionCategoryModel.findOne({ slug: categorySlug, isActive: true }).lean();
  if (!category) throw ApiError.validation([{ path: 'categorySlug', message: 'Choose a valid category' }]);

  const existing = await InterviewQuestionModel.find(
    { categoryId: category._id, $or: [{ createdBy: null }, { createdBy: new Types.ObjectId(userId) }] },
    { question: 1 },
  ).lean();
  const generated = await ai.generateQuestions(userId, {
    categoryName: category.name,
    categoryDescription: category.description ?? '',
    difficulty,
    count,
    avoid: existing.map((q) => q.question),
  });

  const seen = new Set(existing.map((q) => normalizeQuestionText(q.question)));
  const created: QuestionSummary[] = [];
  for (const g of generated) {
    const norm = normalizeQuestionText(g.question);
    if (seen.has(norm)) continue; // the model repeated something we already have
    seen.add(norm);
    const doc = await InterviewQuestionModel.create({
      categoryId: category._id,
      question: g.question.trim(),
      difficulty: g.difficulty,
      type: g.type,
      tags: g.tags.map((t) => t.toLowerCase().trim()).filter(Boolean),
      source: 'ai_generated',
      createdBy: userId,
      isPublic: false,
    });
    created.push({
      id: doc.id as string,
      categorySlug,
      question: doc.question,
      difficulty: doc.difficulty as QuestionSummary['difficulty'],
      type: doc.type as QuestionSummary['type'],
      tags: doc.tags,
      isOwn: true,
    });
  }
  sendSuccess(res, created, 201);
};
