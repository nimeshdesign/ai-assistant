import type {
  AiAnswerRequest,
  AiStatus,
  AnalyzeCodeRequest,
  CodeAnalysis,
  ConceptExplanation,
  DetectQuestionRequest,
  DetectQuestionResult,
  ExplainRequest,
  GenerateQuestionsRequest,
  QuestionSummary,
  SpeakRequest,
  StructuredAnswer,
  TranscriptionResult,
} from '@aia/shared';
import { api } from './api';

export type GeneratedAnswer = StructuredAnswer & { model: string; cached: boolean };
type AnswerArgs = Omit<AiAnswerRequest, 'regenerate'>;

export const aiApi = api.injectEndpoints({
  endpoints: (build) => ({
    getAiStatus: build.query<AiStatus, void>({ query: () => '/ai/status' }),

    /** Cached per (question, length): re-opening a question doesn't cost another AI call. */
    generateAnswer: build.query<GeneratedAnswer, AnswerArgs>({
      query: (body) => ({ url: '/ai/answer', method: 'POST', body }),
      keepUnusedDataFor: 600,
    }),
    /** Fresh answer; replaces the cached one for the same arguments. */
    regenerateAnswer: build.mutation<GeneratedAnswer, AnswerArgs>({
      query: (body) => ({ url: '/ai/answer', method: 'POST', body: { ...body, regenerate: true } }),
      async onQueryStarted(args, { dispatch, queryFulfilled }) {
        const res = await queryFulfilled.catch(() => null);
        if (res) dispatch(aiApi.util.upsertQueryData('generateAnswer', args, res.data));
      },
    }),
    explainConcept: build.mutation<ConceptExplanation, ExplainRequest>({
      query: (body) => ({ url: '/ai/explain', method: 'POST', body }),
    }),
    analyzeCode: build.mutation<CodeAnalysis, AnalyzeCodeRequest>({
      query: (body) => ({ url: '/ai/analyze-code', method: 'POST', body }),
    }),
    /** Classify ambiguous OCR text (text only — images never leave the browser). */
    detectQuestion: build.mutation<DetectQuestionResult, DetectQuestionRequest>({
      query: (body) => ({ url: '/ai/detect-question', method: 'POST', body }),
    }),
    /** Speech-to-text: the recording is uploaded as raw bytes, transcribed in memory, never stored. */
    transcribe: build.mutation<TranscriptionResult, { audio: Blob; mimeType: string }>({
      query: ({ audio, mimeType }) => ({
        url: '/ai/transcribe',
        method: 'POST',
        body: audio,
        headers: { 'content-type': mimeType },
      }),
    }),
    /**
     * Natural voice. Resolves to an object URL for the MP3 (the caller must revoke it).
     * Converting here keeps binary data out of the Redux store.
     */
    speak: build.mutation<string, SpeakRequest>({
      query: (body) => ({
        url: '/ai/speak',
        method: 'POST',
        body,
        responseHandler: async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : res.json()),
      }),
    }),
    generateQuestions: build.mutation<QuestionSummary[], GenerateQuestionsRequest>({
      query: (body) => ({ url: '/questions/generate', method: 'POST', body }),
      invalidatesTags: ['Questions', 'Categories'],
    }),
  }),
});

export const {
  useGetAiStatusQuery,
  useGenerateAnswerQuery,
  useRegenerateAnswerMutation,
  useExplainConceptMutation,
  useAnalyzeCodeMutation,
  useGenerateQuestionsMutation,
  useDetectQuestionMutation,
  useTranscribeMutation,
  useSpeakMutation,
} = aiApi;

/** Friendlier copy for AI error codes returned by the API. */
export function aiErrorCopy(code: string | undefined, fallback: string): { title: string; description: string } {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return {
        title: 'AI is not set up yet',
        description: 'The server needs an OpenAI API key (OPENAI_API_KEY in apps/server/.env). Ask whoever runs this app to add it.',
      };
    case 'AI_RATE_LIMITED':
      return { title: 'Slow down a little', description: "You've made a lot of AI requests in a short time. Please wait a few minutes." };
    case 'AI_BUSY':
    case 'AI_TIMEOUT':
    case 'AI_UNAVAILABLE':
    case 'AI_BAD_OUTPUT':
      return { title: "Couldn't get an answer", description: fallback };
    case 'AI_REFUSED':
      return { title: "The AI couldn't help with that", description: 'Try rephrasing the question.' };
    default:
      return { title: 'Something went wrong', description: fallback };
  }
}
