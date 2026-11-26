import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useAppSelector } from '@/store';
import { useDetectQuestionMutation } from '@/store/aiApi';
import { VideoFrameSource, type Region } from '@/lib/screen/frames';
import { TesseractOcrEngine } from '@/lib/screen/ocr';
import { ScreenReader, type Detection, type ReaderStatus } from '@/lib/screen/screenReader';

export interface EngineState {
  state: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
}

/**
 * Runs the screen-reading pipeline against the <video> preview while `active` is true.
 * Returns live status, the latest OCR text and the list of detections (newest first).
 */
export function useScreenReader(videoRef: RefObject<HTMLVideoElement | null>, active: boolean) {
  const intervalMs = useAppSelector((s) => s.settings.assistant.captureIntervalMs);
  const [detect] = useDetectQuestionMutation();
  const [status, setStatus] = useState<ReaderStatus>('idle');
  const [engine, setEngine] = useState<EngineState>({ state: 'idle', progress: 0 });
  const [lastText, setLastText] = useState<{ text: string; confidence: number } | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegionState] = useState<Region | null>(null);

  const readerRef = useRef<ScreenReader | null>(null);
  const ocrRef = useRef<TesseractOcrEngine | null>(null);

  // One OCR engine per page visit; terminated on unmount.
  useEffect(() => {
    return () => {
      void ocrRef.current?.terminate();
      ocrRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) {
      readerRef.current?.pause();
      return;
    }

    if (!ocrRef.current) {
      ocrRef.current = new TesseractOcrEngine((s, p) => {
        // Only surface loading progress (recognition progress would flicker every pass).
        if (/loading|initializ/i.test(s)) setEngine({ state: p >= 1 ? 'ready' : 'loading', progress: p });
      });
      setEngine({ state: 'loading', progress: 0 });
      ocrRef.current
        .preload()
        .then(() => setEngine({ state: 'ready', progress: 1 }))
        .catch(() => setEngine({ state: 'error', progress: 0 }));
    }

    const reader =
      readerRef.current ??
      new ScreenReader({
        frames: new VideoFrameSource(video),
        ocr: ocrRef.current,
        detectRemote: (text) => detect({ text }).unwrap(),
        intervalMs,
        onEvent: (e) => {
          if (e.type === 'status') setStatus(e.status);
          else if (e.type === 'text') setLastText({ text: e.text, confidence: e.confidence });
          else if (e.type === 'detection') {
            setError(null);
            setDetections((d) => [e.detection, ...d].slice(0, 50));
          } else if (e.type === 'error') setError(e.message);
        },
      });
    readerRef.current = reader;
    reader.start();
    return () => reader.pause();
    // `detect` is stable; interval changes are applied below without restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videoRef]);

  useEffect(() => readerRef.current?.setInterval(intervalMs), [intervalMs]);

  const setRegion = useCallback((r: Region | null) => {
    setRegionState(r);
    readerRef.current?.setRegion(r);
  }, []);

  /** Full stop: forget per-capture state (keeps detections visible). */
  const reset = useCallback(() => {
    readerRef.current?.stop();
    readerRef.current = null;
    setStatus('idle');
  }, []);

  const clearDetections = useCallback(() => setDetections([]), []);

  return { status, engine, lastText, detections, error, region, setRegion, reset, clearDetections };
}
