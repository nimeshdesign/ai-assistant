import { cn } from '@/lib/utils';

/**
 * Always-visible indicator shown while the screen or microphone is being captured.
 * Uses the reserved `recording` colour plus a text label (never colour alone).
 */
export function CaptureIndicator({
  kind,
  state,
  className,
}: {
  kind: 'screen' | 'microphone';
  state: 'active' | 'paused';
  className?: string;
}) {
  const label = kind === 'screen' ? 'Screen' : 'Microphone';
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        state === 'active' ? 'border-recording/40 bg-recording/10 text-recording' : 'text-muted-foreground',
        className,
      )}
    >
      <span className="relative flex size-2">
        {state === 'active' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-recording opacity-60 motion-reduce:animate-none" />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', state === 'active' ? 'bg-recording' : 'bg-muted-foreground')} />
      </span>
      {label} {state === 'active' ? 'capture on' : 'capture paused'}
    </span>
  );
}
