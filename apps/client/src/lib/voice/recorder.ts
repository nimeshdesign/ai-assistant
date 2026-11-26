import { VadTracker, type StopReason, type VadOptions } from './vad';

export interface Recording {
  blob: Blob;
  mimeType: string;
  /** Seconds from start to the end of the last speech (trailing silence excluded). */
  durationSec: number;
  longPauses: number;
  speechDetected: boolean;
  stopReason: StopReason | 'manual';
}

export interface RecorderCallbacks {
  onLevel?: (level: number) => void;
  /** Called when voice-activity detection decides the recording is finished. */
  onAutoStop?: (reason: StopReason) => void;
}

/** Formats our API accepts, in order of preference (Chrome/Edge/Firefox: webm/ogg; Safari: mp4). */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

/**
 * Records the microphone with a live level meter and automatic stop on silence.
 * The audio stays in memory as a Blob; nothing is saved. The microphone is released
 * (indicator off) as soon as recording stops, is cancelled or fails.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunks: Blob[] = [];
  private vad: VadTracker;
  private stopReason: StopReason | 'manual' = 'manual';

  constructor(
    vadOptions: VadOptions,
    private readonly cb: RecorderCallbacks = {},
  ) {
    this.vad = new VadTracker(vadOptions);
  }

  /** Ask for the microphone and start recording. Throws a DOMException if access is denied. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);

    // Level metering for the UI and voice-activity detection.
    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    this.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      this.cb.onLevel?.(Math.min(1, rms * 4)); // scaled for display
      const { stop } = this.vad.update(rms, performance.now());
      if (stop) {
        this.stopReason = stop;
        this.cb.onAutoStop?.(stop);
      }
    }, 50);
  }

  /** Stop and return the recording. Always releases the microphone. */
  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    const done =
      recorder && recorder.state !== 'inactive'
        ? new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }))
        : Promise.resolve();
    recorder?.state !== 'inactive' && recorder?.stop();
    await done;
    const mimeType = (recorder?.mimeType || pickMimeType() || 'audio/webm').split(';')[0]!;
    const result: Recording = {
      blob: new Blob(this.chunks, { type: mimeType }),
      mimeType,
      durationSec: this.vad.speakingDurationMs() / 1000,
      longPauses: this.vad.longPauses,
      speechDetected: this.vad.speechDetected,
      stopReason: this.stopReason,
    };
    this.release();
    return result;
  }

  /** Abandon the recording and release the microphone. */
  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.chunks = [];
    this.release();
  }

  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.recorder = null;
  }
}
