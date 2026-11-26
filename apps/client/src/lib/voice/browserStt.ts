/**
 * The browser's built-in speech recognition (Web Speech API).
 * PRIVACY: in Chrome and Edge this streams audio to the browser vendor's cloud service
 * (Google / Microsoft). It is therefore opt-in and labelled as such in Settings.
 */

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const browserSttSupported = () => !!getCtor();

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked.',
  'service-not-allowed': 'Speech recognition is not allowed in this browser.',
  'no-speech': 'No speech was detected.',
  network: "The browser's speech service could not be reached.",
  'audio-capture': 'No microphone was found.',
};

export class BrowserSpeechRecognizer {
  private rec: SpeechRecognitionLike | null = null;
  private finalText = '';

  constructor(
    private readonly lang: string,
    private readonly cb: { onInterim: (text: string) => void; onError: (message: string) => void },
  ) {}

  start() {
    const Ctor = getCtor();
    if (!Ctor) throw new Error('Speech recognition is not supported in this browser.');
    this.finalText = '';
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) this.finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      this.cb.onInterim(`${this.finalText}${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') this.cb.onError(ERROR_TEXT[e.error] ?? 'Speech recognition failed.');
    };
    this.rec = rec;
    rec.start();
  }

  /** Stop listening and resolve with the final transcript. */
  stop(): Promise<string> {
    const rec = this.rec;
    if (!rec) return Promise.resolve(this.finalText.trim());
    return new Promise((resolve) => {
      rec.onend = () => resolve(this.finalText.trim());
      rec.stop();
      // Some browsers never fire `end` after an error; don't hang.
      setTimeout(() => resolve(this.finalText.trim()), 1500);
    });
  }

  abort() {
    this.rec?.abort();
    this.rec = null;
  }
}
