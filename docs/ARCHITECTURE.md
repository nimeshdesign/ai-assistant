# Architecture

AI Interview Assistant helps developers **prepare** for technical interviews (practice, mock interviews, feedback) and get **live support** in sessions where AI assistance and screen/mic capture are permitted.

## 1. System overview

```
┌──────────────────────────── User's machine ────────────────────────────┐
│                                                                         │
│  ┌──────────────── apps/desktop (Electron) ───────────────────────────┐ │
│  │  Main process                                                      │ │
│  │   • floating, movable assistant window (always-on-top, toggleable) │ │
│  │   • desktopCapturer → user picks a screen or window in-app         │ │
│  │   • tray icon + visible "Capturing"/"Listening" indicators         │ │
│  │  Renderer = the same React app (apps/client), route /desktop       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────── apps/client (React SPA, browser or Electron) ─────┐ │
│  │  UI · Redux Toolkit + RTK Query · Tesseract.js OCR (in-browser)    │ │
│  │  Web Speech API (STT fallback) · speechSynthesis (TTS)             │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │ HTTPS, JSON (text only — no images/audio stored)
                                  ▼
┌──────────────── apps/server (Node.js + Express, REST /api/v1) ──────────┐
│  modules/: auth · users · settings · questions · ai · mock · history    │
│  middleware: helmet · CORS allow-list · rate limit · zod validation     │
│  services/ai: provider interface → OpenAI adapter (key stays server-side)│
└───────────────┬───────────────────────────────────────┬─────────────────┘
                ▼                                       ▼
          ┌───────────┐                        ┌─────────────────┐
          │  MongoDB  │                        │   OpenAI API    │
          └───────────┘                        │ chat · STT · TTS│
                                               └─────────────────┘
```

### Key decisions

| Decision | Why |
|---|---|
| **npm workspaces monorepo** (`packages/shared`, `apps/server`, `apps/client`, `apps/desktop`) | Frontend and backend stay separate, but share enums/types from one source so they can't drift. |
| **OCR runs on the client** (Tesseract.js in a Web Worker, **self-hosted**) | Screenshots never leave the machine; only extracted text goes to the server. The engine (WASM) and English data are copied into `public/ocr` by `scripts/copy-ocr-assets.mjs` (about 23 MB, downloaded on first use, then cached), so OCR makes no third-party requests. This was verified in Chrome with every non-local hostname blocked. |
| **Change detection before OCR/AI** | A 160×90 grayscale thumbnail diff skips unchanged frames (a line of text changes hundreds of pixels; a blinking cursor changes a handful). A 64-bit perceptual hash was tried first but couldn't see one paragraph replacing another on a white page. A normalised-text key then skips text already processed, and only ambiguous text **that shows a sign of a question** reaches the AI. This meets "do not repeatedly process unchanged screen content" and keeps AI cost down. |
| **Client uses shared source in dev** | Vite aliases `@aia/shared` to `packages/shared/src`, so changes to shared code hot-reload without a restart. |
| **AI provider interface** on the server | `services/ai/provider.ts`. OpenAI is the production adapter, and tests use an in-memory fake, so no test needs a key or spends money. Prompts, structured output and error mapping live behind one interface, so the model or provider can change without touching routes. `OPENAI_BASE_URL` also allows OpenAI-compatible gateways. |
| **Structured, validated AI output** | Strict JSON-schema mode, generated from Zod (unsupported keywords stripped from what's sent), then the full Zod schema re-validates the response. Malformed output gets one retry, then `AI_BAD_OUTPUT`. |
| **Untrusted text is fenced** | Questions, code, candidate answers and existing questions go inside delimited tags, and the system prompt says never to follow instructions inside them. Closing tags inside the data are neutralised (prompt-injection guard). |
| **Structured JSON answers** | The AI must return the five-part `StructuredAnswer` (direct answer, simple explanation, real-world example, code example, interview-ready answer), validated with Zod before it reaches the UI. |
| **Short-lived JWT access token (memory) + opaque rotating refresh token (httpOnly cookie)** | Tokens never touch `localStorage` (XSS). Refresh tokens are random 256-bit values stored only as SHA-256 hashes in `auth_sessions`. Each refresh rotates the token, and presenting an already-rotated token revokes all the user's sessions (theft detection). Access tokens carry their session id, so logout takes effect immediately. |
| **scrypt password hashing** (Node built-in) | Memory-hard, no native dependency. Parameters are stored with each hash so they can be raised later (`needsRehash` upgrades on login). |
| **Shared Zod request schemas** (`@aia/shared`) | The API validates and the forms validate with the same rules. Strict objects reject unknown fields, so mass-assignment is impossible. |
| **RTK Query** for server state, small Redux slices for UI state | Caching, loading/error states, and cache invalidation come built in. |
| **Sample data behind real endpoints** (Phases 2–9, now retired) | The UI was built against the final shared API types while backends were missing. Each backend phase swapped one endpoint's sample `queryFn` for an HTTP `query` without changing components; Phase 10 removed the last of it. |
| **Route-level code splitting** | Each feature is a lazy chunk. Recharts only loads with the dashboard, so the entry bundle stays around 130 KB gzipped. |
| **Desktop = thin Electron shell around the web app** (Phase 8) | The window loads the client's `/desktop` route, so the UI, OCR, voice and AI code exist once. The shell only adds what a browser can't: a frameless always-on-top window, bubble ↔ panel, tray, global shortcut and the screen/window picker. A typed preload bridge (`DesktopBridge` in `@aia/shared`) is the whole contract. |
| **Express 5** | Native async error propagation, so no `asyncHandler` wrappers. |

## 2. Folder structure

```
ai-assistant/
├── package.json               # workspaces + root scripts (dev, build, test, typecheck)
├── tsconfig.base.json
├── docs/                      # ARCHITECTURE.md, DATABASE.md, UI_DESIGN.md
├── packages/
│   └── shared/                # @aia/shared — enums, API types, text normalisation
│       └── src/{constants,types,text,index}.ts
├── apps/
│   ├── server/                # @aia/server — Express REST API
│   │   ├── src/
│   │   │   ├── app.ts         # express app factory (used by server.ts and tests)
│   │   │   ├── server.ts      # boot: connect DB, listen, graceful shutdown
│   │   │   ├── config/        # env.ts (zod-validated), db.ts
│   │   │   ├── middleware/    # errorHandler, validate, auth (P3)
│   │   │   ├── models/        # 9 Mongoose models (see DATABASE.md)
│   │   │   ├── modules/       # one folder per feature:
│   │   │   │   └── <feature>/ #   <feature>.routes.ts · .controller.ts · .service.ts · .schemas.ts
│   │   │   ├── services/ai/   # provider interface, OpenAI adapter, prompts (P5)
│   │   │   ├── routes/        # mounts module routers under /api/v1
│   │   │   ├── seed/          # categories + starter questions (P4)
│   │   │   ├── types/         # Express request augmentation
│   │   │   └── utils/         # ApiError, logger, http helpers
│   │   └── tests/             # vitest + supertest + mongodb-memory-server
│   ├── client/                # @aia/client — React SPA (Vite)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── ui/        # shadcn/ui primitives (button, card, badge…)
│   │       │   ├── layout/    # AppShell, Sidebar, Topbar, ThemeToggle
│   │       │   └── common/    # PageHeader, ApiStatus, EmptyState…
│   │       ├── features/      # dashboard, practice, mock, assistant, voice, history, settings, auth
│   │       │   └── <feature>/ #   pages, components, <feature>Api.ts (RTK Query endpoints), hooks
│   │       ├── components/answer/ # AnswerCard (5-part answer, 3 lengths, copy, TTS), AskQuestion
│   │       ├── lib/           # cn(), config, format helpers; ocr/ (P6), speech/ (P7)
│   │       ├── store/         # store, api base slice, feature APIs (auth, questions, ai, mock, history), ui/settings slices
│   │       ├── hooks/         # useSpeech, useScreenCapture, useCopy, useApplyTheme…
│   │       ├── pages/         # NotFound, RouteError
│   │       ├── router.tsx
│   │       └── test/
│   └── desktop/               # @aia/desktop — Electron shell
│       ├── src/main/          # main.ts (window, tray, IPC, permissions), policy.ts (pure rules), icons.ts
│       ├── src/preload/       # preload.ts → window.desktop bridge
│       └── tests/
```

## 3. Module → phase map

| Module | Server | Client | Phase |
|---|---|---|---|
| Foundation, health, error handling, models | `config/`, `models/`, `modules/health` | App shell, theme, router, store | **1 ✅** |
| Dashboard + full UI | — | all `features/*` pages, answer card, ⌘K menu (plus a sample data layer, since removed) | **2 ✅** |
| Auth & users | `modules/auth`, `modules/users`, `modules/settings` | `features/auth`, `features/settings`, `store/authApi.ts` | **3 ✅** |
| Question bank | `modules/questions`, `seed/` (bank in `@aia/shared/seed`) | `features/practice`, `store/questionsApi.ts` | **4 ✅** |
| AI answers | `services/ai`, `modules/ai` | `store/aiApi.ts`, `hooks/useAiAnswer.ts`, answer card, `features/tools` | **5 ✅** |
| Screen OCR | `POST /ai/detect-question` | `lib/screen/*` (`change`, `frames`, `ocr`, `screenReader`), `features/assistant`; heuristics in `@aia/shared` `detect.ts` | **6 ✅** |
| Voice | `POST /ai/transcribe`, `POST /ai/speak` | `lib/voice/*` (`vad`, `recorder`, `browserStt`), `hooks/useVoiceInput`, `hooks/useSpeech`, `features/voice`, mock-room mic; metrics in `@aia/shared` `speech.ts` | **7 ✅** |
| Floating assistant | — | `apps/desktop`, `features/desktop` (`/desktop` route, `SourcePicker`, `useDesktopShell`), `lib/desktop.ts`; bridge types in `@aia/shared` `desktop.ts` | **8 ✅** |
| Mock interview & evaluation | `modules/mock` (`mock.service.ts`, `mock.routes.ts`) | `features/mock`, `store/mockApi.ts`; selection, speech confidence and report rules in `@aia/shared` `mock.ts` | **9 ✅** |
| History, analytics, retention, security hardening | `modules/history` (recording, search, bookmarks, delete, retention), `modules/dashboard`, `GET /users/me/export`; `tests/security.test.ts` | `features/history`, `features/dashboard`, `store/historyApi.ts`, privacy settings (export); date maths in `@aia/shared` `analytics.ts` | **10 ✅** |

## 4. Core data flows

### Screen question → answer (Phase 6)
1. The user clicks **Start**, confirms the consent dialog, and picks a screen, window or tab in the browser's own picker. A red "Screen capture on" indicator stays visible while capture is on. The user can drag on the preview to read only part of the screen (letterboxing is accounted for).
2. Every `captureIntervalMs` (default 3 s, configurable), `ScreenReader` grabs a frame from the preview `<video>` (cropped to the region; small regions are upscaled for OCR) and compares a 160×90 grayscale thumbnail with the previous one. Unchanged frames are skipped, and passes never overlap.
3. Tesseract.js OCRs the frame in a Web Worker. Low-confidence results (< 40%) are ignored. Text identical to the last pass (after normalisation) is skipped.
4. `analyzeScreenText` (shared heuristics) cleans OCR artefacts, rejoins questions wrapped across lines, strips "Q3." and "Interviewer:" prefixes, and classifies the text as question, code (with a language guess), error/stack trace, or other, plus keywords. Only low-confidence text with a question signal goes to `POST /ai/detect-question` (text only, fenced as data, temperature 0). If the AI fails, the local guess is used.
5. Detections are shown newest first, with "Seen earlier" for repeats. Questions can be edited and are answered automatically (setting) via `POST /ai/answer`. Code and errors can be reviewed via `POST /ai/analyze-code`. Answers are saved to History (Screen assistant) when Save history is on.
6. **Pause** stops reading but keeps the stream; **Stop** releases the stream and clears the indicator.

### Voice question → answer (Phase 7)
1. Mic button → one-time consent dialog → `getUserMedia` (with echo cancellation and noise suppression). A "Microphone capture on" indicator is shown while recording.
2. `VoiceRecorder` records WebM/Opus (MP4 on Safari) with `MediaRecorder`. A Web Audio `AnalyserNode` feeds RMS levels (about 20 per second) to `VadTracker`, which drives the level ring and stops automatically after silence: 2.2 s when asking, 5 s when answering a mock-interview question (so thinking pauses are allowed). It also stops if nobody speaks, or at a maximum length. The mic is released on stop, cancel, error or leaving the page.
3. Speech-to-text: by **default** the recording is uploaded once as raw bytes to `POST /ai/transcribe`, which passes it from memory to OpenAI (`OPENAI_STT_MODEL`, with language and tech-vocabulary hints) and keeps nothing. The **opt-in** alternative is the browser's Web Speech API (live text). It is disclosed in the UI as sending audio to the browser vendor (Google for Chrome).
4. `analyzeSpeech` (shared) computes words per minute, filler words ("like" only in hesitation positions) and long pauses. These are the "confidence" signals: how something was said, never who said it. Leading fillers are stripped from the spoken question before answering.
5. `POST /ai/answer`, then read-aloud: browser `speechSynthesis` or a natural AI voice via `POST /ai/speak` (MP3 played in `<audio>`, with play/pause/stop and speed; falls back to the browser voice on error).
6. In mock interviews, spoken answers fill the answer box (editable), are stored with `inputMode: 'voice'` and their speech metrics, and feed the report's "Speech patterns".

### Desktop assistant (Phase 8)
1. `npm run dev:desktop` (or the packaged app) opens one frameless, transparent window that loads `AIA_APP_URL/desktop`. It starts as the **panel** (440×720) so the user can sign in; signed-out users go to `/login?next=/desktop` and come back.
2. The panel has **Screen · Voice · Ask** tabs built from the same hooks as the web app. Tabs stay mounted, so switching never stops screen reading or recording.
3. **Collapse** asks the shell (`setMode('bubble')`) to shrink the window to a 72 px draggable bubble anchored to the same bottom-right corner; clicking the bubble restores the panel. Any route other than `/desktop` (e.g. sign-in after a session expires) forces the panel, so pages never render inside the bubble.
4. **Screen capture**: the page calls `getDisplayMedia`. The main process's display-media handler lists screens and windows (minus its own window) with `desktopCapturer` and sends them to the page, where `SourcePicker` shows them. Nothing is shared until the user picks one; Cancel or a 2-minute timeout denies the request. OCR then runs exactly as in the browser.
5. **Indicators**: the page reports `{ screen, microphone }` through the bridge whenever capture starts or stops. The tray icon turns red and its tooltip and menu say what is being captured. The in-panel indicators stay in the header, and the bubble gets a red ring.

### Mock interview (Phase 9)
1. **Start**: `POST /mock-interviews` with role, level, topics (optional) and 3–10 questions. Questions come from the question bank (shared questions plus the user's own), spread round-robin across the topics and ordered by the level's preferred difficulty (fresher/junior → easy first, mid → medium, senior/lead → hard). With no topics chosen, the role decides (e.g. Backend Developer → Node.js, Express, REST APIs, auth, MongoDB, PostgreSQL). Starting makes **no AI call**. Any older unfinished interview is marked abandoned, so only one runs at a time. State lives on the server, so an interview survives reloads and can be resumed from the setup page.
2. **Answer**: `POST /:id/answers` (text, at least 3 words; for spoken answers also wpm, filler words, long pauses and duration, never audio). The question is claimed atomically first, so a double submit can't pay for two evaluations. The AI evaluates against the interview's level and role (answer fenced as data, temperature 0.2). For spoken answers, confidence is the average of the AI's wording-based score and a **speech score** from pace, fillers per minute and long pauses (`speechConfidenceScore`); typed answers use the wording score only. The answer and evaluation are saved in `user_answers`. If the AI fails, the claim is released and the user can retry. `POST /:id/skip` skips a question.
3. **Complete**: `POST /:id/complete` (idempotent) rolls the evaluations up with `aggregateReport`: average per criterion, weak topics (< 70), strengths from the best answers and improvements from the weakest, speech totals from spoken answers, and a plain-language summary. It is stored in `performance_reports`, and the profile's `stats` (interviews completed, average score, weak topics from the last five reports) are recomputed. An interview ended with no answers becomes `abandoned`, with no report.
4. **Delete**: `DELETE /:id` removes the interview, its answers, report and session, then recomputes the profile stats. Everything also follows the user's retention setting (`expiresAt` + TTL indexes).

### History & dashboard (Phase 10)
1. **Recording**: pages say where a question was asked (`source`: practice, assistant, voice, plus `inputMode`) in `POST /ai/answer`. When Save history is on, the server stores the question and AI answer in `user_answers`, grouped into an `interview_sessions` run per source (a new run after 2 hours idle). Asking the same question again in a run updates that entry instead of duplicating it. Bank questions also store their category. A failure to save never breaks the answer. Mock-interview answers are stored by the mock module with their evaluation.
2. **History** reads `user_answers` newest first with literal search (question and the user's own answer), type and bookmark filters and pagination. Mock entries carry the score, feedback, improved answer and a link to the report.
3. **Dashboard** is computed live: totals, this week's count and the streak use the browser's UTC offset so days and Monday-based weeks match the user's calendar (a streak survives until the end of the day after the last practice). Scores, skills and weak topics come from evaluated answers (last 90 days); the skills score compares the last 30 days with the 30 before. Recommendations are unanswered bank questions from the weakest topics, or from the target role.
4. **Retention**: new documents get `expiresAt` from `retentionDays`; changing the setting re-applies it to everything already stored (or removes it for "keep forever"), and TTL indexes delete expired data.

## 5. REST API catalogue (`/api/v1`)

All responses use `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details?, requestId } }`.

| Area | Method & path | Notes |
|---|---|---|
| Health | `GET /health` | ✅ Phase 1 |
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/logout-all` · `GET /auth/me` | ✅ register/login rate-limited (10 per window/IP). Refresh and logout use the cookie and require `X-Requested-With: fetch` |
| Profile & account | `GET /users/me/profile` · `PATCH /users/me/profile` · `PATCH /users/me/password` · `GET /users/me/sessions` · `DELETE /users/me/sessions/:id` · `DELETE /users/me` (password required; deletes the account and all its data) | ✅ |
| Settings | `GET /settings` · `PATCH /settings/preferences` (theme, answer, ai, assistant) · `PATCH /settings/voice` · `PATCH /settings/privacy` · `PATCH /settings/permissions` | ✅ partial updates; siblings are never overwritten |
| Questions | `GET /categories` (with per-user counts) · `GET /questions?categories&difficulty&type&mine&page&limit` · `GET /questions/practice?categories&difficulty&count&focus` (random set via `$sample`) · `GET /questions/search?q=` (full-text with stemming, plus a partial-word fallback) · `GET /questions/:id` · `POST /questions` (private to its author) · `DELETE /questions/:id` (own questions only) | ✅ Users see the global bank plus their own questions, never anyone else's. `POST /questions/generate` (AI, Phase 5) saves AI-written questions as the user's own. |
| AI | ✅ `GET /ai/status` · `POST /ai/answer` (`length`, `regenerate`) · `POST /ai/explain` · `POST /ai/analyze-code` · `POST /ai/evaluate` · `POST /questions/generate` · `POST /ai/detect-question` (P6) · `POST /ai/transcribe` (raw audio body: webm/ogg/mp4/mpeg/wav, max 10 MB, never stored) · `POST /ai/speak` (returns MP3, `Cache-Control: no-store`) (P7) | Per-user limit (`AI_RATE_LIMIT_PER_5MIN`, default 30). Answers are cached for 1 h by question plus everything that shapes the answer. Errors use stable codes: `AI_NOT_CONFIGURED` 503, `AI_BUSY` 503, `AI_TIMEOUT` 504, `AI_UNAVAILABLE` 503, `AI_REFUSED` 422, `AI_BAD_OUTPUT` 502, `AI_RATE_LIMITED` 429. Provider details are never sent to the client |
| Sessions | `POST /sessions` · `PATCH /sessions/:id` (pause/complete) | assistant/practice/voice sessions |
| Mock | `GET /mock-interviews` (`?status=&limit=`) · `POST /mock-interviews` · `GET /mock-interviews/:id` · `POST /mock-interviews/:id/answers` (AI rate limit) · `POST /mock-interviews/:id/skip` · `POST /mock-interviews/:id/complete` · `GET /mock-interviews/:id/report` · `DELETE /mock-interviews/:id` | ✅ Phase 9 |
| History | `GET /history?q&type&bookmarked&page&limit` (paginated: `meta`) · `PATCH /history/:id` (`{ isBookmarked }`) · `DELETE /history/:id` · `DELETE /history?type=` (`all` also removes mock interviews and reports) | ✅ Phase 10 |
| Dashboard | `GET /dashboard/summary?tzOffset=` | ✅ Phase 10: computed live from the user's data |
| Export | `GET /users/me/export` | ✅ Phase 10: everything stored about the user, as JSON |

## 6. Security & privacy

- **Secrets** stay in server `.env` only. The client never sees the OpenAI key. Env is validated at boot, and production refuses to start with default JWT secrets.
- **Transport and headers**: helmet (CSP, HSTS, nosniff, frame options), a CORS allow-list with credentials, 1 MB JSON limit, a global rate limit plus tighter per-user limits on auth and AI, and request IDs on every response (a caller's id is reused only if it matches `[\w-]{1,64}`, so nothing odd reaches logs). Every API response is `Cache-Control: no-store`, so private data never sits in shared or browser caches.
- **Input handling**: every body and query string is parsed by a strict Zod schema (unknown keys and MongoDB operators such as `{ $ne: … }` are rejected with 422); ids are checked before queries (malformed → 404); history search escapes regex characters and matches literally; every query is scoped to the signed-in user. `tests/security.test.ts` sweeps all data routes for auth and these cases.
- **Passwords**: scrypt (N=2^15, r=8, p=1) with per-user salt and constant-time comparison. `select: false` on the field, and it's stripped from all JSON output. Login spends the same time on unknown emails as on wrong passwords and returns one generic error, so accounts can't be enumerated.
- **Sessions**: access token 15 min (HS256 only, issuer and audience checked). Refresh cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/api/v1/auth`. Every request checks that the session isn't revoked. Changing your password signs out other devices, and you can see and revoke devices yourself.
- **CSRF**: cookie-authenticated endpoints need a custom header (forcing a CORS preflight that the origin allow-list rejects), on top of `SameSite`.
- **Client**: the access token lives only in Redux memory. A failed refresh signs the user out, and every sign-out clears all cached API data so the next user on the browser sees nothing of the previous one. Login redirects accept only same-app paths (no open redirects).
- **Consent first**: screen capture and the mic need both an in-app consent toggle (`user_settings.permissions`) and the OS/browser permission prompt. Both can be revoked at any time.
- **Always-visible indicators**: while the screen or mic is active, the app shows a persistent on-screen indicator and a tray icon state. Nothing captures in the background without one.
- **Electron hardening** (Phase 8): `contextIsolation`, `sandbox`, no `nodeIntegration`, a dedicated session partition, and no `<webview>`. The page gets only the typed `window.desktop` bridge — no `require`, `process` or raw IPC. Every IPC message is accepted only from the app's own origin and validated (malformed capture reports are ignored rather than coerced). Navigation away from the app origin is blocked; pop-ups are denied, and only `https:` links without credentials open in the system browser. Permission requests are limited to microphone (no camera), display capture and clipboard writes, and only for the app origin. Single-instance lock; closing hides to the tray.
- **No stealth features, by design**: the floating window is **not** hidden from screen sharing or recording (no `setContentProtection` or similar). The app makes no attempt to bypass interview-platform proctoring, monitoring, or focus detection. Live support is meant for sessions where AI assistance is permitted.
- **Minimal retention**: only text is stored. Raw audio and screenshots are never persisted unless the user turns that on explicitly. `retentionDays` sets an `expiresAt` that MongoDB TTL indexes enforce. Users can delete one session, all history, or their whole account. Mock interviews store their answer text and evaluations even when "Save history" is off, because resuming and the report need them; they follow the retention period and each one can be deleted (with its answers and report) from the Mock Interview page.
