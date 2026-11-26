import { Router } from 'express';
import type { HealthStatus } from '@aia/shared';
import { dbState } from '../../config/db.js';
import { sendSuccess } from '../../utils/http.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = dbState();
  const data: HealthStatus = {
    status: db === 'connected' ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    db,
    version: process.env.npm_package_version ?? '0.1.0',
  };
  sendSuccess(res, data, db === 'connected' ? 200 : 503);
});
