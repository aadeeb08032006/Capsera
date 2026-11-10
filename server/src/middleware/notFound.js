import { sendError } from '../shared/response.js';

export function notFoundHandler(req, res) {
  return sendError(
    res,
    {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    404,
  );
}

