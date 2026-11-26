import { describe, expect, it } from 'vitest';
import {
  aggregateReport,
  applySpeechConfidence,
  pickMockQuestions,
  speechConfidenceScore,
  topicsForRole,
  type AnswerEvaluation,
} from '@aia/shared';

const identity = <T>(xs: T[]) => [...xs];

function evaluation(overall: number, extra: Partial<AnswerEvaluation> = {}): AnswerEvaluation {
  return {
    scores: { technicalAccuracy: overall, communication: overall, structure: overall, practicalKnowledge: overall, confidence: overall },
    overall,
    feedback: '',
    strengths: [],
    improvements: [],
    improvedAnswer: '',
    ...extra,
  };
}

describe('topicsForRole', () => {
  it('maps the offered roles and typed roles to sensible topics', () => {
    expect(topicsForRole('MERN Stack Developer')).toEqual(['mongodb', 'express', 'react', 'nodejs', 'javascript']);
    expect(topicsForRole('Senior Frontend Engineer')).toContain('css');
    expect(topicsForRole('backend engineer')).toContain('rest-apis');
    expect(topicsForRole('Full-Stack Developer')).toContain('system-design');
    expect(topicsForRole('Data Wrangler')).toEqual(['javascript', 'dsa', 'problem-solving', 'system-design', 'git']);
  });
});

describe('pickMockQuestions', () => {
  const pool = [
    { id: 1, categorySlug: 'a', difficulty: 'easy' as const },
    { id: 2, categorySlug: 'a', difficulty: 'hard' as const },
    { id: 3, categorySlug: 'a', difficulty: 'medium' as const },
    { id: 4, categorySlug: 'b', difficulty: 'hard' as const },
    { id: 5, categorySlug: 'b', difficulty: 'easy' as const },
    { id: 6, categorySlug: 'c', difficulty: 'medium' as const },
  ];

  it('alternates between topics and prefers the level difficulty', () => {
    expect(pickMockQuestions(pool, ['a', 'b', 'c'], 'junior', 4, identity).map((q) => q.id)).toEqual([1, 5, 6, 3]);
    expect(pickMockQuestions(pool, ['a', 'b'], 'senior', 2, identity).map((q) => q.id)).toEqual([2, 4]);
  });

  it('stops when the pool runs out and ignores other topics', () => {
    expect(pickMockQuestions(pool, ['b'], 'mid', 10, identity).map((q) => q.id)).toEqual([5, 4]);
    expect(pickMockQuestions(pool, ['zzz'], 'mid', 3, identity)).toEqual([]);
  });
});

describe('speech confidence', () => {
  it('scores steady delivery high and penalises fillers, pauses and extreme pace', () => {
    expect(speechConfidenceScore({ wordsPerMinute: 140, fillerWordCount: 0, longPauseCount: 0, durationSec: 60 })).toBe(100);
    // 4 fillers/min → −24; 2 long pauses → −10; slow pace (100 wpm) → −10
    expect(speechConfidenceScore({ wordsPerMinute: 100, fillerWordCount: 4, longPauseCount: 2, durationSec: 60 })).toBe(56);
    expect(speechConfidenceScore({ wordsPerMinute: 220, fillerWordCount: 30, longPauseCount: 9, durationSec: 60 })).toBe(20);
  });

  it('does not judge very short or missing recordings', () => {
    expect(speechConfidenceScore(undefined)).toBeNull();
    expect(speechConfidenceScore({ wordsPerMinute: 140, fillerWordCount: 0, longPauseCount: 0, durationSec: 3 })).toBeNull();
    const e = evaluation(60);
    expect(applySpeechConfidence(e, undefined)).toBe(e);
  });

  it('averages the AI wording score with the speech score and recomputes overall', () => {
    const out = applySpeechConfidence(evaluation(60), { wordsPerMinute: 140, fillerWordCount: 0, longPauseCount: 0, durationSec: 60 });
    expect(out.scores.confidence).toBe(80);
    expect(out.overall).toBe(64);
  });
});

describe('aggregateReport', () => {
  it('returns null when nothing was answered', () => {
    expect(aggregateReport([], { total: 5, skipped: 5 })).toBeNull();
  });

  it('averages scores, finds weak topics and picks distinct strengths and improvements', () => {
    const report = aggregateReport(
      [
        { questionText: 'Q1', topic: 'React.js', evaluation: evaluation(90, { strengths: ['Clear definition', 'Good example'], improvements: ['Mention trade-offs'] }) },
        { questionText: 'Q2', topic: 'Node.js', evaluation: evaluation(40, { strengths: ['clear definition'], improvements: ['Explain the event loop', 'Add an example'] }) },
        {
          questionText: 'Q3',
          topic: 'Node.js',
          evaluation: evaluation(60, { improvements: ['Add an example'] }),
          speechMetrics: { wordsPerMinute: 150, fillerWordCount: 3, longPauseCount: 1, durationSec: 40 },
        },
      ],
      { total: 4, skipped: 1 },
    )!;
    expect(report.overallScore).toBe(63);
    expect(report.scores.structure).toBe(63);
    expect(report.weakTopics).toEqual([{ topic: 'Node.js', score: 50 }]);
    expect(report.strengths).toEqual(['Clear definition', 'Good example']);
    expect(report.improvements).toEqual(['Explain the event loop', 'Add an example', 'Mention trade-offs']);
    expect(report.speechMetrics).toEqual({ averageWordsPerMinute: 150, totalFillerWords: 3, totalLongPauses: 1 });
    expect(report.summary).toBe(
      'You answered 3 of 4 questions and skipped 1. A solid base. Focus on structuring answers and adding concrete examples. Your weakest topic was Node.js.',
    );
    expect(report.perQuestion.map((p) => p.score)).toEqual([90, 40, 60]);
  });
});
