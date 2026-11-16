import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { executeQuery } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'auth-rate-limit-tests-secret-at-least-32-chars';
  return { executeQuery: vi.fn() };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery,
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Authentication rate limiting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the standard RATE_LIMITED envelope for repeated change-password requests', async () => {
    const token = jwt.sign({ sub: '7' }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      executeQuery.mockResolvedValueOnce({ rows: [{
        id: 7,
        full_name: 'Active User',
        email: 'active@example.com',
        role: 'TRAINEE',
        status: 'ACTIVE',
      }] });
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'CurrentPass1', newPassword: 'weak' });
      expect(response.status).toBe(400);
    }

    const limited = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'CurrentPass1', newPassword: 'NewPassword2' });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    });
  });
});