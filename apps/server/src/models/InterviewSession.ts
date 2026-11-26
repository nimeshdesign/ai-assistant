import { Schema, model, type InferSchemaType } from 'mongoose';
import { SESSION_STATUSES, SESSION_TYPES } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

/**
 * A session groups question/answer interactions: a practice set, a floating
 * assistant run, a voice session, or the session behind a mock interview.
 */
const interviewSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: SESSION_TYPES, required: true },
    status: { type: String, enum: SESSION_STATUSES, default: 'active' },
    title: { type: String, trim: true, maxlength: 120 },
    categoryIds: { type: [{ type: Schema.Types.ObjectId, ref: 'QuestionCategory' }], default: [] },
    // Snapshot of the options chosen when the session started (difficulty, count, answer length…).
    config: { type: Schema.Types.Mixed, default: {} },
    questionCount: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: () => new Date() },
    endedAt: { type: Date },
    // Set from the user's retention setting; a TTL index deletes the session when reached.
    expiresAt: { type: Date },
  },
  { timestamps: true, collection: 'interview_sessions' },
);

interviewSessionSchema.index({ userId: 1, createdAt: -1 });
interviewSessionSchema.index({ userId: 1, type: 1, status: 1 });
interviewSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
interviewSessionSchema.plugin(toJSONPlugin);

export type InterviewSession = InferSchemaType<typeof interviewSessionSchema>;
export const InterviewSessionModel = model('InterviewSession', interviewSessionSchema);
