import { Link } from 'react-router';
import {
  ArrowRight,
  BookOpenCheck,
  Flame,
  Gauge,
  History,
  Mic,
  MessagesSquare,
  ScanText,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { EVALUATION_CRITERIA, getCategory, type SessionType } from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { ScoreBars } from '@/components/common/ScoreBars';
import { EmptyState, ErrorState, ScoreBadge } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetDashboardSummaryQuery } from '@/store/historyApi';
import { useAppSelector } from '@/store';
import { CRITERION_LABELS, DIFFICULTY_LABELS, DIFFICULTY_TONE, SESSION_TYPE_LABELS, timeAgo } from '@/lib/format';
import { ProgressChart } from './ProgressChart';

const SESSION_ICONS: Record<SessionType, LucideIcon> = {
  practice: BookOpenCheck,
  mock: MessagesSquare,
  assistant: ScanText,
  voice: Mic,
};

export default function DashboardPage() {
  const name = useAppSelector((s) => s.auth.user?.name ?? '');
  const { data, isLoading, isError, refetch } = useGetDashboardSummaryQuery();

  if (isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState description="We couldn't load your dashboard." onRetry={refetch} />
        </Card>
      </>
    );
  }

  const t = data?.totals;

  return (
    <>
      <PageHeader
        title={name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
        description="Here's how your interview preparation is going."
        actions={
          <>
            <Button asChild>
              <Link to="/mock-interview">
                <MessagesSquare /> Start mock interview
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Questions practised"
          icon={BookOpenCheck}
          loading={isLoading}
          value={t?.questionsPractised ?? 0}
          hint={t ? `${t.questionsThisWeek} this week` : undefined}
        />
        <StatCard
          label="Mock interviews"
          icon={MessagesSquare}
          loading={isLoading}
          value={t?.mockInterviewsCompleted ?? 0}
          hint="completed"
        />
        <StatCard
          label="Skills score"
          icon={Gauge}
          loading={isLoading}
          value={t ? `${t.skillsScore}` : 0}
          change={t?.skillsScoreChange}
          hint="vs. previous 30 days"
        />
        <StatCard
          label="Practice streak"
          icon={Flame}
          loading={isLoading}
          value={t ? `${t.streakDays} ${t.streakDays === 1 ? 'day' : 'days'}` : 0}
          hint="keep it going"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Learning progress</CardTitle>
            <CardDescription>Last 8 weeks</CardDescription>
          </CardHeader>
          <CardContent>{isLoading || !data ? <Skeleton className="h-64 w-full" /> : <ProgressChart data={data.progress} />}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical skills</CardTitle>
            <CardDescription>Average across evaluated answers</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <BarsSkeleton rows={5} />
            ) : (
              <ScoreBars items={EVALUATION_CRITERIA.map((c) => ({ label: CRITERION_LABELS[c], score: data.skills[c] }))} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>Your latest activity</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/history">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            {isLoading || !data ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : data.recentSessions.length === 0 ? (
              <EmptyState
                icon={History}
                title="No sessions yet"
                description="Practise a few questions or take a mock interview to see your activity here."
                action={
                  <Button size="sm" asChild>
                    <Link to="/practice">Start practising</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.recentSessions.map((s) => {
                  const Icon = SESSION_ICONS[s.type];
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {SESSION_TYPE_LABELS[s.type]} · {s.questionCount} questions · {timeAgo(s.startedAt)}
                        </p>
                      </div>
                      {s.score !== undefined && <ScoreBadge score={s.score} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" /> Weak topics
            </CardTitle>
            <CardDescription>Focus here next</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <BarsSkeleton rows={4} />
            ) : data.weakTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weak topics yet. Nice work!</p>
            ) : (
              <ScoreBars colorByScore items={data.weakTopics.map((w) => ({ label: w.topic, score: w.score }))} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Recommended questions</CardTitle>
            <CardDescription>Picked from your weak topics</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/practice">
              Practice <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.recommended.map((q) => (
                <li key={q.id}>
                  <Link
                    to={`/practice/session?categories=${q.categorySlug}&difficulty=mixed&count=5`}
                    className="flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <p className="text-sm font-medium">{q.question}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{getCategory(q.categorySlug)?.name}</Badge>
                      <Badge variant={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function BarsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}
