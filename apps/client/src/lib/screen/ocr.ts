import type { Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  /** 0–100 average word confidence. */
  confidence: number;
}

export interface OcrEngine {
  recognize(image: HTMLCanvasElement): Promise<OcrResult>;
  terminate(): Promise<void>;
}

export type OcrLoadProgress = (status: string, progress: number) => void;

/**
 * Tesseract.js running in a Web Worker, fully self-hosted (see scripts/copy-ocr-assets.mjs):
 * the worker, WebAssembly engine and language data are served by this app, so recognising
 * text makes no third-party requests and images never leave the browser.
 */
export class TesseractOcrEngine implements OcrEngine {
  private worker: Promise<Worker> | null = null;

  constructor(private readonly onProgress?: OcrLoadProgress) {}

  private load(): Promise<Worker> {
    this.worker ??= (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = `${window.location.origin}${import.meta.env.BASE_URL}ocr`;
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: `${base}/core`,
        langPath: `${base}/lang`,
        gzip: true,
        // Cache the language data in IndexedDB after the first download.
        cacheMethod: 'write',
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => this.onProgress?.(m.status, m.progress),
      });
    })();
    // Allow a retry if loading failed (e.g. network hiccup).
    this.worker.catch(() => {
      this.worker = null;
    });
    return this.worker;
  }

  /** Start downloading/initialising the engine before the first frame arrives. */
  preload() {
    return this.load().then(() => undefined);
  }

  async recognize(image: HTMLCanvasElement): Promise<OcrResult> {
    const worker = await this.load();
    const { data } = await worker.recognize(image);
    return { text: data.text ?? '', confidence: data.confidence ?? 0 };
  }

  async terminate() {
    const w = this.worker;
    this.worker = null;
    if (w) await (await w).terminate().catch(() => undefined);
  }
}
