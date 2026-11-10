import { sendError } from '../shared/response.js';

/**
 * Global error handler enforcing PRD Section 11.2 & 11.3:
 * - Returns canonical error envelope
 * - Never leaks raw SQL statements or internal secrets in 500 responses
 */
export function errorHandler(err, _req, res, _next) {
  const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error('[CAPSERA API Error]:', err?.message || 'Unexpected error');
  }

  return sendError(
    res,
    {
      code: isServerError ? 'INTERNAL_SERVER_ERROR' : err?.code || 'REQUEST_ERROR',
      message: isServerError
        ? 'An unexpected server error occurred.'
        : err?.message || 'Request could not be processed.',
    },
    statusCode,
  );
}

