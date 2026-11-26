import { z } from 'zod';
import { SESSION_TYPES } from './constants.js';

/*
 * History and dashboard (Phase 10): query schemas and the pure date maths shared by the API
 * and the tests. Dates are bucketed in the user's own time zone (sent as a UTC offset).
 */

export const historyQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  type: z.enum([...SESSION_TYPES, 'all']).default('all'),
  bookmarked: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const historyClearQuerySchema = z.strictObject({
  type: z.enum([...SESSION_TYPES, 'all']).default('all'),
});

export const bookmarkSchema = z.strictObject({ isBookmarked: z.boolean() });

/** Minutes to ADD to UTC to get local time (the negation of `Date#getTimezoneOffset()`). */
export const dashboardQuerySchema = z.strictObject({
  tzOffset: z.coerce.number().int().min(-14 * 60).max(14 * 60).default(0),
});

const DAY = 24 * 60 * 60 * 1000;

/** Local calendar day number (days since epoch in the user's time zone). */
export function localDay(date: Date, tzOffsetMin: number): number {
  return Math.floor((date.getTime() + tzOffsetMin * 60_000) / DAY);
}

/** Start of the local ISO week (Monday 00:00 local), as a UTC instant. */
export function localWeekStart(date: Date, tzOffsetMin: number): Date {
  const day = localDay(date, tzOffsetMin);
  const weekday = (new Date(day * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return new Date((day - weekday) * DAY - tzOffsetMin * 60_000);
}

/** "YYYY-MM-DD" of a local week start (for chart labels). */
export function weekLabel(weekStart: Date, tzOffsetMin: number): string {
  return new Date(weekStart.getTime() + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/**
 * Consecutive local days with activity, ending today — or yesterday, so a streak isn't
 * "lost" before the user has had a chance to practise today.
 */
export function streakDays(activity: Date[], now: Date, tzOffsetMin: number): number {
  const days = new Set(activity.map((d) => localDay(d, tzOffsetMin)));
  const today = localDay(now, tzOffsetMin);
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day--;
  }
  return streak;
}

/** Escape user text for use inside a RegExp (history search is a literal, case-insensitive match). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
