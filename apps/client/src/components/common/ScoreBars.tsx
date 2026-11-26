import { Progress } from '@/components/ui/form-controls';
import { scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE_BG = { success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' } as const;

/**
 * Horizontal score bars (0–100). The number is always printed next to the bar,
 * so the status colour is never the only signal.
 */
export function ScoreBars({
  items,
  colorByScore = false,
  className,
}: {
  items: { label: string; score: number }[];
  colorByScore?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn('space-y-3.5', className)}>
      {items.map(({ label, score }) => (
        <li key={label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{label}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{score}/100</span>
          </div>
          <Progress
            value={score}
            aria-label={`${label}: ${score} out of 100`}
            indicatorClassName={colorByScore ? TONE_BG[scoreTone(score)] : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
