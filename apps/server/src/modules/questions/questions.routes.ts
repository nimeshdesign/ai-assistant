import { Router } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import {
  createQuestionSchema,
  idParamSchema,
  practiceQuerySchema,
  questionListQuerySchema,
  questionSearchQuerySchema,
  type CategoryView,
  type QuestionSummary,
} from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { InterviewQuestionModel, QuestionCategoryModel } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/http.js';

export const categoriesRouter = Router();
export const questionsRouter = Router();
categoriesRouter.use(requireAuth);
questionsRouter.use(requireAuth);

/** Questions a user may see: the global bank plus their own. */
const visibleTo = (userId: string) => ({
  $or: [{ createdBy: null, isPublic: true }, { createdBy: new Types.ObjectId(userId) }],
});

async function slugMaps() {
  const cats = await QuestionCategoryModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return {
    cats,
    idBySlug: new Map(cats.map((c) => [c.slug, c._id])),
    slugById: new Map(cats.map((c) => [String(c._id), c.slug])),
  };
}

type QuestionDoc = {
  _id: unknown;
  categoryId: unknown;
  question: string;
  difficulty: string;
  type: string;
  tags?: string[];
  createdBy?: unknown;
};

function toSummary(q: QuestionDoc, slugById: Map<string, string>, userId: string): QuestionSummary {
  return {
    id: String(q._id),
    categorySlug: slugById.get(String(q.categoryId)) ?? 'unknown',
    question: q.question,
    difficulty: q.difficulty as QuestionSummary['difficulty'],
    type: q.type as QuestionSummary['type'],
    tags: q.tags ?? [],
    isOwn: q.createdBy != null && String(q.createdBy) === userId,
  };
}

function categoryIdsFor(slugs: string[], idBySlug: Map<string, unknown>) {
  const unknown = slugs.filter((s) => !idBySlug.has(s));
  if (unknown.length) throw ApiError.validation([{ path: 'categories', message: `Unknown category: ${unknown.join(', ')}` }]);
  return slugs.map((s) => idBySlug.get(s));
}

// ---------- GET /categories ----------
categoriesRouter.get('/', async (req, res) => {
  const { cats } = await slugMaps();
  const counts = await InterviewQuestionModel.aggregate<{ _id: unknown; n: number }>([
    { $match: visibleTo(req.user!.id) },
    { $group: { _id: '$categoryId', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  const data: CategoryView[] = cats.map((c) => ({
    id: String(c._id),
    slug: c.slug,
    name: c.name,
    group: c.group as CategoryView['group'],
    icon: c.icon ?? 'Tag',
    description: c.description ?? '',
    questionCount: byId.get(String(c._id)) ?? 0,
  }));
  sendSuccess(res, data);
});

// ---------- GET /questions (paginated list) ----------
questionsRouter.get('/', async (req, res) => {
  const q = questionListQuerySchema.parse(req.query);
  const userId = req.user!.id;
  const { idBySlug, slugById } = await slugMaps();

  const filter: Record<string, unknown> = q.mine ? { createdBy: new Types.ObjectId(userId) } : visibleTo(userId);
  if (q.categories?.length) filter.categoryId = { $in: categoryIdsFor(q.categories, idBySlug) };
  if (q.difficulty) filter.difficulty = q.difficulty;
  if (q.type) filter.type = q.type;

  const [items, total] = await Promise.all([
    InterviewQuestionModel.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    InterviewQuestionModel.countDocuments(filter),
  ]);
  sendSuccess(
    res,
    items.map((i) => toSummary(i, slugById, userId)),
    200,
    { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  );
});

// ---------- GET /questions/practice (random set for a session) ----------
questionsRouter.get('/practice', async (req, res) => {
  const q = practiceQuerySchema.parse(req.query);
  const userId = req.user!.id;
  const { idBySlug, slugById } = await slugMaps();

  const match: Record<string, unknown> = {
    ...visibleTo(userId),
    categoryId: { $in: categoryIdsFor(q.categories, idBySlug) },
  };
  if (q.difficulty !== 'mixed') match.difficulty = q.difficulty;

  // The focused question (opened from search/recommendations) always comes first.
  let first: QuestionDoc | null = null;
  if (q.focus) {
    first = await InterviewQuestionModel.findOne({ _id: q.focus, ...visibleTo(userId) }).lean();
    if (!first) throw ApiError.notFound('Question not found');
  }

  const pipeline: PipelineStage[] = [
    { $match: first ? { ...match, _id: { $ne: first._id } } : match },
    { $sample: { size: first ? q.count - 1 : q.count } },
  ];
  const rest = q.count - (first ? 1 : 0) > 0 ? await InterviewQuestionModel.aggregate<QuestionDoc>(pipeline) : [];
  const all = first ? [first, ...rest] : rest;
  sendSuccess(res, all.map((d) => toSummary(d, slugById, userId)));
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- GET /questions/search ----------
questionsRouter.get('/search', async (req, res) => {
  const { q, limit } = questionSearchQuerySchema.parse(req.query);
  const userId = req.user!.id;
  const { slugById } = await slugMaps();

  // Full-text search ranks whole-word matches (with stemming: "closures" finds "closure")…
  const ranked = await InterviewQuestionModel.find(
    { $text: { $search: q }, ...visibleTo(userId) },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();

  // …and a prefix/substring fallback catches partial words as the user types ("clos").
  let results = ranked;
  if (results.length < limit) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    const extra = await InterviewQuestionModel.find({
      ...visibleTo(userId),
      _id: { $nin: ranked.map((r) => r._id) },
      $and: [{ $or: [{ question: pattern }, { tags: pattern }] }],
    })
      .limit(limit - results.length)
      .lean();
    results = [...ranked, ...extra];
  }
  sendSuccess(res, results.map((d) => toSummary(d, slugById, userId)));
});

// ---------- GET /questions/:id ----------
questionsRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const userId = req.user!.id;
  const doc = await InterviewQuestionModel.findOne({ _id: id, ...visibleTo(userId) }).lean();
  if (!doc) throw ApiError.notFound('Question not found');
  const { slugById } = await slugMaps();
  sendSuccess(res, { ...toSummary(doc, slugById, userId), createdAt: doc.createdAt.toISOString() });
});

// ---------- POST /questions (a user's own question) ----------
questionsRouter.post('/', async (req, res) => {
  const input = createQuestionSchema.parse(req.body);
  const userId = req.user!.id;
  const { idBySlug, slugById } = await slugMaps();
  const categoryId = idBySlug.get(input.categorySlug);
  if (!categoryId) throw ApiError.validation([{ path: 'categorySlug', message: 'Choose a valid category' }]);

  try {
    const doc = await InterviewQuestionModel.create({
      categoryId,
      question: input.question,
      difficulty: input.difficulty,
      type: input.type,
      tags: input.tags,
      source: 'user',
      createdBy: userId,
      isPublic: false, // private to its author
    });
    // Raw document (skip the toJSON transform, which renames _id to id).
    sendSuccess(res, toSummary(doc.toObject({ transform: false }) as QuestionDoc, slugById, userId), 201);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw ApiError.conflict('You have already added this question');
    }
    throw err;
  }
});

// ---------- DELETE /questions/:id (own questions only) ----------
questionsRouter.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const result = await InterviewQuestionModel.deleteOne({ _id: id, createdBy: req.user!.id });
  if (result.deletedCount === 0) throw ApiError.notFound('Question not found');
  res.status(204).end();
});
