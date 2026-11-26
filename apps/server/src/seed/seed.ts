import { createHash } from 'node:crypto';
import { CATEGORY_CATALOG, normalizeQuestionText } from '@aia/shared';
import { QUESTION_BANK } from '@aia/shared/seed';
import { InterviewQuestionModel, QuestionCategoryModel } from '../models/index.js';
import { logger } from '../utils/logger.js';

export interface SeedResult {
  categories: { upserted: number; total: number };
  questions: { inserted: number; updated: number; total: number };
}

const hashOf = (q: string) => createHash('sha256').update(normalizeQuestionText(q)).digest('hex');

/**
 * Idempotent seed: categories are upserted by slug, global questions by content hash.
 * Safe to run any number of times; user-created questions are never touched.
 */
export async function seedDatabase(): Promise<SeedResult> {
  // Automatic timestamps would touch `updatedAt` on every run and make every document count
  // as "modified". We disable them for the seed and set timestamps on insert ourselves, so the
  // reported counts reflect real content changes only.
  const now = new Date();
  const onInsert = { createdAt: now, updatedAt: now };
  const catOps = CATEGORY_CATALOG.map((c, order) => ({
    updateOne: {
      filter: { slug: c.slug },
      update: {
        $set: { name: c.name, group: c.group, icon: c.icon, description: c.description, order, isActive: true },
        $setOnInsert: onInsert,
      },
      upsert: true,
    },
  }));
  const catRes = await QuestionCategoryModel.bulkWrite(catOps, { timestamps: false });

  const categories = await QuestionCategoryModel.find({}, { slug: 1 }).lean();
  const idBySlug = new Map(categories.map((c) => [c.slug, c._id]));

  const qOps = QUESTION_BANK.map((q) => {
    const categoryId = idBySlug.get(q.category);
    if (!categoryId) throw new Error(`Seed question references unknown category "${q.category}"`);
    return {
      updateOne: {
        filter: { contentHash: hashOf(q.question), createdBy: null },
        update: {
          $set: { categoryId, question: q.question, difficulty: q.difficulty, type: q.type, tags: q.tags, isPublic: true },
          $setOnInsert: { source: 'seed', createdBy: null, timesAsked: 0, contentHash: hashOf(q.question), ...onInsert },
        },
        upsert: true,
      },
    };
  });
  const qRes = await InterviewQuestionModel.bulkWrite(qOps, { timestamps: false });

  await refreshCategoryCounts();

  const result: SeedResult = {
    categories: { upserted: catRes.upsertedCount, total: CATEGORY_CATALOG.length },
    questions: { inserted: qRes.upsertedCount, updated: qRes.modifiedCount, total: QUESTION_BANK.length },
  };
  logger.info(result, 'Seed complete');
  return result;
}

/** Keep the denormalised `questionCount` (global questions only) in sync. */
export async function refreshCategoryCounts() {
  const counts = await InterviewQuestionModel.aggregate<{ _id: unknown; n: number }>([
    { $match: { createdBy: null, isPublic: true } },
    { $group: { _id: '$categoryId', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  const cats = await QuestionCategoryModel.find({}, { _id: 1 }).lean();
  await QuestionCategoryModel.bulkWrite(
    cats.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { questionCount: byId.get(String(c._id)) ?? 0 } } } })),
    { timestamps: false },
  );
}

/** Seed on startup only when the database has no categories yet (fresh install). */
export async function seedIfEmpty(): Promise<boolean> {
  if (await QuestionCategoryModel.exists({})) return false;
  logger.info('Empty question bank — seeding categories and starter questions');
  await seedDatabase();
  return true;
}
