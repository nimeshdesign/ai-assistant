import type {
  AnswerLength,
  Difficulty,
  EvaluationCriterion,
  ExperienceLevel,
  InputMode,
  QuestionType,
  SessionType,
} from './constants.js';

/** Every API response uses this envelope. */
export type ApiSuccess<T> = { success: true; data: T; meta?: PaginationMeta };
export type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown; requestId?: string };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * The five-part answer structure produced by the AI Answer Generator (Module 4).
 * Shorter lengths omit some sections: `short` = direct + interview-ready only.
 */
export interface StructuredAnswer {
  directAnswer: string;
  simpleExplanation?: string;
  realWorldExample?: string;
  codeExample?: { language: string; code: string } | null;
  interviewReadyAnswer: string;
  length: AnswerLength;
}

export type EvaluationScores = Record<EvaluationCriterion, number>;

/** Speech-pattern signals used for the "confidence" score. No personality inference. */
export interface SpeechMetrics {
  wordsPerMinute?: number;
  fillerWordCount?: number;
  longPauseCount?: number;
  durationSec?: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  db: 'connected' | 'disconnected' | 'connecting';
  version: string;
}

// ---------- Questions ----------

export interface QuestionSummary {
  id: string;
  categorySlug: string;
  question: string;
  difficulty: Difficulty;
  type: QuestionType;
  tags: string[];
  /** Present on API responses: true when the current user created the question. */
  isOwn?: boolean;
}

export interface PracticeQuery {
  categories: string[];
  difficulty: Difficulty | 'mixed';
  count: number;
  /** Question id to put first (e.g. opened from a recommendation or search). */
  focus?: string;
}

export interface GenerateAnswerRequest {
  questionId?: string;
  question: string;
  length: AnswerLength;
}

// ---------- Dashboard (GET /dashboard/summary) ----------

export interface ProgressPoint {
  /** ISO week start date */
  week: string;
  questionsPractised: number;
  /** null when nothing was scored that week. */
  averageScore: number | null;
}

export interface TopicScore {
  topic: string;
  score: number;
}

export interface RecentSession {
  id: string;
  type: SessionType;
  title: string;
  questionCount: number;
  score?: number;
  startedAt: string;
}

export interface DashboardSummary {
  totals: {
    questionsPractised: number;
    questionsThisWeek: number;
    mockInterviewsCompleted: number;
    skillsScore: number;
    skillsScoreChange: number;
    streakDays: number;
  };
  progress: ProgressPoint[];
  skills: EvaluationScores;
  weakTopics: TopicScore[];
  recentSessions: RecentSession[];
  recommended: QuestionSummary[];
}

// ---------- History (GET /history) ----------

export interface HistoryItem {
  id: string;
  sessionId: string;
  sessionType: SessionType;
  questionText: string;
  categorySlug?: string;
  inputMode: InputMode;
  answer?: StructuredAnswer;
  userResponse?: string;
  score?: number;
  /** Mock-interview answers: the evaluator's feedback and better version, and the interview to open. */
  feedback?: string;
  improvedAnswer?: string;
  mockInterviewId?: string;
  isBookmarked: boolean;
  createdAt: string;
}

export interface HistoryQuery {
  q?: string;
  type?: SessionType | 'all';
  bookmarked?: boolean;
  page?: number;
  limit?: number;
}

/** Everything stored about the user, for GET /users/me/export. Never includes password hashes or tokens. */
export interface AccountExport {
  exportedAt: string;
  account: AuthUser;
  profile: ProfileView;
  settings: SettingsView;
  history: HistoryItem[];
  mockInterviews: MockInterviewState[];
  reports: PerformanceReportView[];
  questions: QuestionSummary[];
}

// ---------- Mock interviews ----------

export interface MockInterviewSetup {
  jobRole: string;
  experienceLevel: ExperienceLevel;
  focusAreas: string[];
  questionCount: number;
}

export type MockQuestionStatus = 'pending' | 'answered' | 'skipped';

/** The candidate's answer to one mock question, with its evaluation. Text only — never audio. */
export interface MockAnswerView {
  response: string;
  inputMode: InputMode;
  evaluation: AnswerEvaluation;
  speechMetrics?: SpeechMetrics;
  answeredAt: string;
}

export interface MockQuestion {
  id: string;
  order: number;
  text: string;
  /** Display name of the topic, e.g. "React.js". */
  topic: string;
  categorySlug?: string;
  difficulty: Difficulty;
  status: MockQuestionStatus;
  answer?: MockAnswerView;
}

export interface MockInterviewState extends MockInterviewSetup {
  id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  questions: MockQuestion[];
  /** Index of the first question still pending (equals questions.length when none are left). */
  currentIndex: number;
  startedAt: string;
  completedAt?: string;
  reportId?: string;
}

export interface MockInterviewSummary {
  id: string;
  jobRole: string;
  experienceLevel: ExperienceLevel;
  status: MockInterviewState['status'];
  totalQuestions: number;
  answeredCount: number;
  overallScore?: number;
  reportId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface AnswerEvaluation {
  scores: EvaluationScores;
  overall: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  improvedAnswer: string;
}

export interface PerformanceReportView {
  id: string;
  mockInterviewId: string;
  jobRole: string;
  experienceLevel: ExperienceLevel;
  overallScore: number;
  scores: EvaluationScores;
  summary: string;
  strengths: string[];
  improvements: string[];
  weakTopics: TopicScore[];
  totalQuestions: number;
  answeredCount: number;
  perQuestion: { questionText: string; topic: string; score: number }[];
  speechMetrics?: { averageWordsPerMinute?: number; totalFillerWords?: number; totalLongPauses?: number };
  completedAt: string;
}

// ---------- Auth & account (Phase 3) ----------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
}

/** Returned by register / login / refresh. The refresh token travels only in an httpOnly cookie. */
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  /** ISO timestamp when the access token expires. */
  accessTokenExpiresAt: string;
}

export interface ProfileView {
  name: string;
  headline: string;
  targetRole: string;
  experienceLevel: import('./constants.js').ExperienceLevel;
  yearsOfExperience: number;
  preferredLanguages: string[];
}

export interface SettingsView {
  theme: import('./constants.js').Theme;
  answer: { style: import('./constants.js').AnswerStyle; length: AnswerLength; includeCodeExamples: boolean; codeLanguage: string };
  voice: {
    voiceName: string;
    rate: number;
    pitch: number;
    autoSpeakAnswers: boolean;
    sttLanguage: string;
    /** Speech-to-text: our server (OpenAI, audio not stored) or the browser's own service. */
    sttEngine: import('./ai.js').SttEngine;
    /** Read-aloud: free browser voices or a natural AI voice. */
    ttsEngine: import('./ai.js').TtsEngine;
    aiVoice: import('./ai.js').AiVoice;
  };
  ai: { model: '' | 'fast' | 'quality'; temperature: number };
  assistant: { captureIntervalMs: number; autoGenerateAnswers: boolean };
  privacy: { saveHistory: boolean; retentionDays: number; storeRawAudio: boolean; storeScreenshots: boolean };
  permissions: { screenCapture: boolean; microphone: boolean };
}

export interface AuthSessionView {
  id: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

// ---------- Question bank (Phase 4) ----------

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  group: import('./constants.js').CategoryGroup;
  icon: string;
  description: string;
  /** Questions visible to the current user (global + their own). */
  questionCount: number;
}

export interface QuestionDetail extends QuestionSummary {
  /** True when the current user created this question (only then can they delete it). */
  isOwn: boolean;
  createdAt: string;
}
