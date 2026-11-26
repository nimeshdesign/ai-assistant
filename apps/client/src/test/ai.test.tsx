import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bankId, createFakeApi } from './fakeApi';
import { renderApp } from './utils';

const CLOSURE = bankId('What is a closure in JavaScript?');
const sessionUrl = `/practice/session?categories=javascript&difficulty=mixed&count=5&focus=${CLOSURE}`;

describe('AI answers', () => {
  it('uses the default length and style from the account settings', async () => {
    const api = createFakeApi();
    const account = api.seedSignedInUser();
    account.settings.answer.length = 'short';
    account.settings.answer.style = 'concise';
    const { user } = renderApp(sessionUrl, { api });
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    expect(await screen.findByText('Interview-ready (short, concise): What is a closure in JavaScript?')).toBeInTheDocument();
  });

  it('regenerates an answer on request', async () => {
    const { user, api } = renderApp(sessionUrl);
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    await screen.findByText('Direct answer to: What is a closure in JavaScript?');
    await user.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(await screen.findByText('Direct answer to: What is a closure in JavaScript? (take 2)')).toBeInTheDocument();
    const regen = api.calls.filter((c) => c.path === '/ai/answer' && (c.body as { regenerate?: boolean }).regenerate);
    expect(regen).toHaveLength(1);
  });

  it('reuses the cached answer when you come back to a question', async () => {
    const { user, api } = renderApp(sessionUrl);
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    await screen.findByText('Direct answer to: What is a closure in JavaScript?');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(screen.getByRole('button', { name: /Previous/ }));
    await screen.findByText('Direct answer to: What is a closure in JavaScript?');
    expect(api.calls.filter((c) => c.path === '/ai/answer')).toHaveLength(1);
  });

  it('explains clearly when AI is not configured on the server', async () => {
    const api = createFakeApi();
    api.seedSignedInUser();
    api.setAiConfigured(false);
    const { user } = renderApp(sessionUrl, { api });
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AI is not set up yet');
    expect(alert).toHaveTextContent('OPENAI_API_KEY');
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument(); // retrying can't help
  });

  it('offers a retry for temporary AI failures', async () => {
    const api = createFakeApi();
    api.seedSignedInUser();
    api.failRoute('POST /ai/answer', 503, { success: false, error: { code: 'AI_BUSY', message: 'The AI service is busy right now.' } });
    const { user } = renderApp(sessionUrl, { api });
    await user.click(await screen.findByRole('button', { name: /Show answer/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't get an answer");
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('AI Tools page', () => {
  it('explains a concept', async () => {
    const { user } = renderApp('/tools?tab=explain');
    await user.click(await screen.findByRole('button', { name: /Explain/ }));
    expect(await screen.findByText('Enter a concept to explain')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Concept'), 'event loop');
    await user.click(screen.getByRole('button', { name: /Explain/ }));
    expect(await screen.findByText('event loop is like a restaurant kitchen.')).toBeInTheDocument();
    expect(screen.getByText('Second key point')).toBeInTheDocument();
  });

  it('reviews code and shows issues with a fix', async () => {
    const { user } = renderApp('/tools?tab=code');
    await user.click(await screen.findByLabelText('Code'));
    await user.paste('function sum(a){\n  for (let i=0;i<=a.length;i++) {}\n}');
    await user.click(screen.getByRole('button', { name: /Analyse/ }));
    const issues = await screen.findByRole('list', { name: 'Issues found' });
    expect(within(issues).getByText('Off-by-one error')).toBeInTheDocument();
    expect(within(issues).getByText('line 2')).toBeInTheDocument();
    expect(screen.getByText('Improved version')).toBeInTheDocument();
  });

  it('warns at the top of the page when AI is not configured', async () => {
    const api = createFakeApi();
    api.seedSignedInUser();
    api.setAiConfigured(false);
    renderApp('/tools', { api });
    expect(await screen.findByText('AI is not set up on this server yet.')).toBeInTheDocument();
  });

  it('is reachable from the sidebar', async () => {
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'AI Tools' }));
    expect(router.state.location.pathname).toBe('/tools');
  });
});

describe('AI-generated practice questions', () => {
  it('generates questions into "Your questions"', async () => {
    const { user, api } = renderApp('/practice');
    await user.click(await screen.findByRole('button', { name: /Generate with AI/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate practice questions' });

    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose a category');

    await user.click(within(dialog).getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'CSS' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Hard' }));
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Added 2 new questions to your bank')).toBeInTheDocument();
    const mine = await screen.findByRole('list', { name: 'Your questions' });
    expect(within(mine).getByText('AI question 1 about css?')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.calls.find((c) => c.path === '/questions/generate')?.body).toEqual({ categorySlug: 'css', difficulty: 'hard', count: 5 }),
    );
  });
});
