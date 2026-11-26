import { Router } from 'express';
import { dashboardQuerySchema } from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/http.js';
import { getSummary } from './dashboard.service.js';

/** GET /dashboard/summary?tzOffset=  (minutes east of UTC, so weeks and streaks follow the user's calendar) */
export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/summary', async (req, res) => {
  const { tzOffset } = dashboardQuerySchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store');
  sendSuccess(res, await getSummary(req.user!.id, tzOffset));
});
