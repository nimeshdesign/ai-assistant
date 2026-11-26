import { Types } from 'mongoose';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@aia/shared';
import { env } from '../../config/env.js';
import {
  AuthSessionModel,
  InterviewQuestionModel,
  InterviewSessionModel,
  MockInterviewModel,
  PerformanceReportModel,
  UserAnswerModel,
  UserModel,
  UserProfileModel,
  UserSettingsModel,
  type UserDocument,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from '../../utils/password.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens.js';
import { logger } from '../../utils/logger.js';

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: user.id as string,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser['role'],
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueSession(user: UserDocument, client: ClientInfo): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + refreshTtlMs());
  const session = await AuthSessionModel.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: (client.userAgent ?? '').slice(0, 300),
    ip: client.ip,
    expiresAt: refreshExpiresAt,
  });
  const access = await signAccessToken({ sub: user.id as string, role: user.role as AuthUser['role'], sid: session.id as string });
  return {
    response: { user: toAuthUser(user), accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString() },
    refreshToken,
    refreshExpiresAt,
  };
}

export async function register(input: RegisterInput, client: ClientInfo): Promise<IssuedSession> {
  const exists = await UserModel.exists({ email: input.email });
  if (exists) throw ApiError.conflict('An account with this email already exists');

  const user = await UserModel.create({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
  });
  try {
    // Profile and settings are 1:1 with the user and created up front with defaults.
    await Promise.all([UserProfileModel.create({ userId: user._id }), UserSettingsModel.create({ userId: user._id })]);
  } catch (err) {
    // No multi-document transactions on standalone MongoDB — compensate manually.
    await Promise.all([
      UserModel.deleteOne({ _id: user._id }),
      UserProfileModel.deleteOne({ userId: user._id }),
      UserSettingsModel.deleteOne({ userId: user._id }),
    ]);
    throw err;
  }
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, client);
}

export async function login(input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  // Always run a hash comparison so timing doesn't reveal whether the email exists.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  if (needsRehash(user.passwordHash)) user.passwordHash = await hashPassword(input.password);
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, client);
}

/**
 * Rotate a refresh token. If the presented token was already rotated (matches a
 * session's previous hash), treat it as stolen and revoke every session of that user.
 */
export async function refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
  if (!refreshToken) throw new ApiError(401, 'NO_SESSION', 'Not signed in');
  const tokenHash = hashToken(refreshToken);
  const session = await AuthSessionModel.findOne({ tokenHash });

  if (!session) {
    const reused = await AuthSessionModel.findOne({ previousTokenHash: tokenHash });
    if (reused) {
      logger.warn({ userId: String(reused.userId) }, 'Refresh token reuse detected — revoking all sessions');
      await revokeAllSessions(reused.userId, 'reuse_detected');
    }
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const user = await UserModel.findById(session.userId);
  if (!user || !user.isActive) {
    await AuthSessionModel.updateOne({ _id: session._id }, { revokedAt: new Date(), revokedReason: 'logout' });
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  // Rotate atomically: only succeeds if nobody else rotated this token in the meantime.
  const newToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + refreshTtlMs());
  const rotated = await AuthSessionModel.findOneAndUpdate(
    { _id: session._id, tokenHash, revokedAt: { $exists: false } },
    {
      tokenHash: hashToken(newToken),
      previousTokenHash: tokenHash,
      lastUsedAt: new Date(),
      expiresAt: refreshExpiresAt,
      userAgent: (client.userAgent ?? session.userAgent ?? '').slice(0, 300),
      ip: client.ip,
    },
    { returnDocument: 'after' },
  );
  if (!rotated) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');

  const access = await signAccessToken({ sub: user.id as string, role: user.role as AuthUser['role'], sid: rotated.id as string });
  return {
    response: { user: toAuthUser(user), accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString() },
    refreshToken: newToken,
    refreshExpiresAt,
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await AuthSessionModel.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: { $exists: false } },
    { revokedAt: new Date(), revokedReason: 'logout' },
  );
}

export async function revokeAllSessions(
  userId: Types.ObjectId | string,
  reason: 'logout_all' | 'password_change' | 'reuse_detected',
  exceptSessionId?: string,
): Promise<number> {
  const filter: Record<string, unknown> = { userId, revokedAt: { $exists: false } };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const res = await AuthSessionModel.updateMany(filter, { revokedAt: new Date(), revokedReason: reason });
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  return res.modifiedCount;
}

export async function changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.validation([{ path: 'currentPassword', message: 'Current password is incorrect' }], 'Current password is incorrect');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Keep this device signed in; sign out everywhere else.
  return revokeAllSessions(user._id, 'password_change', sessionId);
}

/** Permanently delete the account and every document that belongs to it. */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.validation([{ path: 'password', message: 'Password is incorrect' }], 'Password is incorrect');
  }
  const owner = { userId: user._id };
  await Promise.all([
    UserAnswerModel.deleteMany(owner),
    InterviewSessionModel.deleteMany(owner),
    MockInterviewModel.deleteMany(owner),
    PerformanceReportModel.deleteMany(owner),
    UserProfileModel.deleteMany(owner),
    UserSettingsModel.deleteMany(owner),
    AuthSessionModel.deleteMany(owner),
    InterviewQuestionModel.deleteMany({ createdBy: user._id }),
  ]);
  await UserModel.deleteOne({ _id: user._id });
}
