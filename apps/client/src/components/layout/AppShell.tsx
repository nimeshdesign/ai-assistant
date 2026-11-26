import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { PageLoader } from '@/components/common/states';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/overlays';
import { useGetProfileQuery, useGetSettingsQuery } from '@/store/authApi';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  useApplyTheme();
  // Load the signed-in user's profile + settings; slices hydrate from these responses.
  useGetSettingsQuery();
  useGetProfileQuery();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const { pathname } = useLocation();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-svh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className={cn('flex min-h-svh flex-col transition-[padding] duration-200', collapsed ? 'md:pl-16' : 'md:pl-60')}>
          <Topbar />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
            {/* Keyed by path so a slow page shows the loader instead of the previous page. */}
            <Suspense key={pathname} fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
