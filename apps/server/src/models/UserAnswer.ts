import { Schema, model, type InferSchemaType } from 'mongoose';
import { ANSWER_LENGTHS, INPUT_MODES, SESSION_TYPES } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const score = { type: Number, min: 0, max: 100 };

/** The five-part structured answer produced by the AI engine. */
const aiAnswerSchema = new Schema(
  {
    directAnswer: { type: String, maxlength: 2000 },
    simpleExplanation: { type: String, maxlength: 4000 },
    realWorldExample: { type: String, maxlength: 4000 },
    codeExample: {
      language: { type: String, maxlength: 30 },
      code: { type: String, maxlength: 10000 },
    },
    interviewReadyAnswer: { type: String, maxlength: 4000 },
    length: { type: String, enum: ANSWER_LENGTHS, default: 'normal' },
    model: { type: String, maxlength: 60 },
    generatedAt: { type: Date },
  },
  { _id: false },
);

const evaluationSchema = new Schema(
  {
    scores: {
      technicalAccuracy: score,
      communication: score,
      structure: score,
      practicalKnowledge: score,
      confidence: score,
    },
    overall: score,
    feedback: { type: String, maxlength: 4000 },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    improvedAnswer: { type: String, maxlength: 6000 },
    evaluatedAt: { type: Date },
  },
  { _id: false },
);

/**
 * One question interaction: the question as seen, the user's own response (if any),
 * the AI-generated answer, and (for practice/mock) the AI evaluation.
 * Raw audio and screenshots are never stored here — only text.
 */
const userAnswerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true },
    // Snapshot of the session's type, so history can filter without a join.
    sessionType: { type: String, enum: SESSION_TYPES, required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'InterviewQuestion' },
    mockInterviewId: { type: Schema.Types.ObjectId, ref: 'MockInterview' },
    // Snapshot so history stays readable even if the source question changes.
    questionText: { type: String, required: true, trim: true, maxlength: 2000 },
    topic: { type: String, trim: true, maxlength: 60 },
    categorySlug: { type: String, trim: true, maxlength: 60 },
    inputMode: { type: String, enum: INPUT_MODES, default: 'text' },
    response: {
      text: { type: String, maxlength: 10000 },
      durationSec: { type: Number, min: 0 },
      speechMetrics: {
        wordsPerMinute: { type: Number, min: 0 },
        fillerWordCount: { type: Number, min: 0 },
        longPauseCount: { type: Number, min: 0 },
      },
    },
    aiAnswer: { type: aiAnswerSchema },
    evaluation: { type: evaluationSchema },
    isBookmarked: { type: Boolean, default: false },
    expiresAt: { type: Date },
  },
  { timestamps: true, collection: 'user_answers' },
);

userAnswerSchema.index({ userId: 1, createdAt: -1 });
userAnswerSchema.index({ sessionId: 1, createdAt: 1 });
userAnswerSchema.index({ mockInterviewId: 1 }, { sparse: true });
userAnswerSchema.index({ userId: 1, topic: 1 });
userAnswerSchema.index({ userId: 1, sessionType: 1, createdAt: -1 });
userAnswerSchema.index({ userId: 1, isBookmarked: 1, createdAt: -1 });
userAnswerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userAnswerSchema.index(
  { questionText: 'text', 'response.text': 'text', 'aiAnswer.interviewReadyAnswer': 'text' },
  { name: 'history_text_search', weights: { questionText: 5 } },
);
userAnswerSchema.plugin(toJSONPlugin);

export type UserAnswer = InferSchemaType<typeof userAnswerSchema>;
export const UserAnswerModel = model('UserAnswer', userAnswerSchema);
