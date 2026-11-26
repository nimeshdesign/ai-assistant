import { z } from 'zod';
import { CATEGORY_CATALOG, DIFFICULTIES, type PracticeQuery } from '@aia/shared';

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;
const slugs = new Set(CATEGORY_CATALOG.map((c) => c.slug));

export const practiceSchema = z.object({
  categories: z
    .array(z.string().refine((s) => slugs.has(s), 'Unknown category'))
    .min(1, 'Pick at least one category'),
  difficulty: z.enum([...DIFFICULTIES, 'mixed']),
  count: z.coerce.number().int().min(1).max(20),
  focus: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid question id').optional(),
});

export function toSearchParams(q: PracticeQuery & { focus?: string }) {
  const p = new URLSearchParams({
    categories: q.categories.join(','),
    difficulty: q.difficulty,
    count: String(q.count),
  });
  if (q.focus) p.set('focus', q.focus);
  return p;
}

/** Parse & validate practice options from the URL so sessions are linkable and refresh-safe. */
export function fromSearchParams(params: URLSearchParams): PracticeQuery | null {
  const parsed = practiceSchema.safeParse({
    categories: (params.get('categories') ?? '').split(',').filter(Boolean),
    difficulty: params.get('difficulty') ?? 'mixed',
    count: params.get('count') ?? 10,
    focus: params.get('focus') ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}
