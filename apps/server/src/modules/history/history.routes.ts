import { Router } from 'express';
import { bookmarkSchema, historyClearQuerySchema, historyQuerySchema } from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/http.js';
import * as history from './history.service.js';

/**
 * Saved questions and answers (Phase 10).
 *
 *   GET    /history                 ?q=&type=&bookmarked=&page=&limit=  newest first
 *   PATCH  /history/:id             { isBookmarked }
 *   DELETE /history/:id             one entry
 *   DELETE /history                 ?type=  everything ("all" also removes mock interviews and reports)
 */
export const historyRouter = Router();
historyRouter.use(requireAuth);

historyRouter.get('/', async (req, res) => {
  const { items, meta } = await history.listHistory(req.user!.id, historyQuerySchema.parse(req.query));
  sendSuccess(res, items, 200, meta);
});

historyRouter.patch('/:id', async (req, res) => {
  const { isBookmarked } = bookmarkSchema.parse(req.body);
  sendSuccess(res, await history.setBookmark(req.user!.id, String(req.params.id), isBookmarked));
});

historyRouter.delete('/:id', async (req, res) => {
  await history.deleteEntry(req.user!.id, String(req.params.id));
  res.status(204).end();
});

historyRouter.delete('/', async (req, res) => {
  const { type } = historyClearQuerySchema.parse(req.query);
  sendSuccess(res, await history.clearHistory(req.user!.id, type));
});
