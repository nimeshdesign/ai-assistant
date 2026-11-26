import { QUESTION_BANK } from '@aia/shared/seed';
import {
  aiAnswerRequestSchema,
  speakRequestSchema,
  analyzeCodeRequestSchema,
  explainRequestSchema,
  generateQuestionsSchema,
  CATEGORY_CATALOG,
  createQuestionSchema,
  normalizeQuestionText,
  practiceQuerySchema,
  questionListQuerySchema,
  questionSearchQuerySchema,
  type CategoryView,
  type QuestionSummary,
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  permissionsUpdateSchema,
  preferencesUpdateSchema,
  privacyUpdateSchema,
  profileUpdateSchema,
  registerSchema,
  voiceUpdateSchema,
  type AuthSessionView,
  type ProfileView,
  type SettingsView,
  aggregateReport,
  applySpeechConfidence,
  getCategory,
  mockAnswerSchema,
  mockListQuerySchema,
  mockSetupSchema,
  mockSkipSchema,
  pickMockQuestions,
  topicsForRole,
  type AnswerEvaluation,
  type MockAnswerView,
  type MockInterviewState,
  type MockInterviewSummary,
  type PerformanceReportView,
  bookmarkSchema,
  dashboardQuerySchema,
  historyClearQuerySchema,
  historyQuerySchema,
  localWeekStart,
  streakDays,
  weekLabel,
  type HistoryItem,
} from '@aia/shared';
import type { ZodType } from 'zod';

/**
 * In-memory stand-in for the REST API used by client tests. It mirrors the real server's
 * contract (envelopes, status codes, error codes, shared Zod validation, refresh-cookie
 * behaviour) so tests exercise the real client code paths without a network.
 */
interface FakeUser {
  id: string;
  email: string;
  name: string;
  password: string;
  createdAt: string;
  profile: Omit<ProfileView, 'name'>;
  settings: SettingsView;
}

const DEFAULT_SETTINGS: SettingsView = {
  theme: 'system',
  answer: { style: 'conversational', length: 'normal', includeCodeExamples: true, codeLanguage: 'javascript' },
  voice: {
    voiceName: '',
    rate: 1,
    pitch: 1,
    autoSpeakAnswers: false,
    sttLanguage: 'en-US',
    sttEngine: 'server',
    ttsEngine: 'browser',
    aiVoice: 'alloy',
  },
  ai: { model: '', temperature: 0.4 },
  assistant: { captureIntervalMs: 3000, autoGenerateAnswers: true },
  privacy: { saveHistory: true, retentionDays: 90, storeRawAudio: false, storeScreenshots: false },
  permissions: { screenCapture: false, microphone: false },
};

export const TEST_PASSWORD = 'Sup3rSecret!';

/** Stable 24-hex id for a seeded question (same text → same id in every test). */
export function bankId(question: string): string {
  const i = QUESTION_BANK.findIndex((q) => q.question === question);
  if (i < 0) throw new Error(`Not in the question bank: ${question}`);
  return (i + 1).toString(16).padStart(24, '0');
}

interface FakeQuestion extends QuestionSummary {
  ownerId: string | null;
}

export function createFakeApi() {
  const users = new Map<string, FakeUser>();
  const accessTokens = new Map<string, { userId: string; sid: string }>();
  const sessions = new Map<string, { userId: string; refresh: string; revoked: boolean; userAgent: string }>();
  let cookie: string | null = null; // the browser's httpOnly refresh cookie
  let seq = 0;
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const failures = new Map<string, { status: number; body: unknown }>();
  let aiConfigured = true;
  let transcript = 'Um, so what is a closure in JavaScript?';
  let answerTake = 0;
  const mocks = new Map<string, { userId: string; state: MockInterviewState; report?: PerformanceReportView }>();
  const history: { userId: string; item: HistoryItem }[] = [];
  /** Same rules as the server: only when the page says where it was asked and "Save history" is on; no duplicates. */
  const record = (user: FakeUser, item: Omit<HistoryItem, 'id' | 'isBookmarked' | 'createdAt' | 'sessionId'>) => {
    if (!user.settings.privacy.saveHistory) return;
    const existing = history.find((h) => h.userId === user.id && h.item.sessionType === item.sessionType && h.item.questionText === item.questionText);
    if (existing) Object.assign(existing.item, item);
    else history.push({ userId: user.id, item: { ...item, id: hexId(), sessionId: `session-${item.sessionType}`, isBookmarked: false, createdAt: new Date().toISOString() } });
  };
  const hexId = () => (0xb00000 + ++seq).toString(16).padStart(24, '0');
  const questions: FakeQuestion[] = QUESTION_BANK.map((q) => ({
    id: bankId(q.question),
    categorySlug: q.category,
    question: q.question,
    difficulty: q.difficulty,
    type: q.type,
    tags: q.tags,
    ownerId: null,
  }));

  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    });
  const ok = (data: unknown, status = 200) => json(status, { success: true, data });
  const fail = (status: number, code: string, message: string, details?: unknown) =>
    json(status, { success: false, error: { code, message, ...(details ? { details } : {}) } });

  function parse<T>(schema: ZodType<T>, body: unknown): { data: T } | { res: Response } {
    const r = schema.safeParse(body);
    if (r.success) return { data: r.data };
    return {
      res: fail(422, 'VALIDATION_ERROR', 'Validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))),
    };
  }

  function issue(user: FakeUser, sid?: string) {
    const sessionId = sid ?? `s${++seq}`;
    const refresh = `rt-${++seq}`;
    sessions.set(sessionId, { userId: user.id, refresh, revoked: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' });
    const accessToken = `at-${++seq}`;
    accessTokens.set(accessToken, { userId: user.id, sid: sessionId });
    cookie = refresh;
    return {
      user: { id: user.id, email: user.email, name: user.name, role: 'user', createdAt: user.createdAt },
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  const profileView = (u: FakeUser): ProfileView => ({ name: u.name, ...u.profile });

  function addUser(name: string, email: string, password: string): FakeUser {
    const user: FakeUser = {
      id: `u${++seq}`,
      email,
      name,
      password,
      createdAt: new Date('2026-01-15T10:00:00Z').toISOString(),
      profile: { headline: '', targetRole: '', experienceLevel: 'junior', yearsOfExperience: 0, preferredLanguages: [] },
      settings: structuredClone(DEFAULT_SETTINGS),
    };
    users.set(user.id, user);
    return user;
  }

  function authed(req: Request): { user: FakeUser; sid: string } | Response {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    const entry = token ? accessTokens.get(token) : undefined;
    if (!entry) return fail(401, token ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED', 'Authentication required');
    const session = sessions.get(entry.sid);
    const user = users.get(entry.userId);
    if (!session || session.revoked || !user) return fail(401, 'SESSION_REVOKED', 'Your session has ended');
    return { user, sid: entry.sid };
  }

  function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
      else if (v !== undefined) target[k] = v;
    }
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method.toUpperCase();
    const contentType = req.headers.get('content-type') ?? '';
    let body: unknown;
    let audioBytes = 0;
    if (contentType.startsWith('audio/')) {
      audioBytes = (await req.arrayBuffer()).byteLength; // binary upload: never parsed as JSON
    } else {
      const text = method === 'GET' ? '' : await req.text();
      body = text ? JSON.parse(text) : undefined;
    }
    calls.push({ method, path, body: audioBytes ? { audioBytes, contentType } : body });

    const forced = failures.get(`${method} ${path}`);
    if (forced) return json(forced.status, forced.body);

    if (path === '/health') return ok({ status: 'ok', db: 'connected', uptimeSec: 1, version: '0.1.0' });

    // ---------- auth ----------
    if (path === '/auth/register' && method === 'POST') {
      const p = parse(registerSchema, body);
      if ('res' in p) return p.res;
      if ([...users.values()].some((u) => u.email === p.data.email)) return fail(409, 'CONFLICT', 'An account with this email already exists');
      return ok(issue(addUser(p.data.name, p.data.email, p.data.password)), 201);
    }
    if (path === '/auth/login' && method === 'POST') {
      const p = parse(loginSchema, body);
      if ('res' in p) return p.res;
      const user = [...users.values()].find((u) => u.email === p.data.email && u.password === p.data.password);
      if (!user) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      return ok(issue(user));
    }
    if (path === '/auth/refresh' && method === 'POST') {
      if (req.headers.get('x-requested-with') !== 'fetch') return fail(403, 'FORBIDDEN', 'Missing X-Requested-With header');
      const entry = [...sessions.entries()].find(([, s]) => s.refresh === cookie && !s.revoked);
      if (!entry) {
        const code = cookie === null ? 'NO_SESSION' : 'SESSION_EXPIRED';
        cookie = null;
        return fail(401, code, 'Not signed in');
      }
      return ok(issue(users.get(entry[1].userId)!, entry[0]));
    }
    if (path === '/auth/logout' && method === 'POST') {
      for (const s of sessions.values()) if (s.refresh === cookie) s.revoked = true;
      cookie = null;
      return json(204);
    }
    if (path === '/auth/logout-all' && method === 'POST') {
      const a = authed(req);
      if (a instanceof Response) return a;
      for (const s of sessions.values()) if (s.userId === a.user.id) s.revoked = true;
      cookie = null;
      return json(204);
    }

    const a = authed(req);
    if (a instanceof Response) return a;
    const { user, sid } = a;

    // ---------- users ----------
    if (path === '/users/me/profile' && method === 'GET') return ok(profileView(user));
    if (path === '/users/me/profile' && method === 'PATCH') {
      const p = parse(profileUpdateSchema.partial(), body);
      if ('res' in p) return p.res;
      const { name, ...rest } = p.data;
      if (name) user.name = name;
      Object.assign(user.profile, rest);
      return ok(profileView(user));
    }
    if (path === '/users/me/password' && method === 'PATCH') {
      const p = parse(changePasswordSchema, body);
      if ('res' in p) return p.res;
      if (p.data.currentPassword !== user.password) {
        return fail(422, 'VALIDATION_ERROR', 'Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }]);
      }
      user.password = p.data.newPassword;
      let n = 0;
      for (const [id, s] of sessions) if (s.userId === user.id && id !== sid && !s.revoked) (s.revoked = true), n++;
      return ok({ otherSessionsSignedOut: n });
    }
    if (path === '/users/me' && method === 'DELETE') {
      const p = parse(deleteAccountSchema, body);
      if ('res' in p) return p.res;
      if (p.data.password !== user.password) {
        return fail(422, 'VALIDATION_ERROR', 'Password is incorrect', [{ path: 'password', message: 'Password is incorrect' }]);
      }
      users.delete(user.id);
      cookie = null;
      return json(204);
    }
    if (path === '/users/me/sessions' && method === 'GET') {
      const list: AuthSessionView[] = [...sessions.entries()]
        .filter(([, s]) => s.userId === user.id && !s.revoked)
        .map(([id, s]) => ({ id, userAgent: s.userAgent, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(), current: id === sid }));
      return ok(list);
    }
    const revokeMatch = path.match(/^\/users\/me\/sessions\/(\w+)$/);
    if (revokeMatch && method === 'DELETE') {
      const s = sessions.get(revokeMatch[1]!);
      if (!s || s.userId !== user.id) return fail(404, 'NOT_FOUND', 'Session not found');
      s.revoked = true;
      return json(204);
    }

    // ---------- categories & questions ----------
    const visible = questions.filter((q) => q.ownerId === null || q.ownerId === user.id);
    const view = ({ ownerId, ...q }: FakeQuestion): QuestionSummary => ({ ...q, isOwn: ownerId === user.id });
    const query = Object.fromEntries(url.searchParams);
    const known = new Set(CATEGORY_CATALOG.map((c) => c.slug));
    const unknownCats = (slugs: string[]) =>
      slugs.some((x) => !known.has(x)) ? fail(422, 'VALIDATION_ERROR', 'Validation failed', [{ path: 'categories', message: 'Unknown category' }]) : null;

    if (path === '/categories' && method === 'GET') {
      const list: CategoryView[] = CATEGORY_CATALOG.map((c, i) => ({
        id: `c${i}`,
        slug: c.slug,
        name: c.name,
        group: c.group,
        icon: c.icon,
        description: c.description,
        questionCount: visible.filter((q) => q.categorySlug === c.slug).length,
      }));
      return ok(list);
    }
    if (path === '/questions/practice' && method === 'GET') {
      const p = parse(practiceQuerySchema, query);
      if ('res' in p) return p.res;
      const bad = unknownCats(p.data.categories);
      if (bad) return bad;
      const pool = visible.filter(
        (q) => p.data.categories.includes(q.categorySlug) && (p.data.difficulty === 'mixed' || q.difficulty === p.data.difficulty),
      );
      let first: FakeQuestion | undefined;
      if (p.data.focus) {
        first = visible.find((q) => q.id === p.data.focus);
        if (!first) return fail(404, 'NOT_FOUND', 'Question not found');
      }
      const rest = pool.filter((q) => q.id !== first?.id); // deterministic order keeps tests stable
      return ok([...(first ? [first] : []), ...rest].slice(0, p.data.count).map(view));
    }
    if (path === '/questions/search' && method === 'GET') {
      const p = parse(questionSearchQuerySchema, query);
      if ('res' in p) return p.res;
      const term = p.data.q.toLowerCase();
      return ok(
        visible
          .filter((q) => q.question.toLowerCase().includes(term) || q.tags.some((t) => t.includes(term)))
          .slice(0, p.data.limit)
          .map(view),
      );
    }
    if (path === '/questions' && method === 'GET') {
      const p = parse(questionListQuerySchema, query);
      if ('res' in p) return p.res;
      const items = (p.data.mine ? questions.filter((q) => q.ownerId === user.id) : visible).map(view);
      return json(200, { success: true, data: items.slice(0, p.data.limit), meta: { page: 1, limit: p.data.limit, total: items.length, totalPages: 1 } });
    }
    if (path === '/questions' && method === 'POST') {
      const p = parse(createQuestionSchema, body);
      if ('res' in p) return p.res;
      if (!known.has(p.data.categorySlug)) {
        return fail(422, 'VALIDATION_ERROR', 'Validation failed', [{ path: 'categorySlug', message: 'Choose a valid category' }]);
      }
      const norm = normalizeQuestionText(p.data.question);
      if (questions.some((q) => q.ownerId === user.id && normalizeQuestionText(q.question) === norm)) {
        return fail(409, 'CONFLICT', 'You have already added this question');
      }
      const created: FakeQuestion = {
        id: (0xabc000 + ++seq).toString(16).padStart(24, '0'),
        categorySlug: p.data.categorySlug,
        question: p.data.question,
        difficulty: p.data.difficulty,
        type: p.data.type,
        tags: p.data.tags,
        ownerId: user.id,
      };
      questions.push(created);
      return ok(view(created), 201);
    }
    const qMatch = path.match(/^\/questions\/([a-f0-9]{24})$/);
    if (qMatch && method === 'DELETE') {
      const i = questions.findIndex((q) => q.id === qMatch[1] && q.ownerId === user.id);
      if (i < 0) return fail(404, 'NOT_FOUND', 'Question not found');
      questions.splice(i, 1);
      return json(204);
    }

    // ---------- AI (deterministic stand-in for the model) ----------
    const aiOff = () =>
      fail(503, 'AI_NOT_CONFIGURED', 'AI features are not set up on this server yet (missing OPENAI_API_KEY).');
    if (path === '/ai/status' && method === 'GET') return ok({ configured: aiConfigured, provider: aiConfigured ? 'openai' : 'none' });
    if (path === '/ai/answer' && method === 'POST') {
      const p = parse(aiAnswerRequestSchema, body);
      if ('res' in p) return p.res;
      if (!aiConfigured) return aiOff();
      const length = p.data.length ?? user.settings.answer.length;
      const take = p.data.regenerate ? ` (take ${++answerTake + 1})` : '';
      const q = p.data.question;
      const generated = {
        directAnswer: `Direct answer to: ${q}${take}`,
        ...(length === 'short' ? {} : { simpleExplanation: `Simple explanation of: ${q}`, realWorldExample: `Real-world example for: ${q}` }),
        codeExample: length === 'detailed' && user.settings.answer.includeCodeExamples ? { language: user.settings.answer.codeLanguage, code: 'console.log(42);' } : null,
        interviewReadyAnswer: `Interview-ready (${length}, ${user.settings.answer.style}): ${q}${take}`,
        length,
        model: 'fake-model' as const,
        cached: false,
      };
      if (p.data.source) {
        const fromBank = p.data.questionId ? questions.find((x) => x.id === p.data.questionId && (x.ownerId === null || x.ownerId === user.id)) : undefined;
        record(user, {
          sessionType: p.data.source,
          questionText: q,
          inputMode: p.data.inputMode ?? 'text',
          ...(fromBank ? { categorySlug: fromBank.categorySlug } : {}),
          answer: { ...generated, codeExample: generated.codeExample ?? null },
        });
      }
      return ok(generated);
    }
    if (path === '/ai/explain' && method === 'POST') {
      const p = parse(explainRequestSchema, body);
      if ('res' in p) return p.res;
      if (!aiConfigured) return aiOff();
      return ok({
        title: p.data.concept,
        summary: `${p.data.concept} in one line.`,
        explanation: `How ${p.data.concept} works.`,
        analogy: `${p.data.concept} is like a restaurant kitchen.`,
        keyPoints: ['First key point', 'Second key point'],
        example: null,
      });
    }
    if (path === '/ai/analyze-code' && method === 'POST') {
      const p = parse(analyzeCodeRequestSchema, body);
      if ('res' in p) return p.res;
      if (!aiConfigured) return aiOff();
      const buggy = p.data.code.includes('<=');
      return ok({
        language: 'javascript',
        summary: buggy ? 'Loops one step too far.' : 'Looks correct.',
        issues: buggy ? [{ severity: 'error', line: 2, title: 'Off-by-one error', detail: 'Uses <= length.', fix: 'Use < length.' }] : [],
        improvedCode: buggy ? p.data.code.replace('<=', '<') : null,
        complexity: 'O(n) time, O(1) space',
      });
    }
    if (path === '/ai/transcribe' && method === 'POST') {
      if (!aiConfigured) return aiOff();
      if (audioBytes < 1000) return fail(422, 'AUDIO_TOO_SHORT', 'The recording is too short.');
      return ok({ text: transcript });
    }
    if (path === '/ai/speak' && method === 'POST') {
      const p = parse(speakRequestSchema, body);
      if ('res' in p) return p.res;
      if (!aiConfigured) return aiOff();
      return new Response(new Uint8Array([73, 68, 51, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (path === '/questions/generate' && method === 'POST') {
      const p = parse(generateQuestionsSchema, body);
      if ('res' in p) return p.res;
      if (!aiConfigured) return aiOff();
      const created = Array.from({ length: Math.min(p.data.count, 2) }, (_, i) => {
        const q: FakeQuestion = {
          id: (0xa10000 + ++seq).toString(16).padStart(24, '0'),
          categorySlug: p.data.categorySlug,
          question: `AI question ${i + 1} about ${p.data.categorySlug}?`,
          difficulty: p.data.difficulty,
          type: 'conceptual',
          tags: [],
          ownerId: user.id,
        };
        questions.push(q);
        return view(q);
      });
      return ok(created, 201);
    }

    // ---------- mock interviews (mirrors apps/server/src/modules/mock) ----------
    const withIndex = (st: MockInterviewState): MockInterviewState => {
      const i = st.questions.findIndex((q) => q.status === 'pending');
      return { ...st, currentIndex: i === -1 ? st.questions.length : i };
    };
    const summary = (m: { state: MockInterviewState; report?: PerformanceReportView }): MockInterviewSummary => ({
      id: m.state.id,
      jobRole: m.state.jobRole,
      experienceLevel: m.state.experienceLevel,
      status: m.state.status,
      totalQuestions: m.state.questions.length,
      answeredCount: m.state.questions.filter((q) => q.status === 'answered').length,
      ...(m.report ? { overallScore: m.report.overallScore, reportId: m.report.id } : {}),
      startedAt: m.state.startedAt,
      ...(m.state.completedAt ? { completedAt: m.state.completedAt } : {}),
    });
    if (path === '/mock-interviews' && method === 'GET') {
      const p = parse(mockListQuerySchema, Object.fromEntries(url.searchParams));
      if ('res' in p) return p.res;
      const mine = [...mocks.values()].filter((m) => m.userId === user.id && (!p.data.status || m.state.status === p.data.status));
      return ok(mine.reverse().slice(0, p.data.limit).map(summary));
    }
    if (path === '/mock-interviews' && method === 'POST') {
      const p = parse(mockSetupSchema, body);
      if ('res' in p) return p.res;
      const unknownTopics = p.data.focusAreas.filter((f) => !getCategory(f));
      if (unknownTopics.length) {
        return fail(422, 'VALIDATION_ERROR', 'Validation failed', [{ path: 'focusAreas', message: `Unknown topic: ${unknownTopics.join(', ')}` }]);
      }
      const topics = p.data.focusAreas.length ? p.data.focusAreas : topicsForRole(p.data.jobRole);
      const pool = questions.filter((q) => q.ownerId === null || q.ownerId === user.id);
      const picked = pickMockQuestions(pool, topics, p.data.experienceLevel, p.data.questionCount, (xs) => [...xs]);
      if (!picked.length) return fail(422, 'NO_QUESTIONS', 'No questions are available for these topics yet. Try adding more topics.');
      for (const m of mocks.values()) if (m.userId === user.id && m.state.status === 'in_progress') m.state.status = 'abandoned';
      const state: MockInterviewState = {
        id: hexId(),
        ...p.data,
        questionCount: picked.length,
        status: 'in_progress',
        currentIndex: 0,
        startedAt: new Date().toISOString(),
        questions: picked.map((q, i) => ({
          id: hexId(),
          order: i,
          text: q.question,
          topic: getCategory(q.categorySlug)?.name ?? q.categorySlug,
          categorySlug: q.categorySlug,
          difficulty: q.difficulty,
          status: 'pending' as const,
        })),
      };
      mocks.set(state.id, { userId: user.id, state });
      return ok(state, 201);
    }
    const mm = path.match(/^\/mock-interviews\/([a-f0-9]{24})(?:\/(answers|skip|complete|report))?$/);
    if (mm) {
      const m = mocks.get(mm[1]!);
      if (!m || m.userId !== user.id) return fail(404, 'NOT_FOUND', 'Mock interview not found');
      const action = mm[2];
      if (!action && method === 'GET') return ok(m.state);
      if (!action && method === 'DELETE') {
        mocks.delete(m.state.id);
        for (const h of history.filter((x) => x.item.mockInterviewId === m.state.id)) history.splice(history.indexOf(h), 1);
        return json(204);
      }
      if (action === 'report' && method === 'GET') return m.report ? ok(m.report) : fail(404, 'NOT_FOUND', 'Report not found');
      if ((action === 'answers' || action === 'skip') && method === 'POST') {
        const p = action === 'answers' ? parse(mockAnswerSchema, body) : parse(mockSkipSchema, body);
        if ('res' in p) return p.res;
        if (m.state.status !== 'in_progress') return fail(409, 'MOCK_NOT_IN_PROGRESS', 'This interview has already ended.');
        const q = m.state.questions.find((x) => x.id === p.data.questionId);
        if (!q) return fail(404, 'NOT_FOUND', 'Question not found in this interview');
        if (q.status !== 'pending') return fail(409, q.status === 'answered' ? 'ALREADY_ANSWERED' : 'ALREADY_SKIPPED', 'Already handled.');
        if (action === 'skip') {
          q.status = 'skipped';
        } else {
          if (!aiConfigured) return aiOff();
          const a = p.data as unknown as { response: string; inputMode: 'text' | 'voice'; speechMetrics?: MockAnswerView['speechMetrics'] };
          const words = a.response.split(/\s+/).filter(Boolean).length;
          const base = Math.min(90, 40 + words * 2);
          const raw: AnswerEvaluation = {
            scores: { technicalAccuracy: base, communication: base, structure: base, practicalKnowledge: base, confidence: base },
            overall: base,
            feedback: `Feedback on your answer to: ${q.text}`,
            strengths: ['Answered the question directly'],
            improvements: ['Add a real-world example'],
            improvedAnswer: `Improved answer for: ${q.text}`,
          };
          const spoken = a.inputMode === 'voice' ? a.speechMetrics : undefined;
          q.status = 'answered';
          q.answer = {
            response: a.response,
            inputMode: a.inputMode,
            evaluation: applySpeechConfidence(raw, spoken),
            ...(spoken ? { speechMetrics: spoken } : {}),
            answeredAt: new Date().toISOString(),
          };
          record(user, {
            sessionType: 'mock',
            questionText: q.text,
            inputMode: a.inputMode,
            ...(q.categorySlug ? { categorySlug: q.categorySlug } : {}),
            userResponse: a.response,
            score: q.answer.evaluation.overall,
            feedback: q.answer.evaluation.feedback,
            improvedAnswer: q.answer.evaluation.improvedAnswer,
            mockInterviewId: m.state.id,
          });
        }
        m.state = withIndex(m.state);
        return ok(m.state);
      }
      if (action === 'complete' && method === 'POST') {
        if (m.state.status === 'in_progress') {
          const answered = m.state.questions.filter((q) => q.answer);
          const report = aggregateReport(
            answered.map((q) => ({
              questionText: q.text,
              topic: q.topic,
              evaluation: q.answer!.evaluation,
              ...(q.answer!.speechMetrics ? { speechMetrics: q.answer!.speechMetrics } : {}),
            })),
            { total: m.state.questions.length, skipped: m.state.questions.filter((q) => q.status === 'skipped').length },
          );
          const completedAt = new Date().toISOString();
          m.state = { ...m.state, status: report ? 'completed' : 'abandoned', completedAt };
          if (report) {
            m.report = {
              id: hexId(),
              mockInterviewId: m.state.id,
              jobRole: m.state.jobRole,
              experienceLevel: m.state.experienceLevel,
              totalQuestions: m.state.questions.length,
              answeredCount: answered.length,
              ...report,
              completedAt,
            };
            m.state.reportId = m.report.id;
          }
        }
        return ok(m.state);
      }
    }

    // ---------- history, dashboard, export (mirrors apps/server/src/modules/history|dashboard) ----------
    if (path === '/history' && method === 'GET') {
      const p = parse(historyQuerySchema, Object.fromEntries(url.searchParams));
      if ('res' in p) return p.res;
      const term = p.data.q?.toLowerCase();
      const mine = history
        .filter((h) => h.userId === user.id)
        .filter((h) => p.data.type === 'all' || h.item.sessionType === p.data.type)
        .filter((h) => p.data.bookmarked === undefined || h.item.isBookmarked === p.data.bookmarked)
        .filter((h) => !term || h.item.questionText.toLowerCase().includes(term) || h.item.userResponse?.toLowerCase().includes(term))
        .map((h) => h.item)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { page, limit } = p.data;
      return json(200, {
        success: true,
        data: mine.slice((page - 1) * limit, page * limit),
        meta: { page, limit, total: mine.length, totalPages: Math.max(1, Math.ceil(mine.length / limit)) },
      });
    }
    const hm = path.match(/^\/history\/([a-f0-9]{24})$/);
    if (hm) {
      const entry = history.find((h) => h.item.id === hm[1] && h.userId === user.id);
      if (!entry) return fail(404, 'NOT_FOUND', 'History entry not found');
      if (method === 'PATCH') {
        const p = parse(bookmarkSchema, body);
        if ('res' in p) return p.res;
        entry.item.isBookmarked = p.data.isBookmarked;
        return ok(entry.item);
      }
      if (method === 'DELETE') {
        history.splice(history.indexOf(entry), 1);
        return json(204);
      }
    }
    if (path === '/history' && method === 'DELETE') {
      const p = parse(historyClearQuerySchema, Object.fromEntries(url.searchParams));
      if ('res' in p) return p.res;
      const doomed = history.filter((h) => h.userId === user.id && (p.data.type === 'all' || h.item.sessionType === p.data.type));
      for (const d of doomed) history.splice(history.indexOf(d), 1);
      if (p.data.type === 'all' || p.data.type === 'mock') for (const [id, m] of mocks) if (m.userId === user.id) mocks.delete(id);
      return ok({ deleted: doomed.length });
    }
    if (path === '/dashboard/summary' && method === 'GET') {
      const p = parse(dashboardQuerySchema, Object.fromEntries(url.searchParams));
      if ('res' in p) return p.res;
      const mine = history.filter((h) => h.userId === user.id).map((h) => h.item);
      const scored = mine.filter((h) => h.score !== undefined);
      const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
      const reports = [...mocks.values()].filter((m) => m.userId === user.id && m.report);
      const now = new Date();
      const thisWeek = localWeekStart(now, p.data.tzOffset);
      return ok({
        totals: {
          questionsPractised: mine.length,
          questionsThisWeek: mine.filter((h) => new Date(h.createdAt) >= thisWeek).length,
          mockInterviewsCompleted: reports.length,
          skillsScore: avg(scored.map((h) => h.score!)),
          skillsScoreChange: 0,
          streakDays: streakDays(mine.map((h) => new Date(h.createdAt)), now, p.data.tzOffset),
        },
        progress: Array.from({ length: 8 }, (_, i) => {
          const start = new Date(thisWeek.getTime() - (7 - i) * 7 * 86_400_000);
          const end = new Date(start.getTime() + 7 * 86_400_000);
          const inWeek = mine.filter((h) => new Date(h.createdAt) >= start && new Date(h.createdAt) < end);
          const s = inWeek.filter((h) => h.score !== undefined).map((h) => h.score!);
          return { week: weekLabel(start, p.data.tzOffset), questionsPractised: inWeek.length, averageScore: s.length ? avg(s) : null };
        }),
        skills: { technicalAccuracy: avg(scored.map((h) => h.score!)), communication: avg(scored.map((h) => h.score!)), structure: avg(scored.map((h) => h.score!)), practicalKnowledge: avg(scored.map((h) => h.score!)), confidence: avg(scored.map((h) => h.score!)) },
        weakTopics: reports.flatMap((m) => m.report!.weakTopics),
        recentSessions: reports.map((m) => ({
          id: m.state.id,
          type: 'mock',
          title: `Mock interview — ${m.state.jobRole}`,
          questionCount: m.state.questions.length,
          score: m.report!.overallScore,
          startedAt: m.state.startedAt,
        })),
        recommended: questions.filter((q) => q.ownerId === null && q.categorySlug === 'javascript').slice(0, 4).map(view),
      });
    }
    if (path === '/users/me/export' && method === 'GET') {
      const mine = [...mocks.values()].filter((m) => m.userId === user.id);
      return ok({
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email, name: user.name, role: 'user', createdAt: user.createdAt },
        profile: profileView(user),
        settings: user.settings,
        history: history.filter((h) => h.userId === user.id).map((h) => h.item),
        mockInterviews: mine.map((m) => m.state),
        reports: mine.flatMap((m) => (m.report ? [m.report] : [])),
        questions: questions.filter((q) => q.ownerId === user.id).map(view),
      });
    }

    // ---------- settings ----------
    if (path === '/settings' && method === 'GET') return ok(user.settings);
    const settingsRoutes: Record<string, [ZodType, string | null]> = {
      '/settings/preferences': [preferencesUpdateSchema, null],
      '/settings/voice': [voiceUpdateSchema, 'voice'],
      '/settings/privacy': [privacyUpdateSchema, 'privacy'],
      '/settings/permissions': [permissionsUpdateSchema, 'permissions'],
    };
    const route = settingsRoutes[path];
    if (route && method === 'PATCH') {
      const p = parse(route[0], body);
      if ('res' in p) return p.res;
      deepMerge(user.settings as unknown as Record<string, unknown>, (route[1] ? { [route[1]]: p.data } : p.data) as Record<string, unknown>);
      return ok(user.settings);
    }

    return fail(404, 'NOT_FOUND', `Route ${method} ${path} not found`);
  }

  return {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => handle(input instanceof Request ? input : new Request(input, init)),
    calls,
    /** Create an account and put its refresh cookie in the "browser" (= already signed in). */
    seedSignedInUser(name = 'Asha Mehta', email = 'asha@example.com') {
      const user = addUser(name, email, TEST_PASSWORD);
      issue(user);
      return user;
    },
    seedUser(name = 'Asha Mehta', email = 'asha@example.com') {
      return addUser(name, email, TEST_PASSWORD);
    },
    /** What the fake speech-to-text "hears". */
    setTranscript: (t: string) => {
      transcript = t;
    },
    /** Simulate a server without OPENAI_API_KEY. */
    setAiConfigured: (v: boolean) => {
      aiConfigured = v;
    },
    /** Make every current access token invalid, as if they all expired. */
    expireAccessTokens: () => accessTokens.clear(),
    /** Force the next responses for `METHOD /path` to fail. */
    failRoute: (key: string, status: number, body: unknown) => failures.set(key, { status, body }),
    get hasCookie() {
      return cookie !== null;
    },
    users,
    mocks,
    history,
    /** Add saved answers for a user, as if they had asked them (newest last). */
    seedHistory(user: FakeUser, items: Partial<HistoryItem>[]) {
      items.forEach((it, i) =>
        record(user, {
          sessionType: 'practice',
          inputMode: 'text',
          questionText: `Question ${i + 1}?`,
          ...it,
        } as Omit<HistoryItem, 'id' | 'isBookmarked' | 'createdAt' | 'sessionId'>),
      );
    },
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
