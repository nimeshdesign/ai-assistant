import { Schema, model, type InferSchemaType } from 'mongoose';
import { EXPERIENCE_LEVELS } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const stringList = (max: number) => ({
  type: [{ type: String, trim: true, maxlength: 40 }],
  default: [],
  validate: { validator: (v: string[]) => v.length <= max, message: `At most ${max} items allowed` },
});

const userProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    headline: { type: String, trim: true, maxlength: 120 },
    bio: { type: String, trim: true, maxlength: 1000 },
    avatarUrl: { type: String, trim: true, maxlength: 500 },
    targetRole: { type: String, trim: true, maxlength: 80 }, // e.g. "Frontend Developer"
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, default: 'junior' },
    yearsOfExperience: { type: Number, min: 0, max: 50, default: 0 },
    preferredLanguages: stringList(15), // e.g. ["JavaScript", "TypeScript"]
    skills: stringList(50),
    // Denormalised aggregate for the dashboard; recomputed when reports are generated.
    stats: {
      questionsPractised: { type: Number, default: 0, min: 0 },
      mockInterviewsCompleted: { type: Number, default: 0, min: 0 },
      averageScore: { type: Number, default: 0, min: 0, max: 100 },
      weakTopics: { type: [String], default: [] },
      lastActiveAt: { type: Date },
    },
  },
  { timestamps: true, collection: 'user_profiles' },
);

userProfileSchema.index({ userId: 1 }, { unique: true }); // 1:1 with users
userProfileSchema.plugin(toJSONPlugin);

export type UserProfile = InferSchemaType<typeof userProfileSchema>;
export const UserProfileModel = model('UserProfile', userProfileSchema);
