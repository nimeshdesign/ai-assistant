import { Schema, model, type InferSchemaType } from 'mongoose';
import { toJSONPlugin } from './plugins.js';

/**
 * One signed-in device/browser. Holds the SHA-256 hash of the current refresh token
 * (never the token itself). Tokens rotate on every refresh: the previous hash is kept
 * so that re-use of an already-rotated token can be detected (likely theft) and all of
 * the user's sessions revoked. Expired sessions are removed by a TTL index.
 */
const authSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String },
    userAgent: { type: String, maxlength: 300, default: '' },
    ip: { type: String, maxlength: 64 },
    lastUsedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, enum: ['logout', 'logout_all', 'password_change', 'reuse_detected', 'revoked_by_user'] },
  },
  { timestamps: true, collection: 'auth_sessions' },
);

authSessionSchema.index({ tokenHash: 1 }, { unique: true });
authSessionSchema.index({ previousTokenHash: 1 }, { sparse: true });
authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.plugin(toJSONPlugin, { hidden: ['tokenHash', 'previousTokenHash'] });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export const AuthSessionModel = model('AuthSession', authSessionSchema);
