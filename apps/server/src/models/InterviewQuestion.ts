import { createHash } from 'node:crypto';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { DIFFICULTIES, QUESTION_SOURCES, QUESTION_TYPES, normalizeQuestionText } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const interviewQuestionSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'QuestionCategory', required: true },
    question: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
    difficulty: { type: String, enum: DIFFICULTIES, default: 'medium' },
    type: { type: String, enum: QUESTION_TYPES, default: 'conceptual' },
    tags: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
    // Optional curated reference answer (seeded questions). AI answers are stored per user in user_answers.
    referenceAnswer: { type: String, trim: true, maxlength: 8000 },
    source: { type: String, enum: QUESTION_SOURCES, default: 'seed' },
    // null for global/seeded questions; set for questions a user captured or created.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isPublic: { type: Boolean, default: true },
    // sha256 of the normalised text — powers repeated-question detection & de-duplication.
    contentHash: { type: String, required: true },
    timesAsked: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'interview_questions' },
);

interviewQuestionSchema.pre('validate', function () {
  if (this.isModified('question') || !this.contentHash) {
    this.contentHash = createHash('sha256').update(normalizeQuestionText(this.question)).digest('hex');
  }
});

interviewQuestionSchema.index({ categoryId: 1, difficulty: 1 });
interviewQuestionSchema.index({ contentHash: 1, createdBy: 1 }, { unique: true });
interviewQuestionSchema.index({ createdBy: 1, createdAt: -1 });
interviewQuestionSchema.index({ tags: 1 });
interviewQuestionSchema.index(
  { question: 'text', tags: 'text' },
  { weights: { question: 5, tags: 2 }, name: 'question_text_search' },
);
interviewQuestionSchema.plugin(toJSONPlugin);

export type InterviewQuestion = InferSchemaType<typeof interviewQuestionSchema>;
export const InterviewQuestionModel = model('InterviewQuestion', interviewQuestionSchema);
