import { Router } from 'express';
import { z } from 'zod';
import { changePasswordSchema, deleteAccountSchema, profileUpdateSchema, type AuthSessionView, type ProfileView } from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { AuthSessionModel, UserModel, UserProfileModel } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/http.js';
import { changePassword, deleteAccount } from '../auth/auth.service.js';
import { clearRefreshCookie } from '../auth/auth.routes.js';
import { exportAccount } from './export.service.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

async function loadProfile(userId: string): Promise<ProfileView> {
  const [user, profile] = await Promise.all([
    UserModel.findById(userId).lean(),
    // Upsert so accounts created before profiles existed still work.
    UserProfileModel.findOneAndUpdate({ userId }, {}, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).lean(),
  ]);
  if (!user || !profile) throw ApiError.unauthorized();
  return {
    name: user.name,
    headline: profile.headline ?? '',
    targetRole: profile.targetRole ?? '',
    experienceLevel: profile.experienceLevel as ProfileView['experienceLevel'],
    yearsOfExperience: profile.yearsOfExperience ?? 0,
    preferredLanguages: profile.preferredLanguages ?? [],
  };
}

usersRouter.get('/me/profile', async (req, res) => {
  sendSuccess(res, await loadProfile(req.user!.id));
});

usersRouter.patch('/me/profile', async (req, res) => {
  const { name, ...profile } = profileUpdateSchema.partial().parse(req.body);
  const userId = req.user!.id;
  await Promise.all([
    name !== undefined ? UserModel.updateOne({ _id: userId }, { name }, { runValidators: true }) : null,
    Object.keys(profile).length
      ? UserProfileModel.updateOne({ userId }, { $set: profile }, { upsert: true, runValidators: true })
      : null,
  ]);
  sendSuccess(res, await loadProfile(userId));
});

usersRouter.patch('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const signedOut = await changePassword(req.user!.id, req.user!.sessionId, currentPassword, newPassword);
  sendSuccess(res, { otherSessionsSignedOut: signedOut });
});

usersRouter.delete('/me', async (req, res) => {
  const { password } = deleteAccountSchema.parse(req.body);
  await deleteAccount(req.user!.id, password);
  clearRefreshCookie(res);
  res.status(204).end();
});

// ---- Signed-in devices ----

usersRouter.get('/me/sessions', async (req, res) => {
  const sessions = await AuthSessionModel.find({ userId: req.user!.id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
  const data: AuthSessionView[] = sessions.map((s) => ({
    id: String(s._id),
    userAgent: s.userAgent ?? '',
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: (s.lastUsedAt ?? s.createdAt).toISOString(),
    current: String(s._id) === req.user!.sessionId,
  }));
  sendSuccess(res, data);
});

usersRouter.delete('/me/sessions/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid session id') }).parse(req.params);
  if (id === req.user!.sessionId) throw ApiError.badRequest('Use sign out to end the current session');
  const result = await AuthSessionModel.updateOne(
    { _id: id, userId: req.user!.id, revokedAt: { $exists: false } },
    { revokedAt: new Date(), revokedReason: 'revoked_by_user' },
  );
  if (result.matchedCount === 0) throw ApiError.notFound('Session not found');
  res.status(204).end();
});

// ---- Data export (Phase 10) ----

/** Everything stored about the user as one JSON download. No password hashes, tokens or other users' data. */
usersRouter.get('/me/export', async (req, res) => {
  sendSuccess(res, await exportAccount(req.user!.id));
});
