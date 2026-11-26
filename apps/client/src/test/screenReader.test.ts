import { describe, expect, it, vi } from 'vitest';
import type { DetectQuestionResult } from '@aia/shared';
import { changedPixels, hasChanged, THUMB_HEIGHT, THUMB_WIDTH } from '@/lib/screen/change';
import type { FrameSource, GrabbedFrame, Region } from '@/lib/screen/frames';
import type { OcrEngine } from '@/lib/screen/ocr';
import { ScreenReader, type ReaderEvent } from '@/lib/screen/screenReader';
import { contentBox, toRegion } from '@/features/assistant/RegionSelector';

// ---------- helpers ----------

/** 9×8 RGBA buffer from a brightness function. */
function pixels(f: (x: number, y: number) => number) {
  const out = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 9; x++) {
      const v = f(x, y);
      out.set([v, v, v, 255], (y * 9 + x) * 4);
    }
  return out;
}

/** Distinct thumbnails standing in for different screens. */
const SCREEN_A = new Uint8Array(THUMB_WIDTH * THUMB_HEIGHT).fill(255);
const SCREEN_B = SCREEN_A.map((v, i) => (i % 7 === 0 ? 0 : v));
const SCREEN_A_FLICKER = SCREEN_A.map((v, i) => (i < 3 ? 0 : v)); // 3 pixels changed

class FakeFrames implements FrameSource {
  signature: Uint8Array = SCREEN_A;
  regions: (Region | null)[] = [];
  available = true;
  grab(region: Region | null): GrabbedFrame | null {
    this.regions.push(region);
    return this.available ? { signature: this.signature, image: {} as HTMLCanvasElement } : null;
  }
}

class FakeOcr implements OcrEngine {
  text = '';
  confidence = 90;
  calls = 0;
  fail: Error | null = null;
  gate: Promise<void> | null = null;
  async recognize() {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.fail) throw this.fail;
    return { text: this.text, confidence: this.confidence };
  }
  async terminate() {}
}

function setup(opts: { remote?: (t: string) => Promise<DetectQuestionResult> } = {}) {
  const frames = new FakeFrames();
  const ocr = new FakeOcr();
  const events: ReaderEvent[] = [];
  const detectRemote = opts.remote ? vi.fn(opts.remote) : undefined;
  const reader = new ScreenReader({
    frames,
    ocr,
    detectRemote,
    onEvent: (e) => events.push(e),
    intervalMs: 1000,
    setTimer: () => 0, // tests drive tick() manually
    clearTimer: () => {},
    now: () => 1_000,
  });
  reader.start();
  const detections = () => events.filter((e) => e.type === 'detection').map((e) => (e as Extract<ReaderEvent, { type: 'detection' }>).detection);
  const lastStatus = () => [...events].reverse().find((e) => e.type === 'status') as Extract<ReaderEvent, { type: 'status' }>;
  return { frames, ocr, reader, events, detections, lastStatus, detectRemote };
}

// ---------- change detection ----------

/** Render text into a 160×90 grayscale thumbnail, like the real frame grabber (needs no canvas). */
function textThumb(lines: string[]): Uint8Array {
  const img = new Uint8Array(THUMB_WIDTH * THUMB_HEIGHT).fill(255);
  lines.forEach((line, row) => {
    for (let c = 0; c < line.length; c++) {
      if (line[c] === ' ') continue;
      // Each character → a 3×5 block of dark pixels whose shape depends on the character.
      const code = line.charCodeAt(c);
      for (let dy = 0; dy < 5; dy++)
        for (let dx = 0; dx < 3; dx++)
          if ((code >> ((dy * 3 + dx) % 7)) & 1) img[(8 + row * 8 + dy) * THUMB_WIDTH + 6 + c * 4 + dx] = 20;
    }
  });
  return img;
}

describe('frame change detection', () => {
  it('sees a different question on an otherwise white page', () => {
    const q1 = textThumb(['Interviewer: Hi, thanks for joining.', '', 'What is the difference between let and const?']);
    const q2 = textThumb(['function sum(arr) {', '  let total = 0;', '  for (let i = 0; i <= arr.length; i++) {', '  return total;']);
    expect(hasChanged(q1, q2)).toBe(true);
    expect(changedPixels(q1, q2)).toBeGreaterThan(100);
  });

  it('ignores a blinking cursor and tiny noise', () => {
    const page = textThumb(['What is a closure in JavaScript?']);
    const cursor = page.slice();
    for (let dy = 0; dy < 6; dy++) cursor[(30 + dy) * THUMB_WIDTH + 100] = 0; // 1×6 caret
    const noise = page.map((v, i) => (i % 97 === 0 ? Math.max(0, v - 20) : v)); // within tolerance
    expect(hasChanged(page, cursor)).toBe(false);
    expect(hasChanged(page, noise)).toBe(false);
    expect(hasChanged(page, page)).toBe(false);
  });

  it('treats the first frame as changed', () => {
    expect(hasChanged(null, SCREEN_A)).toBe(true);
  });
});

// ---------- region maths ----------

describe('region selection', () => {
  it('finds the letterboxed video area inside the preview', () => {
    // 16:9 video in a square box → bars top and bottom
    expect(contentBox(400, 400, 1600, 900)).toEqual({ x: 0, y: 87.5, w: 400, h: 225 });
  });

  it('converts a drag to fractions of the frame, clamped to the video', () => {
    const box = { x: 0, y: 50, w: 400, h: 300 };
    expect(toRegion({ x: 100, y: 125 }, { x: 300, y: 275 }, box)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(toRegion({ x: 300, y: 0 }, { x: 500, y: 500 }, box)).toEqual({ x: 0.75, y: 0, w: 0.25, h: 1 }); // dragged past the edges
    expect(toRegion({ x: 10, y: 60 }, { x: 12, y: 62 }, box)).toBeNull(); // an accidental click
  });
});

// ---------- ScreenReader ----------

describe('ScreenReader', () => {
  it('detects a clear question locally without calling the AI', async () => {
    const t = setup({ remote: async () => ({ kind: 'other', question: null, keywords: [], hasCode: false, language: null }) });
    t.ocr.text = 'Interviewer: What is the difference between let and const in JavaScript?';
    await t.reader.tick();
    expect(t.detections()).toHaveLength(1);
    expect(t.detections()[0]).toMatchObject({
      kind: 'question',
      question: 'What is the difference between let and const in JavaScript?',
      source: 'local',
      repeated: false,
    });
    expect(t.detectRemote).not.toHaveBeenCalled();
  });

  it('skips OCR when the frame has not changed (or only flickered)', async () => {
    const t = setup();
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    await t.reader.tick(); // identical frame
    t.frames.signature = SCREEN_A_FLICKER; // a few pixels flickered: still "unchanged"
    await t.reader.tick();
    expect(t.ocr.calls).toBe(1);
    expect(t.lastStatus().status).toBe('unchanged');
  });

  it('does not re-detect when the frame changes but the text does not', async () => {
    const t = setup();
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    t.frames.signature = SCREEN_B; // e.g. the cursor moved
    t.ocr.text = '  what is a CLOSURE in javascript ';
    await t.reader.tick();
    expect(t.ocr.calls).toBe(2);
    expect(t.detections()).toHaveLength(1);
  });

  it('ignores low-confidence OCR', async () => {
    const t = setup();
    t.ocr.text = 'What is a closure in JavaScript?';
    t.ocr.confidence = 20;
    await t.reader.tick();
    expect(t.detections()).toHaveLength(0);
  });

  it('asks the AI only for ambiguous text and uses its cleaned question', async () => {
    const t = setup({
      remote: async () => ({ kind: 'question', question: 'How would you design a URL shortener?', keywords: ['system design'], hasCode: false, language: null }),
    });
    t.ocr.text = 'design a url shortner for 100M users\nthink about scale';
    await t.reader.tick();
    expect(t.detectRemote).toHaveBeenCalledOnce();
    expect(t.detections()[0]).toMatchObject({ question: 'How would you design a URL shortener?', source: 'ai', keywords: ['system design'] });
  });

  it('falls back to the local guess when the AI is unavailable', async () => {
    const t = setup({ remote: async () => Promise.reject(new Error('AI_NOT_CONFIGURED')) });
    t.ocr.text = 'Implement a debounce function in JavaScript';
    await t.reader.tick();
    expect(t.detections()[0]).toMatchObject({ question: 'Implement a debounce function in JavaScript', source: 'local' });
  });

  it('does not spend an AI call on text with no sign of a question', async () => {
    const t = setup({ remote: async () => ({ kind: 'other', question: null, keywords: [], hasCode: false, language: null }) });
    t.ocr.text = 'File Edit View Window Help 10:42 AM';
    await t.reader.tick();
    expect(t.detectRemote).not.toHaveBeenCalled();
    expect(t.detections()).toHaveLength(0);
  });

  it('drops text the AI says is not interview content', async () => {
    const t = setup({ remote: async () => ({ kind: 'other', question: null, keywords: [], hasCode: false, language: null }) });
    t.ocr.text = 'Release notes: how we improved build times this quarter';
    await t.reader.tick();
    expect(t.detectRemote).toHaveBeenCalledOnce();
    expect(t.detections()).toHaveLength(0);
  });

  it('flags repeated questions within the session', async () => {
    const t = setup();
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    t.frames.signature = SCREEN_B;
    t.ocr.text = 'How does the event loop work?';
    await t.reader.tick();
    t.frames.signature = SCREEN_A;
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    expect(t.detections().map((d) => d.repeated)).toEqual([false, false, true]);
  });

  it('detects code and errors with their content', async () => {
    const t = setup();
    t.ocr.text = 'def find(xs, t):\n    for i, x in enumerate(xs):\n        if x == t:\n            return i\n    return -1';
    await t.reader.tick();
    t.frames.signature = SCREEN_B;
    t.ocr.text = 'Uncaught TypeError: Cannot read properties of undefined\n    at App (App.jsx:12:19)';
    await t.reader.tick();
    const [code, error] = t.detections();
    expect(code).toMatchObject({ kind: 'code', language: 'python', question: null });
    expect(code!.code).toContain('def find(xs, t):');
    expect(error).toMatchObject({ kind: 'error' });
  });

  it('discards a pass that was paused mid-OCR and reads again on resume', async () => {
    const t = setup();
    let release!: () => void;
    t.ocr.gate = new Promise((r) => (release = r));
    t.ocr.text = 'What is a closure in JavaScript?';
    const pending = t.reader.tick();
    t.reader.pause();
    release();
    await pending;
    expect(t.detections()).toHaveLength(0);

    t.ocr.gate = null;
    t.reader.start();
    await t.reader.tick(); // same frame, but re-read after the pause
    expect(t.detections()).toHaveLength(1);
  });

  it('never runs two passes at once', async () => {
    const t = setup();
    let release!: () => void;
    t.ocr.gate = new Promise((r) => (release = r));
    t.ocr.text = 'What is a closure in JavaScript?';
    const first = t.reader.tick();
    await t.reader.tick(); // ignored while busy
    release();
    await first;
    expect(t.ocr.calls).toBe(1);
  });

  it('re-reads after the region changes and passes the region to the frame source', async () => {
    const t = setup();
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    const region = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
    t.reader.setRegion(region);
    t.ocr.text = 'How do indexes improve query performance?';
    await t.reader.tick();
    expect(t.frames.regions.at(-1)).toEqual(region);
    expect(t.detections()).toHaveLength(2);
  });

  it('reports OCR errors and keeps going', async () => {
    const t = setup();
    t.ocr.fail = new Error('worker crashed');
    await t.reader.tick();
    expect(t.events).toContainEqual({ type: 'error', message: 'worker crashed' });
    t.ocr.fail = null;
    t.frames.signature = SCREEN_B;
    t.ocr.text = 'What is a closure in JavaScript?';
    await t.reader.tick();
    expect(t.detections()).toHaveLength(1);
  });

  it('waits when no frame is available yet', async () => {
    const t = setup();
    t.frames.available = false;
    await t.reader.tick();
    expect(t.ocr.calls).toBe(0);
    expect(t.lastStatus().status).toBe('waiting');
  });
});
