import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@aia/shared';

/** Send a success response using the shared `{ success, data, meta }` envelope. */
export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: PaginationMeta) {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(status).json(body);
}
