import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { CodeAnalysis, CodeIssueSeverity } from '@aia/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CodeBlock } from '@/components/answer/AnswerCard';
import { cn } from '@/lib/utils';

/** AI code review: summary, issues (severity, line, fix), improved code and complexity. */
const SEVERITY: Record<CodeIssueSeverity, { label: string; variant: 'destructive' | 'warning' | 'secondary'; icon: typeof AlertCircle }> = {
  error: { label: 'Bug', variant: 'destructive', icon: AlertCircle },
  warning: { label: 'Warning', variant: 'warning', icon: AlertTriangle },
  suggestion: { label: 'Suggestion', variant: 'secondary', icon: Info },
};

export function CodeAnalysisView({ data }: { data: CodeAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Review</CardTitle>
          <Badge variant="outline">{data.language}</Badge>
          {data.complexity && <Badge variant="secondary">{data.complexity}</Badge>}
        </div>
        <CardDescription className="text-foreground">{data.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.issues.length === 0 ? (
          <p className="rounded-lg bg-success/10 p-3 text-sm text-success-text">No problems found. Nice work!</p>
        ) : (
          <ul className="space-y-3" aria-label="Issues found">
            {data.issues.map((issue, i) => {
              const s = SEVERITY[issue.severity];
              return (
                <li key={i} className={cn('rounded-lg border p-3 text-sm', issue.severity === 'error' && 'border-destructive/30')}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={s.variant}>
                      <s.icon /> {s.label}
                    </Badge>
                    {issue.line && <span className="font-mono text-xs text-muted-foreground">line {issue.line}</span>}
                    <span className="font-medium">{issue.title}</span>
                  </div>
                  <p className="text-muted-foreground">{issue.detail}</p>
                  <p className="mt-1">
                    <span className="font-medium">Fix: </span>
                    {issue.fix}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {data.improvedCode && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Improved version</p>
            <CodeBlock language={data.language} code={data.improvedCode} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

