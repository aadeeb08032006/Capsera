import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-dashboard-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery } from '../src/config/db.js';

function makeToken(userId = '1') {
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
    rows: [
      {
        id,
        full_name: fullName,
        email,
        role,
        status,
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
  });
}

describe('Admin Dashboard Module (CP-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when unauthenticated on both dashboard endpoints', async () => {
      const summaryRes = await request(app).get('/api/v1/admin/dashboard/summary');
      expect(summaryRes.status).toBe(401);
      expect(summaryRes.body.error.code).toBe('UNAUTHENTICATED');

      const perfRes = await request(app).get('/api/v1/admin/dashboard/assessment-performance');
      expect(perfRes.status).toBe(401);
      expect(perfRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 FORBIDDEN for ACTIVE TRAINEE and ACTIVE TRAINER on both endpoints', async () => {
      const traineeToken = makeToken('20');
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      const traineeSummary = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(traineeSummary.status).toBe(403);
      expect(traineeSummary.body.error.code).toBe('FORBIDDEN');

      const trainerToken = makeToken('21');
      mockAuthUser({ id: '21', role: 'TRAINER', status: 'ACTIVE' });
      const trainerPerf = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${trainerToken}`);
      expect(trainerPerf.status).toBe(403);
      expect(trainerPerf.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-ACTIVE ADMIN accounts (PENDING, REJECTED, SUSPENDED)', async () => {
      const token = makeToken('9');

      mockAuthUser({ id: '9', role: 'ADMIN', status: 'PENDING' });
      const pendingRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${token}`);
      expect(pendingRes.status).toBe(403);
      expect(pendingRes.body.error.code).toBe('ACCOUNT_PENDING');

      mockAuthUser({ id: '9', role: 'ADMIN', status: 'REJECTED' });
      const rejectedRes = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${token}`);
      expect(rejectedRes.status).toBe(403);
      expect(rejectedRes.body.error.code).toBe('ACCOUNT_REJECTED');

      mockAuthUser({ id: '9', role: 'ADMIN', status: 'SUSPENDED' });
      const suspendedRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${token}`);
      expect(suspendedRes.status).toBe(403);
      expect(suspendedRes.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('GET /api/v1/admin/dashboard/summary', () => {
    it('returns zeroed counts and completionRate 0 on an empty database', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            totalUsers: 0,
            traineeUsers: 0,
            trainerUsers: 0,
            adminUsers: 0,
            pendingUsers: 0,
            activeUsers: 0,
            rejectedUsers: 0,
            suspendedUsers: 0,
            totalCourses: 0,
            draftCourses: 0,
            publishedCourses: 0,
            archivedCourses: 0,
            totalEnrollments: 0,
            activeEnrollments: 0,
            completedEnrollments: 0,
            cancelledEnrollments: 0,
            enrolledTrainees: 0,
            totalAssessments: 0,
            draftAssessments: 0,
            publishedAssessments: 0,
            closedAssessments: 0,
            totalAttempts: 0,
            inProgressAttempts: 0,
            submittedAttempts: 0,
            gradedAttempts: 0,
            expiredAttempts: 0,
            passedAttempts: 0,
            attemptingTrainees: 0,
            totalCertificates: 0,
            validCertificates: 0,
            revokedCertificates: 0,
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          users: {
            total: 0,
            byRole: { TRAINEE: 0, TRAINER: 0, ADMIN: 0 },
            byStatus: { PENDING: 0, ACTIVE: 0, REJECTED: 0, SUSPENDED: 0 },
          },
          courses: {
            total: 0,
            byStatus: { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 },
          },
          enrollments: {
            total: 0,
            byStatus: { ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 },
            completionRate: 0,
          },
          assessments: {
            total: 0,
            byStatus: { DRAFT: 0, PUBLISHED: 0, CLOSED: 0 },
          },
          attempts: {
            total: 0,
            byStatus: { IN_PROGRESS: 0, SUBMITTED: 0, GRADED: 0, EXPIRED: 0 },
            passedCount: 0,
          },
          certificates: {
            totalIssued: 0,
            validCount: 0,
            revokedCount: 0,
          },
          participation: {
            enrolledTrainees: 0,
            attemptingTrainees: 0,
          },
        },
      });
    });

    it('returns populated counts, exact role/status breakdowns, and completionRate excluding CANCELLED rows', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            totalUsers: 25,
            traineeUsers: 19,
            trainerUsers: 5,
            adminUsers: 1,
            pendingUsers: 3,
            activeUsers: 20,
            rejectedUsers: 1,
            suspendedUsers: 1,
            totalCourses: 8,
            draftCourses: 2,
            publishedCourses: 5,
            archivedCourses: 1,
            totalEnrollments: 15,
            activeEnrollments: 6,
            completedEnrollments: 3,
            cancelledEnrollments: 6,
            enrolledTrainees: 8,
            totalAssessments: 10,
            draftAssessments: 2,
            publishedAssessments: 7,
            closedAssessments: 1,
            totalAttempts: 40,
            inProgressAttempts: 3,
            submittedAttempts: 1,
            gradedAttempts: 34,
            expiredAttempts: 2,
            passedAttempts: 27,
            attemptingTrainees: 14,
            totalCertificates: 9,
            validCertificates: 8,
            revokedCertificates: 1,
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toEqual({
        total: 25,
        byRole: { TRAINEE: 19, TRAINER: 5, ADMIN: 1 },
        byStatus: { PENDING: 3, ACTIVE: 20, REJECTED: 1, SUSPENDED: 1 },
      });
      expect(res.body.data.courses).toEqual({
        total: 8,
        byStatus: { DRAFT: 2, PUBLISHED: 5, ARCHIVED: 1 },
      });
      // 3 / (6 + 3) * 100 = 33.33 (6 CANCELLED enrollments excluded from denominator)
      expect(res.body.data.enrollments).toEqual({
        total: 15,
        byStatus: { ACTIVE: 6, COMPLETED: 3, CANCELLED: 6 },
        completionRate: 33.33,
      });
      expect(res.body.data.assessments).toEqual({
        total: 10,
        byStatus: { DRAFT: 2, PUBLISHED: 7, CLOSED: 1 },
      });
      expect(res.body.data.attempts).toEqual({
        total: 40,
        byStatus: { IN_PROGRESS: 3, SUBMITTED: 1, GRADED: 34, EXPIRED: 2 },
        passedCount: 27,
      });
      expect(res.body.data.certificates).toEqual({
        totalIssued: 9,
        validCount: 8,
        revokedCount: 1,
      });
      expect(res.body.data.participation).toEqual({
        enrolledTrainees: 8,
        attemptingTrainees: 14,
      });

      const serialized = JSON.stringify(res.body.data);
      expect(serialized).not.toMatch(/email|fullName|password|answers|traineeId|userId/i);
    });

    it('returns completionRate 0 when only CANCELLED enrollments exist', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            totalEnrollments: 4,
            activeEnrollments: 0,
            completedEnrollments: 0,
            cancelledEnrollments: 4,
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.enrollments.total).toBe(4);
      expect(res.body.data.enrollments.byStatus.CANCELLED).toBe(4);
      expect(res.body.data.enrollments.completionRate).toBe(0);
    });

    it('masks unexpected PostgreSQL errors behind 500 INTERNAL_SERVER_ERROR', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockRejectedValueOnce(new Error('relation "enrollments" does not exist'));

      const res = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

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

  describe('GET /api/v1/admin/dashboard/assessment-performance', () => {
    it('returns zeroed passRate, null averageScorePercentage, and empty bySubject when no assessments or attempts exist', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery
        .mockResolvedValueOnce({
          rows: [
            {
              totalAssessments: 0,
              totalAttempts: 0,
              gradedAttempts: 0,
              passedAttempts: 0,
              averageScorePercentage: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          overall: {
            totalAssessments: 0,
            totalAttempts: 0,
            gradedAttempts: 0,
            passedAttempts: 0,
            passRate: 0,
            averageScorePercentage: null,
          },
          bySubject: [],
        },
      });
    });

    it('calculates overall and subject breakdown accurately using pre-aggregated CTE queries without join multiplication', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery
        .mockResolvedValueOnce({
          rows: [
            {
              totalAssessments: 4,
              totalAttempts: 7,
              gradedAttempts: 5,
              passedAttempts: 4,
              averageScorePercentage: '81.50',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              subject: 'Meteorology',
              courseCount: 2,
              assessmentCount: 3,
              attemptCount: 6,
              gradedAttemptCount: 5,
              passedAttemptCount: 4,
              averageScorePercentage: '81.50',
            },
            {
              subject: 'Unspecified',
              courseCount: 1,
              assessmentCount: 1,
              attemptCount: 1,
              gradedAttemptCount: 0,
              passedAttemptCount: 0,
              averageScorePercentage: null,
            },
          ],
        });

      const res = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        overall: {
          totalAssessments: 4,
          totalAttempts: 7,
          gradedAttempts: 5,
          passedAttempts: 4,
          passRate: 80,
          averageScorePercentage: 81.5,
        },
        bySubject: [
          {
            subject: 'Meteorology',
            courseCount: 2,
            assessmentCount: 3,
            attemptCount: 6,
            gradedAttemptCount: 5,
            passedAttemptCount: 4,
            passRate: 80,
            averageScorePercentage: 81.5,
          },
          {
            subject: 'Unspecified',
            courseCount: 1,
            assessmentCount: 1,
            attemptCount: 1,
            gradedAttemptCount: 0,
            passedAttemptCount: 0,
            passRate: 0,
            averageScorePercentage: null,
          },
        ],
      });

      // Verify independent CTE pre-aggregation is used rather than multi-table fan-out joins
      const subjectSql = executeQuery.mock.calls[2][0];
      expect(subjectSql).toContain('course_by_subject AS');
      expect(subjectSql).toContain('assessment_by_subject AS');
      expect(subjectSql).toContain('attempt_by_subject AS');
      expect(subjectSql).toContain("COALESCE(NULLIF(BTRIM(c.subject), ''), 'Unspecified')");

      const serialized = JSON.stringify(res.body.data);
      expect(serialized).not.toMatch(/email|fullName|password|answers|traineeId|userId/i);
    });

    it('masks SQL errors on assessment-performance without leaking database details', async () => {
      const adminToken = makeToken('1');
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      executeQuery.mockRejectedValueOnce(new Error('permission denied for table assessment_attempts'));

      const res = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${adminToken}`);

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
