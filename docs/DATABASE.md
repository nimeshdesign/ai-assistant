# Database design (MongoDB)

Source of truth: [`apps/server/src/models/`](../apps/server/src/models/). Every collection has `createdAt`/`updatedAt` timestamps, schema validation (required fields, enums from `@aia/shared`, min/max lengths, 0–100 score bounds), and serialises `_id` → `id` with secrets removed.

## Relationships

```
users 1──1 user_profiles
users 1──1 user_settings
users 1──* auth_sessions (one per signed-in device)
users 1──* interview_sessions 1──* user_answers *──0..1 interview_questions *──1 question_categories
                    │                    │
                    └──1 mock_interviews ┘ (questions[].answerId → user_answers)
                              │
                              └──1 performance_reports (perQuestion[].answerId → user_answers)
```

## Collections

| Collection | Purpose | Key fields | Indexes |
|---|---|---|---|
| `auth_sessions` | One signed-in device | `userId`, `tokenHash` (SHA-256 of the current refresh token), `previousTokenHash` (for reuse detection), `userAgent`, `ip`, `lastUsedAt`, `expiresAt`, `revokedAt`, `revokedReason` | `tokenHash` unique; `previousTokenHash`; `{userId, revokedAt}`; **TTL on `expiresAt`** |
| `users` | Accounts | `email` (lowercase, validated), `name`, `passwordHash` (`select:false`), `role`, `isActive`, `lastLoginAt`, `tokenVersion` (`select:false`) | `email` unique |
| `user_profiles` | Professional profile + dashboard aggregates | `userId`, `headline`, `bio`, `targetRole`, `experienceLevel`, `yearsOfExperience`, `preferredLanguages[]` (≤15), `skills[]` (≤50), `stats{questionsPractised, mockInterviewsCompleted, averageScore, weakTopics[], lastActiveAt}` | `userId` unique |
| `user_settings` | Preferences, privacy, consent | `theme`; `answer{style, length, includeCodeExamples, codeLanguage}`; `voice{voiceName, rate 0.5–2, pitch, autoSpeakAnswers, sttLanguage}`; `ai{model, temperature}`; `assistant{captureIntervalMs 1–30 s, autoGenerateAnswers}`; `privacy{saveHistory, retentionDays (0 = forever), storeRawAudio=false, storeScreenshots=false}`; `permissions{screenCapture=false, microphone=false, updatedAt}` | `userId` unique |
| `question_categories` | Topic taxonomy (HTML … HR) | `slug` (kebab-case), `name`, `group` (frontend/backend/programming/other), `description`, `icon`, `order`, `isActive`, `questionCount` | `slug` unique; `{group, order}` |
| `interview_questions` | Question bank: seeded, AI-generated, or user-captured | `categoryId`, `question`, `difficulty`, `type`, `tags[]`, `referenceAnswer`, `source`, `createdBy` (null = global), `isPublic`, `contentHash`, `timesAsked` | `{categoryId, difficulty}`; **`{contentHash, createdBy}` unique** (repeated-question detection); `{createdBy, createdAt}`; `tags`; text index on `question`+`tags` |
| `interview_sessions` | Groups interactions (practice / assistant / voice / mock) | `userId`, `type`, `status`, `title`, `categoryIds[]`, `config` (options snapshot), `questionCount`, `startedAt`, `endedAt`, `expiresAt` | `{userId, createdAt}`; `{userId, type, status}`; **TTL on `expiresAt`** |
| `user_answers` | One question interaction: question snapshot, the user's response, the AI answer, the evaluation | `userId`, `sessionId`, `sessionType` (snapshot for filtering), `questionId?`, `mockInterviewId?`, `questionText`, `topic`, `categorySlug?`, `inputMode`, `response{text, durationSec, speechMetrics}`, `aiAnswer{directAnswer, simpleExplanation, realWorldExample, codeExample{language, code}, interviewReadyAnswer, length, model}`, `evaluation{scores{5 criteria}, overall, feedback, strengths[], improvements[], improvedAnswer}`, `isBookmarked`, `expiresAt` | `{userId, createdAt}`; `{sessionId, createdAt}`; `mockInterviewId`; `{userId, topic}`; `{userId, sessionType, createdAt}`; `{userId, isBookmarked, createdAt}`; **TTL on `expiresAt`**; text index |
| `mock_interviews` | Mock interview state machine | `userId`, `sessionId`, `jobRole`, `experienceLevel`, `focusAreas[]`, `status`, `questions[]{order, text, topic, categorySlug, difficulty, questionId?, answerId?, askedAt, answeredAt, skipped, lockedAt?}` (≤30; `lockedAt` is set while an answer is being evaluated, so it can't be evaluated twice), `currentIndex`, `totalQuestions`, `completedAt`, `reportId`, `expiresAt` | `{userId, createdAt}`; `{userId, status}`; `sessionId` unique; **TTL on `expiresAt`** |
| `performance_reports` | Final report per mock interview | `userId`, `mockInterviewId`, `jobRole`, `experienceLevel`, `totalQuestions`, `answeredCount` (snapshots), `overallScore`, `scores{technicalAccuracy, communication, structure, practicalKnowledge, confidence}`, `summary`, `strengths[]`, `improvements[]`, `weakTopics[]{topic, score}`, `perQuestion[]{answerId, questionText, topic, score}`, `speechMetrics`, `expiresAt` | **`mockInterviewId` unique**; `{userId, createdAt}`; `{userId, weakTopics.topic}`; **TTL on `expiresAt`** |

## Design notes

- **Snapshots over joins for history.** `user_answers.questionText` and `mock_interviews.questions[].text` copy the question text, so history stays readable after a question is edited or deleted.
- **Per-user retention with TTL.** Each user can choose their own retention period, so `expiresAt` is set per document when it's written (`retentionExpiry(settings.privacy.retentionDays)`), and a TTL index with `expireAfterSeconds: 0` deletes it. Documents with no `expiresAt` are kept forever.
- **De-duplication.** `contentHash = sha256(normalizeQuestionText(question))` is computed in a `pre('validate')` hook. The same function runs on the client to skip repeated OCR captures.
- **"Confidence" is behavioural only.** It comes from speech and answer patterns (words per minute, filler words, long pauses, hedging phrases), never from personality inference.
- **Text only.** No collection stores audio or image blobs.
