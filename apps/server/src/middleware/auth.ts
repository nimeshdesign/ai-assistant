import type { RequestHandler } from 'express';
import { AuthSessionModel, UserModel } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Require a valid `Authorization: Bearer <access token>`.
 * Besides verifying the JWT, it checks that the user is still active and that the
 * session the token belongs to has not been revoked — so logout takes effect immediately.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw ApiError.unauthorized();

  const result = await verifyAccessToken(token);
  if (!result.ok) {
    throw result.reason === 'expired'
      ? new ApiError(401, 'TOKEN_EXPIRED', 'Access token expired')
      : new ApiError(401, 'INVALID_TOKEN', 'Invalid access token');
  }

  const { sub, sid } = result.claims;
  const [user, session] = await Promise.all([
    UserModel.findById(sub).select('role isActive').lean(),
    AuthSessionModel.findById(sid).select('userId revokedAt expiresAt').lean(),
  ]);
  if (!user || !user.isActive || !session || session.revokedAt || String(session.userId) !== sub) {
    throw new ApiError(401, 'SESSION_REVOKED', 'Your session has ended. Please sign in again.');
  }

  req.user = { id: sub, role: user.role as 'user' | 'admin', sessionId: sid };
  next();
};

export const requireRole =
  (role: 'admin'): RequestHandler =>
  (req, _res, next) => {
    if (req.user?.role !== role) throw ApiError.forbidden();
    next();
  };
