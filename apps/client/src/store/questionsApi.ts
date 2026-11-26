import type { CategoryView, CreateQuestionInput, PaginationMeta, PracticeQuery, QuestionSummary } from '@aia/shared';
import { api } from './api';

const practiceParams = ({ categories, difficulty, count, focus }: PracticeQuery) => ({
  categories: categories.join(','),
  difficulty,
  count,
  ...(focus ? { focus } : {}),
});

export const questionsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getCategories: build.query<CategoryView[], void>({
      query: () => '/categories',
      providesTags: ['Categories'],
    }),
    getPracticeQuestions: build.query<QuestionSummary[], PracticeQuery>({
      query: (q) => ({ url: '/questions/practice', params: practiceParams(q) }),
      keepUnusedDataFor: 0, // a fresh random set every time a session starts
    }),
    searchQuestions: build.query<QuestionSummary[], string>({
      query: (q) => ({ url: '/questions/search', params: { q } }),
      providesTags: ['Questions'],
    }),
    // Paginated: the base query delivers `{ items, meta }`.
    getMyQuestions: build.query<{ items: QuestionSummary[]; meta?: PaginationMeta }, void>({
      query: () => ({ url: '/questions', params: { mine: 'true', limit: 50 } }),
      providesTags: ['Questions'],
    }),
    createQuestion: build.mutation<QuestionSummary, CreateQuestionInput>({
      query: (body) => ({ url: '/questions', method: 'POST', body }),
      invalidatesTags: ['Questions', 'Categories'],
    }),
    deleteQuestion: build.mutation<void, string>({
      query: (id) => ({ url: `/questions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Questions', 'Categories'],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetPracticeQuestionsQuery,
  useSearchQuestionsQuery,
  useGetMyQuestionsQuery,
  useCreateQuestionMutation,
  useDeleteQuestionMutation,
} = questionsApi;
