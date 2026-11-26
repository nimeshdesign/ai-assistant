import { Schema, model, type InferSchemaType } from 'mongoose';
import { EXPERIENCE_LEVELS } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const score = { type: Number, min: 0, max: 100, required: true };

const performanceReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mockInterviewId: { type: Schema.Types.ObjectId, ref: 'MockInterview', required: true },
    // Snapshot so the report stays readable on its own.
    jobRole: { type: String, maxlength: 80 },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS },
    totalQuestions: { type: Number, min: 0 },
    answeredCount: { type: Number, min: 0 },
    overallScore: score,
    scores: {
      technicalAccuracy: score,
      communication: score,
      structure: score,
      practicalKnowledge: score,
      // Derived only from speech/answer patterns (pace, fillers, pauses, hedging) — no personality judgements.
      confidence: score,
    },
    summary: { type: String, maxlength: 4000 },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    weakTopics: {
      type: [{ topic: { type: String, required: true }, score: { type: Number, min: 0, max: 100 } }],
      default: [],
    },
    perQuestion: {
      type: [
        {
          answerId: { type: Schema.Types.ObjectId, ref: 'UserAnswer' },
          questionText: String,
          topic: String,
          score: { type: Number, min: 0, max: 100 },
        },
      ],
      default: [],
    },
    speechMetrics: {
      averageWordsPerMinute: Number,
      totalFillerWords: Number,
      totalLongPauses: Number,
    },
    expiresAt: { type: Date },
  },
  { timestamps: true, collection: 'performance_reports' },
);

performanceReportSchema.index({ mockInterviewId: 1 }, { unique: true }); // one report per interview
performanceReportSchema.index({ userId: 1, createdAt: -1 });
performanceReportSchema.index({ userId: 1, 'weakTopics.topic': 1 });
performanceReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
performanceReportSchema.plugin(toJSONPlugin);

export type PerformanceReport = InferSchemaType<typeof performanceReportSchema>;
export const PerformanceReportModel = model('PerformanceReport', performanceReportSchema);
