import { z } from 'zod';
import { DIFFICULTIES, QUESTION_TYPES } from '@aia/shared';

/*
 * Model OUTPUT schemas. They're compatible with OpenAI strict structured outputs:
 * every property is required, and optional values are expressed as `nullable`.
 * The same schemas re-validate the response on our side.
 */

const code = z.strictObject({
  language: z.string().max(30),
  code: z.string().max(8000),
});

export const answerOutputSchema = z.strictObject({
  directAnswer: z.string().min(1).max(1500),
  simpleExplanation: z.string().max(3000).nullable(),
  realWorldExample: z.string().max(3000).nullable(),
  codeExample: code.nullable(),
  interviewReadyAnswer: z.string().min(1).max(3000),
});
export type AnswerOutput = z.infer<typeof answerOutputSchema>;

export const explanationOutputSchema = z.strictObject({
  title: z.string().max(120),
  summary: z.string().max(600),
  explanation: z.string().max(4000),
  analogy: z.string().max(1500),
  keyPoints: z.array(z.string().max(300)).max(8),
  example: code.nullable(),
});

export const codeAnalysisOutputSchema = z.strictObject({
  language: z.string().max(30),
  summary: z.string().max(1500),
  issues: z
    .array(
      z.strictObject({
        severity: z.enum(['error', 'warning', 'suggestion']),
        line: z.number().int().min(1).nullable(),
        title: z.string().max(150),
        detail: z.string().max(1500),
        fix: z.string().max(1500),
      }),
    )
    .max(15),
  improvedCode: z.string().max(10_000).nullable(),
  complexity: z.string().max(300).nullable(),
});

const score = z.number().int().min(0).max(100);
export const evaluationOutputSchema = z.strictObject({
  scores: z.strictObject({
    technicalAccuracy: score,
    communication: score,
    structure: score,
    practicalKnowledge: score,
    confidence: score,
  }),
  feedback: z.string().max(2000),
  strengths: z.array(z.string().max(300)).max(5),
  improvements: z.array(z.string().max(300)).max(5),
  improvedAnswer: z.string().max(4000),
});

export const generatedQuestionsOutputSchema = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        question: z.string().min(10).max(500),
        difficulty: z.enum(DIFFICULTIES),
        type: z.enum(QUESTION_TYPES),
        tags: z.array(z.string().max(30)).max(5),
      }),
    )
    .min(1)
    .max(10),
});

export const detectionOutputSchema = z.strictObject({
  kind: z.enum(['question', 'code', 'error', 'other']),
  question: z.string().max(500).nullable(),
  keywords: z.array(z.string().max(40)).max(8),
  hasCode: z.boolean(),
  language: z.string().max(30).nullable(),
});
