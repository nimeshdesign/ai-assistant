import { describe, expect, it } from 'vitest';
import { OpenAiProvider, toStrictJsonSchema } from '../src/services/ai/openai.js';
import { AiProviderError } from '../src/services/ai/provider.js';
import { answerOutputSchema } from '../src/services/ai/schemas.js';
import { sampleAnswer } from './fakeAi.js';

/** Drives the real OpenAI SDK against a fake fetch, so the adapter is tested end to end offline. */
function providerWith(respond: (body: Record<string, unknown>) => Response) {
  const calls: Record<string, unknown>[] = [];
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body);
    return respond(body);
  }) as typeof fetch;
  return { provider: new OpenAiProvider({ apiKey: 'sk-test', timeoutMs: 5000, fetch: fakeFetch }), calls };
}

const completion = (content: string | null, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, refusal: null }, ...extra }],
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

// `x-should-retry: false` tells the SDK not to back off and retry, keeping tests fast.
const apiError = (status: number) =>
  new Response(JSON.stringify({ error: { message: 'nope', type: 'x' } }), {
    status,
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  });

const request = {
  name: 'interview_answer',
  system: 'sys',
  user: 'usr',
  schema: answerOutputSchema,
  model: 'gpt-test',
  temperature: 0.3,
  maxTokens: 500,
};

describe('OpenAiProvider', () => {
  it('sends a strict JSON-schema request and parses the result', async () => {
    const { provider, calls } = providerWith(() => completion(JSON.stringify(sampleAnswer)));
    const res = await provider.generateJson(request);
    expect(res.data).toEqual(sampleAnswer);
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 34 });

    const body = calls[0]!;
    expect(body).toMatchObject({
      model: 'gpt-test',
      temperature: 0.3,
      max_completion_tokens: 500,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
    });
    const format = body.response_format as { type: string; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
    expect(format.type).toBe('json_schema');
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.name).toBe('interview_answer');
  });

  it('produces a strict-mode-compatible schema', () => {
    const schema = toStrictJsonSchema(answerOutputSchema);
    const json = JSON.stringify(schema);
    expect(json).not.toMatch(/"(minLength|maxLength|\$schema|default|format)"/);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['directAnswer', 'simpleExplanation', 'realWorldExample', 'codeExample', 'interviewReadyAnswer']);
  });

  it.each([
    ['a refusal', () => completion(null, { message: { role: 'assistant', content: null, refusal: 'I cannot help with that' } }), 'refused'],
    ['a truncated response', () => completion('{"directAnswer":"a', { finish_reason: 'length' }), 'bad_output'],
    ['invalid JSON', () => completion('not json'), 'bad_output'],
    ['JSON of the wrong shape', () => completion(JSON.stringify({ hello: 'world' })), 'bad_output'],
    ['an empty response', () => completion(null), 'bad_output'],
    ['a bad API key (401)', () => apiError(401), 'unavailable'],
    ['rate limiting (429)', () => apiError(429), 'busy'],
    ['a server error (500)', () => apiError(500), 'busy'],
    ['a bad request (400)', () => apiError(400), 'unavailable'],
  ] as const)('maps %s to "%s"', async (_label, respond, kind) => {
    const { provider } = providerWith(respond);
    const err = await provider.generateJson(request).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe(kind);
  });

  it('maps network failures to "unavailable"', async () => {
    const provider = new OpenAiProvider({
      apiKey: 'sk-test',
      timeoutMs: 5000,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    // The SDK retries connection errors twice with a short backoff before giving up.
    const err = await provider.generateJson(request).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('unavailable');
  }, 20_000);
});
