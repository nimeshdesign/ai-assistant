import { z } from 'zod';
import { EVALUATION_CRITERIA, EXPERIENCE_LEVELS, type Difficulty, type ExperienceLevel } from './constants.js';
import type { AnswerEvaluation, EvaluationScores, PerformanceReportView, SpeechMetrics, TopicScore } from './types.js';

/*
 * Mock interviews (Phase 9): request schemas plus the pure rules shared by the API and the client —
 * which topics a role covers, which difficulties suit a level, the speech-based confidence score
 * and how per-answer evaluations roll up into a performance report.
 */

export const MOCK_QUESTION_COUNTS = [3, 5, 8, 10] as const;
export const MOCK_MAX_FOCUS_AREAS = 10;
/** Answers shorter than this are rejected before any AI call. */
export const MOCK_MIN_ANSWER_WORDS = 3;

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

export const mockSetupSchema = z.strictObject({
  jobRole: z.string().trim().min(2, 'Enter the role you are interviewing for').max(80, 'Keep the role under 80 characters'),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  focusAreas: z
    .array(z.string().regex(/^[a-z0-9-]+$/, 'Invalid topic'))
    .max(MOCK_MAX_FOCUS_AREAS, `Choose at most ${MOCK_MAX_FOCUS_AREAS} topics`)
    .default([]),
  questionCount: z.coerce.number().int().min(1).max(10).default(5),
});
export type MockSetupRequest = z.input<typeof mockSetupSchema>;

export const mockSpeechMetricsSchema = z.strictObject({
  wordsPerMinute: z.number().min(0).max(400),
  fillerWordCount: z.number().int().min(0).max(1000),
  longPauseCount: z.number().int().min(0).max(1000),
  durationSec: z.number().min(0).max(3600),
});

export const mockAnswerSchema = z
  .strictObject({
    questionId: objectId,
    response: z.string().trim().min(1, 'Write an answer first').max(6000, 'Keep your answer under 6000 characters'),
    inputMode: z.enum(['text', 'voice']).default('text'),
    /** Only for answers that were (partly) spoken. Raw audio is never sent here. */
    speechMetrics: mockSpeechMetricsSchema.optional(),
  })
  .refine((v) => v.response.split(/\s+/).filter(Boolean).length >= MOCK_MIN_ANSWER_WORDS, {
    path: ['response'],
    message: 'Write a little more before submitting — even a rough answer helps.',
  });
export type MockAnswerRequest = z.input<typeof mockAnswerSchema>;

export const mockSkipSchema = z.strictObject({ questionId: objectId });

export const mockListQuerySchema = z.strictObject({
  status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ---------- Question selection ----------

/** Default topics for the roles offered in setup; used when the user picks no focus areas. */
const ROLE_TOPICS: { match: RegExp; topics: string[] }[] = [
  { match: /mern/i, topics: ['mongodb', 'express', 'react', 'nodejs', 'javascript'] },
  { match: /full[\s-]*stack/i, topics: ['javascript', 'react', 'nodejs', 'rest-apis', 'mongodb', 'system-design'] },
  { match: /react/i, topics: ['react', 'react-hooks', 'javascript', 'redux', 'typescript'] },
  { match: /node/i, topics: ['nodejs', 'express', 'rest-apis', 'authentication', 'mongodb'] },
  { match: /front[\s-]*end|ui\b|web/i, topics: ['html', 'css', 'javascript', 'react', 'typescript'] },
  { match: /back[\s-]*end|api|server/i, topics: ['nodejs', 'express', 'rest-apis', 'authentication', 'mongodb', 'postgresql'] },
];
const DEFAULT_TOPICS = ['javascript', 'dsa', 'problem-solving', 'system-design', 'git'];

/** Topics a mock interview should cover: the user's choice, or sensible defaults for the role. */
export function topicsForRole(jobRole: string): string[] {
  return ROLE_TOPICS.find((r) => r.match.test(jobRole))?.topics ?? DEFAULT_TOPICS;
}

/** Difficulties in order of preference for each level (first = most common). */
export function difficultyPreference(level: ExperienceLevel): Difficulty[] {
  switch (level) {
    case 'fresher':
      return ['easy', 'medium', 'hard'];
    case 'junior':
      return ['easy', 'medium', 'hard'];
    case 'mid':
      return ['medium', 'easy', 'hard'];
    case 'senior':
    case 'lead':
      return ['hard', 'medium', 'easy'];
  }
}

/**
 * Pick `count` questions, spread evenly across topics (round-robin) and preferring the
 * level's difficulties. `shuffle` is injectable so tests are deterministic.
 */
export function pickMockQuestions<Q extends { categorySlug: string; difficulty: Difficulty }>(
  pool: Q[],
  topics: string[],
  level: ExperienceLevel,
  count: number,
  shuffle: <T>(xs: T[]) => T[] = shuffleArray,
): Q[] {
  const pref = difficultyPreference(level);
  // Topic order is shuffled once, so short interviews don't always start with the same topic.
  const byTopic = shuffle(topics).map((t) =>
    shuffle(pool.filter((q) => q.categorySlug === t)).sort((a, b) => pref.indexOf(a.difficulty) - pref.indexOf(b.difficulty)),
  );
  const picked: Q[] = [];
  for (let round = 0; picked.length < count && byTopic.some((list) => list.length > round); round++) {
    for (const list of byTopic) {
      const q = list[round];
      if (q && picked.length < count) picked.push(q);
    }
  }
  return picked;
}

export function shuffleArray<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------- Confidence from speech patterns ----------

/**
 * A 0–100 delivery score from HOW an answer was spoken: pace, filler words per minute and long pauses.
 * Returns null when there is too little speech to judge. Never uses voice, accent or identity.
 */
export function speechConfidenceScore(m: SpeechMetrics | undefined): number | null {
  if (!m?.durationSec || m.durationSec < 5) return null;
  let score = 100;
  const wpm = m.wordsPerMinute ?? 0;
  if (wpm) {
    if (wpm < 90 || wpm > 190) score -= 20;
    else if (wpm < 110 || wpm > 170) score -= 10;
  }
  const minutes = m.durationSec / 60;
  const fillersPerMinute = (m.fillerWordCount ?? 0) / minutes;
  score -= Math.min(40, Math.round(fillersPerMinute * 6));
  score -= Math.min(20, (m.longPauseCount ?? 0) * 5);
  return Math.max(0, Math.min(100, score));
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * Combine the AI's wording-based confidence with the speech-based one (spoken answers only),
 * then recompute the overall score.
 */
export function applySpeechConfidence(evaluation: AnswerEvaluation, metrics: SpeechMetrics | undefined): AnswerEvaluation {
  const speech = speechConfidenceScore(metrics);
  if (speech === null) return evaluation;
  const scores = { ...evaluation.scores, confidence: avg([evaluation.scores.confidence, speech]) };
  return { ...evaluation, scores, overall: avg(Object.values(scores)) };
}

// ---------- Report ----------

export interface ReportInput {
  questionText: string;
  topic: string;
  evaluation: AnswerEvaluation;
  speechMetrics?: SpeechMetrics;
}

export type ReportBody = Pick<
  PerformanceReportView,
  'overallScore' | 'scores' | 'summary' | 'strengths' | 'improvements' | 'weakTopics' | 'perQuestion' | 'speechMetrics'
>;

export const WEAK_TOPIC_THRESHOLD = 70;

function pickDistinct(lists: string[][], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists)
    for (const item of list) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
      if (out.length === max) return out;
    }
  return out;
}

/** Roll per-answer evaluations up into a report. Returns null when nothing was answered. */
export function aggregateReport(items: ReportInput[], counts: { total: number; skipped: number }): ReportBody | null {
  if (items.length === 0) return null;

  const scores = Object.fromEntries(EVALUATION_CRITERIA.map((c) => [c, avg(items.map((x) => x.evaluation.scores[c]))])) as EvaluationScores;
  const overallScore = avg(items.map((x) => x.evaluation.overall));

  const byTopic = new Map<string, number[]>();
  for (const x of items) byTopic.set(x.topic, [...(byTopic.get(x.topic) ?? []), x.evaluation.overall]);
  const weakTopics: TopicScore[] = [...byTopic]
    .map(([topic, s]) => ({ topic, score: avg(s) }))
    .filter((t) => t.score < WEAK_TOPIC_THRESHOLD)
    .sort((a, b) => a.score - b.score);

  // Strengths from the best answers, improvements from the weakest ones.
  const best = [...items].sort((a, b) => b.evaluation.overall - a.evaluation.overall);
  const strengths = pickDistinct(best.map((x) => x.evaluation.strengths), 3);
  const improvements = pickDistinct([...best].reverse().map((x) => x.evaluation.improvements), 3);

  const spoken = items.map((x) => x.speechMetrics).filter((m): m is SpeechMetrics => !!m?.durationSec);
  const speechMetrics = spoken.length
    ? {
        averageWordsPerMinute: avg(spoken.map((m) => m.wordsPerMinute ?? 0).filter(Boolean)) || undefined,
        totalFillerWords: spoken.reduce((n, m) => n + (m.fillerWordCount ?? 0), 0),
        totalLongPauses: spoken.reduce((n, m) => n + (m.longPauseCount ?? 0), 0),
      }
    : undefined;

  const { total, skipped } = counts;
  const verdict =
    overallScore >= 75
      ? 'Strong performance overall. Keep polishing structure and examples.'
      : overallScore >= 50
        ? 'A solid base. Focus on structuring answers and adding concrete examples.'
        : 'Keep practising the fundamentals and try to explain each idea in your own words.';
  const weakest = weakTopics[0] ? ` Your weakest topic was ${weakTopics[0].topic}.` : '';
  const summary = `You answered ${items.length} of ${total} question${total === 1 ? '' : 's'}${skipped ? ` and skipped ${skipped}` : ''}. ${verdict}${weakest}`;

  return {
    overallScore,
    scores,
    summary,
    strengths,
    improvements,
    weakTopics,
    perQuestion: items.map((x) => ({ questionText: x.questionText, topic: x.topic, score: x.evaluation.overall })),
    ...(speechMetrics ? { speechMetrics } : {}),
  };
}
