import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Region } from '@/lib/screen/frames';

/** Where the video is actually drawn inside an `object-contain` box (letterboxing). */
export function contentBox(boxW: number, boxH: number, videoW: number, videoH: number) {
  if (!videoW || !videoH) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / videoW, boxH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Convert a drag rectangle (box pixels) into a region as fractions of the video frame. */
export function toRegion(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: { x: number; y: number; w: number; h: number },
): Region | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x1 = clamp((Math.min(a.x, b.x) - box.x) / box.w);
  const y1 = clamp((Math.min(a.y, b.y) - box.y) / box.h);
  const x2 = clamp((Math.max(a.x, b.x) - box.x) / box.w);
  const y2 = clamp((Math.max(a.y, b.y) - box.y) / box.h);
  // Ignore accidental clicks / tiny drags.
  if (x2 - x1 < 0.03 || y2 - y1 < 0.03) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Drag over the preview to choose which part of the shared screen is read.
 * Shows the current region; when `selecting` is false the overlay ignores the pointer.
 */
export function RegionSelector({
  video,
  region,
  selecting,
  onSelect,
}: {
  video: HTMLVideoElement | null;
  region: Region | null;
  selecting: boolean;
  onSelect: (r: Region | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);

  const point = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const box = () => {
    const r = ref.current!.getBoundingClientRect();
    return contentBox(r.width, r.height, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
  };

  // Display the saved region in box pixels.
  let shown: { left: number; top: number; width: number; height: number } | null = null;
  if (drag) {
    shown = {
      left: Math.min(drag.a.x, drag.b.x),
      top: Math.min(drag.a.y, drag.b.y),
      width: Math.abs(drag.a.x - drag.b.x),
      height: Math.abs(drag.a.y - drag.b.y),
    };
  } else if (region && ref.current) {
    const b = box();
    shown = { left: b.x + region.x * b.w, top: b.y + region.y * b.h, width: region.w * b.w, height: region.h * b.h };
  }

  return (
    <div
      ref={ref}
      className={selecting ? 'absolute inset-0 cursor-crosshair touch-none' : 'pointer-events-none absolute inset-0'}
      onPointerDown={(e) => {
        if (!selecting) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = point(e);
        setDrag({ a: p, b: p });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, b: point(e) })}
      onPointerUp={() => {
        if (!drag) return;
        const r = toRegion(drag.a, drag.b, box());
        setDrag(null);
        if (r) onSelect(r);
      }}
      aria-hidden
    >
      {shown && (
        <div
          className="absolute rounded-sm border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
          style={shown}
        />
      )}
      {selecting && !drag && (
        <div className="absolute inset-x-0 top-2 mx-auto w-fit rounded-md bg-background/90 px-2 py-1 text-xs shadow">
          Drag to select the area to read
        </div>
      )}
    </div>
  );
}
