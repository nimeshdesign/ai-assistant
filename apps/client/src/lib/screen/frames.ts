import { THUMB_HEIGHT, THUMB_WIDTH, toGrayscale } from './change';

/** Part of the frame to read, as fractions (0–1) of width/height. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GrabbedFrame {
  /** Small grayscale thumbnail of the (cropped) frame, for change detection. */
  signature: Uint8Array;
  /** Canvas holding the (cropped) frame at OCR resolution. */
  image: HTMLCanvasElement;
}

export interface FrameSource {
  grab(region: Region | null): GrabbedFrame | null;
}

/** Tesseract reads best when text is ~20–40px tall; cap the size to keep OCR fast. */
const MAX_OCR_WIDTH = 2000;

/**
 * Pulls frames from the <video> element that previews the shared screen.
 * Pixels stay in memory on this device; nothing here is uploaded or stored.
 */
export class VideoFrameSource implements FrameSource {
  private readonly ocrCanvas = document.createElement('canvas');
  private readonly thumbCanvas = document.createElement('canvas');

  constructor(private readonly video: HTMLVideoElement) {
    this.thumbCanvas.width = THUMB_WIDTH;
    this.thumbCanvas.height = THUMB_HEIGHT;
  }

  grab(region: Region | null): GrabbedFrame | null {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh || this.video.readyState < 2) return null;

    const r = region ?? { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(r.x * vw);
    const sy = Math.round(r.y * vh);
    const sw = Math.max(1, Math.round(r.w * vw));
    const sh = Math.max(1, Math.round(r.h * vh));

    // Small regions are upscaled (OCR struggles with tiny text); big frames are capped.
    const scale = Math.min(MAX_OCR_WIDTH / sw, sw < 800 ? 2 : 1);
    this.ocrCanvas.width = Math.round(sw * scale);
    this.ocrCanvas.height = Math.round(sh * scale);
    const ctx = this.ocrCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, this.ocrCanvas.width, this.ocrCanvas.height);

    const hctx = this.thumbCanvas.getContext('2d', { willReadFrequently: true });
    if (!hctx) return null;
    hctx.drawImage(this.ocrCanvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    const signature = toGrayscale(hctx.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT).data);

    return { signature, image: this.ocrCanvas };
  }
}
