import { useCallback, useEffect, useRef, useState } from 'react';

export type CaptureStatus = 'idle' | 'requesting' | 'capturing' | 'paused' | 'error';

/**
 * User-authorised screen capture via `getDisplayMedia`. The browser/OS picker lets the user
 * choose a screen, window or tab, and shows its own sharing indicator. Nothing is captured
 * without that explicit choice, and stopping releases the stream immediately.
 * Frames are consumed by the OCR pipeline in Phase 6; this hook only manages the stream.
 */
export function useScreenCapture() {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string>();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError('Screen capture is not supported in this browser.');
      setStatus('error');
      return;
    }
    setError(undefined);
    setStatus('requesting');
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
      // The user can also stop sharing from the browser's own UI.
      s.getVideoTracks()[0]?.addEventListener('ended', stop);
      streamRef.current = s;
      setStream(s);
      setStatus('capturing');
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setError(denied ? 'Screen sharing was cancelled or blocked.' : 'Could not start screen capture.');
      setStatus(denied ? 'idle' : 'error');
    }
  }, [supported, stop]);

  const pause = useCallback(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false));
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = true));
    setStatus('capturing');
  }, []);

  // Always release the stream when leaving the page.
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { supported, status, error, stream, start, pause, resume, stop };
}
