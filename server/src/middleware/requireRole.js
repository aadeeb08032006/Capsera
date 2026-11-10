import { AppError } from '../shared/AppError.js';

/**
 * Middleware factory restricting access to users with specified role(s).
 *
 * @param {...string} roles - Permitted roles (e.g. 'ADMIN', 'TRAINER')
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  const allowedRoles = roles.flat();
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions for this resource'));
    }
    return next();
  };
}

export default requireRole;
