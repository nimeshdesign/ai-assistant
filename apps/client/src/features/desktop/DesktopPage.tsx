import { useEffect, useRef, useState } from 'react';
import { EyeOff, Loader2, Minimize2, MonitorUp, Pause, Pin, PinOff, Play, ScanText, Sparkles, Square } from 'lucide-react';
import type { AnswerLength } from '@aia/shared';
import { AnswerCard } from '@/components/answer/AnswerCard';
import { AskQuestion } from '@/components/answer/AskQuestion';
import { CaptureIndicator } from '@/components/common/CaptureIndicator';
import { MicConsentDialog, MicControl, SpeechMetricsSummary, SttEngineNote } from '@/components/voice/VoiceControls';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipProvider } from '@/components/ui/overlays';
import { Toaster } from '@/components/ui/sonner';
import { useAiAnswer } from '@/hooks/useAiAnswer';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useScreenReader } from '@/hooks/useScreenReader';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useAppSelector } from '@/store';
import { useGetProfileQuery, useGetSettingsQuery } from '@/store/authApi';
import { cn } from '@/lib/utils';
import { DetectionDetail } from '@/features/assistant/DetectionDetail';
import { questionFromSpeech } from '@/features/voice/VoicePage';
import { SourcePicker } from './SourcePicker';
import { useDesktopShell } from './useDesktopShell';

/**
 * The floating desktop assistant (Electron renders this route in a frameless window).
 * Bubble: a small round button you can drag anywhere. Panel: Screen · Voice · Ask.
 */
export default function DesktopPage() {
  useApplyTheme();
  // This route sits outside AppShell, so load the account settings/profile here too.
  useGetSettingsQuery();
  useGetProfileQuery();
  const shell = useDesktopShell();
  const [activity, setActivity] = useState({ screen: false, microphone: false });

  // Keep the tray icon / tooltip in sync with what is being captured.
  useEffect(() => shell.reportCapture(activity), [activity, shell.reportCapture]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TooltipProvider delayDuration={300}>
      {shell.state.mode === 'bubble' ? (
        <Bubble capturing={activity.screen || activity.microphone} onOpen={() => void shell.setMode('panel')} />
      ) : (
        <Panel shell={shell} activity={activity} onActivity={setActivity} />
      )}
      <SourcePicker />
      <Toaster />
    </TooltipProvider>
  );
}

function Bubble({ capturing, onOpen }: { capturing: boolean; onOpen: () => void }) {
  return (
    // The outer ring drags the window; the inner button opens the panel.
    <div className="app-drag flex size-[72px] items-center justify-center rounded-full" title="Drag to move">
      <button
        type="button"
        onClick={onOpen}
        aria-label={capturing ? 'Open assistant (capturing)' : 'Open assistant'}
        className={cn(
          'app-no-drag flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          capturing && 'ring-4 ring-recording',
        )}
      >
        <Sparkles className="size-6" />
      </button>
    </div>
  );
}

type Shell = ReturnType<typeof useDesktopShell>;

function Panel({
  shell,
  activity,
  onActivity,
}: {
  shell: Shell;
  activity: { screen: boolean; microphone: boolean };
  onActivity: React.Dispatch<React.SetStateAction<{ screen: boolean; microphone: boolean }>>;
}) {
  const [tab, setTab] = useState('screen');
  const pinned = shell.state.alwaysOnTop;

  return (
    <div
      className={cn(
        'flex h-svh flex-col overflow-hidden bg-background text-foreground',
        shell.inDesktop && 'rounded-xl border shadow-2xl',
      )}
    >
      <header className="app-drag flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-sm font-semibold">Interview AI</span>
        <div className="ml-1 flex gap-1">
          {activity.screen && <CaptureIndicator kind="screen" state="active" className="px-1.5 py-0.5 text-[10px]" />}
          {activity.microphone && <CaptureIndicator kind="microphone" state="active" className="px-1.5 py-0.5 text-[10px]" />}
        </div>
        <div className="app-no-drag ml-auto flex items-center gap-0.5">
          <Tooltip content={pinned ? 'Stop keeping on top' : 'Keep on top of other windows'}>
            <Button variant="ghost" size="icon-sm" aria-pressed={pinned} aria-label="Keep on top" onClick={() => void shell.setAlwaysOnTop(!pinned)}>
              {pinned ? <Pin /> : <PinOff />}
            </Button>
          </Tooltip>
          <Tooltip content="Collapse to bubble">
            <Button variant="ghost" size="icon-sm" aria-label="Collapse to bubble" onClick={() => void shell.setMode('bubble')}>
              <Minimize2 />
            </Button>
          </Tooltip>
          {shell.inDesktop && (
            <Tooltip content="Hide to tray (Ctrl/⌘ + Shift + Space brings it back)">
              <Button variant="ghost" size="icon-sm" aria-label="Hide to tray" onClick={shell.hide}>
                <EyeOff />
              </Button>
            </Tooltip>
          )}
        </div>
      </header>

      {!shell.inDesktop && (
        <p className="border-b bg-accent/50 px-3 py-1.5 text-xs text-accent-foreground">
          Preview of the desktop assistant. Install the desktop app for the floating window.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-3 mt-2 w-auto" aria-label="Assistant">
          <TabsTrigger value="screen">Screen</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="ask">Ask</TabsTrigger>
        </TabsList>
        {/* forceMount: switching tabs must not stop screen reading or recording. */}
        <TabsContent value="screen" forceMount className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden">
          <ScreenTab onActive={(screen) => onActivity((a) => ({ ...a, screen }))} />
        </TabsContent>
        <TabsContent value="voice" forceMount className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden">
          <VoiceTab onActive={(microphone) => onActivity((a) => ({ ...a, microphone }))} />
        </TabsContent>
        <TabsContent value="ask" forceMount className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden">
          <AskQuestion id="desktop-question" source="assistant" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const STATUS_TEXT = {
  idle: 'Not reading',
  waiting: 'Watching for questions…',
  unchanged: 'No new text',
  reading: 'Reading text…',
  analysing: 'Checking the text…',
  paused: 'Paused',
} as const;

function ScreenTab({ onActive }: { onActive: (active: boolean) => void }) {
  const update = useUpdateSettings();
  const consent = useAppSelector((s) => s.settings.permissions.screenCapture);
  const capture = useScreenCapture();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reader = useScreenReader(videoRef, capture.status === 'capturing');
  const [consentOpen, setConsentOpen] = useState(false);
  const active = capture.status === 'capturing' || capture.status === 'paused';
  const latest = reader.detections[0];

  useEffect(() => onActive(active), [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
  }, [capture.stream]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Capture controls">
        {!active ? (
          <Button size="sm" onClick={() => (consent ? void capture.start() : setConsentOpen(true))} disabled={capture.status === 'requesting'}>
            {capture.status === 'requesting' ? <Loader2 className="animate-spin" /> : <MonitorUp />}
            {capture.status === 'requesting' ? 'Choose a screen…' : 'Start reading screen'}
          </Button>
        ) : capture.status === 'capturing' ? (
          <Button size="sm" variant="secondary" onClick={capture.pause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button size="sm" onClick={capture.resume}>
            <Play /> Resume
          </Button>
        )}
        {active && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              capture.stop();
              reader.reset();
            }}
          >
            <Square /> Stop
          </Button>
        )}
      </div>
      {capture.error && (
        <p role="alert" className="text-xs text-destructive-text">
          {capture.error}
        </p>
      )}

      {active && (
        <>
          <div className="relative h-28 overflow-hidden rounded-lg border bg-muted/40">
            <video ref={videoRef} autoPlay muted playsInline className="size-full object-contain" aria-label="Shared screen preview" />
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {reader.engine.state === 'loading' ? 'Preparing text recognition…' : STATUS_TEXT[reader.status]}
          </p>
        </>
      )}

      {latest ? (
        <DetectionDetail key={latest.id} detection={latest} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          <ScanText className="size-5" />
          {active ? 'Questions on the shared screen will appear here.' : 'Share a screen or window to detect questions.'}
        </div>
      )}

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allow screen reading?</DialogTitle>
            <DialogDescription>You choose what to share. Text is read on this device; screenshots are never uploaded or stored.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Only use this where AI assistance and screen capture are allowed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void update('permissions', { screenCapture: true }, { silent: true });
                setConsentOpen(false);
                void capture.start();
              }}
            >
              Allow and choose screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoiceTab({ onActive }: { onActive: (active: boolean) => void }) {
  const defaultLength = useAppSelector((s) => s.settings.answer.length);
  const [length, setLength] = useState<AnswerLength>(defaultLength);
  const [asked, setAsked] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const answer = useAiAnswer(asked, length, { source: 'voice', inputMode: 'voice' });
  const voice = useVoiceInput({ mode: 'question', onResult: (r) => setAsked(questionFromSpeech(r.text)) });

  useEffect(() => onActive(voice.state === 'listening'), [voice.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <MicControl voice={voice} onRequestConsent={() => setConsentOpen(true)} />
      {voice.error && (
        <p role="alert" className="text-center text-xs text-destructive-text">
          {voice.error}
        </p>
      )}
      <SttEngineNote engine={voice.engine} />
      {voice.result && <SpeechMetricsSummary metrics={voice.result.metrics} />}
      {asked && <AnswerCard question={asked} length={length} onLengthChange={setLength} compact {...answer} />}
      <MicConsentDialog open={consentOpen} onOpenChange={setConsentOpen} onAllow={() => void voice.start()} />
    </div>
  );
}
