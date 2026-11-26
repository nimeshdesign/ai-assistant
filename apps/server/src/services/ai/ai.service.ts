import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  normalizeQuestionText,
  type AiStatus,
  type AiVoice,
  type TranscriptionResult,
  type AnswerEvaluation,
  type AnswerLength,
  type CodeAnalysis,
  type DetectQuestionResult,
  type ConceptExplanation,
  type ExperienceLevel,
  type StructuredAnswer,
} from '@aia/shared';
import { env } from '../../config/env.js';
import { UserProfileModel, UserSettingsModel } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { TtlCache } from './cache.js';
import { OpenAiProvider } from './openai.js';
import { AiProviderError, type AiProvider, type JsonRequest } from './provider.js';
import {
  answerPrompt,
  analyzeCodePrompt,
  detectQuestionPrompt,
  evaluatePrompt,
  explainPrompt,
  generateQuestionsPrompt,
  type AnswerPromptContext,
} from './prompts.js';
import {
  answerOutputSchema,
  codeAnalysisOutputSchema,
  detectionOutputSchema,
  evaluationOutputSchema,
  explanationOutputSchema,
  generatedQuestionsOutputSchema,
} from './schemas.js';

// ---------- Provider wiring ----------

let provider: AiProvider | null | undefined;

function getProvider(): AiProvider | null {
  if (provider === undefined) {
    provider = env.OPENAI_API_KEY
      ? new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL, timeoutMs: env.OPENAI_TIMEOUT_MS })
      : null;
  }
  return provider;
}

/** Swap the provider (tests use a fake; `null` simulates "no API key configured"). */
export function setAiProvider(p: AiProvider | null) {
  provider = p;
  answerCache.clear();
}

export function aiStatus(): AiStatus {
  const p = getProvider();
  return { configured: !!p, provider: p ? 'openai' : 'none' };
}

// ---------- Shared request runner ----------

const FAILURE_TO_HTTP: Record<AiProviderError['kind'], [number, string, string]> = {
  busy: [503, 'AI_BUSY', 'The AI service is busy right now. Please try again in a moment.'],
  timeout: [504, 'AI_TIMEOUT', 'The AI took too long to respond. Please try again.'],
  unavailable: [503, 'AI_UNAVAILABLE', 'The AI service is unavailable right now. Please try again later.'],
  refused: [422, 'AI_REFUSED', "The AI couldn't help with that request. Try rephrasing it."],
  bad_output: [502, 'AI_BAD_OUTPUT', 'The AI returned an unexpected response. Please try again.'],
};

async function run<T>(req: Omit<JsonRequest<T>, 'model'> & { model?: string }, userId: string): Promise<{ data: T; model: string }> {
  const p = getProvider();
  if (!p) {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI features are not set up on this server yet (missing OPENAI_API_KEY).');
  }
  const full: JsonRequest<T> = { ...req, model: req.model ?? env.OPENAI_MODEL };
  const started = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await p.generateJson(full);
      logger.info(
        { ai: req.name, userId, model: res.model, ms: Date.now() - started, usage: res.usage, attempt },
        'AI request complete',
      );
      return { data: res.data, model: res.model };
    } catch (err) {
      const e = err instanceof AiProviderError ? err : new AiProviderError('unavailable', 'Unexpected AI error', err);
      // A malformed response is often a one-off: retry once. Other failures were already retried by the SDK.
      if (e.kind === 'bad_output' && attempt < 2) {
        logger.warn({ ai: req.name, userId, reason: e.message }, 'Retrying after malformed AI output');
        continue;
      }
      logger.warn({ ai: req.name, userId, kind: e.kind, reason: e.message, ms: Date.now() - started }, 'AI request failed');
      const [status, code, message] = FAILURE_TO_HTTP[e.kind];
      throw new ApiError(status, code, message);
    }
  }
}

// ---------- User context ----------

interface UserAiContext extends AnswerPromptContext {
  model: string;
  temperature: number;
}

async function loadContext(userId: string, length?: AnswerLength): Promise<UserAiContext> {
  const [settings, profile] = await Promise.all([
    UserSettingsModel.findOne({ userId }).lean(),
    UserProfileModel.findOne({ userId }).lean(),
  ]);
  const choice = settings?.ai?.model ?? '';
  return {
    length: length ?? (settings?.answer?.length as AnswerLength | undefined) ?? 'normal',
    style: (settings?.answer?.style as AnswerPromptContext['style']) ?? 'conversational',
    includeCodeExamples: settings?.answer?.includeCodeExamples ?? true,
    codeLanguage: settings?.answer?.codeLanguage ?? 'javascript',
    experienceLevel: (profile?.experienceLevel as ExperienceLevel) ?? 'junior',
    targetRole: profile?.targetRole || undefined,
    preferredLanguages: profile?.preferredLanguages ?? [],
    model: choice === 'quality' ? env.OPENAI_MODEL_QUALITY : env.OPENAI_MODEL,
    temperature: settings?.ai?.temperature ?? 0.4,
  };
}

// ---------- Features ----------

const answerCache = new TtlCache<StructuredAnswer & { model: string }>(500, 60 * 60 * 1000);

/** Cache key covers everything that changes the answer — never the user's identity. */
function answerKey(question: string, ctx: UserAiContext) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        normalizeQuestionText(question),
        ctx.length,
        ctx.style,
        ctx.includeCodeExamples ? ctx.codeLanguage : '-',
        ctx.experienceLevel,
        ctx.targetRole ?? '',
        ctx.preferredLanguages,
        ctx.model,
      ]),
    )
    .digest('hex');
}

export async function generateAnswer(
  userId: string,
  question: string,
  opts: { length?: AnswerLength; regenerate?: boolean } = {},
): Promise<StructuredAnswer & { model: string; cached: boolean }> {
  const ctx = await loadContext(userId, opts.length);
  const key = answerKey(question, ctx);
  if (!opts.regenerate) {
    const hit = answerCache.get(key);
    if (hit) return { ...hit, cached: true };
  }

  const { system, user } = answerPrompt(question, ctx);
  const maxTokens = { short: 400, normal: 900, detailed: 1800 }[ctx.length];
  const { data, model } = await run(
    {
      name: 'interview_answer',
      system,
      user,
      schema: answerOutputSchema,
      model: ctx.model,
      // A fresh take on "regenerate": nudge the temperature up a little.
      temperature: Math.round(Math.min(1, ctx.temperature + (opts.regenerate ? 0.2 : 0)) * 100) / 100,
      maxTokens,
    },
    userId,
  );

  // Enforce the length contract even if the model over-delivers.
  const answer: StructuredAnswer = {
    directAnswer: data.directAnswer,
    interviewReadyAnswer: data.interviewReadyAnswer,
    length: ctx.length,
    ...(ctx.length !== 'short' && data.simpleExplanation ? { simpleExplanation: data.simpleExplanation } : {}),
    ...(ctx.length !== 'short' && data.realWorldExample ? { realWorldExample: data.realWorldExample } : {}),
    codeExample: ctx.length !== 'short' && ctx.includeCodeExamples ? data.codeExample : null,
  };
  answerCache.set(key, { ...answer, model });
  return { ...answer, model, cached: false };
}

export async function explainConcept(userId: string, concept: string, level?: ExperienceLevel): Promise<ConceptExplanation> {
  const ctx = await loadContext(userId);
  const { system, user } = explainPrompt(concept, level ?? ctx.experienceLevel);
  const { data } = await run(
    { name: 'concept_explanation', system, user, schema: explanationOutputSchema, model: ctx.model, temperature: ctx.temperature, maxTokens: 1500 },
    userId,
  );
  return data;
}

export async function analyzeCode(userId: string, code: string, language?: string, task?: string): Promise<CodeAnalysis> {
  const ctx = await loadContext(userId);
  const { system, user } = analyzeCodePrompt(code, language, task);
  const { data } = await run(
    // Reviews should be consistent: keep temperature low regardless of the user's creativity setting.
    { name: 'code_analysis', system, user, schema: codeAnalysisOutputSchema, model: ctx.model, temperature: 0.2, maxTokens: 3000 },
    userId,
  );
  return data;
}

export async function evaluateAnswer(
  userId: string,
  question: string,
  answer: string,
  opts: { level?: ExperienceLevel; jobRole?: string } = {},
): Promise<AnswerEvaluation> {
  const ctx = await loadContext(userId);
  const { system, user } = evaluatePrompt(question, answer, opts.level ?? ctx.experienceLevel, opts.jobRole);
  const { data } = await run(
    { name: 'answer_evaluation', system, user, schema: evaluationOutputSchema, model: ctx.model, temperature: 0.2, maxTokens: 1500 },
    userId,
  );
  const values = Object.values(data.scores);
  return { ...data, overall: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
}

export async function generateQuestions(
  userId: string,
  opts: { categoryName: string; categoryDescription: string; difficulty: z.infer<typeof generatedQuestionsOutputSchema>['questions'][number]['difficulty']; count: number; avoid: string[] },
) {
  const ctx = await loadContext(userId);
  const { system, user } = generateQuestionsPrompt({ ...opts, level: ctx.experienceLevel });
  const { data } = await run(
    { name: 'generated_questions', system, user, schema: generatedQuestionsOutputSchema, model: ctx.model, temperature: 0.8, maxTokens: 1500 },
    userId,
  );
  return data.questions.slice(0, opts.count);
}

/** Classify OCR text from the screen and extract a clean question. Only text is sent — never images. */
export async function detectQuestion(userId: string, text: string): Promise<DetectQuestionResult> {
  const ctx = await loadContext(userId);
  const { system, user } = detectQuestionPrompt(text);
  const { data } = await run(
    // Classification should be deterministic and cheap: low temperature, small budget, fast model.
    { name: 'screen_detection', system, user, schema: detectionOutputSchema, model: ctx.model, temperature: 0, maxTokens: 300 },
    userId,
  );
  return data;
}

// ---------- Voice (Phase 7) ----------

/** Run a non-JSON provider call (audio) with the same error mapping and logging as `run`. */
async function callProvider<T>(name: string, userId: string, fn: (p: AiProvider) => Promise<T>): Promise<T> {
  const p = getProvider();
  if (!p) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI features are not set up on this server yet (missing OPENAI_API_KEY).');
  const started = Date.now();
  try {
    const result = await fn(p);
    logger.info({ ai: name, userId, ms: Date.now() - started }, 'AI request complete');
    return result;
  } catch (err) {
    const e = err instanceof AiProviderError ? err : new AiProviderError('unavailable', 'Unexpected AI error', err);
    logger.warn({ ai: name, userId, kind: e.kind, reason: e.message, ms: Date.now() - started }, 'AI request failed');
    const [status, code, message] = FAILURE_TO_HTTP[e.kind];
    throw new ApiError(status, code, message);
  }
}

/** Vocabulary hints: help the speech model spell technical terms the way developers write them. */
const TECH_VOCABULARY =
  'JavaScript, TypeScript, React, Redux, Next.js, useEffect, useMemo, useCallback, Node.js, Express, MongoDB, ' +
  'PostgreSQL, MySQL, REST API, GraphQL, JWT, OAuth, CORS, Docker, Kubernetes, CI/CD, Git, closure, event loop, ' +
  'async/await, promise, Big O, hash map, linked list, binary search, recursion, middleware.';

/**
 * Speech-to-text. The audio buffer lives only in memory for the duration of this request and is
 * then garbage-collected: it is never written to disk or the database.
 */
export async function transcribeAudio(userId: string, audio: Buffer, mimeType: string): Promise<TranscriptionResult> {
  const settings = await UserSettingsModel.findOne({ userId }, { 'voice.sttLanguage': 1 }).lean();
  const language = (settings?.voice?.sttLanguage ?? 'en-US').split('-')[0]!.toLowerCase();
  const { text } = await callProvider('transcription', userId, (p) =>
    p.transcribe({ audio, mimeType, model: env.OPENAI_STT_MODEL, language, prompt: TECH_VOCABULARY }),
  );
  return { text: text.trim() };
}

const SPEAKING_STYLE =
  'Speak like a calm, friendly software developer answering in a job interview: natural pace, clear, confident, not robotic.';

export async function speakText(
  userId: string,
  text: string,
  opts: { voice?: AiVoice; speed?: number } = {},
): Promise<{ audio: Buffer; mimeType: string }> {
  const settings = await UserSettingsModel.findOne({ userId }, { voice: 1 }).lean();
  const voice = opts.voice ?? (settings?.voice?.aiVoice as AiVoice | undefined) ?? 'alloy';
  const speed = opts.speed ?? settings?.voice?.rate ?? 1;
  return callProvider('speech', userId, (p) =>
    p.speak({ text, voice, speed, model: env.OPENAI_TTS_MODEL, instructions: SPEAKING_STYLE }),
  );
}
