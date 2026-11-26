import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAppSelector } from '@/store';
import { useRestoreSessionMutation } from '@/store/authApi';

/** On first load, try to restore the session from the httpOnly refresh cookie. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const [restore] = useRestoreSessionMutation();
  const started = useRef(false);

  useEffect(() => {
    if (status === 'checking' && !started.current) {
      started.current = true; // StrictMode runs effects twice — refresh only once
      void restore();
    }
  }, [status, restore]);

  if (status === 'checking') {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading your workspace…
      </div>
    );
  }
  return <>{children}</>;
}

/** Routes that need a signed-in user. Remembers where the user was going. */
export function RequireAuth() {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

/** Login/register: bounce signed-in users to where they were going. */
export function GuestOnly() {
  const status = useAppSelector((s) => s.auth.status);
  const [params] = useSearchParams();
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}

/** Only allow same-app relative paths as redirect targets (prevents open redirects). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
