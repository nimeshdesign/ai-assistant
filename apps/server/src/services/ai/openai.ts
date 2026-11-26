import OpenAI, {
  toFile,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { z } from 'zod';
import {
  AiProviderError,
  type AiProvider,
  type JsonRequest,
  type JsonResult,
  type SpeakRequest,
  type TranscribeRequest,
} from './provider.js';

const EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export interface OpenAiProviderOptions {
  apiKey: string;
  baseURL?: string;
  timeoutMs: number;
  /** Injected in tests to avoid real network calls. */
  fetch?: typeof fetch;
}

/**
 * Keywords OpenAI strict mode may reject. They're removed from the schema we SEND; the full Zod
 * schema (with all length limits) still validates the response on our side.
 */
const UNSUPPORTED_KEYWORDS = new Set(['$schema', 'minLength', 'maxLength', 'default', 'format']);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !UNSUPPORTED_KEYWORDS.has(k))
      .map(([k, v]) => [
        k,
        // Keys under `properties` are field names, not keywords — keep them all.
        k === 'properties' && v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, stripUnsupported(pv)]))
          : stripUnsupported(v),
      ]),
  );
}

/** JSON Schema for OpenAI "strict" structured outputs, generated from the Zod schema. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return stripUnsupported(z.toJSONSchema(schema, { target: 'draft-7' })) as Record<string, unknown>;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;

  constructor(opts: OpenAiProviderOptions) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      timeout: opts.timeoutMs,
      maxRetries: 2, // the SDK retries 429/5xx/connection errors with backoff
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model: req.model,
        temperature: req.temperature,
        max_completion_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.name, strict: true, schema: toStrictJsonSchema(req.schema) },
        },
      });
    } catch (err) {
      throw mapOpenAiError(err);
    }

    const choice = completion.choices[0];
    const message = choice?.message;
    if (message?.refusal) throw new AiProviderError('refused', message.refusal);
    if (choice?.finish_reason === 'length') {
      throw new AiProviderError('bad_output', 'The response was cut off before it finished');
    }
    if (!message?.content) throw new AiProviderError('bad_output', 'The model returned an empty response');

    let raw: unknown;
    try {
      raw = JSON.parse(message.content);
    } catch (err) {
      throw new AiProviderError('bad_output', 'The model returned invalid JSON', err);
    }
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new AiProviderError('bad_output', 'The model response did not match the expected format', parsed.error);

    return {
      data: parsed.data,
      model: completion.model,
      usage: { inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens },
    };
  }

  /** Audio is passed straight through from memory; it is never written to disk on our side. */
  async transcribe(req: TranscribeRequest): Promise<{ text: string }> {
    try {
      const file = await toFile(req.audio, `speech.${EXTENSION[req.mimeType] ?? 'webm'}`, { type: req.mimeType });
      const res = await this.client.audio.transcriptions.create({
        file,
        model: req.model,
        ...(req.language ? { language: req.language } : {}),
        ...(req.prompt ? { prompt: req.prompt } : {}),
      });
      return { text: (res as { text?: string }).text ?? '' };
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }

  async speak(req: SpeakRequest): Promise<{ audio: Buffer; mimeType: string }> {
    try {
      const res = await this.client.audio.speech.create({
        model: req.model,
        input: req.text,
        voice: req.voice,
        speed: req.speed,
        response_format: 'mp3',
        ...(req.instructions ? { instructions: req.instructions } : {}),
      });
      return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}

export function mapOpenAiError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (err instanceof APIConnectionTimeoutError) return new AiProviderError('timeout', 'The AI service took too long to respond', err);
  if (err instanceof RateLimitError) return new AiProviderError('busy', 'The AI service is busy', err);
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return new AiProviderError('unavailable', 'The AI service rejected the server credentials', err);
  }
  if (err instanceof APIConnectionError) return new AiProviderError('unavailable', 'Could not reach the AI service', err);
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    if (status >= 500) return new AiProviderError('busy', 'The AI service had a temporary problem', err);
    return new AiProviderError('unavailable', `The AI service rejected the request (${status})`, err);
  }
  return new AiProviderError('unavailable', 'Unexpected AI error', err);
}
