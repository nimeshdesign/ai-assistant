import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { API_PREFIX, loginSchema, registerSchema } from '@aia/shared';
import { cookieSecure, env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { UserModel } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/http.js';
import * as auth from './auth.service.js';

export const REFRESH_COOKIE = 'aia_rt';
const COOKIE_PATH = `${API_PREFIX}/auth`; // the cookie is only ever sent to auth endpoints

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true, // not readable from JavaScript
  secure: cookieSecure,
  sameSite: env.COOKIE_SAMESITE,
  path: COOKIE_PATH,
  ...(expires ? { expires } : {}),
});

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

const clientInfo = (req: Request): auth.ClientInfo => ({ userAgent: req.get('user-agent'), ip: req.ip });

function sendSession(res: Response, issued: auth.IssuedSession, status = 200) {
  res.cookie(REFRESH_COOKIE, issued.refreshToken, cookieOptions(issued.refreshExpiresAt));
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, issued.response, status);
}

/**
 * Cookie-authenticated endpoints must carry a custom header. Browsers can't add it
 * cross-site without a CORS preflight, which our origin allow-list rejects (CSRF defence
 * on top of SameSite cookies).
 */
const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get('x-requested-with') !== 'fetch') throw ApiError.forbidden('Missing X-Requested-With header');
  next();
};

export function createAuthRouter({ rateLimits = true }: { rateLimits?: boolean } = {}) {
  const router = Router();
  const limiter = (limit: number, windowMin: number): RequestHandler =>
    rateLimits
      ? rateLimit({
          windowMs: windowMin * 60_000,
          limit,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          handler: (_req, _res, next) =>
            next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please wait a few minutes and try again.')),
        })
      : (_req, _res, next) => next();

  router.post('/register', limiter(10, 60), async (req, res) => {
    const input = registerSchema.parse(req.body);
    sendSession(res, await auth.register(input, clientInfo(req)), 201);
  });

  router.post('/login', limiter(10, 15), async (req, res) => {
    const input = loginSchema.parse(req.body);
    sendSession(res, await auth.login(input, clientInfo(req)));
  });

  router.post('/refresh', requireCsrfHeader, limiter(60, 15), async (req, res) => {
    try {
      sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE], clientInfo(req)));
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  });

  router.post('/logout', requireCsrfHeader, async (req, res) => {
    await auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    await auth.revokeAllSessions(req.user!.id, 'logout_all');
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await UserModel.findById(req.user!.id);
    if (!user) throw ApiError.unauthorized();
    sendSuccess(res, auth.toAuthUser(user));
  });

  return router;
}
