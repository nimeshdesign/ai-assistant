/**
 * Tray icons drawn in code (no image files to ship): a filled circle with a soft edge.
 * Violet when idle, red while the screen or microphone is being captured.
 */
export const ICON_COLORS = {
  idle: [109, 94, 252] as const, // brand violet
  capturing: [229, 57, 53] as const, // recording red
};

/** Raw BGRA bitmap of a circle (what Electron's nativeImage.createFromBitmap expects). */
export function circleBitmap(size: number, [r, g, b]: readonly [number, number, number], ring = false): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      // Anti-aliased edge; optional white inner dot as a "recording" mark.
      let alpha = Math.max(0, Math.min(1, radius - d + 0.5));
      let [pr, pg, pb] = [r, g, b];
      if (ring && d < size * 0.18) [pr, pg, pb] = [255, 255, 255];
      const i = (y * size + x) * 4;
      buf[i] = pb; // B
      buf[i + 1] = pg; // G
      buf[i + 2] = pr; // R
      buf[i + 3] = Math.round(alpha * 255);
      alpha = 0;
    }
  }
  return buf;
}
