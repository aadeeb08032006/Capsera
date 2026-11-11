import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-middleware-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import { executeQuery } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { requireRole } from '../src/middleware/requireRole.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/test/protected', authenticate, (req, res) => {
    res.status(200).json({ success: true, user: req.user });
  });

  app.get('/test/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
    res.status(200).json({ success: true, user: req.user });
  });

  app.use(errorHandler);
  return app;
}

describe('Auth Middleware', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests with no token (401 UNAUTHENTICATED)', async () => {
    const res = await request(app).get('/test/protected');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests with malformed token (401 UNAUTHENTICATED)', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer malformed.invalid.token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests with expired token (401 UNAUTHENTICATED)', async () => {
    const expiredToken = jwt.sign({ sub: '10' }, env.jwtSecret, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects PENDING user (403 ACCOUNT_PENDING)', async () => {
    const token = jwt.sign({ sub: '20' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 20,
          full_name: 'Pending Trainee',
          email: 'pending@example.com',
          role: 'TRAINEE',
          status: 'PENDING',
        },
      ],
    });

    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_PENDING');
  });

  it('rejects SUSPENDED user (403 ACCOUNT_SUSPENDED)', async () => {
    const token = jwt.sign({ sub: '30' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 30,
          full_name: 'Suspended Trainer',
          email: 'suspended@example.com',
          role: 'TRAINER',
          status: 'SUSPENDED',
        },
      ],
    });

    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects user with wrong role (403 FORBIDDEN)', async () => {
    const token = jwt.sign({ sub: '40' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 40,
          full_name: 'Active Trainee',
          email: 'trainee@example.com',
          role: 'TRAINEE',
          status: 'ACTIVE',
        },
      ],
    });

    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows valid ACTIVE ADMIN through protected and role-guarded routes (200 OK)', async () => {
    const token = jwt.sign({ sub: '50' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 50,
          full_name: 'System Admin',
          email: 'admin@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      ],
    });

    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      id: '50',
      fullName: 'System Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });
});
