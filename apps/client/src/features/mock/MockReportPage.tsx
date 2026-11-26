import { Link, Navigate, useParams } from 'react-router';
import { Download, Gauge, MessagesSquare, RotateCcw, ThumbsUp, TrendingUp } from 'lucide-react';
import { EVALUATION_CRITERIA, type PerformanceReportView } from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { ScoreBars } from '@/components/common/ScoreBars';
import { EmptyState, ErrorState, PageLoader, ScoreBadge } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGetMockReportQuery, useListMockInterviewsQuery } from '@/store/mockApi';
import { CRITERION_LABELS, TONE_TEXT, capitalize, scoreTone, shortDate } from '@/lib/format';

/** The stored performance report for one finished interview (`/mock-interview/:id/report`). */
export default function MockReportPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useGetMockReportQuery(id);
  if (isLoading) return <PageLoader label="Loading report…" />;
  if (isError || !data) {
    if ((error as { status?: number } | undefined)?.status === 404) return <NoReport />;
    return (
      <Card>
        <ErrorState onRetry={refetch} />
      </Card>
    );
  }
  return <Report report={data} />;
}

/** `/mock-interview/report`: opens the most recent report, if there is one. */
export function LatestMockReport() {
  const { data, isLoading, isError, refetch } = useListMockInterviewsQuery({ status: 'completed', limit: 1 });
  if (isLoading) return <PageLoader label="Loading report…" />;
  if (isError) {
    return (
      <Card>
        <ErrorState onRetry={refetch} />
      </Card>
    );
  }
  const latest = data?.[0];
  return latest ? <Navigate to={`/mock-interview/${latest.id}/report`} replace /> : <NoReport />;
}

function NoReport() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={MessagesSquare}
        title="No report yet"
        description="Finish a mock interview with at least one answer to get a performance report."
        action={
          <Button asChild size="sm">
            <Link to="/mock-interview">Start an interview</Link>
          </Button>
        }
      />
    </Card>
  );
}

function Report({ report }: { report: PerformanceReportView }) {
  const tone = scoreTone(report.overallScore);

  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `interview-report-${report.completedAt.slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Performance report"
        description={`${report.jobRole} · ${capitalize(report.experienceLevel)} · ${shortDate(report.completedAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={download}>
              <Download /> Export
            </Button>
            <Button asChild>
              <Link to="/mock-interview">
                <RotateCcw /> New interview
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-muted-foreground" /> Overall score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className={`text-5xl font-semibold tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
              {report.overallScore}
              <span className="text-lg text-muted-foreground">/100</span>
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evaluation criteria</CardTitle>
            <CardDescription>Confidence is based on answer and speech patterns only — never on personality.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreBars items={EVALUATION_CRITERIA.map((c) => ({ label: CRITERION_LABELS[c], score: report.scores[c] }))} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsUp className="size-4 text-success" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {report.strengths.map((s) => (
                <li key={s} className="before:mr-2 before:text-success before:content-['✓']">
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4 text-warning" /> Areas to improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {report.improvements.map((s) => (
                <li key={s} className="before:mr-2 before:text-warning before:content-['→']">
                  {s}
                </li>
              ))}
            </ul>
            {report.weakTopics.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Weak topics: {report.weakTopics.map((w) => `${w.topic} (${w.score})`).join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Question breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-5 pb-2 font-medium">Question</th>
                <th className="hidden px-5 pb-2 font-medium sm:table-cell">Topic</th>
                <th className="px-5 pb-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.perQuestion.map((p, i) => (
                <tr key={i}>
                  <td className="px-5 py-3">{p.questionText}</td>
                  <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">{p.topic}</td>
                  <td className="px-5 py-3 text-right">
                    <ScoreBadge score={p.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {report.speechMetrics && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Speech patterns</CardTitle>
            <CardDescription>From voice answers only</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4 text-center">
              {[
                ['Words / min', report.speechMetrics.averageWordsPerMinute],
                ['Filler words', report.speechMetrics.totalFillerWords],
                ['Long pauses', report.speechMetrics.totalLongPauses],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </>
  );
}
