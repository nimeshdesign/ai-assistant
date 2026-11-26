import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { VadTracker, VAD_PRESETS } from '@/lib/voice/vad';
import { questionFromSpeech } from '@/features/voice/VoicePage';
import { createFakeApi } from './fakeApi';
import { installFakeMedia, installFakeSpeechRecognition } from './fakeMedia';
import { renderApp } from './utils';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- voice-activity detection (pure) ----------

describe('VadTracker', () => {
  const opts = { threshold: 0.02, silenceToStopMs: 2000, longPauseMs: 1000, noSpeechTimeoutMs: 5000, maxDurationMs: 30_000 };
  /** Feed `level` every 50 ms for `ms` milliseconds. */
  function feed(vad: VadTracker, level: number, ms: number, t: { now: number }) {
    let stop = null;
    for (let i = 0; i < ms / 50 && !stop; i++) {
      t.now += 50;
      stop = vad.update(level, t.now).stop;
    }
    return stop;
  }

  it('stops after the speaker goes quiet, counting long pauses in between', () => {
    const vad = new VadTracker(opts);
    const t = { now: 0 };
    expect(feed(vad, 0.2, 1000, t)).toBeNull(); // speaking
    expect(feed(vad, 0, 1500, t)).toBeNull(); // 1.5 s thinking pause
    expect(feed(vad, 0.2, 1000, t)).toBeNull(); // speaks again
    expect(feed(vad, 0, 3000, t)).toBe('silence'); // finished
    expect(vad.longPauses).toBe(1); // the final silence doesn't count
    expect(vad.speakingDurationMs()).toBe(3450); // first sample at 50 ms → last speech at 3500 ms
  });

  it('gives up when nobody speaks, and enforces a maximum length', () => {
    const t = { now: 0 };
    expect(feed(new VadTracker(opts), 0, 6000, t)).toBe('no-speech');
    t.now = 0;
    expect(feed(new VadTracker({ ...opts, maxDurationMs: 2000 }), 0.3, 5000, t)).toBe('max-duration');
  });

  it('ignores background noise below the threshold', () => {
    const vad = new VadTracker(opts);
    const t = { now: 0 };
    feed(vad, 0.01, 2000, t);
    expect(vad.speechDetected).toBe(false);
  });

  it('allows longer thinking pauses when answering than when asking', () => {
    expect(VAD_PRESETS.answer.silenceToStopMs).toBeGreaterThan(VAD_PRESETS.question.silenceToStopMs);
  });
});

describe('questionFromSpeech', () => {
  it.each([
    ['Um, so what is a closure in JavaScript?', 'What is a closure in JavaScript?'],
    ['okay, well, explain the event loop', 'Explain the event loop'],
    ['How does React reconcile lists?', 'How does React reconcile lists?'],
  ])('%s → %s', (heard, expected) => expect(questionFromSpeech(heard)).toBe(expected));
});

// ---------- Voice page (real hook + recorder over fake media APIs) ----------

describe('Voice Assistant', () => {
  let media: ReturnType<typeof installFakeMedia>;
  beforeEach(() => {
    media = installFakeMedia();
  });

  async function speakAndStop(user: ReturnType<typeof renderApp>['user']) {
    media.mic.level = 0.3; // the user is talking
    await screen.findByText('Microphone capture on');
    await sleep(200);
    await user.click(screen.getByRole('button', { name: 'Stop listening' }));
  }

  it('asks for consent once, records, transcribes on the server and answers', async () => {
    const { user, api } = renderApp('/voice');
    await user.click(await screen.findByRole('button', { name: 'Start listening' }));
    await user.click(await screen.findByRole('button', { name: 'Allow and start' }));
    await speakAndStop(user);

    // Filler-free question, ready to edit
    expect(await screen.findByDisplayValue('What is a closure in JavaScript?')).toBeInTheDocument();
    expect(screen.getByText('Heard: “Um, so what is a closure in JavaScript?”')).toBeInTheDocument();
    // Speech patterns from the real transcript
    expect(screen.getByText(/1 filler word/)).toBeInTheDocument();
    // Answered automatically
    expect(await screen.findByText('Direct answer to: What is a closure in JavaScript?')).toBeInTheDocument();

    // The recording went to /ai/transcribe as raw audio, and the mic was released.
    const upload = api.calls.find((c) => c.path === '/ai/transcribe');
    expect(upload?.body).toMatchObject({ contentType: 'audio/webm', audioBytes: 4000 });
    expect(media.mic.active).toBe(false);
    expect(screen.queryByText('Microphone capture on')).not.toBeInTheDocument();
    await waitFor(() => expect([...api.users.values()][0]!.settings.permissions.microphone).toBe(true));
  });

  it("tells the user when it didn't hear anything (and doesn't upload)", async () => {
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.permissions.microphone = true;
    const { user } = renderApp('/voice', { api });
    await user.click(await screen.findByRole('button', { name: 'Start listening' }));
    await screen.findByText('Microphone capture on');
    await user.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(await screen.findByText(/We didn't hear anything/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/ai/transcribe')).toBe(false);
    expect(media.mic.active).toBe(false);
  });

  it('explains a blocked microphone', async () => {
    media.mic.denied = true;
    const api = createFakeApi();
    api.seedSignedInUser().settings.permissions.microphone = true;
    const { user } = renderApp('/voice', { api });
    await user.click(await screen.findByRole('button', { name: 'Start listening' }));
    expect(await screen.findByText(/Microphone access was blocked/)).toBeInTheDocument();
  });

  it("cancel discards the recording and turns the mic off", async () => {
    const api = createFakeApi();
    api.seedSignedInUser().settings.permissions.microphone = true;
    const { user } = renderApp('/voice', { api });
    await user.click(await screen.findByRole('button', { name: 'Start listening' }));
    await screen.findByText('Microphone capture on');
    await user.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(screen.queryByText('Microphone capture on')).not.toBeInTheDocument();
    expect(media.mic.active).toBe(false);
    expect(api.calls.some((c) => c.path === '/ai/transcribe')).toBe(false);
  });

  it('uses the browser speech service when chosen, with live text and no upload', async () => {
    installFakeSpeechRecognition(['what is the virtual DOM?']);
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.permissions.microphone = true;
    account.settings.voice.sttEngine = 'browser';
    const { user } = renderApp('/voice', { api });
    expect(await screen.findByText(/sends the audio to its provider/)).toBeInTheDocument(); // disclosed
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    media.mic.level = 0.3;
    expect(await screen.findByText('what is the virtual DOM?')).toBeInTheDocument(); // interim text
    await user.click(screen.getByRole('button', { name: 'Stop listening' }));
    // Extra time: under a full parallel run this step was once slower than the default 6 s.
    expect(await screen.findByDisplayValue('What is the virtual DOM?', {}, { timeout: 12000 })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/ai/transcribe')).toBe(false);
  });

  it('reads answers with the natural AI voice when chosen', async () => {
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.voice.ttsEngine = 'ai';
    account.settings.voice.aiVoice = 'coral';
    const { user } = renderApp('/tools', { api });
    await user.type(await screen.findByLabelText('Question'), 'What is a closure?');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    await user.click(await screen.findByRole('button', { name: 'Read answer aloud' }));
    expect(await screen.findByRole('button', { name: 'Pause reading' })).toBeInTheDocument();
    expect(media.play).toHaveBeenCalled();
    const req = api.calls.find((c) => c.path === '/ai/speak');
    expect(req?.body).toMatchObject({ voice: 'coral', text: expect.stringContaining('What is a closure?') });

    await user.click(screen.getByRole('button', { name: 'Pause reading' }));
    expect(media.pause).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Stop reading' }));
    expect(screen.getByRole('button', { name: 'Read answer aloud' })).toBeInTheDocument();
  });

  it('falls back to the browser voice when the AI voice is unavailable', async () => {
    const api = createFakeApi();
    api.seedSignedInUser().settings.voice.ttsEngine = 'ai';
    api.failRoute('POST /ai/speak', 503, { success: false, error: { code: 'AI_BUSY', message: 'busy' } });
    const { user } = renderApp('/tools', { api });
    await user.type(await screen.findByLabelText('Question'), 'What is a closure?');
    await user.click(screen.getByRole('button', { name: /Get answer/ }));
    await user.click(await screen.findByRole('button', { name: 'Read answer aloud' }));
    expect(await screen.findByText(/Using the browser voice instead/)).toBeInTheDocument();
  });
});

describe('Voice answers in mock interviews', () => {
  it('records a spoken answer with speech metrics', async () => {
    const media = installFakeMedia();
    const api = createFakeApi();
    api.seedSignedInUser().settings.permissions.microphone = true;
    api.setTranscript('So basically a closure keeps access to its outer variables, like, even later.');
    const { user } = renderApp('/mock-interview', { api });

    await user.click(await screen.findByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: 'HR Interview Questions' }));
    await user.click(screen.getByRole('radio', { name: '3' }));
    await user.click(screen.getByRole('button', { name: /Start interview/ }));

    await user.click(await screen.findByRole('button', { name: 'Answer with microphone' }));
    media.mic.level = 0.3;
    await screen.findByText('Microphone capture on');
    await sleep(150);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    const box = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(box).toHaveValue('So basically a closure keeps access to its outer variables, like, even later.'));
    expect(screen.getByText(/2 filler words/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Submit answer/ }));
    await screen.findByText('Improved answer');
    // Only text and timing metrics go to the server: never the recording.
    const sent = api.calls.find((c) => c.path.endsWith('/answers'))!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ inputMode: 'voice', speechMetrics: { fillerWordCount: 2 } });
    expect(Object.keys(sent).sort()).toEqual(['inputMode', 'questionId', 'response', 'speechMetrics']);
    expect(screen.getByText(/Confidence also reflects your pace/)).toBeInTheDocument();
    expect(media.mic.active).toBe(false);
  });
});

describe('Voice settings', () => {
  it('lets the user choose the speech-to-text service and states where audio goes', async () => {
    const { user, api } = renderApp('/settings?tab=voice');
    const group = await screen.findByRole('radiogroup', { name: 'Speech-to-text service' });
    expect(within(group).getByRole('radio', { name: /Our server/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(group).getByRole('radio', { name: /browser's speech service/ }));
    await waitFor(() => expect([...api.users.values()][0]!.settings.voice.sttEngine).toBe('browser'));
  });

  it('shows raw audio and screenshots as never stored', async () => {
    renderApp('/settings?tab=privacy');
    expect(await screen.findByText('Raw audio')).toBeInTheDocument();
    expect(screen.getAllByText('Never stored')).toHaveLength(2);
    expect(screen.queryByRole('switch', { name: /raw audio/i })).not.toBeInTheDocument();
  });
});
