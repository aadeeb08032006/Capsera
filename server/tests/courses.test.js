import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-courses-tests-32-chars';
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

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '10',
  fullName = 'Trainer One',
  email = 'trainer1@example.com',
  role = 'TRAINER',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeCourseRow(overrides = {}) {
  const now = new Date('2026-11-11T10:00:00.000Z');
  return {
    id: '1',
    trainer_id: '10',
    title: 'Atmospheric Data Modeling',
    summary: 'Introductory meteorology course',
    description: 'Detailed syllabus covering synoptic forecasting and NWP basics.',
    subject: 'Meteorology',
    level: 'BEGINNER',
    thumbnail_url: 'https://cdn.example.com/thumb.png',
    status: 'DRAFT',
    published_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('Courses API (/api/v1/courses)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth & Status Guards', () => {
    it('rejects unauthenticated requests (401 UNAUTHENTICATED)', async () => {
      const res = await request(app).get('/api/v1/courses');

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
      mockAuthUser({ id: '99', role: 'TRAINEE', status: 'PENDING' });

      const res = await request(app)
        .get('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('99')}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING');
    });
  });

  describe('POST /api/v1/courses', () => {
    it('forbids TRAINEE from creating a course (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ title: 'Unauthorized Course' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid payloads, javascript URLs, and disallowed status fields (400)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: '   ',
          level: 'EXPERT',
          thumbnailUrl: 'javascript:alert(1)',
          status: 'PUBLISHED',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a DRAFT course for TRAINER and ignores client-supplied trainerId', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '42',
            trainer_id: '10',
            title: 'Cyclone Prediction',
            description: null,
            subject: null,
            level: null,
            thumbnail_url: null,
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: '  Cyclone Prediction  ',
          trainerId: '999',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course).toMatchObject({
        id: '42',
        trainerId: '10',
        title: 'Cyclone Prediction',
        status: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
      });
      expect(res.body.data.course.createdAt).toBe('2026-11-11T10:00:00.000Z');

      const insertCall = executeQuery.mock.calls[1];
      expect(insertCall[1][0]).toBe('10');
      expect(insertCall[1][7]).toBe('DRAFT');
    });

    it('allows ADMIN to assign course ownership to an ACTIVE TRAINER', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '15', role: 'TRAINER', status: 'ACTIVE' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '55', trainer_id: '15', title: 'Ocean Currents' })],
      });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Ocean Currents', trainerId: '15' });

      expect(res.status).toBe(201);
      expect(res.body.data.course.trainerId).toBe('15');
    });

    it('rejects ADMIN assigning course to non-trainer user (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '25', role: 'TRAINEE', status: 'ACTIVE' }],
      });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Invalid Owner Course', trainerId: '25' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/courses', () => {
    it('enforces PUBLISHED-only filter for TRAINEE catalogue even if DRAFT requested', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [{ total_items: 0 }] });

      const res = await request(app)
        .get('/api/v1/courses?status=DRAFT')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });

      const countCall = executeQuery.mock.calls[1];
      expect(countCall[0]).toContain('c.status = $1');
      expect(countCall[1][0]).toBe('PUBLISHED');
      expect(countCall[1][1]).toBe('DRAFT');
    });

    it('returns paginated courses for TRAINER including own drafts and escapes search wildcards', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [{ total_items: 1 }] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '7',
            trainer_id: '10',
            trainer_name: 'Trainer One',
            lesson_count: 3,
          }),
        ],
      });

      const res = await request(app)
        .get('/api/v1/courses?search=100%25_test&page=1&pageSize=10')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        id: '7',
        trainerId: '10',
        trainerName: 'Trainer One',
        lessonCount: 3,
      });
      expect(res.body.data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });

      const countCall = executeQuery.mock.calls[1];
      expect(countCall[0]).toContain('(c.status = $1 OR c.trainer_id = $2)');
      expect(countCall[1]).toEqual(['PUBLISHED', '10', '%100\\%\\_test%']);
    });

    it('rejects pageSize > 100 (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const res = await request(app)
        .get('/api/v1/courses?pageSize=101')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/courses/:courseId', () => {
    it('rejects non-numeric courseId (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const res = await request(app)
        .get('/api/v1/courses/abc')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when course does not exist', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/courses/404')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('COURSE_NOT_FOUND');
    });

    it('hides DRAFT course from TRAINEE and from other trainers (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '3', trainer_id: '10', status: 'DRAFT', trainer_name: 'T1', lesson_count: 0 })],
      });

      const traineeRes = await request(app)
        .get('/api/v1/courses/3')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(traineeRes.status).toBe(403);
      expect(traineeRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '11', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '3', trainer_id: '10', status: 'DRAFT', trainer_name: 'T1', lesson_count: 0 })],
      });

      const otherTrainerRes = await request(app)
        .get('/api/v1/courses/3')
        .set('Authorization', `Bearer ${makeToken('11')}`);

      expect(otherTrainerRes.status).toBe(403);
    });

    it('allows owning TRAINER to view own DRAFT course (200)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '3', trainer_id: '10', status: 'DRAFT', trainer_name: 'T1', lesson_count: 2 })],
      });

      const res = await request(app)
        .get('/api/v1/courses/3')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.course.lessonCount).toBe(2);
    });
  });

  describe('PATCH /api/v1/courses/:courseId', () => {
    it('prevents Trainer B from editing Trainer A course (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '11', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '5', trainer_id: '10', status: 'DRAFT' })],
      });

      const res = await request(app)
        .patch('/api/v1/courses/5')
        .set('Authorization', `Bearer ${makeToken('11')}`)
        .send({ title: 'Hijacked Title' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks editing ARCHIVED courses (409 INVALID_STATUS_TRANSITION)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '5',
            trainer_id: '10',
            status: 'ARCHIVED',
            archived_at: new Date('2026-11-11T11:00:00.000Z'),
          }),
        ],
      });

      const res = await request(app)
        .patch('/api/v1/courses/5')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('prevents clearing required fields on a PUBLISHED course (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '5',
            trainer_id: '10',
            status: 'PUBLISHED',
            published_at: new Date('2026-11-11T10:30:00.000Z'),
          }),
        ],
      });

      const res = await request(app)
        .patch('/api/v1/courses/5')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ description: null });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows ADMIN to update any non-archived course (200)', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '5', trainer_id: '10', status: 'DRAFT' })],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '5', trainer_id: '10', title: 'Revised Title', status: 'DRAFT' })],
      });

      const res = await request(app)
        .patch('/api/v1/courses/5')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Revised Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.course.title).toBe('Revised Title');
    });
  });

  describe('POST /api/v1/courses/:courseId/publish & /archive & DELETE', () => {
    it('rejects publishing a draft missing description, subject, or level (400)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '6',
            trainer_id: '10',
            description: null,
            subject: 'Meteorology',
            level: null,
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/courses/6/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('description');
      expect(res.body.error.message).toContain('level');
    });

    it('publishes a complete DRAFT owned by the trainer (200)', async () => {
      const pubTime = new Date('2026-11-11T12:00:00.000Z');
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '6', trainer_id: '10', status: 'DRAFT' })],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '6', trainer_id: '10', status: 'PUBLISHED', published_at: pubTime })],
      });

      const res = await request(app)
        .post('/api/v1/courses/6/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.course.status).toBe('PUBLISHED');
      expect(res.body.data.course.publishedAt).toBe('2026-11-11T12:00:00.000Z');
    });

    it('rejects publishing an ARCHIVED course (409)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeCourseRow({
            id: '6',
            trainer_id: '10',
            status: 'ARCHIVED',
            archived_at: new Date('2026-11-11T12:00:00.000Z'),
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/courses/6/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('archives a PUBLISHED course via POST /archive (200)', async () => {
      const archTime = new Date('2026-11-11T13:00:00.000Z');
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '6', trainer_id: '10', status: 'PUBLISHED' })],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '6', trainer_id: '10', status: 'ARCHIVED', archived_at: archTime })],
      });

      const res = await request(app)
        .post('/api/v1/courses/6/archive')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.course.status).toBe('ARCHIVED');
      expect(res.body.data.course.archivedAt).toBe('2026-11-11T13:00:00.000Z');
    });

    it('prefers archive over delete on DELETE when course is PUBLISHED or referenced', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '6', trainer_id: '10', status: 'PUBLISHED' })] })
        .mockResolvedValueOnce({ rows: [{ has_references: true }] })
        .mockResolvedValueOnce({
          rows: [
            makeCourseRow({
              id: '6',
              trainer_id: '10',
              status: 'ARCHIVED',
              archived_at: new Date('2026-11-11T13:00:00.000Z'),
            }),
          ],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .delete('/api/v1/courses/6')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.action).toBe('ARCHIVED');
      expect(res.body.data.course.status).toBe('ARCHIVED');
    });

    it('deletes an empty unreferenced DRAFT course on DELETE (200)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '8', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({ rows: [{ has_references: false }] })
        .mockResolvedValueOnce({ rows: [{ id: '8' }] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .delete('/api/v1/courses/8')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        action: 'DELETED',
        deletedCourseId: '8',
      });
    });
  });

  describe('Database Error Isolation', () => {
    it('masks internal SQL errors behind 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockRejectedValueOnce(new Error('SELECT * FROM secret_table failed: relation missing'));

      const res = await request(app)
        .get('/api/v1/courses')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.message).not.toContain('secret_table');
      expect(res.body.error.message).not.toContain('SELECT');
    });
  });
});

