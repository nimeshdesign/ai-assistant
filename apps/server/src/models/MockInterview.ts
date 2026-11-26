import { Schema, model, type InferSchemaType } from 'mongoose';
import { DIFFICULTIES, EXPERIENCE_LEVELS, MOCK_STATUSES } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const mockQuestionSchema = new Schema(
  {
    order: { type: Number, required: true, min: 0 },
    text: { type: String, required: true, maxlength: 2000 },
    topic: { type: String, maxlength: 60 }, // display name, e.g. "React.js"
    categorySlug: { type: String, maxlength: 60 },
    difficulty: { type: String, enum: DIFFICULTIES },
    questionId: { type: Schema.Types.ObjectId, ref: 'InterviewQuestion' },
    answerId: { type: Schema.Types.ObjectId, ref: 'UserAnswer' },
    askedAt: { type: Date },
    answeredAt: { type: Date },
    skipped: { type: Boolean, default: false },
    // Set while an answer is being evaluated, so the same question can't be evaluated twice at once.
    lockedAt: { type: Date },
  },
  { _id: true },
);

const mockInterviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true },
    jobRole: { type: String, required: true, trim: true, maxlength: 80 },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, required: true },
    focusAreas: { type: [String], default: [] },
    status: { type: String, enum: MOCK_STATUSES, default: 'in_progress' },
    questions: {
      type: [mockQuestionSchema],
      default: [],
      validate: { validator: (v: unknown[]) => v.length <= 30, message: 'At most 30 questions' },
    },
    currentIndex: { type: Number, default: 0, min: 0 },
    totalQuestions: { type: Number, required: true, min: 1, max: 30 },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date },
    reportId: { type: Schema.Types.ObjectId, ref: 'PerformanceReport' },
    // From the user's retention setting; a TTL index deletes the interview when reached.
    expiresAt: { type: Date },
  },
  { timestamps: true, collection: 'mock_interviews' },
);

mockInterviewSchema.index({ userId: 1, createdAt: -1 });
mockInterviewSchema.index({ userId: 1, status: 1 });
mockInterviewSchema.index({ sessionId: 1 }, { unique: true });
mockInterviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
mockInterviewSchema.plugin(toJSONPlugin);

export type MockInterview = InferSchemaType<typeof mockInterviewSchema>;
export const MockInterviewModel = model('MockInterview', mockInterviewSchema);
