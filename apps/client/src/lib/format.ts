import type { Difficulty, EvaluationCriterion, SessionType } from '@aia/shared';

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(iso: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type Tone = 'success' | 'warning' | 'destructive';
/** ≥75 good · 50–74 fair · <50 needs work (see UI_DESIGN.md). */
export function scoreTone(score: number): Tone {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'destructive';
}

export const CRITERION_LABELS: Record<EvaluationCriterion, string> = {
  technicalAccuracy: 'Technical accuracy',
  communication: 'Communication',
  structure: 'Answer structure',
  practicalKnowledge: 'Practical knowledge',
  confidence: 'Confidence',
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: 'Practice',
  mock: 'Mock interview',
  assistant: 'Screen assistant',
  voice: 'Voice',
};

// Full class names (not built dynamically) so Tailwind can detect them.
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  destructive: 'text-destructive-text',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const DIFFICULTY_TONE: Record<Difficulty, Tone> = { easy: 'success', medium: 'warning', hard: 'destructive' };

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plain-text version of a structured answer, for copy / text-to-speech. */
export function answerToText(a: {
  directAnswer: string;
  simpleExplanation?: string;
  realWorldExample?: string;
  codeExample?: { language: string; code: string } | null;
  interviewReadyAnswer: string;
}) {
  return [
    a.directAnswer,
    a.simpleExplanation,
    a.realWorldExample,
    a.codeExample ? `\`\`\`${a.codeExample.language}\n${a.codeExample.code}\n\`\`\`` : undefined,
    a.interviewReadyAnswer,
  ]
    .filter(Boolean)
    .join('\n\n');
}
