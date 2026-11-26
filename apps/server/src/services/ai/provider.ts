import type { ZodType } from 'zod';

/** One structured-output request to a language model. */
export interface JsonRequest<T> {
  /** Short identifier sent to the provider as the schema name (a-z, 0-9, _). */
  name: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface JsonResult<T> {
  data: T;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Anything that can turn a prompt into schema-valid JSON. The OpenAI adapter implements it
 * for production; tests use an in-memory fake so they never need a key or spend money.
 */
export interface TranscribeRequest {
  audio: Buffer;
  mimeType: string;
  model: string;
  /** ISO-639-1 language, e.g. "en". */
  language?: string;
  /** Vocabulary hints that improve recognition of technical terms. */
  prompt?: string;
}

export interface SpeakRequest {
  text: string;
  voice: string;
  speed: number;
  model: string;
  /** Tone guidance for models that support it. */
  instructions?: string;
}

export interface AiProvider {
  readonly name: 'openai' | 'fake';
  generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
  transcribe(req: TranscribeRequest): Promise<{ text: string }>;
  speak(req: SpeakRequest): Promise<{ audio: Buffer; mimeType: string }>;
}

export type AiFailure = 'busy' | 'timeout' | 'unavailable' | 'refused' | 'bad_output';

/** Provider-neutral error; the service maps it to an HTTP error with a stable code. */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiFailure,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
