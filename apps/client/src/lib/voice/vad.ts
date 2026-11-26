/**
 * Minimal voice-activity detection from audio levels (RMS, 0–1).
 * Pure logic so it can be unit-tested; the recorder feeds it ~20 levels per second.
 */
export interface VadOptions {
  /** RMS above this counts as speech. */
  threshold: number;
  /** After speech has started, stop once silence lasts this long. */
  silenceToStopMs: number;
  /** A silence at least this long (between speech) counts as a "long pause". */
  longPauseMs: number;
  /** Give up if nobody speaks within this time. */
  noSpeechTimeoutMs: number;
  /** Hard limit on a recording. */
  maxDurationMs: number;
}

export const VAD_PRESETS = {
  /** Asking a question: stop soon after the speaker finishes. */
  question: { threshold: 0.02, silenceToStopMs: 2200, longPauseMs: 2000, noSpeechTimeoutMs: 10_000, maxDurationMs: 60_000 },
  /** Answering in an interview: allow thinking pauses before stopping. */
  answer: { threshold: 0.02, silenceToStopMs: 5000, longPauseMs: 2000, noSpeechTimeoutMs: 15_000, maxDurationMs: 180_000 },
} satisfies Record<string, VadOptions>;

export type StopReason = 'silence' | 'no-speech' | 'max-duration';

export class VadTracker {
  private startedAt: number | null = null;
  private lastSpeechAt: number | null = null;
  private silenceStart: number | null = null;
  private pauseCounted = false;
  speechDetected = false;
  longPauses = 0;
  /** Milliseconds of audio containing speech (approximate). */
  speechMs = 0;
  private lastUpdate: number | null = null;

  constructor(private readonly o: VadOptions) {}

  /** Feed one level sample. Returns a reason when recording should stop. */
  update(level: number, now: number): { speaking: boolean; stop: StopReason | null } {
    this.startedAt ??= now;
    const dt = this.lastUpdate === null ? 0 : now - this.lastUpdate;
    this.lastUpdate = now;
    const speaking = level >= this.o.threshold;

    if (speaking) {
      if (this.speechDetected) this.speechMs += dt;
      this.speechDetected = true;
      this.lastSpeechAt = now;
      this.silenceStart = null;
      this.pauseCounted = false;
    } else if (this.speechDetected) {
      this.silenceStart ??= now;
      const silence = now - this.silenceStart;
      // Count a long pause once, when it crosses the threshold (thinking time before speaking again).
      if (!this.pauseCounted && silence >= this.o.longPauseMs) {
        this.pauseCounted = true;
        this.longPauses++;
      }
      if (silence >= this.o.silenceToStopMs) {
        // The final silence before stopping is not a pause *between* speech.
        if (this.pauseCounted) this.longPauses--;
        return { speaking, stop: 'silence' };
      }
    }

    if (!this.speechDetected && now - this.startedAt >= this.o.noSpeechTimeoutMs) return { speaking, stop: 'no-speech' };
    if (now - this.startedAt >= this.o.maxDurationMs) return { speaking, stop: 'max-duration' };
    return { speaking, stop: null };
  }

  /** Duration from start to the last moment of speech (trailing silence excluded). */
  speakingDurationMs(): number {
    if (this.startedAt === null || this.lastSpeechAt === null) return 0;
    return this.lastSpeechAt - this.startedAt;
  }
}
