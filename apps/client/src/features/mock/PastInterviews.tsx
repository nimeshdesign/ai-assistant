import { useState } from 'react';
import { Link } from 'react-router';
import { FileBarChart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MockInterviewSummary } from '@aia/shared';
import { ScoreBadge } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/overlays';
import { errorMessage } from '@/store/api';
import { useDeleteMockInterviewMutation, useListMockInterviewsQuery } from '@/store/mockApi';
import { capitalize, shortDate } from '@/lib/format';

/** Finished interviews with their scores; each can be reopened or deleted (with its answers and report). */
export function PastInterviews() {
  const { data } = useListMockInterviewsQuery({ limit: 10 });
  const [remove, { isLoading }] = useDeleteMockInterviewMutation();
  const [pending, setPending] = useState<MockInterviewSummary | null>(null);
  const past = data?.filter((m) => m.status !== 'in_progress') ?? [];
  if (past.length === 0) return null;

  return (
    <Card className="mx-auto mt-6 max-w-2xl">
      <CardHeader>
        <CardTitle>Past interviews</CardTitle>
        <CardDescription>Kept according to your data retention setting. Delete one to remove its answers and report.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y" aria-label="Past interviews">
          {past.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.jobRole}</p>
                <p className="text-xs text-muted-foreground">
                  {capitalize(m.experienceLevel)} · {shortDate(m.completedAt ?? m.startedAt)} · {m.answeredCount} of {m.totalQuestions} answered
                </p>
              </div>
              {m.overallScore !== undefined ? <ScoreBadge score={m.overallScore} /> : <Badge variant="secondary">Not scored</Badge>}
              <div className="flex gap-1">
                {m.reportId && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/mock-interview/${m.id}/report`} aria-label={`View report: ${m.jobRole}, ${shortDate(m.completedAt ?? m.startedAt)}`}>
                      <FileBarChart /> Report
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Delete interview: ${m.jobRole}, ${shortDate(m.startedAt)}`} onClick={() => setPending(m)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this interview?"
        description="Its answers, feedback and report are deleted permanently."
        confirmLabel={isLoading ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={() => {
          if (!pending) return;
          remove(pending.id)
            .unwrap()
            .then(() => toast.success('Interview deleted.'))
            .catch((err) => toast.error(errorMessage(err)));
          setPending(null);
        }}
      />
    </Card>
  );
}
