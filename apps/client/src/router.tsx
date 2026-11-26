import { lazy, Suspense } from 'react';
import { Outlet, type RouteObject, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader } from '@/components/common/states';
import { AuthBootstrap, GuestOnly, RequireAuth } from '@/features/auth/guards';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteError } from '@/pages/RouteError';

// Each feature is a separate chunk, loaded on first visit.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const PracticePage = lazy(() => import('@/features/practice/PracticePage'));
const PracticeSessionPage = lazy(() => import('@/features/practice/PracticeSessionPage'));
const MockSetupPage = lazy(() => import('@/features/mock/MockSetupPage'));
const MockRoomPage = lazy(() => import('@/features/mock/MockRoomPage'));
const MockReportPage = lazy(() => import('@/features/mock/MockReportPage'));
const LatestMockReport = lazy(() => import('@/features/mock/MockReportPage').then((m) => ({ default: m.LatestMockReport })));
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'));
const VoicePage = lazy(() => import('@/features/voice/VoicePage'));
const HistoryPage = lazy(() => import('@/features/history/HistoryPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const ToolsPage = lazy(() => import('@/features/tools/ToolsPage'));
const DesktopPage = lazy(() => import('@/features/desktop/DesktopPage'));

export const routes: RouteObject[] = [
  {
    element: (
      <AuthBootstrap>
        <Outlet />
      </AuthBootstrap>
    ),
    errorElement: <RouteError />,
    children: [
      {
        element: (
          <Suspense fallback={<PageLoader />}>
            <GuestOnly />
          </Suspense>
        ),
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          // Compact floating assistant rendered by the Electron desktop app (no sidebar/top bar).
          {
            path: 'desktop',
            element: (
              <Suspense fallback={<PageLoader />}>
                <DesktopPage />
              </Suspense>
            ),
          },
          {
            element: <AppShell />,
            children: [
              {
                errorElement: <RouteError />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'practice', element: <PracticePage /> },
                  { path: 'practice/session', element: <PracticeSessionPage /> },
                  { path: 'mock-interview', element: <MockSetupPage /> },
                  // Old links: the interview now lives at its own URL.
                  { path: 'mock-interview/room', element: <Navigate to="/mock-interview" replace /> },
                  { path: 'mock-interview/report', element: <LatestMockReport /> },
                  { path: 'mock-interview/:id', element: <MockRoomPage /> },
                  { path: 'mock-interview/:id/report', element: <MockReportPage /> },
                  { path: 'assistant', element: <AssistantPage /> },
                  { path: 'voice', element: <VoicePage /> },
                  { path: 'tools', element: <ToolsPage /> },
                  { path: 'history', element: <HistoryPage /> },
                  { path: 'settings', element: <SettingsPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
