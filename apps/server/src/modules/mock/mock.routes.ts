import { Router, type RequestHandler } from 'express';
import { mockAnswerSchema, mockListQuerySchema, mockSetupSchema, mockSkipSchema } from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/http.js';
import * as mock from './mock.service.js';

/**
 * Mock interviews (Phase 9).
 *
 *   GET    /mock-interviews                 list (newest first; ?status=in_progress to resume)
 *   POST   /mock-interviews                 start: picks questions for the role, level and topics
 *   GET    /mock-interviews/:id             current state, including answers and evaluations
 *   POST   /mock-interviews/:id/answers     submit an answer → AI evaluation (rate-limited)
 *   POST   /mock-interviews/:id/skip        skip a question
 *   POST   /mock-interviews/:id/complete    finish → performance report (idempotent)
 *   GET    /mock-interviews/:id/report      the performance report
 *   DELETE /mock-interviews/:id             delete the interview, its answers and report
 */
export function createMockRouter(aiLimiter: RequestHandler) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    sendSuccess(res, await mock.listInterviews(req.user!.id, mockListQuerySchema.parse(req.query)));
  });

  router.post('/', async (req, res) => {
    sendSuccess(res, await mock.startInterview(req.user!.id, mockSetupSchema.parse(req.body)), 201);
  });

  router.get('/:id', async (req, res) => {
    sendSuccess(res, await mock.getInterview(req.user!.id, String(req.params.id)));
  });

  router.post('/:id/answers', aiLimiter, async (req, res) => {
    sendSuccess(res, await mock.submitAnswer(req.user!.id, String(req.params.id), mockAnswerSchema.parse(req.body)));
  });

  router.post('/:id/skip', async (req, res) => {
    const { questionId } = mockSkipSchema.parse(req.body);
    sendSuccess(res, await mock.skipQuestion(req.user!.id, String(req.params.id), questionId));
  });

  router.post('/:id/complete', async (req, res) => {
    sendSuccess(res, await mock.completeInterview(req.user!.id, String(req.params.id)));
  });

  router.get('/:id/report', async (req, res) => {
    sendSuccess(res, await mock.getReport(req.user!.id, String(req.params.id)));
  });

  router.delete('/:id', async (req, res) => {
    await mock.deleteInterview(req.user!.id, String(req.params.id));
    res.status(204).end();
  });

  return router;
}
