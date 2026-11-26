import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { env } from '../config/env.js';
import type { UserRole } from '@aia/shared';

const ISSUER = 'ai-interview-assistant';
const AUDIENCE = 'aia-api';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessClaims {
  sub: string;
  role: UserRole;
  /** auth_sessions id — lets requireAuth reject tokens of revoked sessions. */
  sid: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const token = await new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessKey);
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000) };
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'], // never accept "none" or other algorithms
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return { ok: false, reason: 'invalid' };
    return { ok: true, claims: { sub: payload.sub, role: payload.role as UserRole, sid: payload.sid } };
  } catch (e) {
    return { ok: false, reason: e instanceof joseErrors.JWTExpired ? 'expired' : 'invalid' };
  }
}

/** Opaque refresh token (256 bits). Only its SHA-256 hash is stored server-side. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
