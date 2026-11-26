import type { AccountExport, DashboardSummary, HistoryItem, HistoryQuery, PaginationMeta, SessionType } from '@aia/shared';
import { api } from './api';

/** Minutes east of UTC, so the server buckets days and weeks on the user's own calendar. */
export const localTzOffset = () => -new Date().getTimezoneOffset();

/** History, dashboard and data export (Phase 10). */
export const historyApi = api.injectEndpoints({
  endpoints: (build) => ({
    getDashboardSummary: build.query<DashboardSummary, void>({
      query: () => ({ url: '/dashboard/summary', params: { tzOffset: localTzOffset() } }),
      providesTags: ['Dashboard'],
    }),

    getHistory: build.query<{ items: HistoryItem[]; meta: PaginationMeta }, HistoryQuery>({
      query: ({ q, type, bookmarked, page, limit }) => ({
        url: '/history',
        params: {
          ...(q?.trim() ? { q: q.trim() } : {}),
          ...(type && type !== 'all' ? { type } : {}),
          ...(bookmarked ? { bookmarked: 'true' } : {}),
          ...(page ? { page } : {}),
          ...(limit ? { limit } : {}),
        },
      }),
      providesTags: ['History'],
    }),
    setBookmark: build.mutation<HistoryItem, { id: string; isBookmarked: boolean }>({
      query: ({ id, isBookmarked }) => ({ url: `/history/${id}`, method: 'PATCH', body: { isBookmarked } }),
      invalidatesTags: ['History'],
    }),
    deleteHistoryItem: build.mutation<void, string>({
      query: (id) => ({ url: `/history/${id}`, method: 'DELETE' }),
      invalidatesTags: ['History', 'Dashboard'],
    }),
    /** "all" also deletes mock interviews and their reports. */
    clearHistory: build.mutation<{ deleted: number }, SessionType | 'all' | void>({
      query: (type) => ({ url: '/history', method: 'DELETE', params: type && type !== 'all' ? { type } : {} }),
      invalidatesTags: ['History', 'Dashboard', 'MockInterview', 'Profile'],
    }),

    exportAccount: build.mutation<AccountExport, void>({
      query: () => '/users/me/export',
    }),
  }),
});

export const {
  useGetDashboardSummaryQuery,
  useGetHistoryQuery,
  useSetBookmarkMutation,
  useDeleteHistoryItemMutation,
  useClearHistoryMutation,
  useExportAccountMutation,
} = historyApi;
