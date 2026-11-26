import { useEffect, useId } from 'react';
import type { AnswerLength, StructuredAnswer } from '@aia/shared';
import { AlertTriangle, Check, Copy, Lightbulb, Loader2, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Segmented, Tooltip } from '@/components/ui/overlays';
import { useCopy } from '@/hooks/useCopy';
import { useSpeech } from '@/hooks/useSpeech';
import { answerToText } from '@/lib/format';
import { useAppSelector } from '@/store';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy } from '@/store/aiApi';
import { cn } from '@/lib/utils';

const LENGTH_OPTIONS: { value: AnswerLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'normal', label: 'Normal' },
  { value: 'detailed', label: 'Detailed' },
];

export interface AnswerCardProps {
  question: string;
  answer: StructuredAnswer | null | undefined;
  length: AnswerLength;
  onLengthChange: (length: AnswerLength) => void;
  isLoading?: boolean;
  /** RTK Query error; mapped to friendly AI messages. */
  error?: unknown;
  onRetry?: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Renders the Module 4 answer structure: direct answer, simple explanation,
 * real-world example, code example and interview-ready answer — with
 * length switching, copy and text-to-speech.
 */
export function AnswerCard({
  question,
  answer,
  length,
  onLengthChange,
  isLoading,
  error,
  onRetry,
  onRegenerate,
  isRegenerating,
  compact,
  className,
}: AnswerCardProps) {
  const headingId = useId();

  return (
    <Card className={cn('gap-0 py-0', className)} aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <h3 id={headingId} className="text-sm leading-6 font-medium">
          <span className="mr-1.5 text-muted-foreground">Q.</span>
          {question}
        </h3>
        <Segmented label="Answer length" value={length} onValueChange={onLengthChange} options={LENGTH_OPTIONS} />
      </div>

      <div aria-live="polite" aria-busy={isLoading || isRegenerating}>
        {isLoading || isRegenerating ? (
          <div className="space-y-3 px-5 py-5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-20 w-full" />
            <p className="text-xs text-muted-foreground">Writing your answer…</p>
          </div>
        ) : error ? (
          <AnswerError error={error} onRetry={onRetry} />
        ) : answer ? (
          <AnswerBody answer={answer} compact={compact} onRegenerate={onRegenerate} />
        ) : null}
      </div>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[150px_1fr] sm:gap-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pt-0.5">{label}</p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function AnswerError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const code = errorCode(error);
  const copy = aiErrorCopy(code, errorMessage(error, 'The answer could not be generated. Please try again.'));
  const canRetry = onRetry && code !== 'AI_NOT_CONFIGURED';
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{copy.description}</p>
      </div>
      {canRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function AnswerBody({
  answer,
  compact,
  onRegenerate,
}: {
  answer: StructuredAnswer;
  compact?: boolean;
  onRegenerate?: () => void;
}) {
  const { copy, copied } = useCopy();
  const speech = useSpeech();
  const autoSpeak = useAppSelector((s) => s.settings.voice.autoSpeakAnswers);
  const { speak, supported } = speech;

  // Read new answers aloud when the user turned on auto-speak.
  useEffect(() => {
    if (autoSpeak && supported) speak(answer.interviewReadyAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the answer text changes
  }, [answer.interviewReadyAnswer]);

  return (
    <>
      <div className={cn('space-y-5 px-5 py-5', compact && 'space-y-4 py-4')}>
        <Section label="Direct answer">{answer.directAnswer}</Section>
        {answer.simpleExplanation && <Section label="Simple explanation">{answer.simpleExplanation}</Section>}
        {answer.realWorldExample && <Section label="Real-world example">{answer.realWorldExample}</Section>}
        {answer.codeExample && (
          <Section label="Code example">
            <CodeBlock language={answer.codeExample.language} code={answer.codeExample.code} />
          </Section>
        )}
      </div>

      <div className="border-t bg-accent/40 px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent-foreground uppercase">
            <Lightbulb className="size-3.5" /> Interview-ready answer
          </p>
          <div className="flex items-center gap-1">
            {speech.supported && (
              <>
                {speech.state === 'idle' && (
                  <Tooltip content="Read aloud">
                    <Button variant="ghost" size="icon-sm" aria-label="Read answer aloud" onClick={() => speech.speak(answer.interviewReadyAnswer)}>
                      <Play />
                    </Button>
                  </Tooltip>
                )}
                {speech.state === 'loading' && (
                  <Button variant="ghost" size="icon-sm" disabled aria-label="Preparing audio">
                    <Loader2 className="animate-spin" />
                  </Button>
                )}
                {speech.state === 'speaking' && (
                  <Button variant="ghost" size="icon-sm" aria-label="Pause reading" onClick={speech.pause}>
                    <Pause />
                  </Button>
                )}
                {speech.state === 'paused' && (
                  <Button variant="ghost" size="icon-sm" aria-label="Resume reading" onClick={speech.resume}>
                    <Play />
                  </Button>
                )}
                {speech.state !== 'idle' && (
                  <Button variant="ghost" size="icon-sm" aria-label="Stop reading" onClick={speech.stop}>
                    <Square />
                  </Button>
                )}
              </>
            )}
            <Tooltip content="Copy interview-ready answer">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy interview-ready answer"
                onClick={() => copy(answer.interviewReadyAnswer)}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </Tooltip>
          </div>
        </div>
        <p className="text-sm leading-relaxed">{answer.interviewReadyAnswer}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => copy(answerToText(answer), 'Full answer copied')}
          >
            Copy full answer
          </Button>
          {onRegenerate && (
            <Button variant="link" size="sm" className="h-auto gap-1 px-0 text-xs" onClick={onRegenerate}>
              <RefreshCw className="size-3" /> Regenerate
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const { copy, copied } = useCopy();
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{language}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copy(code, 'Code copied')}>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
