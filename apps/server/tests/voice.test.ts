import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { analyzeSpeech, countFillers, MAX_AUDIO_BYTES } from '@aia/shared';
import { setAiProvider } from '../src/services/ai/ai.service.js';
import { AiProviderError } from '../src/services/ai/provider.js';
import { OpenAiProvider } from '../src/services/ai/openai.js';
import { env } from '../src/config/env.js';
import { FakeAiProvider } from './fakeAi.js';
import { makeClient, registerUser } from './helpers.js';

const audio = (bytes = 4000) => Buffer.alloc(bytes, 7);

async function signedIn() {
  const agent = makeClient();
  const { token } = await registerUser(agent);
  return { agent, auth: { Authorization: `Bearer ${token}` } };
}

async function totalDocuments() {
  const cols = await mongoose.connection.db!.collections();
  const counts = await Promise.all(cols.map((c) => c.countDocuments()));
  return counts.reduce((a, b) => a + b, 0);
}

// ---------- speech metrics (shared) ----------

describe('analyzeSpeech', () => {
  it('computes pace, fillers and pauses', () => {
    const r = analyzeSpeech('So um, basically a closure is, you know, a function that like, remembers its scope.', 6, 2);
    expect(r.wordCount).toBe(15);
    expect(r.wordsPerMinute).toBe(150);
    expect(r.pace).toBe('good');
    expect(r.fillerWordCount).toBe(4); // um, basically, you know, like
    expect(r.longPauseCount).toBe(2);
  });

  it('does not count "like" as a verb or preposition', () => {
    expect(countFillers('I like React and it looks like a tree.').get('like')).toBeUndefined();
    expect(countFillers('and, like, it works. Like um yes').get('like')).toBe(2);
  });

  it('does not count "you know" as "know", nor fillers inside words', () => {
    const f = countFillers('You know the answer. I know it. Umbrella, actually.');
    expect(f.get('you know')).toBe(1);
    expect(f.get('um')).toBeUndefined();
    expect(f.get('actually')).toBe(1);
  });

  it('labels slow and fast speech, and ignores very short clips', () => {
    expect(analyzeSpeech('one two three four five', 10).pace).toBe('slow'); // 30 wpm
    expect(analyzeSpeech(Array(40).fill('word').join(' '), 10).pace).toBe('fast'); // 240 wpm
    expect(analyzeSpeech('hello there', 1).pace).toBe('unknown');
  });
});

// ---------- endpoints ----------

let fake: FakeAiProvider;
beforeEach(() => {
  fake = new FakeAiProvider();
  setAiProvider(fake);
});
afterEach(() => setAiProvider(null));

describe('POST /ai/transcribe', () => {
  it('transcribes the raw recording with language and vocabulary hints, and stores nothing', async () => {
    const { agent, auth } = await signedIn();
    await agent.patch('/api/v1/settings/voice').set(auth).send({ sttLanguage: 'en-GB' });
    const before = await totalDocuments();

    const res = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'audio/webm;codecs=opus').send(audio(5000));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ text: 'What is a closure in JavaScript?' });

    const req = fake.transcriptions[0]!;
    expect(req.mimeType).toBe('audio/webm');
    expect(req.audio.length).toBe(5000);
    expect(req.language).toBe('en');
    expect(req.model).toBe(env.OPENAI_STT_MODEL);
    expect(req.prompt).toContain('useEffect');
    expect(await totalDocuments()).toBe(before); // audio is never persisted
  });

  it('rejects unsupported formats, empty clips and oversized uploads', async () => {
    const { agent, auth } = await signedIn();
    const video = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'video/mp4').send(audio());
    expect(video.status).toBe(415);
    const short = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'audio/webm').send(audio(200));
    expect(short.body.error.code).toBe('AUDIO_TOO_SHORT');
    const big = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'audio/webm').send(audio(MAX_AUDIO_BYTES + 1024));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(fake.transcriptions).toHaveLength(0);
  });

  it('maps provider failures and the missing-key case', async () => {
    const { agent, auth } = await signedIn();
    fake.audioError = new AiProviderError('busy', 'rate limited');
    const busy = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'audio/ogg').send(audio());
    expect(busy.status).toBe(503);
    expect(busy.body.error.code).toBe('AI_BUSY');

    setAiProvider(null);
    const off = await agent.post('/api/v1/ai/transcribe').set(auth).set('Content-Type', 'audio/ogg').send(audio());
    expect(off.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('requires authentication', async () => {
    const res = await makeClient().post('/api/v1/ai/transcribe').set('Content-Type', 'audio/webm').send(audio());
    expect(res.status).toBe(401);
  });
});

describe('POST /ai/speak', () => {
  it('returns MP3 audio in the user\'s chosen voice and speed', async () => {
    const { agent, auth } = await signedIn();
    await agent.patch('/api/v1/settings/voice').set(auth).send({ aiVoice: 'coral', rate: 1.25 });
    const res = await agent.post('/api/v1/ai/speak').set(auth).send({ text: 'A closure remembers its scope.' }).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^audio\/mpeg/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(res.body).toString()).toBe('ID3-fake-mp3-A closure remembers its scope.');
    expect(fake.speeches[0]).toMatchObject({ voice: 'coral', speed: 1.25, model: env.OPENAI_TTS_MODEL });
    expect(fake.speeches[0]!.instructions).toMatch(/natural/i);
  });

  it('lets the request override voice and speed, and validates input', async () => {
    const { agent, auth } = await signedIn();
    await agent.post('/api/v1/ai/speak').set(auth).send({ text: 'Hi', voice: 'sage', speed: 0.8 });
    expect(fake.speeches[0]).toMatchObject({ voice: 'sage', speed: 0.8 });
    for (const body of [{ text: '' }, { text: 'x'.repeat(3001) }, { text: 'Hi', voice: 'robot' }, { text: 'Hi', speed: 5 }]) {
      expect((await agent.post('/api/v1/ai/speak').set(auth).send(body)).status).toBe(422);
    }
  });
});

describe('voice settings', () => {
  it('default to server speech-to-text, browser voices and the alloy AI voice', async () => {
    const { agent, auth } = await signedIn();
    const s = (await agent.get('/api/v1/settings').set(auth)).body.data.voice;
    expect(s).toMatchObject({ sttEngine: 'server', ttsEngine: 'browser', aiVoice: 'alloy' });
    expect((await agent.patch('/api/v1/settings/voice').set(auth).send({ sttEngine: 'browser', ttsEngine: 'ai' })).status).toBe(200);
    expect((await agent.patch('/api/v1/settings/voice').set(auth).send({ sttEngine: 'phone' })).status).toBe(422);
  });
});

// ---------- OpenAI adapter (audio) ----------

describe('OpenAiProvider audio', () => {
  function provider(respond: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const p = new OpenAiProvider({
      apiKey: 'sk-test',
      timeoutMs: 5000,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init! });
        return respond(String(url), init!);
      }) as typeof fetch,
    });
    return { p, calls };
  }

  it('uploads audio as multipart to the transcription endpoint', async () => {
    const { p, calls } = provider(
      () => new Response(JSON.stringify({ text: 'hello world' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const r = await p.transcribe({ audio: audio(), mimeType: 'audio/webm', model: 'stt-test', language: 'en', prompt: 'React' });
    expect(r.text).toBe('hello world');
    // The SDK may make a preliminary `data:` fetch (capability probe) before the real upload.
    const upload = calls.find((c) => /\/audio\/transcriptions$/.test(c.url));
    expect(upload).toBeDefined();
    const body = upload!.init.body as FormData;
    expect(body.get('model')).toBe('stt-test');
    expect(body.get('language')).toBe('en');
    expect((body.get('file') as File).name).toBe('speech.webm');
  });

  it('requests MP3 speech with tone instructions', async () => {
    const { p, calls } = provider(() => new Response(Buffer.from('MP3DATA'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const r = await p.speak({ text: 'Hi', voice: 'alloy', speed: 1.1, model: 'tts-test', instructions: 'Be calm' });
    expect(r.audio.toString()).toBe('MP3DATA');
    expect(calls[0]!.url).toMatch(/\/audio\/speech$/);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      model: 'tts-test',
      input: 'Hi',
      voice: 'alloy',
      speed: 1.1,
      response_format: 'mp3',
      instructions: 'Be calm',
    });
  });

  it('maps audio API errors like the text API', async () => {
    const { p } = provider(
      () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } }),
    );
    const err = await p.transcribe({ audio: audio(), mimeType: 'audio/webm', model: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('unavailable');
  });
});
