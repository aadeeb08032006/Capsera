import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-certificates-tests-32-chars';
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
import {
  evaluateCourseCompletionEligibility,
  generateCertificateCode,
  issueCertificateIfEligible,
} from '../src/modules/certificates/certificates.service.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '25',
  fullName = 'Asha Verma',
  email = 'asha@example.com',
  role = 'TRAINEE',
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

function makeCertificateRow(overrides = {}) {
  return {
    id: '1',
    traineeId: '25',
    courseId: '4',
    courseTitle: 'Foundations of Cloud Security',
    courseSubject: 'Security',
    certificateCode: 'CAP-A1B2-C3D4-E5F6',
    issuedAt: '2026-11-14T09:30:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

describe('Certificates Module (CP-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service: evaluateCourseCompletionEligibility() & issueCertificateIfEligible()', () => {
    it('evaluates eligible course completion, marks ACTIVE enrollment COMPLETED, and issues a unique certificate', async () => {
      const fakeClient = {
        query: vi
          .fn()
          // 1. Eligibility snapshot (all lessons done + required assessment passed)
          .mockResolvedValueOnce({
            rows: [
              {
                enrollmentId: '99',
                enrollmentStatus: 'ACTIVE',
                completedAt: null,
                totalLessons: 4,
                completedLessons: 4,
                requiredAssessmentCount: 1,
                passedRequiredAssessmentCount: 1,
              },
            ],
          })
          // 2. markEnrollmentCompleted
          .mockResolvedValueOnce({
            rows: [{ id: '99', status: 'COMPLETED', completedAt: '2026-11-14T09:30:00.000Z' }],
          })
          // 3. findCertificateByTraineeAndCourse
          .mockResolvedValueOnce({ rows: [] })
          // 4. insertCertificate
          .mockResolvedValueOnce({ rows: [makeCertificateRow()] }),
      };
      withTransaction.mockImplementationOnce(async (work) => work(fakeClient));

      const result = await issueCertificateIfEligible('25', '4');

      expect(result.issued).toBe(true);
      expect(result.reason).toBe('ISSUED');
      expect(result.certificate.certificateCode).toBe('CAP-A1B2-C3D4-E5F6');
      expect(result.certificate.isValid).toBe(true);

      expect(fakeClient.query).toHaveBeenCalledTimes(4);
      expect(fakeClient.query.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(fakeClient.query.mock.calls[1][0]).toContain("SET status = 'COMPLETED'");
      expect(fakeClient.query.mock.calls[3][0]).toContain('ON CONFLICT DO NOTHING');
      expect(fakeClient.query.mock.calls[3][1][2]).toMatch(/^CAP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    });

    it('supports courses with only optional assessments when all lessons are complete', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            enrollmentId: '100',
            enrollmentStatus: 'ACTIVE',
            completedAt: null,
            totalLessons: 3,
            completedLessons: 3,
            requiredAssessmentCount: 0,
            passedRequiredAssessmentCount: 0,
          },
        ],
      });

      const eligibility = await evaluateCourseCompletionEligibility('25', '7');

      expect(eligibility).toEqual({
        eligible: true,
        reason: 'ELIGIBLE',
        enrollmentId: '100',
        enrollmentStatus: 'ACTIVE',
        totalLessons: 3,
        completedLessons: 3,
        requiredAssessmentCount: 0,
        passedRequiredAssessmentCount: 0,
      });
    });

    it('rejects eligibility when lessons are incomplete', async () => {
      const fakeClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              enrollmentId: '99',
              enrollmentStatus: 'ACTIVE',
              completedAt: null,
              totalLessons: 5,
              completedLessons: 4,
              requiredAssessmentCount: 1,
              passedRequiredAssessmentCount: 1,
            },
          ],
        }),
      };
      withTransaction.mockImplementationOnce(async (work) => work(fakeClient));

      const result = await issueCertificateIfEligible('25', '4');

      expect(result).toEqual({
        issued: false,
        reason: 'LESSONS_INCOMPLETE',
        certificate: null,
      });
      expect(fakeClient.query).toHaveBeenCalledTimes(1);
    });

    it('rejects eligibility when the course has zero lessons', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            enrollmentId: '99',
            enrollmentStatus: 'ACTIVE',
            completedAt: null,
            totalLessons: 0,
            completedLessons: 0,
            requiredAssessmentCount: 0,
            passedRequiredAssessmentCount: 0,
          },
        ],
      });

      const eligibility = await evaluateCourseCompletionEligibility('25', '4');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toBe('NO_LESSONS');
    });

    it('rejects eligibility when required published assessments are failed or ungraded', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            enrollmentId: '99',
            enrollmentStatus: 'ACTIVE',
            completedAt: null,
            totalLessons: 3,
            completedLessons: 3,
            requiredAssessmentCount: 2,
            passedRequiredAssessmentCount: 1,
          },
        ],
      });

      const eligibility = await evaluateCourseCompletionEligibility('25', '4');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toBe('REQUIRED_ASSESSMENTS_INCOMPLETE');
    });

    it('rejects eligibility when enrollment is CANCELLED or missing', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            enrollmentId: '99',
            enrollmentStatus: 'CANCELLED',
            completedAt: null,
            totalLessons: 3,
            completedLessons: 3,
            requiredAssessmentCount: 0,
            passedRequiredAssessmentCount: 0,
          },
        ],
      });
      const cancelled = await evaluateCourseCompletionEligibility('25', '4');
      expect(cancelled.eligible).toBe(false);
      expect(cancelled.reason).toBe('ENROLLMENT_INACTIVE');

      executeQuery.mockResolvedValueOnce({ rows: [] });
      const missing = await evaluateCourseCompletionEligibility('25', '4');
      expect(missing.eligible).toBe(false);
      expect(missing.reason).toBe('NOT_ENROLLED');
    });

    it('returns existing certificate without inserting a duplicate when already issued', async () => {
      const existingRow = makeCertificateRow({ certificateCode: 'CAP-1111-2222-3333' });
      const fakeClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                enrollmentId: '99',
                enrollmentStatus: 'COMPLETED',
                completedAt: '2026-11-14T08:00:00.000Z',
                totalLessons: 3,
                completedLessons: 3,
                requiredAssessmentCount: 1,
                passedRequiredAssessmentCount: 1,
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [existingRow] }),
      };

      const result = await issueCertificateIfEligible('25', '4', { client: fakeClient });

      expect(result.issued).toBe(false);
      expect(result.reason).toBe('ALREADY_ISSUED');
      expect(result.certificate.certificateCode).toBe('CAP-1111-2222-3333');
      expect(withTransaction).not.toHaveBeenCalled();
      expect(fakeClient.query).toHaveBeenCalledTimes(2);
    });

    it('handles ON CONFLICT duplicate trainee/course and certificate_code collisions safely', async () => {
      const winnerRow = makeCertificateRow({ certificateCode: 'CAP-9999-8888-7777' });
      const fakeClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                enrollmentId: '99',
                enrollmentStatus: 'COMPLETED',
                completedAt: '2026-11-14T08:00:00.000Z',
                totalLessons: 2,
                completedLessons: 2,
                requiredAssessmentCount: 0,
                passedRequiredAssessmentCount: 0,
              },
            ],
          })
          // Pre-check empty
          .mockResolvedValueOnce({ rows: [] })
          // Attempt 1: insert returns empty due to certificate_code collision
          .mockResolvedValueOnce({ rows: [] })
          // Check trainee/course after conflict -> null => retry with new code
          .mockResolvedValueOnce({ rows: [] })
          // Attempt 2: insert succeeds
          .mockResolvedValueOnce({ rows: [winnerRow] }),
      };
      withTransaction.mockImplementationOnce(async (work) => work(fakeClient));

      const result = await issueCertificateIfEligible('25', '4');

      expect(result.issued).toBe(true);
      expect(result.certificate.certificateCode).toBe('CAP-9999-8888-7777');
      expect(fakeClient.query).toHaveBeenCalledTimes(5);
    });

    it('generates formatted uppercase certificate codes using crypto randomness', () => {
      const codeA = generateCertificateCode();
      const codeB = generateCertificateCode();

      expect(codeA).toMatch(/^CAP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
      expect(codeB).toMatch(/^CAP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
      expect(codeA).not.toBe(codeB);
    });
  });

  describe('GET /api/v1/certificates/me', () => {
    it('rejects unauthenticated, non-ACTIVE, and non-TRAINEE callers', async () => {
      const noTokenRes = await request(app).get('/api/v1/certificates/me');
      expect(noTokenRes.status).toBe(401);
      expect(noTokenRes.body.error.code).toBe('UNAUTHENTICATED');

      mockAuthUser({ id: '25', role: 'TRAINEE', status: 'PENDING' });
      const pendingRes = await request(app)
        .get('/api/v1/certificates/me')
        .set('Authorization', `Bearer ${makeToken('25')}`);
      expect(pendingRes.status).toBe(403);
      expect(pendingRes.body.error.code).toBe('ACCOUNT_PENDING');

      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });
      const adminRes = await request(app)
        .get('/api/v1/certificates/me')
        .set('Authorization', `Bearer ${makeToken('1')}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '2', role: 'TRAINER', status: 'ACTIVE' });
      const trainerRes = await request(app)
        .get('/api/v1/certificates/me')
        .set('Authorization', `Bearer ${makeToken('2')}`);
      expect(trainerRes.status).toBe(403);
      expect(trainerRes.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid pagination query parameters with 400 VALIDATION_ERROR', async () => {
      mockAuthUser({ id: '25', role: 'TRAINEE', status: 'ACTIVE' });

      const res = await request(app)
        .get('/api/v1/certificates/me?page=0&pageSize=200')
        .set('Authorization', `Bearer ${makeToken('25')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns paginated certificates for the authenticated trainee in read-only mode', async () => {
      mockAuthUser({ id: '25', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery
        .mockResolvedValueOnce({ rows: [{ totalItems: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            makeCertificateRow({
              id: '10',
              certificateCode: 'CAP-DEAD-BEEF-CAFE',
            }),
          ],
        });

      const res = await request(app)
        .get('/api/v1/certificates/me?page=1&pageSize=10')
        .set('Authorization', `Bearer ${makeToken('25')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          items: [
            {
              id: '10',
              traineeId: '25',
              courseId: '4',
              courseTitle: 'Foundations of Cloud Security',
              courseSubject: 'Security',
              certificateCode: 'CAP-DEAD-BEEF-CAFE',
              issuedAt: '2026-11-14T09:30:00.000Z',
              revokedAt: null,
              isValid: true,
              status: 'VALID',
            },
          ],
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 1,
            totalPages: 1,
          },
        },
      });
      // Read-only GET must never open a transaction to issue certificates
      expect(withTransaction).not.toHaveBeenCalled();
    });

    it('masks unexpected database failures behind 500 INTERNAL_SERVER_ERROR', async () => {
      mockAuthUser({ id: '25', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockRejectedValueOnce(new Error('relation "certificates" does not exist'));

      const res = await request(app)
        .get('/api/v1/certificates/me')
        .set('Authorization', `Bearer ${makeToken('25')}`);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('GET /api/v1/certificates/verify/:certificateCode', () => {
    it('returns minimal verification details for a valid certificate without exposing private user data', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            certificateCode: 'CAP-A1B2-C3D4-E5F6',
            traineeName: 'Asha Verma',
            courseTitle: 'Foundations of Cloud Security',
            issuedAt: '2026-11-14T09:30:00.000Z',
            revokedAt: null,
          },
        ],
      });

      const res = await request(app).get('/api/v1/certificates/verify/CAP-A1B2-C3D4-E5F6');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          certificate: {
            certificateCode: 'CAP-A1B2-C3D4-E5F6',
            traineeName: 'Asha Verma',
            courseTitle: 'Foundations of Cloud Security',
            issuedAt: '2026-11-14T09:30:00.000Z',
            revokedAt: null,
            isValid: true,
            status: 'VALID',
          },
        },
      });
      expect(res.body.data.certificate.email).toBeUndefined();
      expect(res.body.data.certificate.traineeId).toBeUndefined();
      expect(res.body.data.certificate.courseId).toBeUndefined();
      expect(res.body.data.certificate.id).toBeUndefined();
    });

    it('distinguishes revoked certificates cleanly on public verification', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            certificateCode: 'CAP-REV0-KED1-0001',
            traineeName: 'Asha Verma',
            courseTitle: 'Foundations of Cloud Security',
            issuedAt: '2026-11-14T09:30:00.000Z',
            revokedAt: '2026-11-14T11:00:00.000Z',
          },
        ],
      });

      const res = await request(app).get('/api/v1/certificates/verify/CAP-REV0-KED1-0001');

      expect(res.status).toBe(200);
      expect(res.body.data.certificate).toEqual({
        certificateCode: 'CAP-REV0-KED1-0001',
        traineeName: 'Asha Verma',
        courseTitle: 'Foundations of Cloud Security',
        issuedAt: '2026-11-14T09:30:00.000Z',
        revokedAt: '2026-11-14T11:00:00.000Z',
        isValid: false,
        status: 'REVOKED',
      });
    });

    it('returns 404 CERTIFICATE_NOT_FOUND for unknown certificate codes', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/v1/certificates/verify/CAP-0000-0000-0000');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CERTIFICATE_NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for malformed certificate codes', async () => {
      const res = await request(app).get('/api/v1/certificates/verify/bad$code!');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(executeQuery).not.toHaveBeenCalled();
    });
  });
});

