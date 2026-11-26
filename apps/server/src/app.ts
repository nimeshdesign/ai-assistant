import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { API_PREFIX } from '@aia/shared';
import { env, isTest } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export interface AppOptions {
  /** Global + auth rate limits. Off by default in tests so suites can hammer endpoints. */
  rateLimits?: boolean;
}

export function createApp({ rateLimits = !isTest }: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Reuse a caller's request id only if it looks like one (keeps junk out of logs and headers).
        const given = req.headers['x-request-id'];
        const id = typeof given === 'string' && /^[\w-]{1,64}$/.test(given) ? given : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === `${API_PREFIX}/health` },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / non-browser clients (no Origin header) and configured origins.
        // Disallowed origins get no CORS headers, so the browser blocks the response.
        cb(null, !origin || env.CLIENT_ORIGINS.includes(origin));
      },
      credentials: true, // refresh-token cookie
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (rateLimits) {
    app.use(
      API_PREFIX,
      rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  }

  // API responses carry private data: never store them in shared or browser caches.
  app.use(API_PREFIX, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(API_PREFIX, createApiRouter({ rateLimits }));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
