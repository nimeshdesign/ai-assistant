import { vi } from 'vitest';

/**
 * Fake browser media APIs for jsdom (which has none): microphone, MediaRecorder,
 * Web Audio level metering, speech recognition and <audio> playback.
 * Tests control what the "microphone" hears via `mic.level`.
 */
export function installFakeMedia() {
  const mic = {
    level: 0, // RMS the analyser reports
    denied: false,
    tracks: [] as { stop: ReturnType<typeof vi.fn>; kind: string }[],
    get active() {
      return this.tracks.some((t) => t.stop.mock.calls.length === 0);
    },
  };

  const getUserMedia = vi.fn(async () => {
    if (mic.denied) throw new DOMException('Permission denied', 'NotAllowedError');
    const track = { stop: vi.fn(), kind: 'audio' };
    mic.tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });

  class FakeMediaRecorder {
    static isTypeSupported = (t: string) => t.startsWith('audio/webm');
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    private listeners = new Map<string, (() => void)[]>();
    constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
      if (opts?.mimeType) this.mimeType = opts.mimeType;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) });
      setTimeout(() => this.listeners.get('stop')?.forEach((l) => l()), 0);
    }
    addEventListener(type: string, fn: () => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

  class FakeAudioContext {
    createAnalyser() {
      return {
        fftSize: 1024,
        getFloatTimeDomainData(buf: Float32Array) {
          buf.fill(mic.level);
        },
      };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    close = vi.fn(async () => {});
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);

  // <audio> playback (AI voice)
  const play = vi.fn(async () => {});
  const pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:fake' });
  if (!URL.revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });

  return { mic, getUserMedia, play, pause };
}

/** Fake Web Speech API recognizer that "hears" the given phrases. */
export function installFakeSpeechRecognition(phrases: string[]) {
  const instances: FakeRecognition[] = [];
  class FakeRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    constructor() {
      instances.push(this);
    }
    start() {
      phrases.forEach((p, i) =>
        setTimeout(() => this.onresult?.({ resultIndex: i, results: phrases.slice(0, i + 1).map((t) => ({ isFinal: true, 0: { transcript: t } })) }), 10 * (i + 1)),
      );
    }
    stop() {
      setTimeout(() => this.onend?.(), 0);
    }
    abort() {}
  }
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  return instances;
}
