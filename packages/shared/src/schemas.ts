import { z } from 'zod';
import { AI_VOICES, STT_ENGINES, TTS_ENGINES } from './ai.js';
import {
  ANSWER_LENGTHS,
  ANSWER_STYLES,
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  PASSWORD_MIN_LENGTH,
  QUESTION_TYPES,
  THEMES,
} from './constants.js';

/**
 * Request schemas shared by the API (validation middleware) and the client (forms),
 * so both sides enforce exactly the same rules.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long');

export const registerSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Don't reveal password rules at login — just require something.
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1, 'Enter your password to confirm').max(128),
});

// ---------- Profile ----------

export const profileUpdateSchema = z.strictObject({
  name: nameSchema,
  headline: z.string().trim().max(120, 'Keep the headline under 120 characters'),
  // Optional: new accounts start without one.
  targetRole: z
    .string()
    .trim()
    .max(80, 'Keep the role under 80 characters')
    .refine((v) => v.length === 0 || v.length >= 2, 'Use at least 2 characters'),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  yearsOfExperience: z.coerce.number<number>().int('Use whole years').min(0, 'Cannot be negative').max(50, 'Max 50 years'),
  preferredLanguages: z
    .array(z.string().trim().min(1).max(40))
    .max(15, 'At most 15 languages')
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, 'Languages must be unique'),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ---------- Settings sections (PATCH bodies are partial) ----------

export const answerPrefsSchema = z.strictObject({
  style: z.enum(ANSWER_STYLES),
  length: z.enum(ANSWER_LENGTHS),
  includeCodeExamples: z.boolean(),
  codeLanguage: z.string().trim().min(1).max(30),
});
export const aiPrefsSchema = z.strictObject({
  model: z.enum(['', 'fast', 'quality']),
  temperature: z.number().min(0).max(1),
});
export const assistantPrefsSchema = z.strictObject({
  captureIntervalMs: z.number().int().min(1000).max(30000),
  autoGenerateAnswers: z.boolean(),
});
export const preferencesUpdateSchema = z
  .strictObject({
    theme: z.enum(THEMES),
    answer: answerPrefsSchema.partial(),
    ai: aiPrefsSchema.partial(),
    assistant: assistantPrefsSchema.partial(),
  })
  .partial();

export const voiceUpdateSchema = z
  .strictObject({
    voiceName: z.string().max(100),
    rate: z.number().min(0.5).max(2),
    pitch: z.number().min(0).max(2),
    autoSpeakAnswers: z.boolean(),
    sttLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Use a language tag like en-US'),
    sttEngine: z.enum(STT_ENGINES),
    ttsEngine: z.enum(TTS_ENGINES),
    aiVoice: z.enum(AI_VOICES),
  })
  .partial();

export const privacyUpdateSchema = z
  .strictObject({
    saveHistory: z.boolean(),
    retentionDays: z.number().int().min(0).max(3650),
    storeRawAudio: z.boolean(),
    storeScreenshots: z.boolean(),
  })
  .partial();

export const permissionsUpdateSchema = z
  .strictObject({
    screenCapture: z.boolean(),
    microphone: z.boolean(),
  })
  .partial();

// ---------- Questions (Phase 4) ----------

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const slugList = z
  .string()
  .trim()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))
  .pipe(z.array(z.string().regex(/^[a-z0-9-]+$/, 'Invalid category')).max(30));

export const practiceQuerySchema = z.object({
  categories: slugList.pipe(z.array(z.string()).min(1, 'Pick at least one category')),
  difficulty: z.enum([...DIFFICULTIES, 'mixed']).default('mixed'),
  count: z.coerce.number().int().min(1).max(20).default(10),
  focus: objectId.optional(),
});

export const questionListQuerySchema = z.object({
  categories: slugList.optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  mine: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const questionSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

export const createQuestionSchema = z.strictObject({
  categorySlug: z.string().regex(/^[a-z0-9-]+$/, 'Choose a category'),
  question: z.string().trim().min(10, 'Write the full question (at least 10 characters)').max(500, 'Keep it under 500 characters'),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
  type: z.enum(QUESTION_TYPES).default('conceptual'),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(8).default([]),
});
export type CreateQuestionInput = z.input<typeof createQuestionSchema>;

export const idParamSchema = z.object({ id: objectId });
