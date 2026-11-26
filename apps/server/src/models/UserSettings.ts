import { Schema, model, type InferSchemaType } from 'mongoose';
import { AI_VOICES, ANSWER_LENGTHS, ANSWER_STYLES, STT_ENGINES, THEMES, TTS_ENGINES } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const userSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    theme: { type: String, enum: THEMES, default: 'system' },
    answer: {
      style: { type: String, enum: ANSWER_STYLES, default: 'conversational' },
      length: { type: String, enum: ANSWER_LENGTHS, default: 'normal' },
      includeCodeExamples: { type: Boolean, default: true },
      codeLanguage: { type: String, default: 'javascript', maxlength: 30 },
    },
    voice: {
      voiceName: { type: String, maxlength: 100, default: '' }, // browser/OS voice name; '' = system default
      rate: { type: Number, min: 0.5, max: 2, default: 1 },
      pitch: { type: Number, min: 0, max: 2, default: 1 },
      autoSpeakAnswers: { type: Boolean, default: false },
      sttLanguage: { type: String, default: 'en-US', maxlength: 10 },
      // 'server' = our API → OpenAI (audio not stored); 'browser' = the browser's own service (Chrome → Google).
      sttEngine: { type: String, enum: STT_ENGINES, default: 'server' },
      ttsEngine: { type: String, enum: TTS_ENGINES, default: 'browser' },
      aiVoice: { type: String, enum: AI_VOICES, default: 'alloy' },
    },
    ai: {
      model: { type: String, enum: ['', 'fast', 'quality'], default: '' }, // '' = server default
      temperature: { type: Number, min: 0, max: 1, default: 0.4 },
    },
    assistant: {
      captureIntervalMs: { type: Number, min: 1000, max: 30000, default: 3000 },
      autoGenerateAnswers: { type: Boolean, default: true },
    },
    privacy: {
      saveHistory: { type: Boolean, default: true },
      retentionDays: { type: Number, min: 0, max: 3650, default: 90 }, // 0 = keep forever
      storeRawAudio: { type: Boolean, default: false },
      storeScreenshots: { type: Boolean, default: false },
    },
    // Records of explicit, revocable consent. The OS/browser permission prompt still applies on top of this.
    permissions: {
      screenCapture: { type: Boolean, default: false },
      microphone: { type: Boolean, default: false },
      updatedAt: { type: Date },
    },
  },
  { timestamps: true, collection: 'user_settings' },
);

userSettingsSchema.index({ userId: 1 }, { unique: true }); // 1:1 with users
userSettingsSchema.plugin(toJSONPlugin);

export type UserSettings = InferSchemaType<typeof userSettingsSchema>;
export const UserSettingsModel = model('UserSettings', userSettingsSchema);
