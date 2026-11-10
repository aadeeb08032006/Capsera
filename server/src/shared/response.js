import { PAGINATION_DEFAULTS } from './constants.js';

/**
 * Canonical response helpers enforcing PRD Section 11.2 envelopes.
 */

export function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendPaginated(res, { items = [], page, pageSize, totalItems = 0 }, statusCode = 200) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || PAGINATION_DEFAULTS.PAGE);
  const safePageSize = Math.min(
    PAGINATION_DEFAULTS.MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSize, 10) || PAGINATION_DEFAULTS.PAGE_SIZE),
  );
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safePageSize);

  return res.status(statusCode).json({
    success: true,
    data: {
      items,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        totalItems,
        totalPages,
      },
    },
  });
}

export function sendError(res, { code = 'INTERNAL_ERROR', message = 'An unexpected error occurred' }, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

