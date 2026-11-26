import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Play, Search, Trash2, UserRound } from 'lucide-react';
import {
  CATEGORY_GROUPS,
  CATEGORY_GROUP_LABELS,
  DIFFICULTIES,
  type CategoryView,
  type Difficulty,
} from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/form-controls';
import { ConfirmDialog } from '@/components/ui/overlays';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/store/api';
import {
  useDeleteQuestionMutation,
  useGetCategoriesQuery,
  useGetMyQuestionsQuery,
  useSearchQuestionsQuery,
} from '@/store/questionsApi';
import { DIFFICULTY_LABELS, DIFFICULTY_TONE, TONE_TEXT } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AddQuestionDialog } from './AddQuestionDialog';
import { GenerateQuestionsDialog } from './GenerateQuestionsDialog';
import { QUESTION_COUNTS, practiceSchema, toSearchParams } from './practiceParams';

export default function PracticePage() {
  const navigate = useNavigate();
  const { data: categories, isLoading, isError, refetch } = useGetCategoriesQuery();
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [count, setCount] = useState(10);
  const [error, setError] = useState<string>();

  const nameOf = (slug: string) => categories?.find((c) => c.slug === slug)?.name ?? slug;
  const available = selected.reduce((n, s) => n + (categories?.find((c) => c.slug === s)?.questionCount ?? 0), 0);

  const toggle = (slug: string) => {
    setError(undefined);
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  };
  const toggleGroup = (cats: CategoryView[]) => {
    setError(undefined);
    const slugs = cats.filter((c) => c.questionCount > 0).map((c) => c.slug);
    const allOn = slugs.every((s) => selected.includes(s));
    setSelected((cur) => (allOn ? cur.filter((s) => !slugs.includes(s)) : [...new Set([...cur, ...slugs])]));
  };

  const start = () => {
    const parsed = practiceSchema.safeParse({ categories: selected, difficulty, count });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    navigate(`/practice/session?${toSearchParams(parsed.data)}`);
  };

  return (
    <>
      <PageHeader
        title="Practice"
        description="Choose topics, a difficulty and how many questions you want."
        actions={
          categories && (
            <>
              <AddQuestionDialog categories={categories} />
              <GenerateQuestionsDialog categories={categories} />
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {isLoading ? (
            CATEGORY_GROUPS.map((g) => (
              <Card key={g}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))
          ) : isError || !categories ? (
            <Card>
              <ErrorState description="We couldn't load the question categories." onRetry={refetch} />
            </Card>
          ) : (
            CATEGORY_GROUPS.map((group) => {
              const cats = categories.filter((c) => c.group === group);
              if (cats.length === 0) return null;
              const allOn = cats.filter((c) => c.questionCount > 0).every((c) => selected.includes(c.slug));
              return (
                <Card key={group}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{CATEGORY_GROUP_LABELS[group]}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => toggleGroup(cats)}>
                      {allOn ? 'Clear' : 'Select all'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                      role="group"
                      aria-label={`${CATEGORY_GROUP_LABELS[group]} categories`}
                    >
                      {cats.map((c) => {
                        const on = selected.includes(c.slug);
                        const empty = c.questionCount === 0;
                        return (
                          <button
                            key={c.slug}
                            type="button"
                            aria-pressed={on}
                            aria-label={c.name}
                            aria-describedby={`cat-desc-${c.slug}`}
                            disabled={empty}
                            onClick={() => toggle(c.slug)}
                            className={cn(
                              'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                              on && 'border-primary bg-accent/60 hover:bg-accent/60',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground',
                                on && 'bg-primary text-primary-foreground',
                              )}
                            >
                              <CategoryIcon name={c.icon} className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{c.name}</span>
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                                  {c.questionCount}
                                </span>
                              </span>
                              <span id={`cat-desc-${c.slug}`} className="block text-xs text-muted-foreground">
                                {empty ? 'No questions yet' : c.description}
                                {/* The corner number shows the count visually; announce it to screen readers here. */}
                                {!empty && <span className="sr-only"> · {c.questionCount} questions</span>}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Session options</CardTitle>
              <CardDescription>
                {selected.length === 0
                  ? 'No categories selected'
                  : `${selected.length} ${selected.length === 1 ? 'category' : 'categories'} · ${available} questions available`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((s) => (
                    <Badge key={s} variant="secondary">
                      {nameOf(s)}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty | 'mixed')}>
                  <SelectTrigger id="difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="count">Number of questions</Label>
                <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                  <SelectTrigger id="count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} questions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive-text">
                  {error}
                </p>
              )}
              <Button className="w-full" onClick={start} disabled={isLoading}>
                <Play /> Start practice
              </Button>
            </CardContent>
          </Card>

          <QuestionSearch nameOf={nameOf} />
          <MyQuestions nameOf={nameOf} />
        </div>
      </div>
    </>
  );
}

function QuestionSearch({ nameOf }: { nameOf: (slug: string) => string }) {
  const [q, setQ] = useState('');
  const term = useDeferredValue(q.trim());
  const { data, isFetching, isError } = useSearchQuestionsQuery(term, { skip: term.length < 2 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search questions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search questions"
            placeholder="e.g. closures, JWT, joins"
            className="pl-9"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {term.length >= 2 &&
          (isError ? (
            <p className="text-sm text-destructive-text">Search failed. Please try again.</p>
          ) : isFetching && !data ? (
            <Skeleton className="h-16 w-full" />
          ) : data && data.length > 0 ? (
            <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Search results">
              {data.map((x) => (
                <li key={x.id}>
                  <Link
                    to={`/practice/session?${toSearchParams({ categories: [x.categorySlug], difficulty: 'mixed', count: 5, focus: x.id })}`}
                    className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {x.question}
                    <span className="mt-0.5 flex gap-1.5 text-xs text-muted-foreground">
                      {nameOf(x.categorySlug)} ·{' '}
                      <span className={TONE_TEXT[DIFFICULTY_TONE[x.difficulty]]}>{DIFFICULTY_LABELS[x.difficulty]}</span>
                      {x.isOwn && <span>· yours</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No questions match “{term}”.</p>
          ))}
      </CardContent>
    </Card>
  );
}

function MyQuestions({ nameOf }: { nameOf: (slug: string) => string }) {
  const { data } = useGetMyQuestionsQuery();
  const [deleteQuestion] = useDeleteQuestionMutation();
  const [pending, setPending] = useState<{ id: string; question: string } | null>(null);
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" /> Your questions
        </CardTitle>
        <CardDescription>Private to you, included in practice sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1" aria-label="Your questions">
          {items.map((q) => (
            <li key={q.id} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{q.question}</p>
                <p className="text-xs text-muted-foreground">
                  {nameOf(q.categorySlug)} · {DIFFICULTY_LABELS[q.difficulty]}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete question: ${q.question}`}
                onClick={() => setPending({ id: q.id, question: q.question })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this question?"
        description={pending ? `“${pending.question}” will be removed from your question bank.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!pending) return;
          try {
            await deleteQuestion(pending.id).unwrap();
            toast.success('Question deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </Card>
  );
}
