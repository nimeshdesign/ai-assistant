import { Link } from 'react-router';
import { Loader2, Mic, ShieldCheck, Square, X } from 'lucide-react';
import type { SpeechAnalysis } from '@aia/shared';
import { CaptureIndicator } from '@/components/common/CaptureIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';
import type { useVoiceInput } from '@/hooks/useVoiceInput';
import { cn } from '@/lib/utils';

type Voice = ReturnType<typeof useVoiceInput>;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Big round mic button with a live level ring, status line and listening indicator. */
export function MicControl({ voice, onRequestConsent, size = 'lg' }: { voice: Voice; onRequestConsent: () => void; size?: 'lg' | 'sm' }) {
  const listening = voice.state === 'listening';
  const busy = voice.state === 'transcribing';
  const ring = Math.round(4 + voice.level * 18); // px

  const onClick = () => {
    if (listening) return void voice.stop();
    if (voice.needsConsent) return onRequestConsent();
    void voice.start();
  };

  if (size === 'sm') {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={listening ? 'destructive' : 'outline'}
          onClick={onClick}
          disabled={busy || !voice.supported}
          aria-label={listening ? 'Stop recording' : 'Answer with microphone'}
        >
          {busy ? <Loader2 className="animate-spin" /> : listening ? <Square /> : <Mic />}
          {busy ? 'Transcribing…' : listening ? `Stop · ${mmss(voice.elapsed)}` : 'Voice'}
        </Button>
        {listening && <CaptureIndicator kind="microphone" state="active" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || !voice.supported}
        aria-label={listening ? 'Stop listening' : 'Start listening'}
        aria-pressed={listening}
        className={cn(
          'flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-md transition-[box-shadow,background-color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
          listening ? 'bg-recording' : 'bg-primary hover:bg-primary/90',
        )}
        style={listening ? { boxShadow: `0 0 0 ${ring}px color-mix(in oklch, var(--recording) 25%, transparent)` } : undefined}
      >
        {busy ? <Loader2 className="size-7 animate-spin" /> : listening ? <Square className="size-7" /> : <Mic className="size-8" />}
      </button>
      <div className="min-h-10 text-center text-sm" aria-live="polite">
        {listening ? (
          <>
            <CaptureIndicator kind="microphone" state="active" />
            <p className="mt-1 text-xs text-muted-foreground">
              {mmss(voice.elapsed)} · stops automatically when you finish
            </p>
          </>
        ) : busy ? (
          <p className="text-muted-foreground">Turning your speech into text…</p>
        ) : !voice.supported ? (
          <p className="text-muted-foreground">Voice input isn't supported in this browser.</p>
        ) : (
          <p className="text-muted-foreground">Press and speak your question</p>
        )}
      </div>
      {listening && (
        <Button variant="ghost" size="sm" onClick={voice.cancel}>
          <X /> Cancel
        </Button>
      )}
    </div>
  );
}

/** Where the audio goes, stated plainly next to the mic. */
export function SttEngineNote({ engine }: { engine: 'server' | 'browser' }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success-text" />
      {engine === 'server' ? (
        <span>Your recording is sent to our server to be turned into text, then discarded — it is never stored.</span>
      ) : (
        <span>
          Using your browser's speech service — your browser sends the audio to its provider (Google for Chrome).{' '}
          <Link to="/settings?tab=voice" className="underline underline-offset-2">
            Change
          </Link>
        </span>
      )}
    </p>
  );
}

const PACE_LABEL = { slow: 'A bit slow', good: 'Good pace', fast: 'A bit fast', unknown: 'Pace —' } as const;

/** How something was said: pace, filler words, long pauses. Never about the person. */
export function SpeechMetricsSummary({ metrics }: { metrics: SpeechAnalysis }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">How you said it</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={metrics.pace === 'good' ? 'success' : metrics.pace === 'unknown' ? 'outline' : 'warning'}>
          {PACE_LABEL[metrics.pace]}
          {metrics.wordsPerMinute ? ` · ${metrics.wordsPerMinute} wpm` : ''}
        </Badge>
        <Badge variant={metrics.fillerWordCount <= 2 ? 'secondary' : 'warning'}>
          {metrics.fillerWordCount} filler word{metrics.fillerWordCount === 1 ? '' : 's'}
          {metrics.topFillers.length ? ` (${metrics.topFillers.map(([w]) => `“${w}”`).join(', ')})` : ''}
        </Badge>
        <Badge variant="secondary">
          {metrics.longPauseCount} long pause{metrics.longPauseCount === 1 ? '' : 's'}
        </Badge>
      </div>
    </div>
  );
}

/** One-time consent before the microphone is first used (the browser will still ask too). */
export function MicConsentDialog({ open, onOpenChange, onAllow }: { open: boolean; onOpenChange: (o: boolean) => void; onAllow: () => void }) {
  const update = useUpdateSettings();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="size-5 text-primary" /> Allow the microphone?
          </DialogTitle>
          <DialogDescription>Before you speak, please confirm:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li>• The microphone is only on while you're recording, with a visible “Microphone capture on” indicator.</li>
          <li>• It stops by itself when you finish speaking, or press Stop at any time.</li>
          <li>• Raw audio is never stored. Only the text of what you said is kept, if history is on.</li>
          <li>• Only use this where AI assistance and recording are allowed.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void update('permissions', { microphone: true }, { silent: true });
              onOpenChange(false);
              onAllow();
            }}
          >
            Allow and start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
