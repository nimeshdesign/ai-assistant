import { useGetHealthQuery } from '@/store/api';
import { cn } from '@/lib/utils';

/** Small indicator showing whether the client can reach the API and the API can reach MongoDB. */
export function ApiStatus() {
  const { data, isLoading, isError } = useGetHealthQuery(undefined, { pollingInterval: 30_000 });

  const state = isLoading ? 'checking' : isError || !data ? 'offline' : data.db === 'connected' ? 'online' : 'degraded';
  const label = {
    checking: 'Checking API…',
    online: 'API online',
    degraded: 'Database unavailable',
    offline: 'API offline',
  }[state];

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
      <span
        className={cn(
          'size-2 rounded-full',
          state === 'online' && 'bg-success',
          state === 'degraded' && 'bg-warning',
          state === 'offline' && 'bg-destructive',
          state === 'checking' && 'animate-pulse bg-muted-foreground',
        )}
      />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </div>
  );
}
