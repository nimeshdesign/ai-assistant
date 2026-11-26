import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeSpeech, type SpeechAnalysis } from '@aia/shared';
import { useAppSelector } from '@/store';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useTranscribeMutation } from '@/store/aiApi';
import { BrowserSpeechRecognizer, browserSttSupported } from '@/lib/voice/browserStt';
import { VoiceRecorder, recordingSupported } from '@/lib/voice/recorder';
import { VAD_PRESETS } from '@/lib/voice/vad';

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'error';

export interface VoiceResult {
  text: string;
  metrics: SpeechAnalysis;
  engine: 'server' | 'browser';
}

/**
 * Press-to-talk speech input with automatic stop on silence.
 * - 'server' engine (default): records with MediaRecorder and uploads once to our API, which
 *   transcribes in memory and keeps nothing.
 * - 'browser' engine (opt-in): the browser's own recognition service, with live interim text.
 * The microphone is released as soon as listening ends, and on unmount.
 */
export function useVoiceInput({ mode = 'question' as keyof typeof VAD_PRESETS, onResult }: { mode?: keyof typeof VAD_PRESETS; onResult?: (r: VoiceResult) => void } = {}) {
  const voice = useAppSelector((s) => s.settings.voice);
  const consent = useAppSelector((s) => s.settings.permissions.microphone);
  const [transcribe] = useTranscribeMutation();

  const [state, setState] = useState<VoiceState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const browserRef = useRef<BrowserSpeechRecognizer | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<'server' | 'browser'>('server');
  const stoppingRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const engine: 'server' | 'browser' = voice.sttEngine === 'browser' ? 'browser' : 'server';
  const supported = recordingSupported() && (engine === 'server' || browserSttSupported());

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const finish = useCallback(
    async () => {
      const recorder = recorderRef.current;
      if (!recorder || stoppingRef.current) return;
      stoppingRef.current = true;
      clearTimers();
      setLevel(0);
      try {
        const recording = await recorder.stop(); // mic released here
        recorderRef.current = null;
        if (!recording.speechDetected) {
          browserRef.current?.abort();
          browserRef.current = null;
          setState('error');
          setError("We didn't hear anything. Check your microphone and try again.");
          return;
        }
        setState('transcribing');
        let text: string;
        if (engineRef.current === 'browser') {
          text = (await browserRef.current?.stop()) ?? '';
          browserRef.current = null;
        } else {
          const res = await transcribe({ audio: recording.blob, mimeType: recording.mimeType }).unwrap();
          text = res.text;
        }
        if (!text.trim()) {
          setState('error');
          setError("We couldn't make out any words. Try speaking a little closer to the microphone.");
          return;
        }
        const r: VoiceResult = {
          text: text.trim(),
          metrics: analyzeSpeech(text, recording.durationSec, recording.longPauses),
          engine: engineRef.current,
        };
        setResult(r);
        setInterim('');
        setState('idle');
        onResultRef.current?.(r);
      } catch (err) {
        setState('error');
        setError(aiErrorCopy(errorCode(err), errorMessage(err, 'Could not turn your speech into text.')).description);
      } finally {
        stoppingRef.current = false;
      }
    },
    [transcribe],
  );

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    setResult(null);
    setInterim('');
    setElapsed(0);
    engineRef.current = engine;
    const recorder = new VoiceRecorder(VAD_PRESETS[mode], {
      onLevel: setLevel,
      onAutoStop: () => void finish(),
    });
    try {
      await recorder.start();
    } catch (err) {
      setState('error');
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setError(denied ? 'Microphone access was blocked. Allow it in your browser\'s site settings and try again.' : 'Could not start the microphone.');
      return;
    }
    recorderRef.current = recorder;
    if (engine === 'browser') {
      const rec = new BrowserSpeechRecognizer(voice.sttLanguage, {
        onInterim: setInterim,
        onError: (message) => setError(message),
      });
      try {
        rec.start();
        browserRef.current = rec;
      } catch (err) {
        recorder.cancel();
        recorderRef.current = null;
        setState('error');
        setError(err instanceof Error ? err.message : 'Speech recognition failed.');
        return;
      }
    }
    const startedAt = Date.now();
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    setState('listening');
  }, [engine, finish, mode, voice.sttLanguage]);

  const cancel = useCallback(() => {
    clearTimers();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    browserRef.current?.abort();
    browserRef.current = null;
    setLevel(0);
    setInterim('');
    setState('idle');
  }, []);

  // Never leave the microphone on after leaving the page.
  useEffect(() => cancel, [cancel]);

  return {
    state,
    level,
    elapsed,
    interim,
    result,
    error,
    engine,
    supported,
    needsConsent: !consent,
    start,
    stop: finish,
    cancel,
    reset: () => {
      setResult(null);
      setError(null);
      setState('idle');
    },
  };
}
