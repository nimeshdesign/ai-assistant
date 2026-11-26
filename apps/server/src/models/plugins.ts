import type { Schema } from 'mongoose';

/**
 * Shared serialisation: expose `id` instead of `_id`, drop `__v`,
 * and strip any field listed in `hidden` (e.g. password hashes).
 */
export function toJSONPlugin(schema: Schema, opts: { hidden?: string[] } = {}) {
  const hidden = opts.hidden ?? [];
  const transform = (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    for (const field of hidden) delete ret[field];
    return ret;
  };
  schema.set('toJSON', { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false, transform });
}

/** Compute a retention expiry date. `0` days means "keep forever". */
export function retentionExpiry(retentionDays: number | undefined, from = new Date()): Date | undefined {
  if (!retentionDays || retentionDays <= 0) return undefined;
  return new Date(from.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}
