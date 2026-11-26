import * as React from 'react';
import { Checkbox as CB, Label as L, Progress as P, Separator as S, Slider as SL, Switch as SW } from 'radix-ui';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full min-w-0 rounded-md border border-input bg-transparent text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldBase, 'h-9 px-3 py-1', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-20 px-3 py-2', className)} {...props} />;
}

function Label({ className, ...props }: React.ComponentProps<typeof L.Root>) {
  return (
    <L.Root
      data-slot="label"
      className={cn('flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:opacity-50', className)}
      {...props}
    />
  );
}

function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
        className,
      )}
      {...props}
    >
      <SW.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5 dark:data-[state=checked]:bg-primary-foreground" />
    </SW.Root>
  );
}

function Checkbox({ className, ...props }: React.ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CB.Indicator className="flex items-center justify-center">
        <CheckIcon className="size-3.5" />
      </CB.Indicator>
    </CB.Root>
  );
}

function Slider({ className, ...props }: React.ComponentProps<typeof SL.Root>) {
  const count = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <SL.Root
      data-slot="slider"
      className={cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <SL.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SL.Range className="absolute h-full bg-primary" />
      </SL.Track>
      {Array.from({ length: count }, (_, i) => (
        <SL.Thumb
          key={i}
          aria-label={props['aria-label']}
          className="block size-4 rounded-full border border-primary bg-background shadow-sm transition-[box-shadow] outline-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/50"
        />
      ))}
    </SL.Root>
  );
}

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof P.Root> & { indicatorClassName?: string }) {
  return (
    <P.Root
      data-slot="progress"
      value={value}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <P.Indicator
        className={cn('h-full w-full flex-1 bg-primary transition-transform duration-500', indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </P.Root>
  );
}

function Separator({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      data-slot="separator"
      orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}

/** Label + control + hint/error, with ids wired for accessibility. */
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Input, Textarea, Label, Switch, Checkbox, Slider, Progress, Separator, Field };
