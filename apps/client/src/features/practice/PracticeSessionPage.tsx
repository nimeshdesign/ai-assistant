import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, RotateCcw } from 'lucide-react';
import type { AnswerLength } from '@aia/shared';
import { AnswerCard } from '@/components/answer/AnswerCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label, Progress, Textarea } from '@/components/ui/form-controls';
import { useAppSelector } from '@/store';
import { useAiAnswer } from '@/hooks/useAiAnswer';
import { errorMessage } from '@/store/api';
import { useGetCategoriesQuery, useGetPracticeQuestionsQuery } from '@/store/questionsApi';
import { DIFFICULTY_LABELS, DIFFICULTY_TONE } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fromSearchParams } from './practiceParams';

export default function PracticeSessionPage() {
  const [params] = useSearchParams();
  const query = fromSearchParams(params);

  if (!query) {
    return (
      <Card>
        <ErrorState
          title="Invalid practice session"
          description="The session link is missing or has invalid options."
        />
        <div className="flex justify-center pb-8">
          <Button asChild>
            <Link to="/practice">Set up a new session</Link>
          </Button>
        </div>
      </Card>
    );
  }
  // Key on the query string so changing options resets the session state.
  return <Session key={params.toString()} query={query} />;
}

function Session({ query }: { query: NonNullable<ReturnType<typeof fromSearchParams>> }) {
  const defaultLength = useAppSelector((s) => s.settings.answer.length);
  const { data: questions, isLoading, isError, error, refetch } = useGetPracticeQuestionsQuery(query);
  const { data: categories } = useGetCategoriesQuery();
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [length, setLength] = useState<AnswerLength>(defaultLength);
  const [finished, setFinished] = useState(false);

  const current = questions?.[index];
  const answer = useAiAnswer(current && revealed[current.id] ? current.question : null, length, {
    source: 'practice',
    ...(current ? { questionId: current.id } : {}),
  });

  // Keyboard shortcuts: ← / → to move, R to reveal (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!questions || (e.target as HTMLElement).closest('input, textarea, [role="combobox"]')) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, questions.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
      if (e.key.toLowerCase() === 'r' && current) setRevealed((r) => ({ ...r, [current.id]: true }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [questions, current]);

  if (isLoading) return <PageLoader label="Preparing your questions…" />;
  if (isError) {
    return (
      <Card>
        <ErrorState description={errorMessage(error, 'We couldn\x27t load your questions.')} onRetry={refetch} />
      </Card>
    );
  }
  if (!questions || questions.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No questions match these options"
          description="Try another difficulty or add more categories."
          action={
            <Button asChild size="sm">
              <Link to="/practice">Change options</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const answeredCount = questions.filter((q) => revealed[q.id] || drafts[q.id]?.trim()).length;

  if (finished) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Session complete</h2>
            <p className="text-sm text-muted-foreground">
              You worked through {answeredCount} of {questions.length} questions.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => { setFinished(false); setIndex(0); }}>
              <RotateCcw /> Review answers
            </Button>
            <Button asChild>
              <Link to="/practice">New session</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const q = current!;
  const category = categories?.find((c) => c.slug === q.categorySlug);
  const isLast = index === questions.length - 1;

  return (
    <>
      <PageHeader
        title="Practice session"
        description={`${questions.length} questions · ${query.difficulty === 'mixed' ? 'Mixed difficulty' : DIFFICULTY_LABELS[query.difficulty]}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/practice">
              <ArrowLeft /> Change options
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Questions" className="order-2 lg:order-1">
          <div className="mb-3 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length} attempted
            </p>
            <Progress value={(answeredCount / questions.length) * 100} aria-label="Session progress" />
          </div>
          <ol className="space-y-1">
            {questions.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    i === index && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="w-5 shrink-0 font-mono text-xs leading-5 tabular-nums">{i + 1}.</span>
                  <span className="line-clamp-2">{item.question}</span>
                  {(revealed[item.id] || drafts[item.id]?.trim()) && (
                    <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-success" aria-label="attempted" />
                  )}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="order-1 space-y-4 lg:order-2">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  Question {index + 1} of {questions.length}
                </span>
                {category && <Badge variant="secondary">{category.name}</Badge>}
                <Badge variant={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
              </div>
              <h2 className="text-lg leading-snug font-semibold">{q.question}</h2>
              <div className="grid gap-2">
                <Label htmlFor="draft">Your answer (optional)</Label>
                <Textarea
                  id="draft"
                  rows={4}
                  placeholder="Try answering in your own words first — it helps you remember."
                  value={drafts[q.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIndex((i) => i - 1)}
                  disabled={index === 0}
                  aria-label="Previous question"
                >
                  <ArrowLeft /> Previous
                </Button>
                <div className="flex gap-2">
                  {!revealed[q.id] && (
                    <Button variant="secondary" onClick={() => setRevealed((r) => ({ ...r, [q.id]: true }))}>
                      <Eye /> Show answer
                    </Button>
                  )}
                  {isLast ? (
                    <Button onClick={() => setFinished(true)}>
                      Finish <CheckCircle2 />
                    </Button>
                  ) : (
                    <Button onClick={() => setIndex((i) => i + 1)}>
                      Next <ArrowRight />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {revealed[q.id] && (
            <AnswerCard question={q.question} length={length} onLengthChange={setLength} {...answer} />
          )}
          <p className="hidden text-xs text-muted-foreground sm:block">
            Tip: use <kbd className="rounded border px-1 font-mono">←</kbd> <kbd className="rounded border px-1 font-mono">→</kbd> to move
            between questions and <kbd className="rounded border px-1 font-mono">R</kbd> to reveal the answer.
          </p>
        </div>
      </div>
    </>
  );
}
