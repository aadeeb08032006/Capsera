import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-skills-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery } from '../src/config/db.js';
import { findAllSkills } from '../src/modules/competency/skills.repository.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '40',
  fullName = 'Active Trainee',
  email = 'trainee@example.com',
  role = 'TRAINEE',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeSkillRow(overrides = {}) {
  return {
    id: '1',
    name: 'Node.js',
    category: 'Backend',
    createdAt: new Date('2026-11-03T09:00:00.000Z'),
    ...overrides,
  };
}

describe('Skills API (GET /api/v1/skills)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth & Active Status Guards', () => {
    it('rejects unauthenticated requests (401 UNAUTHENTICATED)', async () => {
      const res = await request(app).get('/api/v1/skills');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication token required',
        },
      });
    });

    it('rejects PENDING users (403 ACCOUNT_PENDING)', async () => {
      mockAuthUser({ id: '91', status: 'PENDING' });

      const res = await request(app)
        .get('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('91')}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING');
    });

    it('rejects SUSPENDED users (403 ACCOUNT_SUSPENDED)', async () => {
      mockAuthUser({ id: '92', role: 'TRAINER', status: 'SUSPENDED' });

      const res = await request(app)
        .get('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('92')}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('allows any ACTIVE role (TRAINEE, TRAINER, ADMIN) to list skills', async () => {
      for (const role of ['TRAINEE', 'TRAINER', 'ADMIN']) {
        mockAuthUser({ id: '10', role, status: 'ACTIVE' });
        executeQuery.mockResolvedValueOnce({ rows: [{ totalItems: 0 }] });

        const res = await request(app)
          .get('/api/v1/skills')
          .set('Authorization', `Bearer ${makeToken('10')}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('Pagination, Filtering & Ordering', () => {
    it('uses default pagination (page=1, pageSize=20) and alphabetical ordering', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      executeQuery
        .mockResolvedValueOnce({ rows: [{ totalItems: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            makeSkillRow({ id: 1, name: 'Express.js', category: 'Backend' }),
            makeSkillRow({ id: 2, name: 'PostgreSQL', category: 'Database' }),
          ],
        });

      const res = await request(app)
        .get('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          items: [
            {
              id: '1',
              name: 'Express.js',
              category: 'Backend',
              createdAt: '2026-11-03T09:00:00.000Z',
            },
            {
              id: '2',
              name: 'PostgreSQL',
              category: 'Database',
              createdAt: '2026-11-03T09:00:00.000Z',
            },
          ],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 2,
            totalPages: 1,
          },
        },
      });

      const countCall = executeQuery.mock.calls[1];
      expect(countCall[0]).toContain('COUNT(*)::int AS "totalItems"');
      expect(countCall[1]).toEqual([]);

      const listCall = executeQuery.mock.calls[2];
      expect(listCall[0]).toContain('ORDER BY LOWER(name) ASC, id ASC');
      expect(listCall[0]).toContain('LIMIT $1 OFFSET $2');
      expect(listCall[1]).toEqual([20, 0]);
    });

    it('applies exact category filter and custom pagination parameters', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      executeQuery
        .mockResolvedValueOnce({ rows: [{ totalItems: 12 }] })
        .mockResolvedValueOnce({
          rows: [
            makeSkillRow({ id: '7', name: 'Node.js', category: 'Backend' }),
            makeSkillRow({ id: '8', name: 'PostgreSQL', category: 'Backend' }),
          ],
        });

      const res = await request(app)
        .get('/api/v1/skills?category=%20Backend%20&page=2&pageSize=5')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination).toEqual({
        page: 2,
        pageSize: 5,
        totalItems: 12,
        totalPages: 3,
      });

      const countCall = executeQuery.mock.calls[1];
      expect(countCall[0]).toContain('WHERE category = $1');
      expect(countCall[1]).toEqual(['Backend']);

      const listCall = executeQuery.mock.calls[2];
      expect(listCall[0]).toContain('WHERE category = $1');
      expect(listCall[0]).toContain('LIMIT $2 OFFSET $3');
      expect(listCall[1]).toEqual(['Backend', 5, 5]);
    });

    it('returns empty items and totalPages=0 without querying rows when totalItems is 0', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [{ totalItems: 0 }] });

      const res = await request(app)
        .get('/api/v1/skills?category=NonExistent')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          items: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },
        },
      });
      // 1 auth query + 1 count query only
      expect(executeQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation & Error Handling', () => {
    it('rejects pageSize > 100, page < 1, negative, non-integer, and non-numeric pagination (400 VALIDATION_ERROR)', async () => {
      const invalidQueries = [
        'page=0&pageSize=101',
        'page=-1',
        'pageSize=-5',
        'page=1.5',
        'page=abc&pageSize=xyz',
      ];

      for (const query of invalidQueries) {
        mockAuthUser({ id: '40', role: 'TRAINEE' });

        const res = await request(app)
          .get(`/api/v1/skills?${query}`)
          .set('Authorization', `Bearer ${makeToken('40')}`);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects blank or oversized category filter (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });

      const blankRes = await request(app)
        .get('/api/v1/skills?category=%20%20%20')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(blankRes.status).toBe(400);
      expect(blankRes.body.error.code).toBe('VALIDATION_ERROR');

      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const longCategory = 'a'.repeat(121);
      const longRes = await request(app)
        .get(`/api/v1/skills?category=${longCategory}`)
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(longRes.status).toBe(400);
      expect(longRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('masks internal SQL errors behind 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      executeQuery.mockRejectedValueOnce(new Error('relation "skills" does not exist'));

      const res = await request(app)
        .get('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
    });
  });

  describe('Repository: findAllSkills()', () => {
    it('returns { items, totalItems } with default limit and offset', async () => {
      executeQuery
        .mockResolvedValueOnce({ rows: [{ totalItems: 1 }] })
        .mockResolvedValueOnce({ rows: [makeSkillRow()] });

      const result = await findAllSkills();

      expect(result).toEqual({
        items: [makeSkillRow()],
        totalItems: 1,
      });
      expect(executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [20, 0],
      );
    });
  });
});

