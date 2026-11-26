/**
 * Frame change detection for text screens.
 *
 * Each frame is reduced to a small grayscale thumbnail (its "signature"). A frame counts as
 * changed when enough pixels differ noticeably from the previous signature. At 160×90 a line of
 * text spans hundreds of pixels, while a blinking cursor or compression noise touches only a
 * handful — so real content changes are caught and tiny flickers are ignored.
 *
 * (A 64-bit perceptual hash such as dHash is too coarse for this: on a mostly white page, swapping
 * one paragraph for another barely changes a 9×8 thumbnail, so new questions would be missed.)
 */
export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 90;

/** RGBA pixels → grayscale (one byte per pixel). */
export function toGrayscale(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) | 0;
  }
  return out;
}

/** Number of pixels whose brightness differs by more than `tolerance` (0–255). */
export function changedPixels(a: Uint8Array, b: Uint8Array, tolerance = 32): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > tolerance) n++;
  return n;
}

/**
 * True when `next` differs meaningfully from `prev`.
 * Default threshold: 0.2% of the thumbnail (≈29 of 14,400 pixels), and never fewer than 8.
 */
export function hasChanged(prev: Uint8Array | null, next: Uint8Array, minPixels?: number): boolean {
  if (!prev) return true;
  const threshold = minPixels ?? Math.max(8, Math.round(next.length * 0.002));
  return changedPixels(prev, next) >= threshold;
}
