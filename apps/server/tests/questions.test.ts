import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORY_CATALOG } from '@aia/shared';
import { QUESTION_BANK } from '@aia/shared/seed';
import { InterviewQuestionModel, QuestionCategoryModel } from '../src/models/index.js';
import { seedDatabase, seedIfEmpty } from '../src/seed/seed.js';
import { makeClient, registerUser } from './helpers.js';

async function signedIn(email = 'asha@example.com') {
  const agent = makeClient();
  const { token } = await registerUser(agent, { email });
  return { agent, auth: { Authorization: `Bearer ${token}` } };
}

describe('seeding', () => {
  it('loads every category and question, and is idempotent', async () => {
    const first = await seedDatabase();
    expect(first.categories.total).toBe(CATEGORY_CATALOG.length);
    expect(first.questions.inserted).toBe(QUESTION_BANK.length);
    expect(await QuestionCategoryModel.countDocuments()).toBe(CATEGORY_CATALOG.length);
    expect(await InterviewQuestionModel.countDocuments()).toBe(QUESTION_BANK.length);

    const second = await seedDatabase();
    expect(second.categories.upserted).toBe(0);
    expect(second.questions.inserted).toBe(0);
    expect(await InterviewQuestionModel.countDocuments()).toBe(QUESTION_BANK.length);

    const react = await QuestionCategoryModel.findOne({ slug: 'react' });
    expect(react!.questionCount).toBe(QUESTION_BANK.filter((q) => q.category === 'react').length);
  });

  it('seedIfEmpty only runs on a fresh database', async () => {
    expect(await seedIfEmpty()).toBe(true);
    expect(await seedIfEmpty()).toBe(false);
  });

  it('gives every category at least 6 questions', () => {
    for (const c of CATEGORY_CATALOG) {
      expect(QUESTION_BANK.filter((q) => q.category === c.slug).length, c.slug).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('question API', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it('requires authentication', async () => {
    const agent = makeClient();
    expect((await agent.get('/api/v1/categories')).status).toBe(401);
    expect((await agent.get('/api/v1/questions/practice?categories=react')).status).toBe(401);
  });

  it('GET /categories lists all categories in catalogue order with counts', async () => {
    const { agent, auth } = await signedIn();
    const res = await agent.get('/api/v1/categories').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual(CATEGORY_CATALOG.map((c) => c.slug));
    const css = res.body.data.find((c: { slug: string }) => c.slug === 'css');
    expect(css).toMatchObject({ name: 'CSS', group: 'frontend', icon: 'Palette', questionCount: 6 });
  });

  describe('GET /questions/practice', () => {
    it('returns a random set from the chosen categories and difficulty', async () => {
      const { agent, auth } = await signedIn();
      const res = await agent.get('/api/v1/questions/practice?categories=react,css&difficulty=easy&count=20').set(auth);
      expect(res.status).toBe(200);
      const expected = QUESTION_BANK.filter((q) => ['react', 'css'].includes(q.category) && q.difficulty === 'easy');
      expect(res.body.data).toHaveLength(expected.length);
      for (const q of res.body.data) {
        expect(['react', 'css']).toContain(q.categorySlug);
        expect(q.difficulty).toBe('easy');
        expect(q.id).toMatch(/^[a-f0-9]{24}$/);
      }
    });

    it('limits to count and puts the focused question first', async () => {
      const { agent, auth } = await signedIn();
      const focus = await InterviewQuestionModel.findOne({ question: 'What is a closure in JavaScript?' });
      const res = await agent.get(`/api/v1/questions/practice?categories=javascript&count=3&focus=${focus!.id}`).set(auth);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].question).toBe('What is a closure in JavaScript?');
      expect(new Set(res.body.data.map((q: { id: string }) => q.id)).size).toBe(3);
    });

    it.each([
      ['categories=', 'categories'],
      ['categories=cobol', 'categories'],
      ['categories=react&count=99', 'count'],
      ['categories=react&difficulty=impossible', 'difficulty'],
      ['categories=react&focus=q006', 'focus'],
    ])('validates %s', async (qs, path) => {
      const { agent, auth } = await signedIn();
      const res = await agent.get(`/api/v1/questions/practice?${qs}`).set(auth);
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: { path: string }) => d.path === path)).toBe(true);
    });
  });

  describe('GET /questions/search', () => {
    it('finds whole words with stemming and partial words as you type', async () => {
      const { agent, auth } = await signedIn();
      const stemmed = await agent.get('/api/v1/questions/search?q=closures').set(auth);
      expect(stemmed.body.data[0].question).toBe('What is a closure in JavaScript?');

      const partial = await agent.get('/api/v1/questions/search?q=clos').set(auth);
      expect(partial.body.data.map((q: { question: string }) => q.question)).toContain('What is a closure in JavaScript?');

      const byTag = await agent.get('/api/v1/questions/search?q=jwt').set(auth);
      expect(byTag.body.data.map((q: { question: string }) => q.question)).toContain('How does JWT authentication work?');
    });

    it('treats regex characters literally and validates length', async () => {
      const { agent, auth } = await signedIn();
      expect((await agent.get('/api/v1/questions/search?q=.*').set(auth)).body.data).toEqual([]);
      expect((await agent.get('/api/v1/questions/search?q=a').set(auth)).status).toBe(422);
    });
  });

  it('GET /questions paginates and filters', async () => {
    const { agent, auth } = await signedIn();
    const res = await agent.get('/api/v1/questions?categories=hr&limit=4&page=2').set(auth);
    expect(res.body.meta).toEqual({ page: 2, limit: 4, total: 6, totalPages: 2 });
    expect(res.body.data).toHaveLength(2);
  });

  describe('user questions', () => {
    it('lets a user add a private question that only they can see and delete', async () => {
      const asha = await signedIn('asha@example.com');
      const ravi = await signedIn('ravi@example.com');

      const created = await asha.agent
        .post('/api/v1/questions')
        .set(asha.auth)
        .send({ categorySlug: 'react', question: 'How does React Suspense work with data fetching?', difficulty: 'hard', tags: ['Suspense'] });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ categorySlug: 'react', difficulty: 'hard', isOwn: true, tags: ['suspense'] });
      const id = created.body.data.id;

      // Visible to the author: in practice sets, search, counts and "mine"
      const search = await asha.agent.get('/api/v1/questions/search?q=suspense').set(asha.auth);
      expect(search.body.data.map((q: { id: string }) => q.id)).toContain(id);
      const mine = await asha.agent.get('/api/v1/questions?mine=true').set(asha.auth);
      expect(mine.body.data.map((q: { id: string }) => q.id)).toEqual([id]);
      const cats = await asha.agent.get('/api/v1/categories').set(asha.auth);
      expect(cats.body.data.find((c: { slug: string }) => c.slug === 'react').questionCount).toBe(7);

      // Invisible to everyone else
      expect((await ravi.agent.get(`/api/v1/questions/${id}`).set(ravi.auth)).status).toBe(404);
      expect((await ravi.agent.get('/api/v1/questions/search?q=suspense').set(ravi.auth)).body.data).toEqual([]);
      expect((await ravi.agent.get(`/api/v1/questions/practice?categories=react&focus=${id}`).set(ravi.auth)).status).toBe(404);
      const raviCats = await ravi.agent.get('/api/v1/categories').set(ravi.auth);
      expect(raviCats.body.data.find((c: { slug: string }) => c.slug === 'react').questionCount).toBe(6);

      // Only the author can delete it; seeded questions can't be deleted by anyone
      expect((await ravi.agent.delete(`/api/v1/questions/${id}`).set(ravi.auth)).status).toBe(404);
      const seeded = await InterviewQuestionModel.findOne({ createdBy: null });
      expect((await asha.agent.delete(`/api/v1/questions/${seeded!.id}`).set(asha.auth)).status).toBe(404);
      expect((await asha.agent.delete(`/api/v1/questions/${id}`).set(asha.auth)).status).toBe(204);
      expect(await InterviewQuestionModel.exists({ _id: id })).toBeNull();
    });

    it('rejects duplicates, bad categories and short questions', async () => {
      const { agent, auth } = await signedIn();
      const body = { categorySlug: 'css', question: 'How do container queries work in CSS?' };
      expect((await agent.post('/api/v1/questions').set(auth).send(body)).status).toBe(201);
      expect((await agent.post('/api/v1/questions').set(auth).send({ ...body, question: '  how do CONTAINER queries work in css ' })).status).toBe(409);
      expect((await agent.post('/api/v1/questions').set(auth).send({ ...body, categorySlug: 'cobol' })).status).toBe(422);
      expect((await agent.post('/api/v1/questions').set(auth).send({ ...body, question: 'Why?' })).status).toBe(422);
      expect((await agent.post('/api/v1/questions').set(auth).send({ ...body, createdBy: null })).status).toBe(422);
    });
  });
});
