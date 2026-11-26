import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { Toaster } from '@/components/ui/sonner';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const POINTS = [
  'Practise by topic with clear, natural answers',
  'Realistic mock interviews with feedback',
  'Screen and voice assistants that ask before capturing anything',
];

export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  useApplyTheme();
  return (
    <>
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Interview AI</span>
        </div>
        <div className="max-w-md space-y-6">
          <p className="text-3xl leading-tight font-semibold tracking-tight">
            Walk into your next technical interview prepared.
          </p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Your data stays yours — delete it any time.</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1.5">
              <div className="mb-6 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:hidden">
                <Sparkles className="size-4" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
    {/* Outside the grid: as a grid child it would create a second row and shrink the panels. */}
    <Toaster />
    </>
  );
}
