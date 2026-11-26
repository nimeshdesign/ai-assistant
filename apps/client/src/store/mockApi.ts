import type {
  MockAnswerRequest,
  MockInterviewState,
  MockInterviewSummary,
  MockSetupRequest,
  PerformanceReportView,
} from '@aia/shared';
import { api } from './api';

/** Mock interviews (Phase 9): state lives on the server, so an interview survives reloads and can be resumed. */
export const mockApi = api.injectEndpoints({
  endpoints: (build) => ({
    listMockInterviews: build.query<MockInterviewSummary[], { status?: MockInterviewSummary['status']; limit?: number } | void>({
      query: (args) => ({ url: '/mock-interviews', params: args ?? {} }),
      providesTags: [{ type: 'MockInterview', id: 'LIST' }],
    }),
    getMockInterview: build.query<MockInterviewState, string>({
      query: (id) => `/mock-interviews/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'MockInterview', id }],
    }),
    startMockInterview: build.mutation<MockInterviewState, MockSetupRequest>({
      query: (body) => ({ url: '/mock-interviews', method: 'POST', body }),
      invalidatesTags: [{ type: 'MockInterview', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const res = await queryFulfilled.catch(() => null);
        if (res) dispatch(mockApi.util.upsertQueryData('getMockInterview', res.data.id, res.data));
      },
    }),
    submitMockAnswer: build.mutation<MockInterviewState, MockAnswerRequest & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/mock-interviews/${id}/answers`, method: 'POST', body }),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const res = await queryFulfilled.catch(() => null);
        if (res) dispatch(mockApi.util.upsertQueryData('getMockInterview', id, res.data));
      },
    }),
    skipMockQuestion: build.mutation<MockInterviewState, { id: string; questionId: string }>({
      query: ({ id, questionId }) => ({ url: `/mock-interviews/${id}/skip`, method: 'POST', body: { questionId } }),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const res = await queryFulfilled.catch(() => null);
        if (res) dispatch(mockApi.util.upsertQueryData('getMockInterview', id, res.data));
      },
    }),
    completeMockInterview: build.mutation<MockInterviewState, string>({
      query: (id) => ({ url: `/mock-interviews/${id}/complete`, method: 'POST' }),
      invalidatesTags: [{ type: 'MockInterview', id: 'LIST' }, 'Dashboard', 'Profile'],
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const res = await queryFulfilled.catch(() => null);
        if (res) dispatch(mockApi.util.upsertQueryData('getMockInterview', id, res.data));
      },
    }),
    deleteMockInterview: build.mutation<void, string>({
      query: (id) => ({ url: `/mock-interviews/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'MockInterview', id: 'LIST' }, { type: 'MockInterview', id }, 'Dashboard', 'Profile'],
    }),
    getMockReport: build.query<PerformanceReportView, string>({
      query: (id) => `/mock-interviews/${id}/report`,
      providesTags: (_r, _e, id) => [{ type: 'MockInterview', id }],
    }),
  }),
});

export const {
  useListMockInterviewsQuery,
  useGetMockInterviewQuery,
  useStartMockInterviewMutation,
  useSubmitMockAnswerMutation,
  useSkipMockQuestionMutation,
  useCompleteMockInterviewMutation,
  useDeleteMockInterviewMutation,
  useGetMockReportQuery,
} = mockApi;
