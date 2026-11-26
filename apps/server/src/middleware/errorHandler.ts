import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiError as ApiErrorBody } from '@aia/shared';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

/** Convert any thrown value into an ApiError so the response shape is always consistent. */
function normalize(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.validation(err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.validation(
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000) {
    const keys = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    return ApiError.conflict(keys.length ? `${keys.join(', ')} already exists` : undefined);
  }
  // Upload bigger than the route allows (express.raw / express.json limit)
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'That upload is too large.');
  }
  // express.json() parse failures
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    return ApiError.badRequest('Malformed JSON body');
  }

  const status = (err as { status?: number })?.status;
  if (status && status >= 400 && status < 500) {
    return new ApiError(status, 'BAD_REQUEST', (err as Error).message);
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const apiError = normalize(err);
  const requestId = req.id as string | undefined;

  if (apiError.statusCode >= 500) {
    logger.error({ err, requestId, path: req.originalUrl }, 'Unhandled error');
  }

  const body: ApiErrorBody = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
  // Expose stack traces only outside production to help debugging.
  if (!isProd && apiError.statusCode >= 500 && err instanceof Error) {
    (body.error as Record<string, unknown>).stack = err.stack;
  }
  res.status(apiError.statusCode).json(body);
};
