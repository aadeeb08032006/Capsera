import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { executeQuery } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/AppError.js';
import { mapUser } from './mapUser.js';

export { mapUser };

const dummyPasswordHash = await bcrypt.hash('capsera-auth-dummy-password', env.bcryptCost);

export async function signupUser({ fullName, email, password, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFullName = fullName.trim();
  const passwordHash = await bcrypt.hash(password, env.bcryptCost);

  try {
    const result = await executeQuery(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, status, created_at`,
      [normalizedFullName, normalizedEmail, passwordHash, role],
    );

    return mapUser(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email is already registered');
    }
    throw error;
  }
}

export async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await executeQuery(
    `SELECT id, full_name, email, password_hash, role, status, created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [normalizedEmail],
  );
  const user = result.rows[0];
  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const statusErrors = {
    PENDING: ['ACCOUNT_PENDING', 'Your account is pending administrator approval'],
    REJECTED: ['ACCOUNT_REJECTED', 'Your account registration was rejected'],
    SUSPENDED: ['ACCOUNT_SUSPENDED', 'Your account has been suspended'],
  };
  const statusError = statusErrors[user.status];
  if (statusError) {
    throw new AppError(403, statusError[0], statusError[1]);
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'Your account is not active');
  }

  return {
    token: jwt.sign({ sub: String(user.id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn }),
    expiresIn: 3600,
    user: mapUser(user),
  };
}
