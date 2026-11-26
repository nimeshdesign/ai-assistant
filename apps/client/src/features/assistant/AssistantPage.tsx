import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Bug,
  Code2,
  Crop,
  Expand,
  Loader2,
  MessageCircleQuestion,
  MonitorUp,
  Pause,
  Play,
  Repeat,
  ScanText,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react';
import { AskQuestion } from '@/components/answer/AskQuestion';
import { CaptureIndicator } from '@/components/common/CaptureIndicator';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, Switch, Label } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useScreenReader } from '@/hooks/useScreenReader';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';
import { useAppSelector } from '@/store';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Detection, ReaderStatus } from '@/lib/screen/screenReader';
import { RegionSelector } from './RegionSelector';
import { DetectionDetail } from './DetectionDetail';

const STATUS_TEXT: Record<ReaderStatus, string> = {
  idle: 'Not reading',
  waiting: 'Watching for questions…',
  unchanged: 'No new text on screen',
  reading: 'Reading text…',
  analysing: 'Checking the text…',
  paused: 'Paused',
};

const KIND_ICON = { question: MessageCircleQuestion, code: Code2, error: Bug } as const;

export default function AssistantPage() {
  const update = useUpdateSettings();
  const consent = useAppSelector((s) => s.settings.permissions.screenCapture);
  const autoAnswer = useAppSelector((s) => s.settings.assistant.autoGenerateAnswers);
  const capture = useScreenCapture();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);

  const active = capture.status === 'capturing' || capture.status === 'paused';
  const reader = useScreenReader(videoRef, capture.status === 'capturing');

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
  }, [capture.stream]);

  // Follow the newest detection unless the user picked an older one.
  const newest = reader.detections[0];
  useEffect(() => {
    if (newest && follow) setSelectedId(newest.id);
  }, [newest, follow]);

  const selected = reader.detections.find((d) => d.id === selectedId) ?? null;

  const onStart = () => (consent ? void capture.start() : setConsentOpen(true));
  const onStop = () => {
    capture.stop();
    reader.reset();
    reader.setRegion(null);
    setSelecting(false);
  };

  return (
    <>
      <PageHeader
        title="Screen Assistant"
        description="Share a screen, window or tab. Questions on it are read on your device and answered."
        actions={active && <CaptureIndicator kind="screen" state={capture.status === 'capturing' ? 'active' : 'paused'} />}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        {/* ---------------- Capture ---------------- */}
        <Card className="xl:self-start">
          <CardHeader>
            <CardTitle>Screen capture</CardTitle>
            <CardDescription>You choose exactly what is shared. Nothing is captured in the background.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Capture controls">
              {!active ? (
                <Button onClick={onStart} disabled={capture.status === 'requesting' || !capture.supported}>
                  {capture.status === 'requesting' ? <Loader2 className="animate-spin" /> : <MonitorUp />}
                  {capture.status === 'requesting' ? 'Waiting for selection…' : 'Start'}
                </Button>
              ) : capture.status === 'capturing' ? (
                <Button variant="secondary" onClick={capture.pause}>
                  <Pause /> Pause
                </Button>
              ) : (
                <Button onClick={capture.resume}>
                  <Play /> Resume
                </Button>
              )}
              <Button variant="outline" onClick={onStop} disabled={!active}>
                <Square /> Stop
              </Button>
              <div className="ml-auto flex gap-2">
                <Button
                  variant={selecting ? 'default' : 'outline'}
                  aria-pressed={selecting}
                  onClick={() => setSelecting((s) => !s)}
                  disabled={!active}
                >
                  <Crop /> {selecting ? 'Selecting…' : 'Select area'}
                </Button>
                {reader.region && (
                  <Button variant="ghost" onClick={() => reader.setRegion(null)}>
                    <Expand /> Whole screen
                  </Button>
                )}
              </div>
            </div>

            {!capture.supported && (
              <p className="text-sm text-muted-foreground">
                Your browser does not support screen capture. Use a desktop browser or the desktop app (Phase 8).
              </p>
            )}
            {capture.error && (
              <p role="alert" className="text-sm text-destructive-text">
                {capture.error}
              </p>
            )}

            <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted/40">
              {active ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="size-full object-contain"
                    aria-label="Shared screen preview"
                  />
                  <RegionSelector
                    video={videoRef.current}
                    region={reader.region}
                    selecting={selecting}
                    onSelect={(r) => {
                      reader.setRegion(r);
                      setSelecting(false);
                    }}
                  />
                  {capture.status === 'paused' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium">
                      Paused — nothing is being read
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={ScanText}
                  title="No screen shared"
                  description="Press Start and pick a screen, window or tab."
                  className="h-full justify-center"
                />
              )}
            </div>

            {active && (
              <div className="space-y-2 text-sm" aria-live="polite">
                {reader.engine.state === 'loading' && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Preparing text recognition (first time only)…</p>
                    <Progress value={Math.round(reader.engine.progress * 100)} aria-label="Loading text recognition" />
                  </div>
                )}
                {reader.engine.state === 'error' && (
                  <p role="alert" className="text-destructive-text">
                    Text recognition could not start. Check your connection and press Start again.
                  </p>
                )}
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn('size-2 rounded-full', reader.status === 'reading' || reader.status === 'analysing' ? 'animate-pulse bg-primary' : 'bg-muted-foreground/50')} />
                  {STATUS_TEXT[reader.status]}
                  {reader.region && ' · reading selected area'}
                </p>
                {reader.error && <p className="text-xs text-destructive-text">{reader.error}</p>}
                {reader.lastText && (
                  <details className="rounded-md border p-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Text read from screen ({Math.round(reader.lastText.confidence)}% confidence)
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">
                      {reader.lastText.text || '(no text found)'}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-text" />
              <span>
                Text recognition runs in your browser. Screenshots are never uploaded or stored — only the text of a
                detected question is sent to get an answer.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- Detections ---------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Detected</CardTitle>
                <CardDescription>Questions, code and errors found on your screen.</CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="auto-answer" className="text-xs font-normal">
                    Answer automatically
                  </Label>
                  <Switch
                    id="auto-answer"
                    checked={autoAnswer}
                    onCheckedChange={(v) => void update('assistant', { autoGenerateAnswers: v })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="follow-new" className="text-xs font-normal">
                    Jump to new questions
                  </Label>
                  <Switch id="follow-new" checked={follow} onCheckedChange={setFollow} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reader.detections.length === 0 ? (
                <EmptyState
                  icon={MessageCircleQuestion}
                  title={active ? 'Nothing detected yet' : 'Start sharing to detect questions'}
                  description={
                    active
                      ? 'When a question, code or an error appears on the shared screen, it shows up here.'
                      : 'You can also type a question below.'
                  }
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{reader.detections.length} found this session</span>
                    <Button variant="ghost" size="sm" onClick={reader.clearDetections}>
                      <Trash2 /> Clear
                    </Button>
                  </div>
                  <DetectionList
                    items={reader.detections}
                    selectedId={selected?.id ?? null}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setFollow(id === reader.detections[0]?.id);
                    }}
                  />
                  {selected && (
                    <div className="border-t pt-4">
                      <DetectionDetail detection={selected} />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Or type a question</CardTitle>
            </CardHeader>
            <CardContent>
              <AskQuestion id="assistant-question" source="assistant" />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Allow screen reading?
            </DialogTitle>
            <DialogDescription>Before you share your screen, please confirm:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <li>• You choose which screen, window or tab to share — and can stop at any time.</li>
            <li>• A capture indicator stays visible the whole time.</li>
            <li>• Text is read on your device. Screenshots are not stored or uploaded.</li>
            <li>• Only use this where AI assistance and screen capture are allowed.</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            You can change this any time in{' '}
            <Link to="/settings?tab=privacy" className="underline underline-offset-2">
              Settings → Privacy
            </Link>
            .
          </p>
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
    </>
  );
}

function DetectionList({
  items,
  selectedId,
  onSelect,
}: {
  items: Detection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Detections">
      {items.map((d) => {
        const Icon = KIND_ICON[d.kind];
        const label = d.question ?? (d.kind === 'error' ? 'Error on screen' : `Code${d.language ? ` (${d.language})` : ''}`);
        return (
          <li key={d.id}>
            <button
              type="button"
              aria-current={d.id === selectedId}
              onClick={() => onSelect(d.id)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                d.id === selectedId && 'bg-accent text-accent-foreground',
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="line-clamp-2 flex-1">{label}</span>
              {d.repeated && <Repeat className="mt-0.5 size-3.5 shrink-0 text-warning-text" aria-label="seen earlier" />}
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(new Date(d.at).toISOString())}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
