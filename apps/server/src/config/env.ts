import { z } from 'zod';

const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ai_interview_assistant'),
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_SECRET),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    // Refresh-token cookie. `secure` defaults to true in production (HTTPS only).
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    // 'lax' when web app and API share a site; 'none' (requires secure) for cross-site deployments.
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    OPENAI_API_KEY: z.string().optional().default(''),
    // Default model, used for "Server default" and "Faster responses".
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    // Used when a user picks "Higher quality" in Settings → AI model.
    OPENAI_MODEL_QUALITY: z.string().default('gpt-4o'),
    // Speech-to-text and text-to-speech models (Phase 7).
    OPENAI_STT_MODEL: z.string().default('gpt-4o-mini-transcribe'),
    OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    // Per-user AI requests allowed per 5 minutes (cost control).
    AI_RATE_LIMIT_PER_5MIN: z.coerce.number().int().min(1).max(1000).default(30),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    // Browsers reject SameSite=None cookies that are not Secure.
    if (env.COOKIE_SAMESITE === 'none' && !(env.COOKIE_SECURE ?? env.NODE_ENV === 'production')) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true' });
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_ACCESS_SECRET.startsWith('dev-only')) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'JWT_ACCESS_SECRET must be set in production' });
    }
  });

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const cookieSecure = env.COOKIE_SECURE ?? isProd;
