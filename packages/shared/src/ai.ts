import { z } from 'zod';
import { ANSWER_LENGTHS, DIFFICULTIES, EXPERIENCE_LEVELS, INPUT_MODES } from './constants.js';

// ---------- Requests (validated by the API and used by client forms) ----------

export const aiAnswerRequestSchema = z.strictObject({
  question: z.string().trim().min(5, 'Enter a question (at least 5 characters)').max(2000, 'Keep the question under 2000 characters'),
  length: z.enum(ANSWER_LENGTHS).optional(),
  questionId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  /** Skip the cache and produce a fresh answer. */
  regenerate: z.boolean().optional(),
  /** Where the question was asked. When set (and "Save history" is on) the answer is saved to history. */
  source: z.enum(['practice', 'assistant', 'voice']).optional(),
  inputMode: z.enum(INPUT_MODES).optional(),
});
export type AnswerSource = NonNullable<z.infer<typeof aiAnswerRequestSchema>['source']>;
export type AiAnswerRequest = z.input<typeof aiAnswerRequestSchema>;

export const explainRequestSchema = z.strictObject({
  concept: z.string().trim().min(2, 'Enter a concept to explain').max(200, 'Keep it under 200 characters'),
  level: z.enum(EXPERIENCE_LEVELS).optional(),
});
export type ExplainRequest = z.input<typeof explainRequestSchema>;

export const analyzeCodeRequestSchema = z.strictObject({
  code: z.string().min(1, 'Paste some code to analyse').max(10_000, 'Keep the code under 10,000 characters'),
  language: z.string().trim().max(30).optional(),
  /** Optional context, e.g. the interview task the code is meant to solve. */
  task: z.string().trim().max(500).optional(),
});
export type AnalyzeCodeRequest = z.input<typeof analyzeCodeRequestSchema>;

export const evaluateRequestSchema = z.strictObject({
  question: z.string().trim().min(5).max(2000),
  answer: z.string().trim().min(1, 'Write an answer to evaluate').max(6000),
});
export type EvaluateRequest = z.input<typeof evaluateRequestSchema>;

export const generateQuestionsSchema = z.strictObject({
  categorySlug: z.string().regex(/^[a-z0-9-]+$/, 'Choose a category'),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
  count: z.coerce.number().int().min(1).max(10).default(5),
});
export type GenerateQuestionsRequest = z.input<typeof generateQuestionsSchema>;

// ---------- Responses ----------

export interface ConceptExplanation {
  title: string;
  summary: string;
  explanation: string;
  analogy: string;
  keyPoints: string[];
  example: { language: string; code: string } | null;
}

export type CodeIssueSeverity = 'error' | 'warning' | 'suggestion';

export interface CodeAnalysis {
  language: string;
  summary: string;
  issues: { severity: CodeIssueSeverity; line: number | null; title: string; detail: string; fix: string }[];
  improvedCode: string | null;
  complexity: string | null;
}

export interface AiStatus {
  configured: boolean;
  provider: 'openai' | 'none';
}

/** Error codes the AI endpoints can return, for friendly client messages. */
export const AI_ERROR_CODES = ['AI_NOT_CONFIGURED', 'AI_BUSY', 'AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_BAD_OUTPUT', 'AI_REFUSED'] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

// ---------- Screen question detection (Phase 6) ----------

export const detectQuestionRequestSchema = z.strictObject({
  /** Text extracted by OCR on the user's device. Images are never uploaded. */
  text: z.string().trim().min(8, 'Not enough text to analyse').max(4000, 'Too much text (max 4000 characters)'),
});
export type DetectQuestionRequest = z.input<typeof detectQuestionRequestSchema>;

export interface DetectQuestionResult {
  kind: 'question' | 'code' | 'error' | 'other';
  /** The cleaned-up interview question, if there is one. */
  question: string | null;
  keywords: string[];
  hasCode: boolean;
  language: string | null;
}

// ---------- Voice (Phase 7) ----------

/** OpenAI voices offered for natural-sounding answers. */
export const AI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'sage', 'shimmer'] as const;
export type AiVoice = (typeof AI_VOICES)[number];

export const STT_ENGINES = ['server', 'browser'] as const;
export type SttEngine = (typeof STT_ENGINES)[number];
export const TTS_ENGINES = ['browser', 'ai'] as const;
export type TtsEngine = (typeof TTS_ENGINES)[number];

/** Audio formats accepted by POST /ai/transcribe (what MediaRecorder produces in major browsers). */
export const TRANSCRIBE_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'] as const;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export interface TranscriptionResult {
  text: string;
}

export const speakRequestSchema = z.strictObject({
  text: z.string().trim().min(1, 'Nothing to read aloud').max(3000, 'Too long to read aloud (max 3000 characters)'),
  voice: z.enum(AI_VOICES).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});
export type SpeakRequest = z.input<typeof speakRequestSchema>;
