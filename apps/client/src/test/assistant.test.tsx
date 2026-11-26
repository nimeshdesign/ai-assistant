import { act, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detection } from '@/lib/screen/screenReader';
import { createFakeApi } from './fakeApi';
import { renderApp } from './utils';

// ---- Controllable stand-in for the screen-reading hook (OCR itself is unit-tested separately) ----
type ReaderState = ReturnType<typeof makeState>;
function makeState(detections: Detection[] = []) {
  return {
    status: 'waiting' as const,
    engine: { state: 'ready' as const, progress: 1 },
    lastText: null,
    detections,
    error: null,
    region: null,
    setRegion: vi.fn(),
    reset: vi.fn(),
    clearDetections: () => setReader({ detections: [] }),
  };
}
let snapshot: ReaderState = makeState();
const listeners = new Set<() => void>();
function setReader(patch: Partial<ReaderState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}
vi.mock('@/hooks/useScreenReader', () => ({
  useScreenReader: () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => snapshot,
    ),
}));

let n = 0;
const detection = (over: Partial<Detection>): Detection => ({
  id: `d${++n}`,
  at: Date.now(),
  kind: 'question',
  question: 'What is a closure in JavaScript?',
  code: null,
  language: null,
  keywords: ['closure', 'javascript'],
  text: 'What is a closure in JavaScript?',
  repeated: false,
  source: 'local',
  ...over,
});
const push = (d: Detection) => act(() => setReader({ detections: [d, ...snapshot.detections] }));

beforeEach(() => {
  snapshot = makeState();
});

describe('Screen Assistant detections', () => {
  it('answers a detected question automatically when that setting is on (default)', async () => {
    const { api } = renderApp('/assistant');
    await screen.findByText('Start sharing to detect questions');
    push(detection({}));

    expect(await screen.findByText('Direct answer to: What is a closure in JavaScript?')).toBeInTheDocument();
    expect(screen.getByLabelText('Detected question (you can edit it)')).toHaveValue('What is a closure in JavaScript?');
    expect(screen.getByText('closure')).toBeInTheDocument(); // keyword chip
    expect(api.calls.filter((c) => c.path === '/ai/answer')).toHaveLength(1);
  });

  it('waits for the user when auto-answer is off, and answers the edited question', async () => {
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.assistant.autoGenerateAnswers = false;
    const { user } = renderApp('/assistant', { api });
    await screen.findByText('Start sharing to detect questions');
    push(detection({ question: 'Wht is a closure in JS?' })); // OCR typo

    const field = await screen.findByLabelText('Detected question (you can edit it)');
    expect(api.calls.some((c) => c.path === '/ai/answer')).toBe(false);
    await user.clear(field);
    await user.type(field, 'What is a closure in JavaScript?');
    await user.click(within(field.closest('form')!).getByRole('button', { name: /Get answer/ }));
    expect(await screen.findByText('Direct answer to: What is a closure in JavaScript?')).toBeInTheDocument();
  });

  it('marks questions seen earlier in the session', async () => {
    renderApp('/assistant');
    await screen.findByText('Start sharing to detect questions');
    push(detection({ repeated: true }));
    expect(await screen.findByText('Seen earlier')).toBeInTheDocument();
  });

  it('reviews code found on screen', async () => {
    const { user } = renderApp('/assistant');
    await screen.findByText('Start sharing to detect questions');
    push(
      detection({
        kind: 'code',
        question: null,
        language: 'javascript',
        code: 'function sum(a) {\n  for (let i = 0; i <= a.length; i++) {}\n}',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Review this code/ }));
    const issues = await screen.findByRole('list', { name: 'Issues found' });
    expect(within(issues).getByText('Off-by-one error')).toBeInTheDocument();
  });

  it('jumps to new detections, unless the user picked an older one', async () => {
    const { user } = renderApp('/assistant');
    await screen.findByText('Start sharing to detect questions');
    push(detection({ question: 'First question about closures?' }));
    push(detection({ question: 'Second question about the event loop?' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Detected question (you can edit it)')).toHaveValue('Second question about the event loop?'),
    );

    // Pick the older one: following stops.
    const list = screen.getByRole('list', { name: 'Detections' });
    await user.click(within(list).getByRole('button', { name: /First question/ }));
    push(detection({ question: 'Third question about promises?' }));
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(3));
    expect(screen.getByLabelText('Detected question (you can edit it)')).toHaveValue('First question about closures?');
    expect(screen.getByRole('switch', { name: 'Jump to new questions' })).toHaveAttribute('aria-checked', 'false');
  });

  it('clears the detections list', async () => {
    const { user } = renderApp('/assistant');
    await screen.findByText('Start sharing to detect questions');
    push(detection({}));
    await user.click(await screen.findByRole('button', { name: /Clear/ }));
    expect(await screen.findByText('Start sharing to detect questions')).toBeInTheDocument();
  });
});
