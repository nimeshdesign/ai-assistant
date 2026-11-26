import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { ArrowRight, CheckCircle2, Flag, Loader2, Send, SkipForward, ThumbsUp, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { EVALUATION_CRITERIA, MOCK_MIN_ANSWER_WORDS, type MockAnswerView, type SpeechAnalysis } from '@aia/shared';
import { MicConsentDialog, MicControl, SpeechMetricsSummary } from '@/components/voice/VoiceControls';
import { ScoreBars } from '@/components/common/ScoreBars';
import { EmptyState, ErrorState, PageLoader, ScoreBadge } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Progress, Textarea } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/overlays';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { errorMessage } from '@/store/api';
import {
  useCompleteMockInterviewMutation,
  useGetMockInterviewQuery,
  useSkipMockQuestionMutation,
  useSubmitMockAnswerMutation,
} from '@/store/mockApi';
import { CRITERION_LABELS, DIFFICULTY_LABELS, DIFFICULTY_TONE, capitalize } from '@/lib/format';

/** Keyed by id so moving to another interview starts with fresh local state. */
export default function MockRoomPage() {
  const { id = '' } = useParams();
  return <MockRoom key={id} id={id} />;
}

function MockRoom({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: interview, isLoading, isError, error, refetch } = useGetMockInterviewQuery(id);
  const [submitAnswer, { isLoading: evaluating }] = useSubmitMockAnswerMutation();
  const [skipQuestion, { isLoading: skipping }] = useSkipMockQuestionMutation();
  const [complete, { isLoading: completing }] = useCompleteMockInterviewMutation();

  // The question on screen. It stays put after answering so the feedback can be read, until "Next".
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string>();
  // Speech metrics for the spoken parts of this answer (combined if recorded in several takes).
  const [spoken, setSpoken] = useState<SpeechAnalysis | null>(null);
  const [micConsentOpen, setMicConsentOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const voice = useVoiceInput({
    mode: 'answer',
    onResult: (r) => {
      setFormError(undefined);
      setDraft((d) => (d.trim() ? `${d.trim()} ${r.text}` : r.text));
      setSpoken((prev) => combineMetrics(prev, r.metrics));
    },
  });

  useEffect(() => {
    if (interview && viewIndex === null) setViewIndex(Math.min(interview.currentIndex, interview.questions.length - 1));
  }, [interview, viewIndex]);

  if (isLoading) return <PageLoader label="Loading interview…" />;
  if (isError || !interview) {
    const notFound = (error as { status?: number } | undefined)?.status === 404;
    return (
      <Card className="mx-auto max-w-lg">
        {notFound ? (
          <EmptyState
            title="Interview not found"
            description="It may have been deleted or removed by your data retention setting."
            action={
              <Button asChild size="sm">
                <Link to="/mock-interview">Start a new interview</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState onRetry={refetch} />
        )}
      </Card>
    );
  }
  if (interview.status === 'completed') return <Navigate to={`/mock-interview/${interview.id}/report`} replace />;
  if (interview.status === 'abandoned') {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          title="This interview has ended"
          description="It was ended without answers, or replaced by a newer interview."
          action={
            <Button asChild size="sm">
              <Link to="/mock-interview">Start a new interview</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  if (viewIndex === null) return <PageLoader label="Loading interview…" />;

  const total = interview.questions.length;
  const q = interview.questions[viewIndex]!;
  const remaining = interview.questions.filter((x) => x.status === 'pending').length;
  const handled = total - remaining;
  const busy = evaluating || skipping || completing;

  const resetDraft = () => {
    voice.cancel();
    setSpoken(null);
    setDraft('');
    setFormError(undefined);
  };

  const finish = async () => {
    try {
      const done = await complete(interview.id).unwrap();
      resetDraft();
      if (done.status === 'completed') navigate(`/mock-interview/${interview.id}/report`);
      else navigate('/mock-interview', { replace: true });
      if (done.status !== 'completed') toast.info('Interview ended. There were no answers to score.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not finish the interview. Please try again.'));
    }
  };

  /** Move to the next pending question, or finish when none are left. */
  const goNext = (state = interview) => {
    resetDraft();
    const next = state.questions.findIndex((x) => x.status === 'pending');
    if (next === -1) void finish();
    else setViewIndex(next);
  };

  const submit = async () => {
    const words = draft.trim().split(/\s+/).filter(Boolean).length;
    if (words < MOCK_MIN_ANSWER_WORDS) {
      setFormError('Write a little more before submitting — even a rough answer helps.');
      return;
    }
    try {
      await submitAnswer({
        id: interview.id,
        questionId: q.id,
        response: draft.trim(),
        inputMode: spoken ? 'voice' : 'text',
        ...(spoken
          ? {
              speechMetrics: {
                wordsPerMinute: spoken.wordsPerMinute,
                fillerWordCount: spoken.fillerWordCount,
                longPauseCount: spoken.longPauseCount,
                durationSec: spoken.durationSec,
              },
            }
          : {}),
      }).unwrap();
      voice.cancel();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not evaluate your answer. Please try again.'));
    }
  };

  const skip = async () => {
    try {
      goNext(await skipQuestion({ id: interview.id, questionId: q.id }).unwrap());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const isLastPending = q.status === 'answered' && remaining === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {interview.jobRole} · {capitalize(interview.experienceLevel)}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Mock interview</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmEnd(true)} disabled={busy}>
          <Flag /> End interview
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Question {viewIndex + 1} of {total}
          </span>
          <span>{Math.round((handled / total) * 100)}% complete</span>
        </div>
        <Progress value={(handled / total) * 100} aria-label="Interview progress" />
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{q.topic}</Badge>
            <Badge variant={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
          </div>
          <h3 className="text-lg leading-snug font-semibold" aria-live="polite">
            {q.text}
          </h3>

          {q.status === 'answered' && q.answer ? (
            <Feedback answer={q.answer} />
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="mock-answer">Your answer</Label>
                <Textarea
                  id="mock-answer"
                  rows={6}
                  value={draft}
                  disabled={evaluating}
                  aria-invalid={!!formError}
                  aria-describedby={formError ? 'mock-answer-error' : undefined}
                  placeholder="Answer as you would out loud in the interview…"
                  onChange={(e) => {
                    setFormError(undefined);
                    setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) void submit();
                  }}
                />
                {formError && (
                  <p id="mock-answer-error" role="alert" className="text-xs text-destructive-text">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <MicControl voice={voice} size="sm" onRequestConsent={() => setMicConsentOpen(true)} />
                  <Button variant="ghost" onClick={skip} disabled={busy}>
                    <SkipForward /> Skip
                  </Button>
                </div>
                <Button onClick={submit} disabled={busy}>
                  {evaluating ? <Loader2 className="animate-spin" /> : <Send />}
                  {evaluating ? 'Evaluating…' : 'Submit answer'}
                </Button>
              </div>
              {voice.error && (
                <p role="alert" className="text-xs text-destructive-text">
                  {voice.error}
                </p>
              )}
              {spoken && <SpeechMetricsSummary metrics={spoken} />}
              <p className="text-xs text-muted-foreground">Tip: press Ctrl/⌘ + Enter to submit, or answer out loud with Voice.</p>
            </>
          )}
        </CardContent>
      </Card>

      {q.status === 'answered' && (
        <div className="flex justify-end">
          <Button onClick={() => goNext()} disabled={busy}>
            {completing ? <Loader2 className="animate-spin" /> : null}
            {isLastPending ? (
              <>
                See report <CheckCircle2 />
              </>
            ) : (
              <>
                Next question <ArrowRight />
              </>
            )}
          </Button>
        </div>
      )}

      <MicConsentDialog open={micConsentOpen} onOpenChange={setMicConsentOpen} onAllow={() => void voice.start()} />

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End the interview now?"
        description="Your report will include only the questions you have answered so far."
        confirmLabel="End interview"
        onConfirm={() => void finish()}
      />
    </div>
  );
}

function Feedback({ answer }: { answer: MockAnswerView }) {
  const { evaluation } = answer;
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Your answer{answer.inputMode === 'voice' ? ' (spoken)' : ''}</p>
        {answer.response}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Overall</span>
        <ScoreBadge score={evaluation.overall} />
      </div>

      <p className="text-sm leading-relaxed">{evaluation.feedback}</p>

      <ScoreBars items={EVALUATION_CRITERIA.map((c) => ({ label: CRITERION_LABELS[c], score: evaluation.scores[c] }))} />
      {answer.speechMetrics && (
        <p className="text-xs text-muted-foreground">Confidence also reflects your pace, filler words and pauses while speaking.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FeedbackList icon={ThumbsUp} title="What went well" items={evaluation.strengths} />
        <FeedbackList icon={TrendingUp} title="How to improve" items={evaluation.improvements} />
      </div>

      <Card className="gap-2 bg-accent/40 py-4 shadow-none">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Improved answer</CardTitle>
        </CardHeader>
        <CardContent className="px-4 text-sm leading-relaxed">{evaluation.improvedAnswer}</CardContent>
      </Card>
    </div>
  );
}

function FeedbackList({ icon: Icon, title, items }: { icon: typeof ThumbsUp; title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((s) => (
          <li key={s} className="before:mr-2 before:content-['•']">
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Merge metrics from several recordings of the same answer (durations add up, pace is re-derived). */
function combineMetrics(a: SpeechAnalysis | null, b: SpeechAnalysis): SpeechAnalysis {
  if (!a) return b;
  const durationSec = a.durationSec + b.durationSec;
  const wordCount = a.wordCount + b.wordCount;
  const wordsPerMinute = durationSec >= 3 ? Math.round((wordCount / durationSec) * 60) : 0;
  const fillers = new Map(a.topFillers);
  for (const [w, n] of b.topFillers) fillers.set(w, (fillers.get(w) ?? 0) + n);
  return {
    wordCount,
    durationSec,
    wordsPerMinute,
    fillerWordCount: a.fillerWordCount + b.fillerWordCount,
    longPauseCount: a.longPauseCount + b.longPauseCount,
    topFillers: [...fillers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3),
    pace: !wordsPerMinute ? 'unknown' : wordsPerMinute < 110 ? 'slow' : wordsPerMinute > 170 ? 'fast' : 'good',
  };
}
