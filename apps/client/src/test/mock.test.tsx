import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from './fakeApi';
import { renderApp } from './utils';

const ANSWER = 'I am a frontend developer who loves building accessible interfaces with React.';

async function startInterview(user: ReturnType<typeof renderApp>['user'], { role = 'React Developer', topic = 'HR Interview Questions', count = '3' } = {}) {
  await user.click(await screen.findByRole('button', { name: role }));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('radio', { name: /Senior/ }));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: topic }));
  await user.click(screen.getByRole('radio', { name: count }));
  await user.click(screen.getByRole('button', { name: /Start interview/ }));
  expect(await screen.findByText(`Question 1 of ${count}`)).toBeInTheDocument();
}

describe('Mock interview flow', () => {
  it('runs setup → answers with AI feedback → stored report', async () => {
    const { user, router, api } = renderApp('/mock-interview');
    await startInterview(user);

    const interviewId = router.state.location.pathname.split('/')[2]!;
    expect(router.state.location.pathname).toBe(`/mock-interview/${interviewId}`);
    const started = api.calls.find((c) => c.method === 'POST' && c.path === '/mock-interviews');
    expect(started?.body).toEqual({ jobRole: 'React Developer', experienceLevel: 'senior', focusAreas: ['hr'], questionCount: 3 });
    // Senior candidates get the harder questions first.
    const first = api.mocks.get(interviewId)!.state.questions[0]!;
    expect(screen.getByRole('heading', { name: first.text })).toBeInTheDocument();
    expect(screen.queryByText(/Sample/)).not.toBeInTheDocument();

    // Too-short answers are rejected before anything is sent.
    await user.type(screen.getByLabelText('Your answer'), 'Hi');
    await user.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Write a little more/);
    expect(api.calls.some((c) => c.path.endsWith('/answers'))).toBe(false);

    await user.clear(screen.getByLabelText('Your answer'));
    await user.type(screen.getByLabelText('Your answer'), ANSWER);
    await user.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(await screen.findByText(`Feedback on your answer to: ${first.text}`)).toBeInTheDocument();
    expect(screen.getByText('Improved answer')).toBeInTheDocument();
    expect(screen.getByText('What went well')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.endsWith('/answers'))?.body).toEqual({ questionId: first.id, response: ANSWER, inputMode: 'text' });

    await user.click(screen.getByRole('button', { name: /Next question/ }));
    expect(await screen.findByText('Question 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Skip/ }));
    expect(await screen.findByText('Question 3 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /End interview/ }));
    await user.click(await screen.findByRole('button', { name: 'End interview' }));

    expect(await screen.findByRole('heading', { name: 'Performance report' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/mock-interview/${interviewId}/report`);
    expect(screen.getByText(/You answered 1 of 3 questions and skipped 1/)).toBeInTheDocument();
    expect(screen.getByText(/React Developer · Senior/)).toBeInTheDocument();
    expect(screen.getByText('Add a real-world example')).toBeInTheDocument();
    expect(api.mocks.get(interviewId)!.state.status).toBe('completed');
  });

  it('finishes with "See report" after the last question', async () => {
    const { user, router } = renderApp('/mock-interview');
    await startInterview(user, { count: '3' });
    for (let i = 1; i <= 3; i++) {
      await user.type(screen.getByLabelText('Your answer'), ANSWER);
      await user.click(screen.getByRole('button', { name: /Submit answer/ }));
      await user.click(await screen.findByRole('button', { name: i < 3 ? /Next question/ : /See report/ }));
    }
    expect(await screen.findByRole('heading', { name: 'Performance report' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/\/report$/);
    expect(screen.getByText(/You answered 3 of 3 questions\./)).toBeInTheDocument();
  });

  it('survives a reload: the unfinished interview can be resumed where it was left', async () => {
    const api = createFakeApi();
    const first = renderApp('/mock-interview', { api });
    await startInterview(first.user);
    await first.user.type(screen.getByLabelText('Your answer'), ANSWER);
    await first.user.click(screen.getByRole('button', { name: /Submit answer/ }));
    await screen.findByText('Improved answer');
    first.unmount();

    const { user, router } = renderApp('/mock-interview', { api });
    expect(await screen.findByText(/You have an unfinished interview/)).toHaveTextContent('1 of 3 answered');
    await user.click(screen.getByRole('link', { name: 'Resume' }));
    expect(await screen.findByText('Question 2 of 3')).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/mock-interview\/[a-f0-9]{24}$/);
  });

  it('keeps the draft and explains when AI is not set up', async () => {
    const api = createFakeApi();
    const { user } = renderApp('/mock-interview', { api });
    await startInterview(user);
    api.setAiConfigured(false);
    await user.type(screen.getByLabelText('Your answer'), ANSWER);
    await user.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(await screen.findByText(/AI features are not set up/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toHaveValue(ANSWER);
  });

  it('lists past interviews and deletes one after confirmation', async () => {
    const api = createFakeApi();
    const first = renderApp('/mock-interview', { api });
    await startInterview(first.user);
    await first.user.type(screen.getByLabelText('Your answer'), ANSWER);
    await first.user.click(screen.getByRole('button', { name: /Submit answer/ }));
    await first.user.click(await screen.findByRole('button', { name: /End interview/ }));
    await first.user.click(await screen.findByRole('button', { name: 'End interview' }));
    await screen.findByRole('heading', { name: 'Performance report' });
    first.unmount();

    const { user } = renderApp('/mock-interview', { api });
    const list = await screen.findByRole('list', { name: 'Past interviews' });
    expect(within(list).getByText('React Developer')).toBeInTheDocument();
    expect(within(list).getByText(/1 of 3 answered/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /View report/ })).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /Delete interview/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Past interviews' })).not.toBeInTheDocument());
    expect(api.mocks.size).toBe(0);
  });
});

describe('Mock interview routes', () => {
  it('sends the old room link back to setup', async () => {
    const { router } = renderApp('/mock-interview/room');
    await screen.findByRole('heading', { name: 'Mock Interview' });
    expect(router.state.location.pathname).toBe('/mock-interview');
  });

  it('shows a friendly message for an unknown interview', async () => {
    renderApp('/mock-interview/0000000000000000000000ff');
    expect(await screen.findByText('Interview not found')).toBeInTheDocument();
  });

  it('shows an empty state when there is no report yet', async () => {
    renderApp('/mock-interview/report');
    expect(await screen.findByText('No report yet')).toBeInTheDocument();
  });
});
