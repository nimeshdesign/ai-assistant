import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  change,
  loading,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  change?: number;
  loading?: boolean;
}) {
  return (
    <Card className="gap-3 px-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        <Icon className="size-4" aria-hidden />
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-28" />
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {change !== undefined && change !== 0 && (
              <span className={cn('inline-flex items-center gap-0.5 font-medium', change > 0 ? 'text-success-text' : 'text-destructive-text')}>
                {change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {change > 0 ? '+' : ''}
                {change}
              </span>
            )}
            {hint}
          </p>
        </>
      )}
    </Card>
  );
}
