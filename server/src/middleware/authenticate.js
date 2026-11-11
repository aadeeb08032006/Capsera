import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { executeQuery } from '../config/db.js';
import { AppError } from '../shared/AppError.js';
import { asyncHandler } from '../shared/asyncHandler.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication token required');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication token required');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired authentication token');
  }

  if (!decoded || !decoded.sub) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid authentication token payload');
  }

  const result = await executeQuery(
    'SELECT id, full_name, email, role, status FROM users WHERE id = $1',
    [decoded.sub],
  );

  if (!result || !result.rows || result.rows.length === 0) {
    throw new AppError(401, 'UNAUTHENTICATED', 'User not found');
  }

  const row = result.rows[0];

  if (row.status === 'PENDING') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Your account is pending administrator approval');
  }
  if (row.status === 'REJECTED') {
    throw new AppError(403, 'ACCOUNT_REJECTED', 'Your account registration was rejected');
  }
  if (row.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended');
  }
  if (row.status !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'Your account is not active');
  }

  req.user = {
    id: String(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
  };

  next();
});

export default authenticate;
