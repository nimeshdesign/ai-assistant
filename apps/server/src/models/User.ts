import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { USER_ROLES } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email is invalid'],
    },
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    // Never returned by default queries; only selected explicitly during login.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    // Incrementing this invalidates every refresh token issued before (logout everywhere).
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.plugin(toJSONPlugin, { hidden: ['passwordHash', 'tokenVersion'] });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
