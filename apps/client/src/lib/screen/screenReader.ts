import { analyzeScreenText, normalizeQuestionText, type DetectQuestionResult, type ScreenTextAnalysis } from '@aia/shared';
import { hasChanged } from './change';
import type { FrameSource, Region } from './frames';
import type { OcrEngine } from './ocr';

/** Words that suggest a question or task is present even when the local heuristics are unsure. */
const QUESTION_SIGNAL = /\?|\b(what|why|how|when|which|explain|describe|implement|write|design|compare|difference|find|build|create)\b/i;

export type ReaderStatus = 'idle' | 'waiting' | 'unchanged' | 'reading' | 'analysing' | 'paused';

export interface Detection {
  id: string;
  at: number;
  kind: 'question' | 'code' | 'error';
  question: string | null;
  code: string | null;
  language: string | null;
  keywords: string[];
  /** Raw OCR text the detection came from (shown on request, never uploaded as an image). */
  text: string;
  /** This question was already detected earlier in the session. */
  repeated: boolean;
  /** 'local' = heuristics were confident; 'ai' = the server confirmed ambiguous text. */
  source: 'local' | 'ai';
}

export type ReaderEvent =
  | { type: 'status'; status: ReaderStatus }
  | { type: 'text'; text: string; confidence: number }
  | { type: 'detection'; detection: Detection }
  | { type: 'error'; message: string };

export interface ScreenReaderOptions {
  frames: FrameSource;
  ocr: OcrEngine;
  /** Ask the server to classify ambiguous text. Omit to stay fully local. */
  detectRemote?: (text: string) => Promise<DetectQuestionResult>;
  onEvent: (e: ReaderEvent) => void;
  intervalMs: number;
  /** Minimum number of changed thumbnail pixels for a frame to count as new (default: 0.2%). */
  minChangedPixels?: number;
  /** Ignore OCR results below this average confidence (0–100). */
  minConfidence?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

/**
 * The screen-reading loop:
 *   grab frame → skip if visually unchanged → OCR → skip if text unchanged →
 *   local heuristics → (only if ambiguous) server classification → emit detection.
 * Ticks never overlap: a slow OCR pass delays the next tick instead of stacking up.
 */
export class ScreenReader {
  private timer: unknown = null;
  private running = false;
  private busy = false;
  private region: Region | null = null;
  private lastSignature: Uint8Array | null = null;
  private lastTextKey: string | null = null;
  private readonly seenQuestions = new Set<string>();
  private readonly seenSnippets = new Set<string>();
  private readonly o: Required<Omit<ScreenReaderOptions, 'detectRemote' | 'minChangedPixels'>> &
    Pick<ScreenReaderOptions, 'detectRemote' | 'minChangedPixels'>;

  constructor(opts: ScreenReaderOptions) {
    this.o = {
      minConfidence: 40,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      ...opts,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.emit({ type: 'status', status: 'waiting' });
    this.schedule(0);
  }

  pause() {
    this.running = false;
    if (this.timer) this.o.clearTimer(this.timer);
    this.timer = null;
    // A frame being read when paused is discarded, so read the screen again on resume.
    this.lastSignature = null;
    this.emit({ type: 'status', status: 'paused' });
  }

  /** Stop and forget per-capture state (but keep the session's seen questions). */
  stop() {
    this.running = false;
    if (this.timer) this.o.clearTimer(this.timer);
    this.timer = null;
    this.lastSignature = null;
    this.lastTextKey = null;
    this.emit({ type: 'status', status: 'idle' });
  }

  setRegion(region: Region | null) {
    this.region = region;
    this.lastSignature = null; // a new region always gets read
    this.lastTextKey = null;
  }

  setInterval(ms: number) {
    this.o.intervalMs = ms;
  }

  private schedule(ms: number) {
    if (!this.running) return;
    this.timer = this.o.setTimer(() => void this.tick(), ms);
  }

  private emit(e: ReaderEvent) {
    this.o.onEvent(e);
  }

  /** One pass of the pipeline. Public so tests can drive it step by step. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const frame = this.o.frames.grab(this.region);
      if (!frame) {
        this.emit({ type: 'status', status: 'waiting' });
        return;
      }
      if (!hasChanged(this.lastSignature, frame.signature, this.o.minChangedPixels)) {
        this.emit({ type: 'status', status: 'unchanged' });
        return;
      }
      this.lastSignature = frame.signature;

      this.emit({ type: 'status', status: 'reading' });
      const { text, confidence } = await this.o.ocr.recognize(frame.image);
      if (!this.running) return; // paused/stopped while OCR was running
      this.emit({ type: 'text', text, confidence });

      const key = normalizeQuestionText(text);
      if (!key || key === this.lastTextKey || confidence < this.o.minConfidence) {
        this.emit({ type: 'status', status: 'unchanged' });
        return;
      }
      this.lastTextKey = key;

      const local = analyzeScreenText(text);
      const detection = await this.classify(local, text);
      if (detection && this.running) this.emit({ type: 'detection', detection });
      this.emit({ type: 'status', status: 'waiting' });
    } catch (err) {
      this.emit({ type: 'error', message: err instanceof Error ? err.message : 'Screen reading failed' });
    } finally {
      this.busy = false;
      this.schedule(this.o.intervalMs);
    }
  }

  private async classify(local: ScreenTextAnalysis, text: string): Promise<Detection | null> {
    if (local.kind === 'empty') return null;

    let kind: Detection['kind'] | null = local.kind === 'other' ? null : local.kind;
    let question = local.question;
    let keywords = local.keywords;
    let language = local.language;
    let source: Detection['source'] = 'local';

    // Ask the server only when the local result is uncertain AND the text shows some sign of a
    // question. Otherwise every unrelated change (a clock ticking, a chat message) would cost an AI call.
    if (local.confidence === 'low' && this.o.detectRemote && text.trim().length >= 8 && QUESTION_SIGNAL.test(text)) {
      this.emit({ type: 'status', status: 'analysing' });
      try {
        const remote = await this.o.detectRemote(text.slice(0, 4000));
        source = 'ai';
        kind = remote.kind === 'other' ? null : remote.kind;
        question = remote.question ?? (remote.kind === 'question' ? local.question : null);
        keywords = remote.keywords.length ? remote.keywords : local.keywords;
        language = remote.language ?? local.language;
      } catch {
        // AI unavailable: fall back to the local guess rather than failing the pass.
      }
    }
    if (!kind) return null;

    // Repeated-content detection for this session.
    let repeated = false;
    if (question) {
      const qKey = normalizeQuestionText(question);
      repeated = this.seenQuestions.has(qKey);
      this.seenQuestions.add(qKey);
    } else {
      const sKey = normalizeQuestionText((local.code ?? text).slice(0, 500));
      repeated = this.seenSnippets.has(sKey);
      this.seenSnippets.add(sKey);
    }

    return {
      id: `${this.o.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: this.o.now(),
      kind,
      question,
      code: local.code,
      language,
      keywords,
      text,
      repeated,
      source,
    };
  }
}
