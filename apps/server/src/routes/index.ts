import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { categoriesRouter, questionsRouter } from '../modules/questions/questions.routes.js';
import { createAiLimiter, createAiRouter, generateQuestionsHandler } from '../modules/ai/ai.routes.js';
import { requireAuth } from '../middleware/auth.js';
import { createMockRouter } from '../modules/mock/mock.routes.js';
import { historyRouter } from '../modules/history/history.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';

/**
 * API v1 router. Each feature module owns its routes/service under src/modules/<feature>/
 * and is mounted here as its phase is implemented:
 *
 *   /history, /dashboard     Phase 10
 */
export function createApiRouter({ rateLimits }: { rateLimits: boolean }) {
  const api = Router();
  api.use('/health', healthRouter);
  api.use('/auth', createAuthRouter({ rateLimits }));
  api.use('/users', usersRouter);
  api.use('/settings', settingsRouter);
  const aiLimiter = createAiLimiter(rateLimits);
  api.use('/categories', categoriesRouter);
  api.post('/questions/generate', requireAuth, aiLimiter, generateQuestionsHandler);
  api.use('/questions', questionsRouter);
  api.use('/ai', createAiRouter(aiLimiter));
  api.use('/mock-interviews', createMockRouter(aiLimiter));
  api.use('/history', historyRouter);
  api.use('/dashboard', dashboardRouter);
  return api;
}
