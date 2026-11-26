import {
  AiProviderError,
  type AiProvider,
  type JsonRequest,
  type JsonResult,
  type SpeakRequest,
  type TranscribeRequest,
} from '../src/services/ai/provider.js';

type Responder = (req: JsonRequest<unknown>) => unknown;

/** In-memory AI provider: records every request and returns canned, schema-checked data. */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake' as const;
  readonly requests: JsonRequest<unknown>[] = [];
  private queue: (unknown | AiProviderError)[] = [];

  constructor(private responders: Record<string, Responder> = {}) {}

  /** Queue one-off results (data or an AiProviderError) returned before the responders. */
  enqueue(...items: (unknown | AiProviderError)[]) {
    this.queue.push(...items);
    return this;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    this.requests.push(req as JsonRequest<unknown>);
    const next = this.queue.length ? this.queue.shift() : this.responders[req.name]?.(req as JsonRequest<unknown>);
    if (next instanceof AiProviderError) throw next;
    if (next === undefined) throw new Error(`FakeAiProvider: no response configured for "${req.name}"`);
    // Behave like the real adapter: validate against the schema.
    const parsed = req.schema.safeParse(next);
    if (!parsed.success) throw new AiProviderError('bad_output', 'schema mismatch', parsed.error);
    return { data: parsed.data, model: req.model, usage: { inputTokens: 100, outputTokens: 50 } };
  }

  last() {
    return this.requests.at(-1)!;
  }

  readonly transcriptions: TranscribeRequest[] = [];
  readonly speeches: SpeakRequest[] = [];
  transcript = 'What is a closure in JavaScript?';
  audioError: AiProviderError | null = null;

  async transcribe(req: TranscribeRequest) {
    this.transcriptions.push(req);
    if (this.audioError) throw this.audioError;
    return { text: this.transcript };
  }

  async speak(req: SpeakRequest) {
    this.speeches.push(req);
    if (this.audioError) throw this.audioError;
    return { audio: Buffer.from('ID3-fake-mp3-' + req.text), mimeType: 'audio/mpeg' };
  }
}

export const sampleAnswer = {
  directAnswer: 'A closure is a function that remembers variables from where it was created.',
  simpleExplanation: 'Inner functions keep a reference to the outer scope.',
  realWorldExample: 'Event handlers that remember some state.',
  codeExample: { language: 'javascript', code: 'const add = (a) => (b) => a + b;' },
  interviewReadyAnswer: 'So a closure is basically a function bundled with its surrounding variables.',
};

export const defaultResponders: Record<string, Responder> = {
  interview_answer: () => sampleAnswer,
  concept_explanation: () => ({
    title: 'Event loop',
    summary: 'How JavaScript runs async code on one thread.',
    explanation: 'The call stack runs code; callbacks wait in queues.',
    analogy: 'A chef with one pair of hands and a ticket rail.',
    keyPoints: ['Single thread', 'Microtasks before macrotasks'],
    example: null,
  }),
  code_analysis: () => ({
    language: 'javascript',
    summary: 'Sums an array but has an off-by-one bug.',
    issues: [{ severity: 'error', line: 2, title: 'Off-by-one', detail: 'Uses <= length.', fix: 'Use < length.' }],
    improvedCode: 'function sum(a){let s=0;for(let i=0;i<a.length;i++)s+=a[i];return s;}',
    complexity: 'O(n) time, O(1) space',
  }),
  answer_evaluation: () => ({
    scores: { technicalAccuracy: 80, communication: 70, structure: 60, practicalKnowledge: 75, confidence: 65 },
    feedback: 'Good start.',
    strengths: ['Correct definition'],
    improvements: ['Add an example'],
    improvedAnswer: 'A closure is…',
  }),
};
