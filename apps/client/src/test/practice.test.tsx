import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fromSearchParams, toSearchParams } from '@/features/practice/practiceParams';
import { renderApp } from './utils';
import { bankId, createFakeApi } from './fakeApi';

const CLOSURE = bankId('What is a closure in JavaScript?');

describe('practice params', () => {
  it('round-trips valid options through the URL', () => {
    const p = toSearchParams({ categories: ['react', 'css'], difficulty: 'hard', count: 5, focus: CLOSURE });
    expect(fromSearchParams(p)).toEqual({ categories: ['react', 'css'], difficulty: 'hard', count: 5, focus: CLOSURE });
  });

  it('rejects unknown categories and out-of-range counts', () => {
    expect(fromSearchParams(new URLSearchParams('categories=cobol&difficulty=easy&count=5'))).toBeNull();
    expect(fromSearchParams(new URLSearchParams('categories=react&difficulty=easy&count=99'))).toBeNull();
    expect(fromSearchParams(new URLSearchParams('difficulty=easy&count=5'))).toBeNull();
    expect(fromSearchParams(new URLSearchParams('categories=react&focus=q006'))).toBeNull(); // ids must be real
  });
});

describe('Practice', () => {
  it('requires at least one category', async () => {
    const { user, router } = renderApp('/practice');
    await user.click(await screen.findByRole('button', { name: /Start practice/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one category');
    expect(router.state.location.pathname).toBe('/practice');
  });

  it('starts a session with the chosen category', async () => {
    const { user, router } = renderApp('/practice');
    await user.click(await screen.findByRole('button', { name: 'JavaScript' }));
    await user.click(screen.getByRole('button', { name: /Start practice/ }));
    expect(router.state.location.pathname).toBe('/practice/session');
    expect(router.state.location.search).toContain('categories=javascript');
    expect(await screen.findByRole('heading', { name: 'Practice session' })).toBeInTheDocument();
  });

  it('searches the question bank', async () => {
    const { user } = renderApp('/practice');
    await user.type(await screen.findByRole('textbox', { name: 'Search questions' }), 'jwt');
    expect(await screen.findByRole('link', { name: /How does JWT authentication work/ })).toBeInTheDocument();
  });

  it('reveals a structured answer and switches length', async () => {
    const { user, api } = renderApp(`/practice/session?categories=javascript&difficulty=mixed&count=5&focus=${CLOSURE}`);
    expect(await screen.findByRole('heading', { level: 2, name: 'What is a closure in JavaScript?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show answer/ }));

    expect(await screen.findByText('Direct answer')).toBeInTheDocument();
    expect(screen.getByText('Simple explanation')).toBeInTheDocument();
    expect(screen.queryByText('Code example')).not.toBeInTheDocument(); // default length = normal

    const lengths = screen.getByRole('radiogroup', { name: 'Answer length' });
    await user.click(within(lengths).getByRole('radio', { name: 'Detailed' }));
    expect(await screen.findByText('Code example')).toBeInTheDocument();

    await user.click(within(lengths).getByRole('radio', { name: 'Short' }));
    await screen.findByText(/Interview-ready \(short/);
    expect(screen.queryByText('Simple explanation')).not.toBeInTheDocument();

    // Each length was requested from the AI API with the question text.
    const lengthsAsked = api.calls.filter((c) => c.path === '/ai/answer').map((c) => (c.body as { length: string }).length);
    expect(lengthsAsked).toEqual(['normal', 'detailed', 'short']);
  });

  it('copies the interview-ready answer', async () => {
    const { user } = renderApp(`/practice/session?categories=javascript&difficulty=mixed&count=5&focus=${CLOSURE}`);
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy interview-ready answer' }));
    expect(await navigator.clipboard.readText()).toBe('Interview-ready (normal, conversational): What is a closure in JavaScript?');
  });

  it('moves through questions and finishes the session', async () => {
    const { user } = renderApp('/practice/session?categories=hr&difficulty=mixed&count=3');
    await screen.findByText(/Question 1 of 3/);
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(screen.getByRole('button', { name: /Finish/ }));
    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument();
  });

  it('shows category counts from the API', async () => {
    renderApp('/practice');
    const css = await screen.findByRole('button', { name: 'CSS' });
    expect(css).toHaveAccessibleDescription(/6 questions/);
  });

  it('adds a private question, shows it under "Your questions" and deletes it', async () => {
    const api = createFakeApi();
    api.seedSignedInUser();
    const { user } = renderApp('/practice', { api });
    await user.click(await screen.findByRole('button', { name: /Add your own question/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a question' });

    await user.click(within(dialog).getByRole('button', { name: 'Add question' }));
    expect(await within(dialog).findByText(/Write the full question/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Question'), 'How does React Suspense work with data fetching?');
    await user.click(within(dialog).getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'React.js' }));
    await user.type(within(dialog).getByLabelText('Tags (optional)'), 'suspense, data');
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }));

    const mine = await screen.findByRole('list', { name: 'Your questions' });
    expect(within(mine).getByText('How does React Suspense work with data fetching?')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'React.js' })).toHaveAccessibleDescription(/7 questions/);

    await user.click(within(mine).getByRole('button', { name: /Delete question/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Your questions' })).not.toBeInTheDocument());
  });

  it('shows the API error when a session cannot be loaded', async () => {
    renderApp(`/practice/session?categories=javascript&difficulty=mixed&count=5&focus=${'0'.repeat(24)}`);
    expect(await screen.findByText('Question not found')).toBeInTheDocument();
  });

  it('shows an error for an invalid session link', async () => {
    renderApp('/practice/session?categories=nope');
    expect(await screen.findByText('Invalid practice session')).toBeInTheDocument();
  });
});
