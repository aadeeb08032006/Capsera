import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-recommendations-tests-32-chars';
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

describe('GET /api/v1/trainers/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication, account status, and role authorization', () => {
    it('returns 401 UNAUTHENTICATED when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/trainers/recommendations?skillId=1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('returns 401 UNAUTHENTICATED when JWT token is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', 'Bearer not-a-valid-jwt');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it.each([
      ['PENDING', 'ACCOUNT_PENDING'],
      ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
      ['REJECTED', 'ACCOUNT_REJECTED'],
    ])('returns 403 %s when user status is %s', async (status, expectedCode) => {
      mockAuthUser({ id: '41', role: 'TRAINEE', status });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('41')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(expectedCode);
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('returns 403 FORBIDDEN for an ACTIVE TRAINER user', async () => {
      mockAuthUser({ id: '15', role: 'TRAINER', status: 'ACTIVE' });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('15')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('allows an ACTIVE TRAINEE user', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '1', name: 'Node.js', category: 'Backend' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 0 }],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows an ACTIVE ADMIN user', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '1', name: 'Node.js', category: 'Backend' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 0 }],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Query parameter validation', () => {
    it.each([
      ['missing skillId', '/api/v1/trainers/recommendations'],
      ['non-numeric skillId', '/api/v1/trainers/recommendations?skillId=abc'],
      ['zero skillId', '/api/v1/trainers/recommendations?skillId=0'],
      ['negative skillId', '/api/v1/trainers/recommendations?skillId=-5'],
      ['overflow BIGINT skillId', '/api/v1/trainers/recommendations?skillId=9223372036854775808'],
      ['zero page', '/api/v1/trainers/recommendations?skillId=1&page=0'],
      ['negative page', '/api/v1/trainers/recommendations?skillId=1&page=-1'],
      ['non-numeric page', '/api/v1/trainers/recommendations?skillId=1&page=two'],
      ['zero pageSize', '/api/v1/trainers/recommendations?skillId=1&pageSize=0'],
      ['pageSize above max (101)', '/api/v1/trainers/recommendations?skillId=1&pageSize=101'],
      ['non-numeric pageSize', '/api/v1/trainers/recommendations?skillId=1&pageSize=many'],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, url) => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });

      const res = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('Missing skill and empty match handling', () => {
    it('returns 404 SKILL_NOT_FOUND when canonical skillId does not exist', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=999')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SKILL_NOT_FOUND');
      expect(executeQuery).toHaveBeenCalledTimes(2);
    });

    it('returns empty items and totalPages 0 without running the row query when totalItems is 0', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: 7, name: 'Rust', category: 'Systems' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 0 }],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=7')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          skill: {
            id: '7',
            name: 'Rust',
            category: 'Systems',
          },
          items: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },
        },
      });
      expect(executeQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('SQL filtering, deterministic ordering, profile join, pagination, and explanations', () => {
    it('enforces ACTIVE TRAINER filters, exact skillId match, deterministic ORDER BY, and LEFT JOIN trainer_profiles', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '1', name: 'Node.js', category: 'Backend' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 1 }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            trainerId: 12,
            fullName: 'Alice Mentor',
            headline: null,
            organization: null,
            subjectExpertise: null,
            proficiency: '4',
            yearsOfExperience: '1.0',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);

      const countSql = executeQuery.mock.calls[2][0];
      const countParams = executeQuery.mock.calls[2][1];
      expect(countSql).toContain('FROM trainer_skills ts');
      expect(countSql).toContain('INNER JOIN users u ON u.id = ts.trainer_id');
      expect(countSql).toContain('ts.skill_id = $1');
      expect(countSql).toContain('u.role = $2');
      expect(countSql).toContain('u.status = $3');
      expect(countParams).toEqual(['1', 'TRAINER', 'ACTIVE']);

      const rowsSql = executeQuery.mock.calls[3][0];
      const rowsParams = executeQuery.mock.calls[3][1];
      expect(rowsSql).toContain('LEFT JOIN trainer_profiles tp ON tp.user_id = u.id');
      expect(rowsSql).toContain('ts.proficiency DESC');
      expect(rowsSql).toContain('ts.years_of_experience DESC');
      expect(rowsSql).toContain('LOWER(u.full_name) ASC');
      expect(rowsSql).toContain('u.id ASC');
      expect(rowsSql).not.toContain('tp.years_of_experience');
      expect(rowsParams).toEqual(['1', 'TRAINER', 'ACTIVE', 20, 0]);

      expect(res.body.data.items).toEqual([
        {
          trainerId: '12',
          fullName: 'Alice Mentor',
          headline: null,
          organization: null,
          subjectExpertise: null,
          proficiency: 4,
          proficiencyLabel: 'EXPERT',
          yearsOfExperience: 1,
          explanation: {
            matchedSkill: 'Node.js',
            proficiency: 4,
            proficiencyLabel: 'EXPERT',
            yearsOfExperience: 1,
            summary: "Matches Node.js; expert proficiency; 1 year's experience.",
          },
        },
      ]);
    });

    it('normalizes DTOs, generates singular/plural explanations, and preserves ranked order across pages', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: 5, name: 'PostgreSQL', category: 'Databases' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 5 }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            trainerId: '22',
            fullName: 'Bob Expert',
            headline: 'DB Architect',
            organization: 'Capsera Corp',
            subjectExpertise: 'Query Tuning',
            proficiency: 3,
            yearsOfExperience: '5.5',
          },
          {
            trainerId: '19',
            fullName: 'Cara Intermediate',
            headline: 'Backend Coach',
            organization: null,
            subjectExpertise: 'SQL',
            proficiency: 2,
            yearsOfExperience: '0.0',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=5&page=2&pageSize=2')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(executeQuery.mock.calls[3][1]).toEqual(['5', 'TRAINER', 'ACTIVE', 2, 2]);
      expect(res.body.data.pagination).toEqual({
        page: 2,
        pageSize: 2,
        totalItems: 5,
        totalPages: 3,
      });
      expect(res.body.data.items).toEqual([
        {
          trainerId: '22',
          fullName: 'Bob Expert',
          headline: 'DB Architect',
          organization: 'Capsera Corp',
          subjectExpertise: 'Query Tuning',
          proficiency: 3,
          proficiencyLabel: 'ADVANCED',
          yearsOfExperience: 5.5,
          explanation: {
            matchedSkill: 'PostgreSQL',
            proficiency: 3,
            proficiencyLabel: 'ADVANCED',
            yearsOfExperience: 5.5,
            summary: "Matches PostgreSQL; advanced proficiency; 5.5 years' experience.",
          },
        },
        {
          trainerId: '19',
          fullName: 'Cara Intermediate',
          headline: 'Backend Coach',
          organization: null,
          subjectExpertise: 'SQL',
          proficiency: 2,
          proficiencyLabel: 'INTERMEDIATE',
          yearsOfExperience: 0,
          explanation: {
            matchedSkill: 'PostgreSQL',
            proficiency: 2,
            proficiencyLabel: 'INTERMEDIATE',
            yearsOfExperience: 0,
            summary: "Matches PostgreSQL; intermediate proficiency; 0 years' experience.",
          },
        },
      ]);
    });

    it('returns empty items with accurate pagination metadata when page is beyond totalPages', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '5', name: 'PostgreSQL', category: 'Databases' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ totalItems: 3 }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [],
      });

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=5&page=5&pageSize=2')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(200);
      expect(executeQuery.mock.calls[3][1]).toEqual(['5', 'TRAINER', 'ACTIVE', 2, 8]);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 5,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
      });
    });
  });

  describe('Unexpected database errors', () => {
    it('masks raw SQL errors as 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockRejectedValueOnce(new Error('relation "trainer_skills" lock timeout'));

      const res = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=1')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.message).toBe('An unexpected server error occurred.');
      expect(res.body.error.message).not.toContain('lock timeout');
    });
  });
});