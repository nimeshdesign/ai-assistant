import { useState } from 'react';
import type { ProgressPoint } from '@aia/shared';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmented } from '@/components/ui/overlays';
import { shortDate } from '@/lib/format';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Metric = 'averageScore' | 'questionsPractised';

const METRICS: { value: Metric; label: string }[] = [
  { value: 'averageScore', label: 'Avg. score' },
  { value: 'questionsPractised', label: 'Questions' },
];

const axisProps = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({ active, payload, label, metric }: { active?: boolean; payload?: { value: number | null }[]; label?: string; metric: Metric }) {
  if (!active || !label) return null;
  const value = payload?.[0]?.value;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">Week of {shortDate(label)}</p>
      <p className="mt-0.5 font-medium text-popover-foreground tabular-nums">
        {value == null ? 'No scored answers' : `${value} ${metric === 'averageScore' ? 'avg. score' : 'questions'}`}
      </p>
    </div>
  );
}

/**
 * One measure at a time (toggle) — never a dual axis. Single series, so no legend:
 * the toggle names what is shown. A visually hidden table provides the data to screen readers.
 */
export function ProgressChart({ data }: { data: ProgressPoint[] }) {
  const hasScores = data.some((p) => p.averageScore !== null);
  // Scores only come from evaluated (mock-interview) answers; until then, show activity.
  const [metric, setMetric] = useState<Metric>(hasScores ? 'averageScore' : 'questionsPractised');
  const animate = !usePrefersReducedMotion();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {metric === 'averageScore' && !hasScores ? 'No scored answers yet. Finish a mock interview to see your score trend.' : ''}
        </p>
        <Segmented label="Progress metric" value={metric} onValueChange={setMetric} options={METRICS} />
      </div>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'averageScore' ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="week" tickFormatter={shortDate} {...axisProps} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axisProps} />
              <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="averageScore"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#scoreFill)"
                connectNulls
                dot={{ r: 3, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={animate}
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="week" tickFormatter={shortDate} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: 'var(--accent)' }} />
              <Bar dataKey="questionsPractised" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Weekly learning progress</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>Questions practised</th>
            <th>Average score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.week}>
              <td>{shortDate(p.week)}</td>
              <td>{p.questionsPractised}</td>
              <td>{p.averageScore ?? 'No scored answers'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
