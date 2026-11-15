import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `cp06-it-${RUN_ID}-`;
const TEST_TITLE_PREFIX = `CP06-IT-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-cp06-integration-test-secret';

  if (enabled) {
    if (process.env.DATABASE_URL) {
      let parsed;
      try {
        parsed = new URL(process.env.DATABASE_URL);
      } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL targeting capsera_cp03_test');
      }
      if (parsed.pathname !== `/${testDbName}`) {
        throw new Error(
          `Refusing to run integration tests: DATABASE_URL must target /${testDbName}, got ${parsed.pathname}`,
        );
      }
    } else if (process.env.DB_NAME !== testDbName) {
      throw new Error(
        `Refusing to run integration tests: DB_NAME must be explicitly set to "${testDbName}"`,
      );
    }

    process.env.DB_HOST = process.env.INTEGRATION_DB_HOST || process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.INTEGRATION_DB_PORT || process.env.DB_PORT || '5432';
    process.env.DB_USER =
      process.env.INTEGRATION_DB_USER ||
      process.env.DB_USER ||
      process.env.PGUSER ||
      process.env.USER ||
      'postgres';
    process.env.DB_PASSWORD =
      process.env.INTEGRATION_DB_PASSWORD ?? process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '';
  }

  return { runPgIntegration: enabled, TEST_DB_NAME: testDbName };
});

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, pool, withTransaction } from '../src/config/db.js';
import {
  evaluateCourseCompletionEligibility,
  issueCertificateIfEligible,
} from '../src/modules/certificates/certificates.service.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

describe.runIf(runPgIntegration)(
  'CP-06 Certificates Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdCourseIds = [];
    const createdLessonIds = [];
    const createdEnrollmentIds = [];
    const createdAssessmentIds = [];
    const createdAttemptIds = [];
    const createdCertificateIds = [];

    let trainerUser;
    let traineeUser;
    let otherTraineeUser;

    async function seedUser({ fullName, emailSlug, role, status = 'ACTIVE' }) {
      const email = `${TEST_EMAIL_PREFIX}${emailSlug}@capsera.test`;
      const result = await executeQuery(
        `INSERT INTO users (full_name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name AS "fullName", email, role, status`,
        [fullName, email, '$2b$12$test.hash.placeholder.for.integration.only', role, status],
      );
      const id = String(result.rows[0].id);
      createdUserIds.push(id);
      return { ...result.rows[0], id };
    }

    async function seedCourse({ title, subject = 'Cloud Architecture' }) {
      const result = await executeQuery(
        `INSERT INTO courses (trainer_id, title, description, subject, level, status, published_at)
         VALUES ($1, $2, $3, $4, 'BEGINNER', 'PUBLISHED', NOW())
         RETURNING id, title, subject`,
        [trainerUser.id, `${TEST_TITLE_PREFIX}${title}`, 'Integration test course', subject],
      );
      const id = String(result.rows[0].id);
      createdCourseIds.push(id);
      return { ...result.rows[0], id };
    }

    async function seedLesson(courseId, lessonOrder, title) {
      const result = await executeQuery(
        `INSERT INTO lessons (course_id, title, content, lesson_order)
         VALUES ($1, $2, 'Lesson content', $3)
         RETURNING id`,
        [courseId, title, lessonOrder],
      );
      const id = String(result.rows[0].id);
      createdLessonIds.push(id);
      return id;
    }

    async function seedEnrollment(traineeId, courseId, status = 'ACTIVE') {
      const completedAtSql = status === 'COMPLETED' ? 'NOW()' : 'NULL';
      const cancelledAtSql = status === 'CANCELLED' ? 'NOW()' : 'NULL';
      const result = await executeQuery(
        `INSERT INTO enrollments (trainee_id, course_id, status, completed_at, cancelled_at)
         VALUES ($1, $2, $3, ${completedAtSql}, ${cancelledAtSql})
         RETURNING id, status`,
        [traineeId, courseId, status],
      );
      const id = String(result.rows[0].id);
      createdEnrollmentIds.push(id);
      return { id, status: result.rows[0].status };
    }

    async function markLessonCompleted(enrollmentId, courseId, lessonId) {
      await executeQuery(
        `INSERT INTO lesson_progress (enrollment_id, course_id, lesson_id)
         VALUES ($1, $2, $3)`,
        [enrollmentId, courseId, lessonId],
      );
    }

    async function seedAssessment(
      courseId,
      { title, status = 'PUBLISHED', isRequired = true, passPercentage = 60 } = {},
    ) {
      const publishedAtSql = status === 'PUBLISHED' ? 'NOW()' : 'NULL';
      const result = await executeQuery(
        `INSERT INTO assessments (course_id, title, max_attempts, pass_percentage, is_required, status, published_at)
         VALUES ($1, $2, 3, $3, $4, $5, ${publishedAtSql})
         RETURNING id`,
        [courseId, title, passPercentage, isRequired, status],
      );
      const id = String(result.rows[0].id);
      createdAssessmentIds.push(id);
      return id;
    }

    async function seedAttempt(
      assessmentId,
      traineeId,
      { attemptNumber = 1, status = 'GRADED', isPassed = true, scorePercentage = 80 } = {},
    ) {
      let result;
      if (status === 'GRADED') {
        result = await executeQuery(
          `INSERT INTO assessment_attempts
             (assessment_id, trainee_id, attempt_number, status, started_at, submitted_at, graded_at,
              earned_points, total_points, score_percentage, is_passed)
           VALUES ($1, $2, $3, 'GRADED', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes',
                   NOW(), 8, 10, $4, $5)
           RETURNING id`,
          [assessmentId, traineeId, attemptNumber, scorePercentage, isPassed],
        );
      } else {
        result = await executeQuery(
          `INSERT INTO assessment_attempts
             (assessment_id, trainee_id, attempt_number, status, started_at, submitted_at)
           VALUES ($1, $2, $3, 'SUBMITTED', NOW() - INTERVAL '10 minutes', NOW())
           RETURNING id`,
          [assessmentId, traineeId, attemptNumber],
        );
      }
      const id = String(result.rows[0].id);
      createdAttemptIds.push(id);
      return id;
    }

    async function trackCreatedCertificateFor(traineeId, courseId) {
      const res = await executeQuery(
        'SELECT id FROM certificates WHERE trainee_id = $1 AND course_id = $2',
        [traineeId, courseId],
      );
      if (res.rows[0]?.id) {
        const id = String(res.rows[0].id);
        if (!createdCertificateIds.includes(id)) {
          createdCertificateIds.push(id);
        }
      }
    }

    async function cleanupTestRecords() {
      if (createdCourseIds.length > 0 && createdUserIds.length > 0) {
        await executeQuery(
          `DELETE FROM certificates
           WHERE id = ANY($1::bigint[])
              OR trainee_id = ANY($2::bigint[])
              OR course_id = ANY($3::bigint[])`,
          [createdCertificateIds, createdUserIds, createdCourseIds],
        );
      } else if (createdCertificateIds.length > 0) {
        await executeQuery('DELETE FROM certificates WHERE id = ANY($1::bigint[])', [
          createdCertificateIds,
        ]);
      }

      if (createdAttemptIds.length > 0 || createdUserIds.length > 0) {
        await executeQuery(
          `DELETE FROM assessment_attempts
           WHERE id = ANY($1::bigint[])
              OR trainee_id = ANY($2::bigint[])`,
          [createdAttemptIds, createdUserIds],
        );
      }

      if (createdAssessmentIds.length > 0) {
        await executeQuery('DELETE FROM assessments WHERE id = ANY($1::bigint[])', [
          createdAssessmentIds,
        ]);
      }

      if (createdEnrollmentIds.length > 0) {
        await executeQuery('DELETE FROM lesson_progress WHERE enrollment_id = ANY($1::bigint[])', [
          createdEnrollmentIds,
        ]);
        await executeQuery('DELETE FROM enrollments WHERE id = ANY($1::bigint[])', [
          createdEnrollmentIds,
        ]);
      }

      if (createdLessonIds.length > 0) {
        await executeQuery('DELETE FROM lessons WHERE id = ANY($1::bigint[])', [
          createdLessonIds,
        ]);
      }

      if (createdCourseIds.length > 0) {
        await executeQuery('DELETE FROM courses WHERE id = ANY($1::bigint[])', [
          createdCourseIds,
        ]);
      }

      if (createdUserIds.length > 0) {
        await executeQuery('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
      }

      createdCertificateIds.length = 0;
      createdAttemptIds.length = 0;
      createdAssessmentIds.length = 0;
      createdEnrollmentIds.length = 0;
      createdLessonIds.length = 0;
      createdCourseIds.length = 0;
      createdUserIds.length = 0;
    }

    beforeAll(async () => {
      const dbCheck = await executeQuery('SELECT current_database() AS db');
      if (dbCheck.rows[0]?.db !== TEST_DB_NAME) {
        throw new Error(
          `Refusing to run integration tests against non-isolated database: ${dbCheck.rows[0]?.db}`,
        );
      }
    });

    beforeEach(async () => {
      vi.restoreAllMocks();
      await cleanupTestRecords();
      trainerUser = await seedUser({
        fullName: 'CP06 Trainer',
        emailSlug: 'trainer',
        role: 'TRAINER',
      });
      traineeUser = await seedUser({
        fullName: 'CP06 Trainee One',
        emailSlug: 'trainee1',
        role: 'TRAINEE',
      });
      otherTraineeUser = await seedUser({
        fullName: 'CP06 Trainee Two',
        emailSlug: 'trainee2',
        role: 'TRAINEE',
      });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupTestRecords();
    });

    afterAll(async () => {
      await pool.end();
    });

    it('enforces exact eligibility rules for zero lessons, incomplete lessons, required vs optional/unpublished assessments, and CANCELLED enrollments', async () => {
      // 1. Course with zero lessons -> not eligible
      const emptyCourse = await seedCourse({ title: 'Zero-Lessons' });
      await seedEnrollment(traineeUser.id, emptyCourse.id, 'ACTIVE');
      const zeroLessonsCheck = await evaluateCourseCompletionEligibility(
        traineeUser.id,
        emptyCourse.id,
      );
      expect(zeroLessonsCheck.eligible).toBe(false);
      expect(zeroLessonsCheck.reason).toBe('NO_LESSONS');

      // 2. CANCELLED enrollment -> not eligible even with lessons/attempts satisfied
      const cancelledCourse = await seedCourse({ title: 'Cancelled-Course' });
      const cancelledLesson = await seedLesson(cancelledCourse.id, 1, 'L1');
      const cancelledEnrollment = await seedEnrollment(
        traineeUser.id,
        cancelledCourse.id,
        'ACTIVE',
      );
      await markLessonCompleted(cancelledEnrollment.id, cancelledCourse.id, cancelledLesson);
      await executeQuery(
        `UPDATE enrollments SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
        [cancelledEnrollment.id],
      );
      const cancelledCheck = await evaluateCourseCompletionEligibility(
        traineeUser.id,
        cancelledCourse.id,
      );
      expect(cancelledCheck.eligible).toBe(false);
      expect(cancelledCheck.reason).toBe('ENROLLMENT_INACTIVE');

      // 3. Incomplete lessons & ungraded/failed required assessment progression
      const fullCourse = await seedCourse({ title: 'Standard-Course' });
      const lesson1 = await seedLesson(fullCourse.id, 1, 'Intro');
      const lesson2 = await seedLesson(fullCourse.id, 2, 'Deep Dive');
      const enrollment = await seedEnrollment(traineeUser.id, fullCourse.id, 'ACTIVE');

      const requiredAssessment = await seedAssessment(fullCourse.id, {
        title: 'Final Exam',
        status: 'PUBLISHED',
        isRequired: true,
      });
      await seedAssessment(fullCourse.id, {
        title: 'Optional Practice Quiz',
        status: 'PUBLISHED',
        isRequired: false,
      });
      await seedAssessment(fullCourse.id, {
        title: 'Unpublished Draft Quiz',
        status: 'DRAFT',
        isRequired: true,
      });

      // Only 1 of 2 lessons completed
      await markLessonCompleted(enrollment.id, fullCourse.id, lesson1);
      const partialLessonCheck = await evaluateCourseCompletionEligibility(
        traineeUser.id,
        fullCourse.id,
      );
      expect(partialLessonCheck.eligible).toBe(false);
      expect(partialLessonCheck.reason).toBe('LESSONS_INCOMPLETE');

      // Complete 2nd lesson, but required assessment only has SUBMITTED + failed GRADED attempts
      await markLessonCompleted(enrollment.id, fullCourse.id, lesson2);
      await seedAttempt(requiredAssessment, traineeUser.id, {
        attemptNumber: 1,
        status: 'SUBMITTED',
      });
      await seedAttempt(requiredAssessment, traineeUser.id, {
        attemptNumber: 2,
        status: 'GRADED',
        isPassed: false,
        scorePercentage: 40,
      });
      const failedAssessmentCheck = await evaluateCourseCompletionEligibility(
        traineeUser.id,
        fullCourse.id,
      );
      expect(failedAssessmentCheck.eligible).toBe(false);
      expect(failedAssessmentCheck.reason).toBe('REQUIRED_ASSESSMENTS_INCOMPLETE');

      // Pass required published assessment -> eligible (optional & draft assessments ignored)
      await seedAttempt(requiredAssessment, traineeUser.id, {
        attemptNumber: 3,
        status: 'GRADED',
        isPassed: true,
        scorePercentage: 90,
      });
      const eligibleCheck = await evaluateCourseCompletionEligibility(
        traineeUser.id,
        fullCourse.id,
      );
      expect(eligibleCheck.eligible).toBe(true);
      expect(eligibleCheck.reason).toBe('ELIGIBLE');
    });

    it('issues one certificate atomically, updates enrollment to COMPLETED, enforces DB uniqueness, handles code collisions, rolls back failures, and is concurrency-safe', async () => {
      const course = await seedCourse({ title: 'Concurrency-Course' });
      const lesson = await seedLesson(course.id, 1, 'Core Lesson');
      const enrollment = await seedEnrollment(traineeUser.id, course.id, 'ACTIVE');
      await markLessonCompleted(enrollment.id, course.id, lesson);

      // 1. Concurrent issuance calls -> only 1 certificate created, enrollment marked COMPLETED
      const [first, second] = await Promise.all([
        issueCertificateIfEligible(traineeUser.id, course.id),
        issueCertificateIfEligible(traineeUser.id, course.id),
      ]);
      await trackCreatedCertificateFor(traineeUser.id, course.id);

      const results = [first, second];
      expect(results.filter((r) => r.issued)).toHaveLength(1);
      expect(results.filter((r) => !r.issued && r.reason === 'ALREADY_ISSUED')).toHaveLength(1);
      expect(first.certificate.certificateCode).toBe(second.certificate.certificateCode);

      const enrollmentRow = await executeQuery(
        'SELECT status, completed_at FROM enrollments WHERE id = $1',
        [enrollment.id],
      );
      expect(enrollmentRow.rows[0].status).toBe('COMPLETED');
      expect(enrollmentRow.rows[0].completed_at).toBeTruthy();

      const countRes = await executeQuery(
        'SELECT COUNT(*)::int AS count FROM certificates WHERE trainee_id = $1 AND course_id = $2',
        [traineeUser.id, course.id],
      );
      expect(countRes.rows[0].count).toBe(1);

      // 2. Repeated call returns existing certificate
      const repeated = await issueCertificateIfEligible(traineeUser.id, course.id);
      expect(repeated.issued).toBe(false);
      expect(repeated.reason).toBe('ALREADY_ISSUED');
      expect(repeated.certificate.id).toBe(first.certificate.id);

      // 3. Direct SQL insert violates uq_certificates_trainee_course (23505) & uq_certificates_code (23505)
      await expect(
        executeQuery(
          'INSERT INTO certificates (trainee_id, course_id, certificate_code) VALUES ($1, $2, $3)',
          [traineeUser.id, course.id, 'CAP-UNIQUE-CHECK-0001'],
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: 'uq_certificates_trainee_course' });

      const otherCourse = await seedCourse({ title: 'Other-Course' });
      const otherEnrollment = await seedEnrollment(otherTraineeUser.id, otherCourse.id, 'ACTIVE');
      const otherLesson = await seedLesson(otherCourse.id, 1, 'Other Lesson');
      await markLessonCompleted(otherEnrollment.id, otherCourse.id, otherLesson);

      await expect(
        executeQuery(
          'INSERT INTO certificates (trainee_id, course_id, certificate_code) VALUES ($1, $2, $3)',
          [otherTraineeUser.id, otherCourse.id, first.certificate.certificateCode],
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: 'uq_certificates_code' });

      // 4. Simulated code collision with unrelated certificate retries cleanly without aborting transaction
      const existingHex = first.certificate.certificateCode.replace(/^CAP-/, '').replace(/-/g, '');
      const collidingBytes = Buffer.from(existingHex, 'hex');
      const randomSpy = vi
        .spyOn(crypto, 'randomBytes')
        .mockReturnValueOnce(collidingBytes);

      const collidedRetryResult = await issueCertificateIfEligible(
        otherTraineeUser.id,
        otherCourse.id,
      );
      await trackCreatedCertificateFor(otherTraineeUser.id, otherCourse.id);
      randomSpy.mockRestore();

      expect(collidedRetryResult.issued).toBe(true);
      expect(collidedRetryResult.certificate.certificateCode).not.toBe(
        first.certificate.certificateCode,
      );

      // 5. Failed outer transaction using optional { client } leaves zero partial enrollment/certificate changes
      const rollbackCourse = await seedCourse({ title: 'Rollback-Course' });
      const rollbackLesson = await seedLesson(rollbackCourse.id, 1, 'Rollback Lesson');
      const rollbackEnrollment = await seedEnrollment(traineeUser.id, rollbackCourse.id, 'ACTIVE');
      await markLessonCompleted(rollbackEnrollment.id, rollbackCourse.id, rollbackLesson);

      await expect(
        withTransaction(async (client) => {
          const inner = await issueCertificateIfEligible(traineeUser.id, rollbackCourse.id, {
            client,
          });
          expect(inner.issued).toBe(true);
          throw new Error('Simulated downstream failure after issuance');
        }),
      ).rejects.toThrow('Simulated downstream failure after issuance');

      const rollbackEnrollCheck = await executeQuery(
        'SELECT status, completed_at FROM enrollments WHERE id = $1',
        [rollbackEnrollment.id],
      );
      expect(rollbackEnrollCheck.rows[0].status).toBe('ACTIVE');
      expect(rollbackEnrollCheck.rows[0].completed_at).toBeNull();

      const rollbackCertCheck = await executeQuery(
        'SELECT COUNT(*)::int AS count FROM certificates WHERE trainee_id = $1 AND course_id = $2',
        [traineeUser.id, rollbackCourse.id],
      );
      expect(rollbackCertCheck.rows[0].count).toBe(0);
    });

    it('serves read-only paginated GET /me certificates and privacy-preserving public verification for valid, revoked, and missing codes', async () => {
      // Eligible course NOT yet issued: GET /me must remain read-only and NOT auto-issue
      const unissuedCourse = await seedCourse({ title: 'Not-Yet-Issued' });
      const unissuedLesson = await seedLesson(unissuedCourse.id, 1, 'L1');
      const unissuedEnroll = await seedEnrollment(traineeUser.id, unissuedCourse.id, 'ACTIVE');
      await markLessonCompleted(unissuedEnroll.id, unissuedCourse.id, unissuedLesson);

      const traineeToken = makeToken(traineeUser.id);
      const emptyMeRes = await request(app)
        .get('/api/v1/certificates/me')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(emptyMeRes.status).toBe(200);
      expect(emptyMeRes.body.data.items).toEqual([]);

      const countUnissued = await executeQuery(
        'SELECT COUNT(*)::int AS count FROM certificates WHERE trainee_id = $1 AND course_id = $2',
        [traineeUser.id, unissuedCourse.id],
      );
      expect(countUnissued.rows[0].count).toBe(0);

      // Issue 3 certificates for traineeUser + 1 for otherTraineeUser
      const c1 = await seedCourse({ title: 'Course-1' });
      const c2 = await seedCourse({ title: 'Course-2' });
      const c3 = await seedCourse({ title: 'Course-3' });
      for (const course of [c1, c2, c3]) {
        const lid = await seedLesson(course.id, 1, 'L1');
        const eid = await seedEnrollment(traineeUser.id, course.id, 'ACTIVE');
        await markLessonCompleted(eid.id, course.id, lid);
        await issueCertificateIfEligible(traineeUser.id, course.id);
        await trackCreatedCertificateFor(traineeUser.id, course.id);
      }

      const otherCourse = await seedCourse({ title: 'Other-Trainee-Course' });
      const otherLid = await seedLesson(otherCourse.id, 1, 'L1');
      const otherEid = await seedEnrollment(otherTraineeUser.id, otherCourse.id, 'ACTIVE');
      await markLessonCompleted(otherEid.id, otherCourse.id, otherLid);
      const otherIssued = await issueCertificateIfEligible(otherTraineeUser.id, otherCourse.id);
      await trackCreatedCertificateFor(otherTraineeUser.id, otherCourse.id);

      // Pagination check on /me (pageSize=2 across 3 owned certificates)
      const page1 = await request(app)
        .get('/api/v1/certificates/me?page=1&pageSize=2')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(page1.status).toBe(200);
      expect(page1.body.data.items).toHaveLength(2);
      expect(page1.body.data.pagination).toEqual({
        page: 1,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
      });

      const page2 = await request(app)
        .get('/api/v1/certificates/me?page=2&pageSize=2')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(page2.status).toBe(200);
      expect(page2.body.data.items).toHaveLength(1);
      expect(
        page2.body.data.items.every((item) => item.traineeId === traineeUser.id),
      ).toBe(true);

      const allMyCodes = [...page1.body.data.items, ...page2.body.data.items].map(
        (item) => item.certificateCode,
      );
      expect(allMyCodes).not.toContain(otherIssued.certificate.certificateCode);

      // Public verification (valid certificate, case-insensitive lookup)
      const validCode = allMyCodes[0];
      const verifyValid = await request(app).get(
        `/api/v1/certificates/verify/${validCode.toLowerCase()}`,
      );
      expect(verifyValid.status).toBe(200);
      expect(verifyValid.body.data.certificate).toMatchObject({
        certificateCode: validCode,
        traineeName: 'CP06 Trainee One',
        isValid: true,
        status: 'VALID',
        revokedAt: null,
      });
      // No private data exposed
      expect(verifyValid.body.data.certificate.email).toBeUndefined();
      expect(verifyValid.body.data.certificate.traineeId).toBeUndefined();
      expect(verifyValid.body.data.certificate.courseId).toBeUndefined();
      expect(verifyValid.body.data.certificate.id).toBeUndefined();

      // Revoked certificate reported cleanly
      await executeQuery(
        `UPDATE certificates
         SET revoked_at = issued_at + INTERVAL '1 second'
         WHERE certificate_code = $1`,
        [otherIssued.certificate.certificateCode],
      );
      const verifyRevoked = await request(app).get(
        `/api/v1/certificates/verify/${otherIssued.certificate.certificateCode}`,
      );
      expect(verifyRevoked.status).toBe(200);
      expect(verifyRevoked.body.data.certificate.isValid).toBe(false);
      expect(verifyRevoked.body.data.certificate.status).toBe('REVOKED');
      expect(verifyRevoked.body.data.certificate.revokedAt).toBeTruthy();

      // Unknown code -> 404
      const verifyMissing = await request(app).get(
        '/api/v1/certificates/verify/CAP-0000-0000-0000',
      );
      expect(verifyMissing.status).toBe(404);
      expect(verifyMissing.body.error.code).toBe('CERTIFICATE_NOT_FOUND');
    });
  },
);

