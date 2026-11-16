import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-announcements-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, withTransaction } from '../src/config/db.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '1',
  fullName = 'Platform Admin',
  email = 'admin@example.com',
  role = 'ADMIN',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeDbAnnouncement(overrides = {}) {
  return {
    id: '10',
    creatorId: '1',
    creatorName: 'Platform Admin',
    title: 'Spring Onboarding Open',
    body: 'Enrollment for Q2 foundational modules is now open.',
    category: 'ANNOUNCEMENT',
    status: 'PUBLISHED',
    publishedAt: '2026-11-14T08:00:00.000Z',
    expiresAt: null,
    createdAt: '2026-11-14T07:55:00.000Z',
    updatedAt: '2026-11-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('Announcements API (/api/v1/announcements)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/announcements', () => {
    it('returns published, non-expired announcements for public visitors with optional category filter and pagination', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [{ totalItems: 3 }] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeDbAnnouncement({ id: '12', category: 'ACHIEVEMENT', title: 'Top Cohort' }),
        ],
      });

      const res = await request(app).get(
        '/api/v1/announcements?category=ACHIEVEMENT&page=2&pageSize=1',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          items: [
            makeDbAnnouncement({ id: '12', category: 'ACHIEVEMENT', title: 'Top Cohort' }),
          ],
          pagination: {
            page: 2,
            pageSize: 1,
            totalItems: 3,
            totalPages: 3,
          },
        },
      });

      const countSql = executeQuery.mock.calls[0][0];
      const countParams = executeQuery.mock.calls[0][1];
      expect(countSql).toContain('a.status = $1');
      expect(countSql).toContain('a.published_at IS NOT NULL');
      expect(countSql).toContain('a.published_at <= NOW()');
      expect(countSql).toContain('a.expires_at IS NULL OR a.expires_at > NOW()');
      expect(countSql).toContain('a.category = $2');
      expect(countParams).toEqual(['PUBLISHED', 'ACHIEVEMENT']);

      const rowsSql = executeQuery.mock.calls[1][0];
      const rowsParams = executeQuery.mock.calls[1][1];
      expect(rowsSql).toContain('ORDER BY a.published_at DESC, a.id DESC');
      expect(rowsParams).toEqual(['PUBLISHED', 'ACHIEVEMENT', 1, 1]);
    });

    it('rejects unauthenticated access to scope=admin or status filters with 401', async () => {
      const adminScopeRes = await request(app).get('/api/v1/announcements?scope=admin');
      expect(adminScopeRes.status).toBe(401);
      expect(adminScopeRes.body.error.code).toBe('UNAUTHENTICATED');

      const statusRes = await request(app).get('/api/v1/announcements?status=DRAFT');
      expect(statusRes.status).toBe(401);
      expect(statusRes.body.error.code).toBe('UNAUTHENTICATED');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('rejects invalid JWT tokens on public endpoint rather than silently falling back', async () => {
      const res = await request(app)
        .get('/api/v1/announcements')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-admin users requesting scope=admin with 403 FORBIDDEN', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });

      const res = await request(app)
        .get('/api/v1/announcements?scope=admin')
        .set('Authorization', `Bearer ${makeToken('40')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects status filter when scope=public even for ADMIN users', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });

      const res = await request(app)
        .get('/api/v1/announcements?status=DRAFT')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('allows ACTIVE ADMIN to view drafts and archived posts with scope=admin and optional status/category filters', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({ rows: [{ totalItems: 1 }] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeDbAnnouncement({
            id: '15',
            status: 'ARCHIVED',
            category: 'NEW_CONTENT',
            publishedAt: '2026-11-01T08:00:00.000Z',
          }),
        ],
      });

      const res = await request(app)
        .get('/api/v1/announcements?scope=admin&status=ARCHIVED&category=NEW_CONTENT')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('ARCHIVED');

      const countSql = executeQuery.mock.calls[1][0];
      const countParams = executeQuery.mock.calls[1][1];
      expect(countSql).toContain('a.status = $1');
      expect(countSql).toContain('a.category = $2');
      expect(countSql).not.toContain('NOW()');
      expect(countParams).toEqual(['ARCHIVED', 'NEW_CONTENT']);
    });
  });

  describe('POST /api/v1/announcements', () => {
    it('rejects unauthenticated, inactive, and non-ADMIN users', async () => {
      const noAuth = await request(app).post('/api/v1/announcements').send({});
      expect(noAuth.status).toBe(401);

      mockAuthUser({ id: '10', role: 'ADMIN', status: 'SUSPENDED' });
      const suspended = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({});
      expect(suspended.status).toBe(403);
      expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');

      mockAuthUser({ id: '20', role: 'TRAINER', status: 'ACTIVE' });
      const trainer = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({
          title: 'Course update',
          body: 'New lab posted',
          category: 'NEW_CONTENT',
        });
      expect(trainer.status).toBe(403);
      expect(trainer.body.error.code).toBe('FORBIDDEN');
    });

    it('creates a DRAFT announcement by default using req.user.id as creatorId', async () => {
      mockAuthUser({ id: '7', fullName: 'Admin Seven', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeDbAnnouncement({
            id: '21',
            creatorId: '7',
            creatorName: 'Admin Seven',
            status: 'DRAFT',
            publishedAt: null,
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${makeToken('7')}`)
        .send({
          title: '  Spring Onboarding Open  ',
          body: 'Enrollment details soon.',
          category: 'ANNOUNCEMENT',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.announcement).toMatchObject({
        id: '21',
        creatorId: '7',
        creatorName: 'Admin Seven',
        status: 'DRAFT',
        publishedAt: null,
      });

      const insertParams = executeQuery.mock.calls[1][1];
      expect(insertParams[0]).toBe('7');
      expect(insertParams[1]).toBe('Spring Onboarding Open');
      expect(insertParams[4]).toBe('DRAFT');
      expect(insertParams[5]).toBeNull();
    });

    it('allows immediate publication with status=PUBLISHED and sets publishedAt automatically', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeDbAnnouncement({
            id: '22',
            status: 'PUBLISHED',
            category: 'NEW_CONTENT',
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({
          title: 'New Kubernetes Module',
          body: 'Published in backend track.',
          category: 'NEW_CONTENT',
          status: 'PUBLISHED',
          expiresAt: '2099-01-01T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.announcement.status).toBe('PUBLISHED');
      expect(res.body.data.announcement.publishedAt).toBeTruthy();

      const insertParams = executeQuery.mock.calls[1][1];
      expect(insertParams[4]).toBe('PUBLISHED');
      expect(typeof insertParams[5]).toBe('string');
      expect(Number.isNaN(Date.parse(insertParams[5]))).toBe(false);
    });

    it.each([
      ['missing title', { body: 'Text', category: 'ANNOUNCEMENT' }],
      ['blank title', { title: '   ', body: 'Text', category: 'ANNOUNCEMENT' }],
      ['missing body', { title: 'Title', category: 'ANNOUNCEMENT' }],
      ['invalid category', { title: 'Title', body: 'Text', category: 'ALERT' }],
      ['ARCHIVED on create', { title: 'Title', body: 'Text', category: 'ANNOUNCEMENT', status: 'ARCHIVED' }],
      ['unknown creatorId field', { title: 'Title', body: 'Text', category: 'ANNOUNCEMENT', creatorId: '99' }],
      ['past expiresAt when publishing', { title: 'Title', body: 'Text', category: 'ANNOUNCEMENT', status: 'PUBLISHED', expiresAt: '2020-01-01T00:00:00.000Z' }],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, payload) => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });

      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('PATCH /api/v1/announcements/:announcementId', () => {
    it('rejects non-ADMIN users and invalid announcementId params or empty bodies', async () => {
      mockAuthUser({ id: '40', role: 'TRAINEE', status: 'ACTIVE' });
      const forbiddenRes = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('40')}`)
        .send({ title: 'Updated' });
      expect(forbiddenRes.status).toBe(403);

      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const badIdRes = await request(app)
        .patch('/api/v1/announcements/abc')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Updated' });
      expect(badIdRes.status).toBe(400);
      expect(badIdRes.body.error.code).toBe('VALIDATION_ERROR');

      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const emptyPatchRes = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({});
      expect(emptyPatchRes.status).toBe(400);
      expect(emptyPatchRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 ANNOUNCEMENT_NOT_FOUND for unknown IDs', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      withTransaction.mockImplementationOnce(async (work) =>
        work({
          query: vi.fn().mockResolvedValueOnce({ rows: [] }),
        }),
      );

      const res = await request(app)
        .patch('/api/v1/announcements/999')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ANNOUNCEMENT_NOT_FOUND');
    });

    it('allows editing content and publishing DRAFT -> PUBLISHED with automatic publishedAt', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            makeDbAnnouncement({
              id: '10',
              status: 'DRAFT',
              publishedAt: null,
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            makeDbAnnouncement({
              id: '10',
              title: 'Updated Title',
              status: 'PUBLISHED',
              publishedAt: '2026-11-14T09:00:00.000Z',
            }),
          ],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ title: 'Updated Title', status: 'PUBLISHED' });

      expect(res.status).toBe(200);
      expect(res.body.data.announcement.title).toBe('Updated Title');
      expect(res.body.data.announcement.status).toBe('PUBLISHED');
      expect(res.body.data.announcement.publishedAt).toBeTruthy();

      const updateParams = clientQuery.mock.calls[1][1];
      expect(updateParams[1]).toBe('Updated Title');
      expect(updateParams[4]).toBe('PUBLISHED');
      expect(typeof updateParams[5]).toBe('string');
    });

    it('allows archiving from DRAFT or PUBLISHED', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [makeDbAnnouncement({ id: '10', status: 'PUBLISHED' })],
        })
        .mockResolvedValueOnce({
          rows: [makeDbAnnouncement({ id: '10', status: 'ARCHIVED' })],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.announcement.status).toBe('ARCHIVED');
    });

    it('treats ARCHIVED as terminal and rejects PUBLISHED -> DRAFT transitions with 409 CONFLICT', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      withTransaction.mockImplementationOnce(async (work) =>
        work({
          query: vi.fn().mockResolvedValueOnce({
            rows: [makeDbAnnouncement({ id: '10', status: 'ARCHIVED' })],
          }),
        }),
      );

      const restoreRes = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'PUBLISHED' });

      expect(restoreRes.status).toBe(409);
      expect(restoreRes.body.error.code).toBe('CONFLICT');

      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      withTransaction.mockImplementationOnce(async (work) =>
        work({
          query: vi.fn().mockResolvedValueOnce({
            rows: [makeDbAnnouncement({ id: '10', status: 'PUBLISHED' })],
          }),
        }),
      );

      const revertRes = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'DRAFT' });

      expect(revertRes.status).toBe(409);
      expect(revertRes.body.error.code).toBe('CONFLICT');
    });

    it('rejects expiresAt earlier than publishedAt with 400 VALIDATION_ERROR', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      withTransaction.mockImplementationOnce(async (work) =>
        work({
          query: vi.fn().mockResolvedValueOnce({
            rows: [
              makeDbAnnouncement({
                id: '10',
                status: 'PUBLISHED',
                publishedAt: '2026-11-14T08:00:00.000Z',
              }),
            ],
          }),
        }),
      );

      const res = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ expiresAt: '2026-11-14T07:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('masks unexpected database errors as 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      withTransaction.mockRejectedValueOnce(new Error('pg lock error'));

      const res = await request(app)
        .patch('/api/v1/announcements/10')
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
