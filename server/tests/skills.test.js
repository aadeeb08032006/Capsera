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
import { executeQuery, withTransaction } from '../src/config/db.js';
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

describe('Skills API (POST /api/v1/skills)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth, Active Status & Role Guards', () => {
    it('rejects missing or invalid JWT (401 UNAUTHENTICATED)', async () => {
      const missingRes = await request(app)
        .post('/api/v1/skills')
        .send({ name: 'Node.js', category: 'Backend' });

      expect(missingRes.status).toBe(401);
      expect(missingRes.body.error.code).toBe('UNAUTHENTICATED');

      const invalidRes = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ name: 'Node.js', category: 'Backend' });

      expect(invalidRes.status).toBe(401);
      expect(invalidRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-ACTIVE ADMIN users (403 ACCOUNT_PENDING / ACCOUNT_SUSPENDED / ACCOUNT_REJECTED)', async () => {
      const cases = [
        { status: 'PENDING', expectedCode: 'ACCOUNT_PENDING' },
        { status: 'SUSPENDED', expectedCode: 'ACCOUNT_SUSPENDED' },
        { status: 'REJECTED', expectedCode: 'ACCOUNT_REJECTED' },
      ];

      for (const { status, expectedCode } of cases) {
        mockAuthUser({ id: '50', role: 'ADMIN', status });

        const res = await request(app)
          .post('/api/v1/skills')
          .set('Authorization', `Bearer ${makeToken('50')}`)
          .send({ name: 'Node.js', category: 'Backend' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe(expectedCode);
      }
    });

    it('denies access to TRAINEE and TRAINER roles (403 FORBIDDEN)', async () => {
      for (const role of ['TRAINEE', 'TRAINER']) {
        mockAuthUser({ id: '25', role, status: 'ACTIVE' });

        const res = await request(app)
          .post('/api/v1/skills')
          .set('Authorization', `Bearer ${makeToken('25')}`)
          .send({ name: 'Node.js', category: 'Backend' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('Validation, Creation & Conflict Handling', () => {
    it('creates a skill for ACTIVE ADMIN, trims fields, and returns 201 with normalized DTO', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeSkillRow({
            id: 42,
            name: 'PostgreSQL',
            category: 'Database',
            createdAt: new Date('2026-11-13T01:45:00.000Z'),
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ name: '  PostgreSQL  ', category: '  Database  ' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: {
          skill: {
            id: '42',
            name: 'PostgreSQL',
            category: 'Database',
            createdAt: '2026-11-13T01:45:00.000Z',
          },
        },
      });

      const insertCall = executeQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO skills (name, category)');
      expect(insertCall[0]).toContain('VALUES ($1, $2)');
      expect(insertCall[1]).toEqual(['PostgreSQL', 'Database']);
    });

    it('rejects missing, blank, oversized, non-string, and unknown fields (400 VALIDATION_ERROR)', async () => {
      const invalidPayloads = [
        {},
        { name: 'Node.js' },
        { category: 'Backend' },
        { name: '   ', category: 'Backend' },
        { name: 'Node.js', category: '   ' },
        { name: 'a'.repeat(121), category: 'Backend' },
        { name: 'Node.js', category: 'b'.repeat(121) },
        { name: 123, category: 'Backend' },
        { name: 'Node.js', category: 'Backend', extraField: 'unexpected' },
      ];

      for (const payload of invalidPayloads) {
        mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });

        const res = await request(app)
          .post('/api/v1/skills')
          .set('Authorization', `Bearer ${makeToken('1')}`)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns 409 CONFLICT on duplicate or case-insensitive duplicate skill names (uq_skills_name_ci)', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const uniqueViolation = new Error(
        'duplicate key value violates unique constraint "uq_skills_name_ci"',
      );
      uniqueViolation.code = '23505';
      uniqueViolation.constraint = 'uq_skills_name_ci';
      executeQuery.mockRejectedValueOnce(uniqueViolation);

      const res = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ name: 'node.js', category: 'Backend' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A skill with this name already exists',
        },
      });
    });

    it('does not misclassify unrelated 23505 errors as skill-name conflict', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const otherUniqueViolation = new Error(
        'duplicate key value violates unique constraint "skills_pkey"',
      );
      otherUniqueViolation.code = '23505';
      otherUniqueViolation.constraint = 'skills_pkey';
      executeQuery.mockRejectedValueOnce(otherUniqueViolation);

      const res = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ name: 'Docker', category: 'DevOps' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
    });

    it('masks unexpected database errors behind 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

      const res = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ name: 'Docker', category: 'DevOps' });

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
});

describe('Trainee Skill Mapping API (PUT /api/v1/profiles/me/skills)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMockTransaction(mockClientQuery) {
    withTransaction.mockImplementation(async (work) => {
      const client = { query: mockClientQuery };
      return work(client);
    });
  }

  describe('Auth, Active Status & Role Guards', () => {
    it('rejects missing or invalid JWT (401 UNAUTHENTICATED)', async () => {
      const missingRes = await request(app)
        .put('/api/v1/profiles/me/skills')
        .send({ skills: [] });

      expect(missingRes.status).toBe(401);
      expect(missingRes.body.error.code).toBe('UNAUTHENTICATED');

      const invalidRes = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', 'Bearer bad.token.here')
        .send({ skills: [] });

      expect(invalidRes.status).toBe(401);
      expect(invalidRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-ACTIVE TRAINEE users (403 ACCOUNT_PENDING / ACCOUNT_SUSPENDED / ACCOUNT_REJECTED)', async () => {
      const cases = [
        { status: 'PENDING', expectedCode: 'ACCOUNT_PENDING' },
        { status: 'SUSPENDED', expectedCode: 'ACCOUNT_SUSPENDED' },
        { status: 'REJECTED', expectedCode: 'ACCOUNT_REJECTED' },
      ];

      for (const { status, expectedCode } of cases) {
        mockAuthUser({ id: '40', role: 'TRAINEE', status });

        const res = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${makeToken('40')}`)
          .send({ skills: [{ skillId: '1', proficiency: 2 }] });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(expectedCode);
      }
    });

    it('denies access to TRAINER and ADMIN roles (403 FORBIDDEN)', async () => {
      for (const role of ['TRAINER', 'ADMIN']) {
        mockAuthUser({ id: '15', role, status: 'ACTIVE' });

        const res = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${makeToken('15')}`)
          .send({ skills: [{ skillId: '1', proficiency: 2 }] });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('Validation & Ownership', () => {
    it('rejects duplicate skillId values (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({
          skills: [
            { skillId: '1', proficiency: 2 },
            { skillId: '1', proficiency: 3 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(withTransaction).not.toHaveBeenCalled();
    });

    it('rejects invalid proficiency, invalid BIGINT skillId, malformed payloads, and client-supplied traineeId', async () => {
      const invalidPayloads = [
        {},
        { skills: 'not-an-array' },
        { skills: [], traineeId: '999' },
        { skills: [{ skillId: '1', proficiency: 0 }] },
        { skills: [{ skillId: '1', proficiency: 5 }] },
        { skills: [{ skillId: '1', proficiency: 2.5 }] },
        { skills: [{ skillId: '1', proficiency: '3' }] },
        { skills: [{ skillId: '0', proficiency: 2 }] },
        { skills: [{ skillId: '-1', proficiency: 2 }] },
        { skills: [{ skillId: 'abc', proficiency: 2 }] },
        { skills: [{ skillId: '9999999999999999999', proficiency: 2 }] },
        { skills: [{ skillId: '1', proficiency: 2, extra: true }] },
      ];

      for (const payload of invalidPayloads) {
        mockAuthUser({ id: '40', role: 'TRAINEE' });

        const res = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${makeToken('40')}`)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Transactional Replace-All, Rollback & Concurrency', () => {
    it('replaces trainee skill mappings atomically using req.user.id and FOR UPDATE row lock', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 40 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { id: 101, skillId: 1, skillName: 'Node.js', category: 'Backend', proficiency: 3 },
            { id: 102, skillId: 2, skillName: 'PostgreSQL', category: 'Database', proficiency: 4 },
          ],
        });
      setupMockTransaction(clientQuery);

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({
          skills: [
            { skillId: '1', proficiency: 3 },
            { skillId: '2', proficiency: 4 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          skills: [
            { id: '101', skillId: '1', skillName: 'Node.js', category: 'Backend', proficiency: 3 },
            { id: '102', skillId: '2', skillName: 'PostgreSQL', category: 'Database', proficiency: 4 },
          ],
        },
      });

      expect(clientQuery).toHaveBeenNthCalledWith(
        1,
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        ['40'],
      );
      expect(clientQuery).toHaveBeenNthCalledWith(
        2,
        'SELECT id FROM skills WHERE id = ANY($1::bigint[])',
        [['1', '2']],
      );
      expect(clientQuery).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM trainee_skills WHERE trainee_id = $1',
        ['40'],
      );
      expect(clientQuery).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO trainee_skills (trainee_id, skill_id, proficiency)'),
        ['40', ['1', '2'], [3, 4]],
      );
    });

    it('updates proficiency via replace-all semantics', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: '40' }] })
        .mockResolvedValueOnce({ rows: [{ id: '1' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: '105', skillId: '1', skillName: 'Node.js', category: 'Backend', proficiency: 4 }],
        });
      setupMockTransaction(clientQuery);

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({ skills: [{ skillId: '1', proficiency: 4 }] });

      expect(res.status).toBe(200);
      expect(res.body.data.skills).toEqual([
        { id: '105', skillId: '1', skillName: 'Node.js', category: 'Backend', proficiency: 4 },
      ]);
    });

    it('clears all mappings when skills is an empty array []', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: '40' }] })
        .mockResolvedValueOnce({ rowCount: 2 });
      setupMockTransaction(clientQuery);

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({ skills: [] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { skills: [] },
      });
      expect(clientQuery).toHaveBeenCalledTimes(2);
      expect(clientQuery).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM trainee_skills WHERE trainee_id = $1',
        ['40'],
      );
    });

    it('returns 404 SKILL_NOT_FOUND and aborts before DELETE when any skillId does not exist', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: '40' }] })
        .mockResolvedValueOnce({ rows: [{ id: '1' }] });
      setupMockTransaction(clientQuery);

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({
          skills: [
            { skillId: '1', proficiency: 2 },
            { skillId: '999', proficiency: 3 },
          ],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SKILL_NOT_FOUND');
      expect(clientQuery).toHaveBeenCalledTimes(2);
    });

    it('rolls back cleanly and masks unexpected transaction errors behind 500', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: '40' }] })
        .mockResolvedValueOnce({ rows: [{ id: '1' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockRejectedValueOnce(new Error('deadlock detected'));
      setupMockTransaction(clientQuery);

      const res = await request(app)
        .put('/api/v1/profiles/me/skills')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({ skills: [{ skillId: '1', proficiency: 3 }] });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
    });

    it('serializes concurrent replacements for the same trainee without mixed results', async () => {
      // Simulate PostgreSQL FOR UPDATE row lock serializing two concurrent transactions
      let storedMappings = [];
      let lockQueue = Promise.resolve();

      withTransaction.mockImplementation(async (work) => {
        const release = lockQueue;
        let resolveNext;
        lockQueue = new Promise((r) => {
          resolveNext = r;
        });
        await release;

        try {
          const client = {
            query: vi.fn(async (sql, params) => {
              if (sql.includes('FOR UPDATE')) {
                return { rows: [{ id: params[0] }] };
              }
              if (sql.includes('FROM skills WHERE id = ANY')) {
                return { rows: params[0].map((id) => ({ id })) };
              }
              if (sql.startsWith('DELETE FROM trainee_skills')) {
                storedMappings = [];
                return { rowCount: 0 };
              }
              if (sql.includes('INSERT INTO trainee_skills')) {
                const [, skillIds, proficiencies] = params;
                storedMappings = skillIds.map((skillId, idx) => ({
                  id: String(idx + 1),
                  skillId,
                  skillName: `Skill ${skillId}`,
                  category: 'General',
                  proficiency: proficiencies[idx],
                }));
                return { rows: storedMappings };
              }
              return { rows: [] };
            }),
          };
          return await work(client);
        } finally {
          resolveNext();
        }
      });

      mockAuthUser({ id: '40', role: 'TRAINEE' });
      mockAuthUser({ id: '40', role: 'TRAINEE' });

      const [resA, resB] = await Promise.all([
        request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${makeToken('40')}`)
          .send({ skills: [{ skillId: '1', proficiency: 2 }] }),
        request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${makeToken('40')}`)
          .send({
            skills: [
              { skillId: '2', proficiency: 4 },
              { skillId: '3', proficiency: 1 },
            ],
          }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      // Final stored state matches the second serialized transaction cleanly, with no mixed rows
      expect(storedMappings).toEqual([
        { id: '1', skillId: '2', skillName: 'Skill 2', category: 'General', proficiency: 4 },
        { id: '2', skillId: '3', skillName: 'Skill 3', category: 'General', proficiency: 1 },
      ]);
    });
  });
});

