import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Validated request input, populated by the `validate` middleware. */
    valid: { body: unknown; query: unknown; params: unknown };
    /** Authenticated user, set by `requireAuth`. */
    user?: { id: string; role: 'user' | 'admin'; sessionId: string };
  }
}
