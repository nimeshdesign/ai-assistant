import type { SpeechMetrics } from './types.js';

/**
 * Speech-pattern metrics for the "confidence" criterion (Module 6).
 * They describe HOW something was said — pace, filler words, long pauses — from the transcript
 * and timing only. They never judge voice, accent, personality or identity.
 */

/** Multi-word fillers first so "you know" isn't counted as "know". */
export const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of', 'i guess'] as const;
export const FILLER_WORDS = ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'like', 'basically', 'actually', 'literally'] as const;

export interface SpeechAnalysis extends Required<Pick<SpeechMetrics, 'wordsPerMinute' | 'fillerWordCount' | 'longPauseCount' | 'durationSec'>> {
  wordCount: number;
  /** Most frequent fillers, e.g. [["basically", 3], ["um", 2]]. */
  topFillers: [string, number][];
  pace: 'slow' | 'good' | 'fast' | 'unknown';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

export function countFillers(text: string): Map<string, number> {
  let lower = ` ${text.toLowerCase().replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const counts = new Map<string, number>();
  for (const phrase of FILLER_PHRASES) {
    const re = new RegExp(` ${phrase} `, 'g');
    const n = (lower.match(re) ?? []).length;
    if (n) {
      counts.set(phrase, n);
      lower = lower.replace(re, ' ');
    }
  }
  for (const word of FILLER_WORDS) {
    if (word === 'like') continue; // handled below, using punctuation
    const n = (lower.match(new RegExp(` ${word} `, 'g')) ?? []).length;
    if (n) counts.set(word, (counts.get(word) ?? 0) + n);
  }
  // "like" is a filler only in hesitation positions — "that like, remembers", "and, like, it" or
  // "like um" — never as a verb or preposition ("I like React", "looks like a tree").
  const raw = text.toLowerCase();
  const likeFillers = (raw.match(/\blike\s*,|,\s*like\b(?!\s+(a|an|the|this|that)\b)|\blike\s+(um+|uh+|er+)\b/g) ?? []).length;
  if (likeFillers) counts.set('like', likeFillers);
  return counts;
}

export function analyzeSpeech(transcript: string, durationSec: number, longPauseCount = 0): SpeechAnalysis {
  const wordCount = countWords(transcript);
  const fillers = countFillers(transcript);
  const fillerWordCount = [...fillers.values()].reduce((a, b) => a + b, 0);
  // Under ~3 seconds there isn't enough speech for a meaningful pace.
  const wordsPerMinute = durationSec >= 3 && wordCount > 0 ? Math.round((wordCount / durationSec) * 60) : 0;
  const pace = !wordsPerMinute ? 'unknown' : wordsPerMinute < 110 ? 'slow' : wordsPerMinute > 170 ? 'fast' : 'good';
  return {
    wordCount,
    wordsPerMinute,
    fillerWordCount,
    longPauseCount,
    durationSec: Math.round(durationSec * 10) / 10,
    topFillers: [...fillers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    pace,
  };
}
