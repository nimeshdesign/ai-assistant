import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AiVoice, TtsEngine } from '@aia/shared';
import { useAppSelector } from '@/store';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useSpeakMutation } from '@/store/aiApi';

export type SpeechState = 'idle' | 'loading' | 'speaking' | 'paused';

const browserSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Strip markdown/code so TTS reads naturally. */
export function speakable(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' (code example shown on screen) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>]/g, '')
    .trim();
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  voiceName?: string;
  engine?: TtsEngine;
  aiVoice?: AiVoice;
}

/**
 * Text-to-speech with play / pause / resume / stop.
 * - 'browser' engine: the system voices via speechSynthesis (free, offline-capable).
 * - 'ai' engine: a natural voice from POST /ai/speak, played through an <audio> element.
 *   If the AI voice fails, it falls back to the browser voice and says so.
 */
export function useSpeech() {
  const voiceSettings = useAppSelector((s) => s.settings.voice);
  const [speakAi] = useSpeakMutation();
  const [state, setState] = useState<SpeechState>('idle');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const releaseAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  useEffect(() => {
    if (!browserSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      // Only cancel speech that this hook instance started.
      if (utterRef.current) window.speechSynthesis.cancel();
      releaseAudio();
    };
  }, []);

  const speakBrowser = useCallback(
    (text: string, opts: SpeakOptions) => {
      if (!browserSupported()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.rate = opts.rate ?? voiceSettings.rate;
      u.pitch = opts.pitch ?? voiceSettings.pitch;
      const name = opts.voiceName ?? voiceSettings.voiceName;
      const voice = name ? synth.getVoices().find((v) => v.name === name) : undefined;
      if (voice) u.voice = voice;
      u.onend = u.onerror = () => {
        if (utterRef.current === u) {
          utterRef.current = null;
          setState('idle');
        }
      };
      utterRef.current = u;
      synth.speak(u);
      setState('speaking');
    },
    [voiceSettings],
  );

  const stop = useCallback(() => {
    requestRef.current++; // ignore any AI audio still being fetched
    releaseAudio();
    if (browserSupported() && utterRef.current) {
      utterRef.current = null;
      window.speechSynthesis.cancel();
    }
    setState('idle');
  }, []);

  const speak = useCallback(
    async (text: string, opts: SpeakOptions = {}) => {
      stop();
      const engine = opts.engine ?? voiceSettings.ttsEngine;
      if (engine !== 'ai') return speakBrowser(text, opts);

      const request = ++requestRef.current;
      setState('loading');
      try {
        const url = await speakAi({
          text: speakable(text).slice(0, 3000),
          voice: opts.aiVoice ?? voiceSettings.aiVoice,
          speed: opts.rate ?? voiceSettings.rate,
        }).unwrap();
        if (request !== requestRef.current) {
          URL.revokeObjectURL(url); // stopped or replaced while loading
          return;
        }
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (audioRef.current === audio) {
            releaseAudio();
            setState('idle');
          }
        };
        await audio.play();
        setState('speaking');
      } catch (err) {
        if (request !== requestRef.current) return;
        releaseAudio();
        const copy = aiErrorCopy(errorCode(err), errorMessage(err, 'The AI voice is unavailable.'));
        toast.message(`${copy.title}. Using the browser voice instead.`, { id: 'tts-fallback' });
        speakBrowser(text, opts);
      }
    },
    [speakAi, speakBrowser, stop, voiceSettings],
  );

  const pause = useCallback(() => {
    if (state !== 'speaking') return;
    if (audioRef.current) audioRef.current.pause();
    else if (browserSupported()) window.speechSynthesis.pause();
    setState('paused');
  }, [state]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    if (audioRef.current) void audioRef.current.play();
    else if (browserSupported()) window.speechSynthesis.resume();
    setState('speaking');
  }, [state]);

  return {
    supported: browserSupported() || voiceSettings.ttsEngine === 'ai',
    state,
    voices,
    speak,
    pause,
    resume,
    stop,
  };
}
